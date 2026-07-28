import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CategoryEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import {
  REPORT_PDF_COLORS,
  drawReportPdfContextRow,
  drawReportPdfHeader,
  drawReportPdfPageFooter,
} from './report-pdf.util';

export interface BirthdayRow {
  id: string;
  name: string;
  sport: SportEnum | undefined;
  category: CategoryEnum | undefined;
  birthDate: Date;
  age: number;
  daysToNext: number;
}

export interface BirthdaysPdfContext {
  sport: SportEnum | null;
  categories: CategoryEnum[];
}

@Injectable({ providedIn: 'root' })
export class BirthdaysReportPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;
  private readonly CAT_BG = REPORT_PDF_COLORS.groupBg;

  async generate(players: BirthdayRow[], ctx: BirthdaysPdfContext): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    const y = await this.drawHeader(doc, players.length, ctx, pageW, marginL);

    const grouped = new Map<string, BirthdayRow[]>();
    for (const p of players) {
      const key = p.category ?? '__none__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const body: (string | object)[][] = [];
    let rowNum = 1;

    for (const [catKey, catPlayers] of grouped) {
      const catLabel = catKey === '__none__' ? 'Sin categoría' : getCategoryLabel(catKey as CategoryEnum);
      body.push([{
        content: catLabel.toUpperCase(),
        colSpan: 4,
        styles: {
          fillColor: this.CAT_BG,
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
        },
      }]);

      for (const p of catPlayers) {
        body.push([String(rowNum++), p.name, this.formatDate(p.birthDate), String(p.age)]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [['#', 'Nombre', 'Fecha de nac.', 'Edad']],
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
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 16, halign: 'center' },
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });

    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`cumpleanos-${today}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    total: number,
    ctx: BirthdaysPdfContext,
    pageW: number,
    marginL: number
  ): Promise<number> {
    let y = await drawReportPdfHeader(doc, { pageW, marginL, subtitle: 'LISTADO DE CUMPLEAÑOS' });
    const lineH = 6;

    const sportCat = this.buildSportCatText(ctx);
    if (sportCat) {
      drawReportPdfContextRow(doc, 'Ámbito', sportCat, marginL, y);
      y += lineH;
    }

    drawReportPdfContextRow(doc, 'Total', `${total} jugador(es)`, marginL, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200).line(marginL, y, pageW - marginL, y);
    return y + 6;
  }

  private buildSportCatText(ctx: BirthdaysPdfContext): string {
    const parts: string[] = [];
    if (ctx.sport) parts.push(ctx.sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey');
    if (ctx.categories.length) {
      parts.push(ctx.categories.map((c) => getCategoryLabel(c)).join(', '));
    }
    return parts.join(' — ');
  }

  private formatDate(date: Date | string): string {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('es-AR', { timeZone: 'UTC' });
  }
}