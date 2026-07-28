import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CategoryEnum, IPlayerFeeStatusRow, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import {
  REPORT_PDF_COLORS,
  drawReportPdfContextRow,
  drawReportPdfHeader,
  drawReportPdfPageFooter,
} from './report-pdf.util';

export interface EligibilityReportPdfContext {
  season: string;
  sport: SportEnum | null;
  category: CategoryEnum | null;
  hasBduar: boolean;
  hasCursos: boolean;
  hasFondo: boolean;
}

@Injectable({ providedIn: 'root' })
export class EligibilityReportPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;
  private readonly GROUP_BG = REPORT_PDF_COLORS.groupBg;

  async generate(rows: IPlayerFeeStatusRow[], ctx: EligibilityReportPdfContext): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    let y = await this.drawHeader(doc, rows, ctx, pageW, marginL);

    // Group by category
    const grouped = new Map<string, IPlayerFeeStatusRow[]>();
    for (const row of rows) {
      const catLabel = getCategoryLabel(row.category as CategoryEnum);
      if (!grouped.has(catLabel)) grouped.set(catLabel, []);
      grouped.get(catLabel)!.push(row);
    }

    const columns: string[] = ['Jugador', 'DNI', 'Cuota', 'Pago Derecho'];
    if (ctx.hasBduar) columns.push('Ficha BD UAR');
    if (ctx.hasCursos) columns.push('Cursos');
    if (ctx.hasFondo) columns.push('Fondo Sol.');
    columns.push('Habilitado');

    const body: import('jspdf-autotable').RowInput[] = [];

    for (const [catLabel, catRows] of grouped) {
      const eligibleCount = catRows.filter(r => r.eligible).length;
      body.push([
        {
          content: `${catLabel}  (${eligibleCount}/${catRows.length} habilitados)`,
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

      for (const row of catRows) {
        const cells: import('jspdf-autotable').CellInput[] = [
          row.playerName,
          row.playerDni,
          this.yesNo(row.membershipCurrent),
          this.yesNo(row.feePaid),
        ];
        if (ctx.hasBduar) cells.push(row.bduarRegistered !== undefined ? this.yesNo(row.bduarRegistered) : '—');
        if (ctx.hasCursos) cells.push(row.coursesApproved !== undefined ? this.yesNo(row.coursesApproved) : '—');
        if (ctx.hasFondo) cells.push(row.solidarityFundPaid !== undefined ? this.yesNo(row.solidarityFundPaid) : '—');
        cells.push({
          content: row.eligible ? 'SÍ' : 'NO',
          styles: {
            textColor: row.eligible ? [27, 94, 32] : [183, 28, 28],
            fontStyle: 'bold',
          },
        });
        body.push(cells);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [columns],
      body,
      theme: 'grid',
      headStyles: {
        fillColor: this.HEADER_BG,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: this.PRIMARY,
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      alternateRowStyles: { fillColor: this.SECTION_BG },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 14, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });

    const sportLabel = ctx.sport === SportEnum.RUGBY ? 'rugby' : ctx.sport === SportEnum.HOCKEY ? 'hockey' : 'todos';
    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`habilitacion-${sportLabel}-${ctx.season}-${today}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    rows: IPlayerFeeStatusRow[],
    ctx: EligibilityReportPdfContext,
    pageW: number,
    marginL: number,
  ): Promise<number> {
    const y0 = await drawReportPdfHeader(doc, { pageW, marginL, subtitle: 'HABILITACIÓN DE JUGADORES' });

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = y0;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) => drawReportPdfContextRow(doc, label, value, x, yy);

    const sportLabel = ctx.sport === SportEnum.RUGBY ? 'Rugby' : ctx.sport === SportEnum.HOCKEY ? 'Hockey' : 'Todos';
    row('Deporte', sportLabel, col1x, y);
    row('Temporada', ctx.season, col2x, y);
    y += lineH;

    if (ctx.category) {
      row('Categoría', getCategoryLabel(ctx.category), col1x, y);
      y += lineH;
    }

    const total = rows.length;
    const eligibleCount = rows.filter(r => r.eligible).length;
    const paidCount = rows.filter(r => r.feePaid).length;

    row('Total jugadores', String(total), col1x, y);
    row('Habilitados', `${eligibleCount} / ${total}`, col2x, y);
    y += lineH;
    row('Derecho pagado', `${paidCount} / ${total}`, col1x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y, pageW - marginL, y);

    return y + 6;
  }

  private yesNo(value: boolean): string {
    return value ? 'Sí' : 'No';
  }
}
