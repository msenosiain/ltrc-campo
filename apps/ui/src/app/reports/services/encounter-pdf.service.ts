import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EncounterReport } from '../../payments/services/payments.service';
import { REPORT_PDF_COLORS, drawReportPdfContextRow, drawReportPdfHeader } from './report-pdf.util';

@Injectable({ providedIn: 'root' })
export class EncounterPdfService {
  private readonly PRIMARY = REPORT_PDF_COLORS.primary;
  private readonly HEADER_BG = REPORT_PDF_COLORS.headerBg;
  private readonly SECTION_BG = REPORT_PDF_COLORS.sectionBg;

  async generate(report: EncounterReport): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const marginL = 14;

    let y = await this.drawHeader(doc, report, pageW, marginL);

    for (const cat of report.categories) {
      if (y > 240) {
        doc.addPage();
        y = 20;
      }

      // Category section header
      doc.setFillColor(...this.HEADER_BG);
      doc.rect(marginL, y, pageW - marginL * 2, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(
        `${cat.categoryLabel.toUpperCase()}   ·   ${cat.count} pago(s)   ·   $${this.formatMoney(cat.total)}`,
        marginL + 3,
        y + 5
      );
      y += 7;

      if (cat.payments.length === 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(150, 150, 150);
        doc.text('Sin pagos registrados', marginL + 4, y + 5);
        y += 10;
        continue;
      }

      autoTable(doc, {
        startY: y,
        head: [['Jugador', 'DNI', 'Concepto', 'Método', 'Monto', 'Fecha']],
        body: cat.payments.map((p) => [
          p.playerName,
          p.playerDni,
          p.concept,
          this.methodLabel(p.method),
          this.formatMoney(p.amount),
          p.date,
        ]),
        theme: 'grid',
        headStyles: {
          fillColor: [60, 60, 60],
          textColor: 255,
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
        },
        bodyStyles: {
          fontSize: 8,
          textColor: this.PRIMARY,
          lineColor: [200, 200, 200],
          lineWidth: 0.3,
        },
        alternateRowStyles: { fillColor: this.SECTION_BG },
        columnStyles: {
          0: { cellWidth: 42 },           // Jugador
          1: { cellWidth: 22, halign: 'center' }, // DNI
          2: { cellWidth: 'auto' },       // Concepto — toma el espacio restante
          3: { cellWidth: 24, halign: 'center' }, // Método
          4: { cellWidth: 20, halign: 'right' },  // Monto
          5: { cellWidth: 20, halign: 'center' }, // Fecha
        },
        margin: { left: marginL, right: marginL },
      });

      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // Grand total row
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFillColor(46, 125, 50);
    doc.rect(marginL, y, pageW - marginL * 2, 8, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('TOTAL GENERAL', marginL + 3, y + 5.5);
    doc.text(this.formatMoney(report.grandTotal), pageW - marginL - 3, y + 5.5, { align: 'right' });

    const filename = `informe-encuentro-${report.date.replace(/\//g, '-')}.pdf`;
    doc.save(filename);
  }

  private async drawHeader(doc: jsPDF, report: EncounterReport, pageW: number, marginL: number): Promise<number> {
    const y0 = await drawReportPdfHeader(doc, { pageW, marginL, subtitle: 'INFORME DE COBROS — ENCUENTRO' });

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = y0;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) => drawReportPdfContextRow(doc, label, value, x, yy);

    row('Encuentro', report.encounterLabel, col1x, y);
    if (report.opponent) row('Rival', report.opponent, col2x, y);
    y += lineH;

    const dateLabel = report.time ? `${report.date} · ${report.time}hs` : report.date;
    row('Fecha', dateLabel, col1x, y);
    row('Categorías', report.categories.map((c) => c.categoryLabel).join(', '), col2x, y);
    y += lineH;

    row('Total cobrado', this.formatMoney(report.grandTotal), col1x, y);
    row('Cantidad de pagos', String(report.grandCount), col2x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y + 1, pageW - marginL, y + 1);

    return y + 7;
  }

  private formatMoney(amount: number): string {
    return '$' + amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private methodLabel(method: string): string {
    const labels: Record<string, string> = {
      cash: 'Efectivo',
      transfer: 'Transferencia',
      mercadopago: 'Mercado Pago',
    };
    return labels[method] ?? method;
  }
}
