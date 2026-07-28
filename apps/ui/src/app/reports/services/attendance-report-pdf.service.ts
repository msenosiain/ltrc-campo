import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AttendanceReportPlayerRow, CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import {
  REPORT_PDF_COLORS,
  drawReportPdfContextRow,
  drawReportPdfHeader,
  drawReportPdfPageFooter,
} from './report-pdf.util';

export interface AttendanceReportPdfContext {
  sport: SportEnum | null;
  category: CategoryEnum | null;
  fromDate: string;
  toDate: string;
  type: 'training' | 'match' | 'both';
}

const STATUS_COLOR: Record<string, [number, number, number]> = {
  present: [46, 125, 50],
  absent: [198, 40, 40],
  justified: [230, 81, 0],
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Presente',
  absent: 'Ausente',
  justified: 'Justificado',
};

const TYPE_LABEL: Record<AttendanceReportPdfContext['type'], string> = {
  training: 'Entrenamientos',
  match: 'Partidos',
  both: 'Entrenamientos y partidos',
};

@Injectable({ providedIn: 'root' })
export class AttendanceReportPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;
  private readonly GROUP_BG = REPORT_PDF_COLORS.groupBg;

  async generate(players: AttendanceReportPlayerRow[], ctx: AttendanceReportPdfContext): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    const y = await this.drawHeader(doc, players, ctx, pageW, marginL);

    if (players.length === 1) {
      this.drawPlayerDetail(doc, players[0], y, pageW, marginL);
    } else {
      this.drawSummaryTable(doc, players, ctx, y, pageW, marginL);
    }

    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`asistencia-${today}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    players: AttendanceReportPlayerRow[],
    ctx: AttendanceReportPdfContext,
    pageW: number,
    marginL: number
  ): Promise<number> {
    const y0 = await drawReportPdfHeader(doc, { pageW, marginL, subtitle: 'REPORTE DE ASISTENCIA' });

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = y0;
    const lineH = 6;

    const sportCat = this.buildSportCatText(ctx);
    if (sportCat) drawReportPdfContextRow(doc, 'Ámbito', sportCat, col1x, y);
    drawReportPdfContextRow(doc, 'Tipo', TYPE_LABEL[ctx.type], sportCat ? col2x : col1x, y);
    y += lineH;

    drawReportPdfContextRow(doc, 'Período', `${ctx.fromDate} al ${ctx.toDate}`, col1x, y);
    drawReportPdfContextRow(doc, 'Jugadores', String(players.length), col2x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y, pageW - marginL, y);

    return y + 6;
  }

  private drawSummaryTable(
    doc: jsPDF,
    players: AttendanceReportPlayerRow[],
    ctx: AttendanceReportPdfContext,
    startY: number,
    pageW: number,
    marginL: number
  ): void {
    const grouped = new Map<string, AttendanceReportPlayerRow[]>();
    for (const p of players) {
      const key = p.category ?? '__none__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const columns = this.summaryColumns(ctx.type);
    const body: import('jspdf-autotable').RowInput[] = [];

    for (const [catKey, catPlayers] of grouped) {
      const catLabel = catKey === '__none__' ? 'Sin categoría' : getCategoryLabel(catKey as CategoryEnum);
      body.push([
        {
          content: catLabel.toUpperCase(),
          colSpan: columns.length,
          styles: {
            fillColor: this.GROUP_BG,
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ]);
      for (const p of catPlayers) {
        body.push(this.summaryRow(p, ctx.type));
      }
    }

    autoTable(doc, {
      startY,
      head: [columns],
      body,
      theme: 'grid',
      headStyles: { fillColor: this.HEADER_BG, textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 7.5, textColor: this.PRIMARY, lineColor: [200, 200, 200], lineWidth: 0.3 },
      alternateRowStyles: { fillColor: this.SECTION_BG },
      columnStyles: { 0: { cellWidth: 'auto' } },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });
  }

  private summaryColumns(type: AttendanceReportPdfContext['type']): string[] {
    if (type === 'training') return ['Jugador', 'Presentes / Total', '% Asistencia'];
    if (type === 'match') return ['Jugador', 'Presentes / Total', '% Asistencia'];
    return ['Jugador', 'Entren. (P/T)', '% Entren.', 'Partidos (P/T)', '% Partidos'];
  }

  private summaryRow(p: AttendanceReportPlayerRow, type: AttendanceReportPdfContext['type']): import('jspdf-autotable').CellInput[] {
    if (type === 'training') return [p.playerName, `${p.training.present} / ${p.training.total}`, `${p.training.pct}%`];
    if (type === 'match') return [p.playerName, `${p.match.present} / ${p.match.total}`, `${p.match.pct}%`];
    return [
      p.playerName,
      `${p.training.present} / ${p.training.total}`,
      `${p.training.pct}%`,
      `${p.match.present} / ${p.match.total}`,
      `${p.match.pct}%`,
    ];
  }

  private drawPlayerDetail(
    doc: jsPDF,
    player: AttendanceReportPlayerRow,
    startY: number,
    pageW: number,
    marginL: number
  ): void {
    let y = startY;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...this.PRIMARY);
    doc.text(player.playerName, marginL, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(getCategoryLabel(player.category), marginL, y);
    y += 4;

    const col2x = pageW / 2;
    drawReportPdfContextRow(doc, 'Entrenamientos', `${player.training.present} / ${player.training.total} (${player.training.pct}%)`, marginL, y);
    drawReportPdfContextRow(doc, 'Partidos', `${player.match.present} / ${player.match.total} (${player.match.pct}%)`, col2x, y);
    y += 8;

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Tipo', 'Detalle', 'Estado']],
      body: player.sessions.map((s) => [
        this.formatDate(s.date),
        s.type === 'training' ? 'Entrenamiento' : 'Partido',
        s.label ?? '—',
        {
          content: STATUS_LABEL[s.status] ?? s.status,
          styles: { textColor: STATUS_COLOR[s.status] ?? this.PRIMARY, fontStyle: 'bold' },
        },
      ]),
      theme: 'grid',
      headStyles: { fillColor: this.HEADER_BG, textColor: 255, fontStyle: 'bold', fontSize: 8, halign: 'center' },
      bodyStyles: { fontSize: 7.5, textColor: this.PRIMARY, lineColor: [200, 200, 200], lineWidth: 0.3 },
      alternateRowStyles: { fillColor: this.SECTION_BG },
      columnStyles: {
        0: { cellWidth: 24, halign: 'center' },
        1: { cellWidth: 28 },
        2: { cellWidth: 'auto' },
        3: { cellWidth: 26, halign: 'center' },
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });
  }

  private buildSportCatText(ctx: AttendanceReportPdfContext): string {
    const parts: string[] = [];
    if (ctx.sport) parts.push(ctx.sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey');
    if (ctx.category) parts.push(getCategoryLabel(ctx.category));
    return parts.join(' — ');
  }

  private formatDate(date: string): string {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString('es-AR', { timeZone: 'UTC' });
  }
}
