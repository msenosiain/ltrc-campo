import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx-js-style';
import {
  CategoryEnum,
  IPayment,
  PaymentMethodEnum,
  PaymentStatusEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import {
  categoryOptions,
  getCategoryLabel,
} from '../../common/category-options';
import {
  GlobalPaymentRow,
  GlobalPaymentsReport,
} from '../../payments/services/payments.service';
import {
  REPORT_PDF_COLORS,
  drawReportPdfContextRow,
  drawReportPdfHeader,
  drawReportPdfPageFooter,
} from './report-pdf.util';

export interface PaymentsReportPdfContext {
  sport?: string | null;
  category?: string | null;
  tournamentName?: string | null;
  statusLabel?: string | null;
  methodLabel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

const XLSX_STYLE = {
  title: { font: { bold: true, sz: 14 } },
  info: { font: { sz: 10, italic: true, color: { rgb: '666666' } } },
  groupHeader: {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '374763' } },
  },
  colHeader: {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '1E1E1E' } },
  },
  data: { font: { sz: 10 } },
  total: {
    font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill: { patternType: 'solid', fgColor: { rgb: '2E7D32' } },
  },
};

@Injectable({ providedIn: 'root' })
export class PaymentsReportPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;

  generateExcel(
    report: GlobalPaymentsReport,
    ctx: PaymentsReportPdfContext
  ): void {
    const COLS = 8;
    const infoParts: string[] = [];
    if (ctx.tournamentName) infoParts.push(`Evento: ${ctx.tournamentName}`);
    const sportCat = this.buildSportCatText(ctx);
    if (sportCat) infoParts.push(`Ámbito: ${sportCat}`);
    if (ctx.dateFrom || ctx.dateTo)
      infoParts.push(`Período: ${ctx.dateFrom ?? '—'} al ${ctx.dateTo ?? '—'}`);
    if (ctx.statusLabel) infoParts.push(`Estado: ${ctx.statusLabel}`);
    if (ctx.methodLabel) infoParts.push(`Método: ${ctx.methodLabel}`);
    infoParts.push(`Registros: ${report.total}`);

    const aoa: unknown[][] = [
      ['INFORME DE PAGOS'],
      [infoParts.join('   ·   ')],
      [],
      [
        'Fecha',
        'Jugador',
        'DNI',
        'Deporte / Cat.',
        'Concepto',
        'Método',
        'Monto',
        'Estado',
      ],
    ];

    const grouped = new Map<string, GlobalPaymentRow[]>();
    for (const p of report.data) {
      const key = p.entityLabel ?? '—';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const groupHeaderRows: number[] = [];
    const dataRows: number[] = [];

    for (const [label, payments] of grouped) {
      groupHeaderRows.push(aoa.length);
      aoa.push([label]);
      for (const p of payments) {
        dataRows.push(aoa.length);
        aoa.push([
          this.formatDate(p.date),
          p.playerName,
          p.playerDni,
          this.sportCatLabel(p.playerSport, p.playerCategory),
          p.concept,
          this.methodLabel(p.method),
          p.amount,
          this.statusLabel(p.status),
        ]);
      }
    }

    const totalRow = aoa.length;
    aoa.push([
      `TOTAL APROBADO — ${report.total} registro(s)`,
      '',
      '',
      '',
      '',
      '',
      report.totalApproved,
      '',
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
      ...groupHeaderRows.map((r) => ({
        s: { r, c: 0 },
        e: { r, c: COLS - 1 },
      })),
      { s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 5 } },
      { s: { r: totalRow, c: 6 }, e: { r: totalRow, c: 7 } },
    ];
    ws['!cols'] = [
      { wch: 12 },
      { wch: 28 },
      { wch: 14 },
      { wch: 20 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];

    this.applyXlsxStyle(ws, 'A1', XLSX_STYLE.title);
    this.applyXlsxStyle(ws, 'A2', XLSX_STYLE.info);
    for (let c = 0; c < COLS; c++) {
      this.applyXlsxStyle(
        ws,
        XLSX.utils.encode_cell({ r: 3, c }),
        XLSX_STYLE.colHeader
      );
    }
    for (const r of groupHeaderRows) {
      this.applyXlsxStyle(
        ws,
        XLSX.utils.encode_cell({ r, c: 0 }),
        XLSX_STYLE.groupHeader
      );
    }
    for (const r of dataRows) {
      for (let c = 0; c < COLS; c++) {
        this.applyXlsxStyle(
          ws,
          XLSX.utils.encode_cell({ r, c }),
          XLSX_STYLE.data
        );
      }
    }
    for (let c = 0; c < COLS; c++) {
      this.applyXlsxStyle(
        ws,
        XLSX.utils.encode_cell({ r: totalRow, c }),
        XLSX_STYLE.total
      );
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos');
    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    XLSX.writeFile(wb, `informe-pagos-${today}.xlsx`);
  }

  private applyXlsxStyle(
    ws: XLSX.WorkSheet,
    addr: string,
    style: object
  ): void {
    if (ws[addr]) (ws[addr] as any).s = style;
  }

  async generate(
    report: GlobalPaymentsReport,
    ctx: PaymentsReportPdfContext
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    const y = await this.drawHeader(doc, report, ctx, pageW, marginL);

    // Agrupar pagos por evento
    const grouped = new Map<string, GlobalPaymentRow[]>();
    for (const p of report.data) {
      const key = p.entityLabel ?? '—';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    const COLS = 8;
    const GROUP_BG: [number, number, number] = [55, 71, 99];
    const body: any[] = [];

    for (const [label, payments] of grouped) {
      // Fila de agrupación
      body.push([
        {
          content: label,
          colSpan: COLS,
          styles: {
            fillColor: GROUP_BG,
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ]);
      // Filas de pagos del grupo
      for (const p of payments) {
        body.push([
          this.formatDate(p.date),
          p.playerName,
          p.playerDni,
          this.sportCatLabel(p.playerSport, p.playerCategory),
          p.concept,
          this.methodLabel(p.method),
          this.formatMoney(p.amount),
          this.statusLabel(p.status),
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [
        [
          'Fecha',
          'Jugador',
          'DNI',
          'Deporte / Cat.',
          'Concepto',
          'Método',
          'Monto',
          'Estado',
        ],
      ],
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
        0: { cellWidth: 16, halign: 'center' }, // Fecha
        1: { cellWidth: 'auto' }, // Jugador
        2: { cellWidth: 20, halign: 'center' }, // DNI
        3: { cellWidth: 22 }, // Deporte/Cat
        4: { cellWidth: 24 }, // Concepto
        5: { cellWidth: 20, halign: 'center' }, // Método
        6: { cellWidth: 18, halign: 'right' }, // Monto
        7: { cellWidth: 18, halign: 'center' }, // Estado
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });

    const finalY = (doc as any).lastAutoTable.finalY + 4;

    // Fila total
    doc.setFillColor(46, 125, 50);
    doc.rect(marginL, finalY, pageW - marginL * 2, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(
      `TOTAL APROBADO — ${report.total} registro(s)`,
      marginL + 3,
      finalY + 5.5
    );
    doc.text(
      this.formatMoney(report.totalApproved),
      pageW - marginL - 3,
      finalY + 5.5,
      { align: 'right' }
    );

    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`informe-pagos-${today}.pdf`);
  }

  async generateForEntity(
    payments: IPayment[],
    entityLabel: string,
    entityDate?: Date
  ): Promise<void> {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    let y = await drawReportPdfHeader(doc, {
      pageW,
      marginL,
      subtitle: 'REPORTE DE COBROS',
    });

    const approved = payments.filter(
      (p) => p.status === PaymentStatusEnum.APPROVED
    );
    const totalApproved = approved.reduce((s, p) => s + p.amount, 0);
    const totalPending = payments
      .filter((p) => p.status === PaymentStatusEnum.PENDING)
      .reduce((s, p) => s + p.amount, 0);

    const col2x = pageW / 2;
    const addRow = (label: string, value: string, x: number) =>
      drawReportPdfContextRow(doc, label, value, x, y);

    addRow('Evento', entityLabel, marginL);
    if (entityDate) addRow('Fecha', this.formatDate(entityDate), col2x);
    y += 6;
    addRow('Total pagos', String(payments.length), marginL);
    addRow('Total aprobado', this.formatMoney(totalApproved), col2x);
    y += 6;
    if (totalPending > 0) {
      addRow('Pendiente', this.formatMoney(totalPending), marginL);
      y += 6;
    }

    doc.setDrawColor(200, 200, 200).line(marginL, y, pageW - marginL, y);
    y += 6;

    // Agrupar por categoría
    const catOrder = new Map(
      categoryOptions.map((c, i) => [c.id as string, i])
    );
    const categoryGroups = new Map<string, IPayment[]>();
    for (const p of payments) {
      const cat = (p as any).playerId?.category as string | undefined;
      const label = cat
        ? getCategoryLabel(cat as CategoryEnum)
        : 'Sin categoría';
      const key = cat ?? '__none__';
      if (!categoryGroups.has(key)) categoryGroups.set(key, []);
      categoryGroups.get(key)!.push(p);
    }
    const sortedGroups = Array.from(categoryGroups.entries()).sort(
      ([keyA], [keyB]) =>
        (catOrder.get(keyA) ?? 999) - (catOrder.get(keyB) ?? 999)
    );

    const CAT_HEADER_BG = REPORT_PDF_COLORS.groupBg;
    const SUBTOTAL_BG: [number, number, number] = [232, 240, 254];
    const body: any[] = [];
    let rowIndex = 1;

    for (const [catKey, catPayments] of sortedGroups) {
      const catLabel =
        catKey === '__none__'
          ? 'Sin categoría'
          : getCategoryLabel(catKey as CategoryEnum);
      body.push([
        {
          content: catLabel.toUpperCase(),
          colSpan: 8,
          styles: {
            fillColor: CAT_HEADER_BG,
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ]);

      for (const p of catPayments) {
        body.push([
          String(rowIndex++),
          (p as any).playerId?.name ?? p.payerName ?? '-',
          (p as any).playerId?.idNumber ?? p.payerDni ?? '-',
          p.concept,
          this.methodLabel(p.method),
          this.formatMoney(p.amount),
          this.formatDate(p.date),
          this.statusLabel(p.status),
        ]);
      }

      const catApproved = catPayments
        .filter((p) => p.status === PaymentStatusEnum.APPROVED)
        .reduce((s, p) => s + p.amount, 0);
      const catApprovedCount = catPayments.filter(
        (p) => p.status === PaymentStatusEnum.APPROVED
      ).length;

      body.push([
        {
          content: `Subtotal — ${catApprovedCount} aprobado(s)`,
          colSpan: 5,
          styles: {
            fillColor: SUBTOTAL_BG,
            fontStyle: 'bold',
            fontSize: 7.5,
            textColor: this.PRIMARY,
          },
        },
        {
          content: this.formatMoney(catApproved),
          colSpan: 1,
          styles: {
            fillColor: SUBTOTAL_BG,
            fontStyle: 'bold',
            fontSize: 7.5,
            halign: 'right',
            textColor: [46, 125, 50] as [number, number, number],
          },
        },
        {
          content: '',
          colSpan: 2,
          styles: { fillColor: SUBTOTAL_BG },
        },
      ]);
    }

    autoTable(doc, {
      startY: y,
      head: [
        [
          '#',
          'Jugador',
          'DNI',
          'Concepto',
          'Método',
          'Monto',
          'Fecha',
          'Estado',
        ],
      ],
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
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 30 },
        4: { cellWidth: 22, halign: 'center' },
        5: { cellWidth: 20, halign: 'right' },
        6: { cellWidth: 16, halign: 'center' },
        7: { cellWidth: 18, halign: 'center' },
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });

    const finalY = (doc as any).lastAutoTable.finalY + 4;
    doc
      .setFillColor(46, 125, 50)
      .rect(marginL, finalY, pageW - marginL * 2, 8, 'F');
    doc.setFontSize(9).setFont('helvetica', 'bold').setTextColor(255, 255, 255);
    doc.text(
      `TOTAL APROBADO — ${approved.length} pago(s)`,
      marginL + 3,
      finalY + 5.5
    );
    doc.text(
      this.formatMoney(totalApproved),
      pageW - marginL - 3,
      finalY + 5.5,
      { align: 'right' }
    );

    doc.save(`cobros-${entityLabel.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    report: GlobalPaymentsReport,
    ctx: PaymentsReportPdfContext,
    pageW: number,
    marginL: number
  ): Promise<number> {
    const y0 = await drawReportPdfHeader(doc, {
      pageW,
      marginL,
      subtitle: 'INFORME DE PAGOS',
    });

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = y0;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) =>
      drawReportPdfContextRow(doc, label, value, x, yy);

    // Fila 1: torneo / deporte+categoría
    if (ctx.tournamentName) {
      row('Torneo', ctx.tournamentName, col1x, y);
    }
    const sportCat = this.buildSportCatText(ctx);
    if (sportCat)
      row('Ámbito', sportCat, ctx.tournamentName ? col2x : col1x, y);
    if (ctx.tournamentName || sportCat) y += lineH;

    // Fila 2: período
    const desde = ctx.dateFrom ?? '—';
    const hasta = ctx.dateTo ?? '—';
    if (ctx.dateFrom || ctx.dateTo) {
      row('Período', `${desde} al ${hasta}`, col1x, y);
      y += lineH;
    }

    // Fila 3: filtros adicionales
    const extra: string[] = [];
    if (ctx.statusLabel) extra.push(`Estado: ${ctx.statusLabel}`);
    if (ctx.methodLabel) extra.push(`Método: ${ctx.methodLabel}`);
    if (extra.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(extra.join('   ·   '), col1x, y);
      y += lineH;
    }

    // Fila resumen
    row('Registros', String(report.total), col1x, y);
    row('Total aprobado', this.formatMoney(report.totalApproved), col2x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y, pageW - marginL, y);

    return y + 6;
  }

  private buildSportCatText(ctx: PaymentsReportPdfContext): string {
    const parts: string[] = [];
    if (ctx.sport)
      parts.push(ctx.sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey');
    if (ctx.category)
      parts.push(getCategoryLabel(ctx.category as CategoryEnum));
    return parts.join(' — ');
  }

  private formatMoney(amount: number): string {
    return (
      '$' +
      amount.toLocaleString('es-AR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    );
  }

  private formatDate(date: string | Date): string {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  }

  private sportCatLabel(sport: string | null, category: string | null): string {
    const parts: string[] = [];
    if (sport) parts.push(sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey');
    if (category) parts.push(getCategoryLabel(category as CategoryEnum));
    return parts.join(' / ') || '—';
  }

  private methodLabel(method: string): string {
    const labels: Record<string, string> = {
      [PaymentMethodEnum.CASH]: 'Efectivo',
      [PaymentMethodEnum.TRANSFER]: 'Transfer.',
      [PaymentMethodEnum.MERCADOPAGO]: 'MercadoPago',
    };
    return labels[method] ?? method;
  }

  private statusLabel(status: string): string {
    const labels: Record<string, string> = {
      approved: 'Aprobado',
      pending: 'Pendiente',
      in_process: 'En proceso',
      rejected: 'Rechazado',
      cancelled: 'Cancelado',
    };
    return labels[status] ?? status;
  }
}
