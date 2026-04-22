import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { CategoryEnum, PaymentMethodEnum, SportEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import { GlobalPaymentRow, GlobalPaymentsReport } from '../../payments/services/payments.service';

export interface PaymentsReportPdfContext {
  sport?: string | null;
  category?: string | null;
  tournamentName?: string | null;
  statusLabel?: string | null;
  methodLabel?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}

@Injectable({ providedIn: 'root' })
export class PaymentsReportPdfService {
  private readonly LOGO_PATH = '/escudo.png';
  private readonly PRIMARY: [number, number, number] = [30, 30, 30];
  private readonly HEADER_BG: [number, number, number] = [20, 20, 20];
  private readonly SECTION_BG: [number, number, number] = [245, 245, 245];

  async generate(report: GlobalPaymentsReport, ctx: PaymentsReportPdfContext): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    let y = await this.drawHeader(doc, report, ctx, pageW, marginL);

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
      head: [['Fecha', 'Jugador', 'DNI', 'Deporte / Cat.', 'Concepto', 'Método', 'Monto', 'Estado']],
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
        0: { cellWidth: 16, halign: 'center' },   // Fecha
        1: { cellWidth: 'auto' },                  // Jugador
        2: { cellWidth: 20, halign: 'center' },    // DNI
        3: { cellWidth: 22 },                      // Deporte/Cat
        4: { cellWidth: 24 },                      // Concepto
        5: { cellWidth: 20, halign: 'center' },    // Método
        6: { cellWidth: 18, halign: 'right' },     // Monto
        7: { cellWidth: 18, halign: 'center' },    // Estado
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

    const finalY = (doc as any).lastAutoTable.finalY + 4;

    // Fila total
    doc.setFillColor(46, 125, 50);
    doc.rect(marginL, finalY, pageW - marginL * 2, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`TOTAL APROBADO — ${report.total} registro(s)`, marginL + 3, finalY + 5.5);
    doc.text(this.formatMoney(report.totalApproved), pageW - marginL - 3, finalY + 5.5, { align: 'right' });

    const today = new Date().toLocaleDateString('es-AR').replace(/\//g, '-');
    doc.save(`informe-pagos-${today}.pdf`);
  }

  private async drawHeader(
    doc: jsPDF,
    report: GlobalPaymentsReport,
    ctx: PaymentsReportPdfContext,
    pageW: number,
    marginL: number
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
    doc.text('INFORME DE PAGOS', marginL + logoSize + 5, 24);

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

    // Fila 1: torneo / deporte+categoría
    if (ctx.tournamentName) {
      row('Torneo', ctx.tournamentName, col1x, y);
    }
    const sportCat = this.buildSportCatText(ctx);
    if (sportCat) row('Ámbito', sportCat, ctx.tournamentName ? col2x : col1x, y);
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
    if (ctx.sport) parts.push(ctx.sport === SportEnum.RUGBY ? 'Rugby' : 'Hockey');
    if (ctx.category) parts.push(getCategoryLabel(ctx.category as CategoryEnum));
    return parts.join(' — ');
  }

  private formatMoney(amount: number): string {
    return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private formatDate(date: string | Date): string {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleDateString('es-AR', { timeZone: 'UTC' });
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
