import { Document, Types } from 'mongoose';
import { SportEnum } from '@ltrc-campo/shared-api-model';

export class PlayerSeasonRecordEntity extends Document {
  id: string;
  playerId: Types.ObjectId;
  season: string;
  sport: SportEnum;
  fichaMedica: boolean;
  fichaMedicaFecha?: Date;
  cursosAprobados: boolean;
  cursosFecha?: Date;
  fichajeBDUAR: boolean;
  fichajeUnion: boolean;
  fondoSolidarioPagado: boolean;
  fondoSolidarioFecha?: Date;
  notes?: string;
  updatedBy?: Types.ObjectId;
  updatedAt: Date;
}
