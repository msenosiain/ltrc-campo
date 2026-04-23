import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CategoryEnum, IPlayerFeeStatusRow, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';

export interface EligibilityReportPdfContext {
  season: string;
  sport: SportEnum | null;
  category: CategoryEnum | null;
  hasCursos: boolean;
  hasFondo: boolean;
}

@Injectable({ providedIn: 'root' })
export class EligibilityReportPdfService {
  private readonly LOGO_PATH = '/escudo.png';
  private readonly PRIMARY: [number, number, number] = [30, 30, 30];
  private readonly HEADER_BG: [number, number, number] = [20, 20, 20];
  private readonly SECTION_BG: [number, number, number] = [245, 245, 245];
  private readonly GROUP_BG: [number, number, number] = [55, 71, 99];

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

    const columns: string[] = ['Jugador', 'DNI', 'Cuota', 'Pago Derecho', 'Ficha Médica'];
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
          this.yesNo(row.bduarRegistered),
        ];
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
        4: { cellWidth: 14, halign: 'center' },
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => {
        doc.setFontSize(7);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Página ${doc.getNumberOfPages()}`,
          pageW - marginL,
          doc.internal.pageSize.getHeight() - 8,
          { align: 'right' }
        );
      },
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
    const logoSize = 18;

    try {
      const logoBase64 = await this.loadImageAsBase64(this.LOGO_PATH);
      doc.addImage(logoBase64, 'PNG', marginL, 10, logoSize, logoSize);
    } catch {
      // sin logo
    }

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...this.PRIMARY);
    doc.text('LOS TORDOS RUGBY CLUB', marginL + logoSize + 5, 17);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('HABILITACIÓN DE JUGADORES', marginL + logoSize + 5, 24);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(marginL, 32, pageW - marginL, 32);

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = 39;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...this.PRIMARY);
      const labelW = doc.getTextWidth(`${label}: `);
      doc.text(`${label}: `, x, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(value, x + labelW, yy);
    };

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

  private loadImageAsBase64(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  }
}
