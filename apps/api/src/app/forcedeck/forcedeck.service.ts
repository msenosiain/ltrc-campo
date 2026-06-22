import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CmjRecordEntity } from './schemas/cmj-record.entity';
import { CmrjRecordEntity } from './schemas/cmrj-record.entity';
import { TrainingSessionEntity } from '../trainings/sessions/schemas/training-session.entity';
import { PlayerEntity } from '../players/schemas/player.entity';
import { GridFsService } from '../shared/gridfs/gridfs.service';
import { parseCmjCSV } from './parsers/cmj-csv.parser';
import { parseCmrjCSV } from './parsers/cmrj-csv.parser';
import { ForcedeckAggregationService } from './forcedeck-aggregation.service';
import { ForcedeckPdfService } from './forcedeck-pdf.service';

function normalizeWords(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function namesMatch(csvName: string, playerName: string): boolean {
  const csvWords = normalizeWords(csvName);
  const playerWords = normalizeWords(playerName);
  if (csvWords.length === 0 || playerWords.length === 0) return false;
  return csvWords.every((cw) =>
    playerWords.some((pw) => pw.startsWith(cw) || cw.startsWith(pw))
  );
}

@Injectable()
export class ForcedeckService {
  constructor(
    @InjectModel(CmjRecordEntity.name)
    private readonly cmjModel: Model<CmjRecordEntity>,
    @InjectModel(CmrjRecordEntity.name)
    private readonly cmrjModel: Model<CmrjRecordEntity>,
    @InjectModel(TrainingSessionEntity.name)
    private readonly sessionModel: Model<TrainingSessionEntity>,
    @InjectModel(PlayerEntity.name)
    private readonly playerModel: Model<PlayerEntity>,
    private readonly gridFsService: GridFsService,
    private readonly aggregationService: ForcedeckAggregationService,
    private readonly pdfService: ForcedeckPdfService,
  ) {}

  async importCmjCsv(sessionId: string, csvBuffer: Buffer) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const csvText = csvBuffer.toString('utf-8');
    const rows = parseCmjCSV(csvText, session.sport, session.category, sessionId);

    if (rows.length === 0) {
      throw new BadRequestException(
        'El CSV no contiene filas válidas. Verificá el formato ForceDecks.'
      );
    }

    // Resolve player names
    const players = await this.playerModel
      .find({ sport: session.sport, category: session.category })
      .lean();

    const resolvedRows = rows.map((row) => {
      const match = players.find((p) => namesMatch(row.playerName, p.name));
      return {
        ...row,
        playerId: match ? new Types.ObjectId(match._id as Types.ObjectId) : undefined,
      };
    });

    // Upsert with dedup (unique index: playerName + sessionDate + time)
    const ops = resolvedRows.map((row) => ({
      updateOne: {
        filter: {
          playerName: row.playerName,
          sessionDate: row.sessionDate,
          time: row.time,
        },
        update: { $setOnInsert: row },
        upsert: true,
      },
    }));
    await this.cmjModel.bulkWrite(ops, { ordered: false });

    return this.generateAndAttachCmjPdf(session, sessionId);
  }

  async importCmrjCsv(sessionId: string, csvBuffer: Buffer) {
    const session = await this.sessionModel.findById(sessionId);
    if (!session) throw new NotFoundException('Training session not found');

    const csvText = csvBuffer.toString('utf-8');
    const rows = parseCmrjCSV(csvText, session.sport, session.category, sessionId);

    if (rows.length === 0) {
      throw new BadRequestException(
        'El CSV no contiene filas válidas. Verificá el formato ForceDecks.'
      );
    }

    const players = await this.playerModel
      .find({ sport: session.sport, category: session.category })
      .lean();

    const resolvedRows = rows.map((row) => {
      const match = players.find((p) => namesMatch(row.playerName, p.name));
      return {
        ...row,
        playerId: match ? new Types.ObjectId(match._id as Types.ObjectId) : undefined,
      };
    });

    const ops = resolvedRows.map((row) => ({
      updateOne: {
        filter: {
          playerName: row.playerName,
          sessionDate: row.sessionDate,
          time: row.time,
        },
        update: { $setOnInsert: row },
        upsert: true,
      },
    }));
    await this.cmrjModel.bulkWrite(ops, { ordered: false });

    return this.generateAndAttachCmrjPdf(session, sessionId);
  }

  private async generateAndAttachCmjPdf(
    session: TrainingSessionEntity,
    sessionId: string
  ) {
    // Load all historical records for same sport + category
    const allRecords = await this.cmjModel
      .find({ sport: session.sport, category: session.category })
      .lean();

    const reportData = this.aggregationService.aggregateCmj(
      allRecords as unknown as CmjRecordEntity[]
    );
    const pdfBuffer = await this.pdfService.generateCmjPdf(reportData);

    const filename = `reporte-cmj-${session.date}-${Date.now()}.pdf`;
    const fileId = await this.gridFsService.uploadFile(
      'trainingAttachments',
      filename,
      pdfBuffer,
      'application/pdf'
    );

    const attachment = {
      fileId,
      filename,
      mimeType: 'application/pdf',
      name: `Reporte CMJ — ${session.date}`,
      visibility: 'staff' as const,
      targetPlayers: [],
    };

    await this.sessionModel.findByIdAndUpdate(sessionId, {
      $push: { attachments: attachment },
    });

    return attachment;
  }

  private async generateAndAttachCmrjPdf(
    session: TrainingSessionEntity,
    sessionId: string
  ) {
    const allRecords = await this.cmrjModel
      .find({ sport: session.sport, category: session.category })
      .lean();

    const reportData = this.aggregationService.aggregateCmrj(
      allRecords as unknown as CmrjRecordEntity[]
    );
    const pdfBuffer = await this.pdfService.generateCmrjPdf(reportData);

    const filename = `reporte-cmrj-${session.date}-${Date.now()}.pdf`;
    const fileId = await this.gridFsService.uploadFile(
      'trainingAttachments',
      filename,
      pdfBuffer,
      'application/pdf'
    );

    const attachment = {
      fileId,
      filename,
      mimeType: 'application/pdf',
      name: `Reporte CMRJ — ${session.date}`,
      visibility: 'staff' as const,
      targetPlayers: [],
    };

    await this.sessionModel.findByIdAndUpdate(sessionId, {
      $push: { attachments: attachment },
    });

    return attachment;
  }
}
