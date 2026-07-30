import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CategoryEnum, PaymentMethodEnum } from '@ltrc-campo/shared-api-model';
import { categoryOptions, getCategoryLabel } from '../../common/category-options';
import { GlobalPaymentRow, GlobalPaymentsReport } from '../../payments/services/payments.service';
import {
  REPORT_PDF_COLORS,
  drawReportPdfContextRow,
  drawReportPdfHeader,
  drawReportPdfPageFooter,
} from './report-pdf.util';

export interface PlayerFeesReportPdfContext {
  conceptLabel?: string | null;
  statusLabel?: string | null;
  methodLabel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PlayerFeesReportPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;
  private readonly GROUP_BG = REPORT_PDF_COLORS.groupBg;

  async generate(report: GlobalPaymentsReport, ctx: PlayerFeesReportPdfContext): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    let y = await this.drawHeader(doc, report, ctx, pageW, marginL);

    // Agrupar por categoría
    const catOrder = new Map(categoryOptions.map((c, i) => [c.id as string, i]));
    const grouped = new Map<string, GlobalPaymentRow[]>();
    for (const p of report.data) {
      const key = p.playerCategory ?? '__none__';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }
    const sortedGroups = Array.from(grouped.entries())
      .sort(([keyA], [keyB]) => (catOrder.get(keyA) ?? 999) - (catOrder.get(keyB) ?? 999));

    const COLS = 7;
    const body: import('jspdf-autotable').RowInput[] = [];

    for (const [catKey, payments] of sortedGroups) {
      const catLabel = catKey === '__none__' ? 'Sin categoría' : getCategoryLabel(catKey as CategoryEnum);
      const approved = payments.filter((p) => p.status === 'approved');
      const approvedTotal = approved.reduce((s, p) => s + p.amount, 0);

      body.push([
        {
          content: `${catLabel}  —  ${approved.length}/${payments.length} aprobado(s)  —  ${this.formatMoney(approvedTotal)}`,
          colSpan: COLS,
          styles: {
            fillColor: this.GROUP_BG,
            textColor: 255,
            fontStyle: 'bold',
            fontSize: 8,
            cellPadding: { top: 2.5, bottom: 2.5, left: 3, right: 3 },
          },
        },
      ]);

      for (const p of payments) {
        body.push([
          this.formatDate(p.date),
          p.playerName,
          p.playerDni,
          p.concept,
          this.methodLabel(p.method),
          this.formatMoney(p.amount),
          this.statusLabel(p.status),
        ]);
      }
    }

    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Jugador', 'DNI', 'Tipo de cobro', 'Método', 'Monto', 'Estado']],
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
        0: { cellWidth: 18, halign: 'center' },  // Fecha
        1: { cellWidth: 'auto' },                 // Jugador
        2: { cellWidth: 22, halign: 'center' },   // DNI
        3: { cellWidth: 32 },                      // Tipo de cobro
        4: { cellWidth: 24, halign: 'center' },   // Método
        5: { cellWidth: 20, halign: 'right' },    // Monto
        6: { cellWidth: 20, halign: 'center' },   // Estado
      },
      margin: { left: marginL, right: marginL },
      didDrawPage: () => drawReportPdfPageFooter(doc, pageW, marginL),
    });

    const finalY = (doc as any).lastAutoTable.finalY + 4;

    doc.setFillColor(46, 125, 50);
    doc.rect(marginL, finalY, pageW - marginL * 2, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`TOTAL APROBADO — ${report.total} registro(s)`, marginL + 3, finalY + 5.5);
    doc.text(this.formatMoney(report.totalApproved), pageW - marginL - 3, finalY + 5.5, { align: 'right' });

    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`derechos-de-jugador-${today}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    report: GlobalPaymentsReport,
    ctx: PlayerFeesReportPdfContext,
    pageW: number,
    marginL: number
  ): Promise<number> {
    const y0 = await drawReportPdfHeader(doc, { pageW, marginL, subtitle: 'DERECHOS DE JUGADOR' });

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = y0;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) => drawReportPdfContextRow(doc, label, value, x, yy);

    if (ctx.dateFrom || ctx.dateTo) {
      row('Período', `${ctx.dateFrom ?? '—'} al ${ctx.dateTo ?? '—'}`, col1x, y);
      y += lineH;
    }

    const extra: string[] = [];
    if (ctx.conceptLabel) extra.push(`Tipo de cobro: ${ctx.conceptLabel}`);
    if (ctx.statusLabel) extra.push(`Estado: ${ctx.statusLabel}`);
    if (ctx.methodLabel) extra.push(`Método: ${ctx.methodLabel}`);
    if (extra.length) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(80, 80, 80);
      doc.text(extra.join('   ·   '), col1x, y);
      y += lineH;
    }

    row('Registros', String(report.total), col1x, y);
    row('Total aprobado', this.formatMoney(report.totalApproved), col2x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y, pageW - marginL, y);

    return y + 6;
  }

  private formatMoney(amount: number): string {
    return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatDate(date: string | Date): string {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('es-AR', { timeZone: 'UTC' });
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