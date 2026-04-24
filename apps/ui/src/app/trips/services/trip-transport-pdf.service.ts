import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import { Trip, TripParticipant, TripParticipantTypeEnum, TripTransport } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';

@Injectable({ providedIn: 'root' })
export class TripTransportPdfService {
  private readonly LOGO_PATH = '/escudo.png';
  private readonly COPIES_PER_TRANSPORT = 2;

  async generate(trip: Trip): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const transports = trip.transports ?? [];

    if (transports.length === 0) return;

    const logoBase64 = await this.loadLogo();
    let firstPage = true;

    for (const transport of transports) {
      const categories = this.getTransportCategories(trip.participants, transport);
      for (let copy = 0; copy < this.COPIES_PER_TRANSPORT; copy++) {
        if (!firstPage) doc.addPage();
        firstPage = false;
        await this.drawCartel(doc, transport, categories, trip.destination, logoBase64);
      }
    }

    const filename = `carteles-${trip.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
    doc.save(filename);
  }

  private async drawCartel(
    doc: jsPDF,
    transport: TripTransport,
    categories: string[],
    destination: string,
    logoBase64: string | null,
  ): Promise<void> {
    const W  = doc.internal.pageSize.getWidth();   // 210mm
    const H  = doc.internal.pageSize.getHeight();  // 297mm
    const cx = W / 2;
    const pad = 12;
    const splitY = H * 0.40;   // 40% para el escudo (~119mm)

    const maxWidth = W - pad * 2;

    // ══ ZONA SUPERIOR 40% — Escudo ════════════════════════════════════════
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, W, splitY, 'F');

    // Escudo centrado verticalmente en la zona blanca
    const logoSize = splitY * 0.68;
    const logoX = cx - logoSize / 2;
    const logoY = (splitY - logoSize) / 2 - 4;
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', logoX, logoY, logoSize, logoSize);
    }

    // Nombre del club justo antes del split
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('LOS TORDOS RUGBY CLUB', cx, splitY - 5, { align: 'center' });

    // ══ ZONA INFERIOR 60% — Info ══════════════════════════════════════════
    // Separador fino entre zonas
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(pad, splitY, W - pad, splitY);

    // Espacio disponible para la info
    const infoH   = H - splitY;      // ~178mm
    const infoTop = splitY + 10;

    // ── NOMBRE DEL TRANSPORTE ─────────────────────────────────────────────
    const nameText = transport.name.toUpperCase();
    let nameFontSize = 72;
    doc.setFontSize(nameFontSize);
    while (doc.getTextWidth(nameText) > maxWidth && nameFontSize > 32) {
      nameFontSize -= 2;
      doc.setFontSize(nameFontSize);
    }
    const nameY = infoTop + infoH * 0.22;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 15, 15);
    doc.text(nameText, cx, nameY, { align: 'center' });

    // Línea divisoria gruesa
    const divY = nameY + 6;
    doc.setFillColor(18, 18, 18);
    doc.rect(pad, divY, W - pad * 2, 1.5, 'F');

    // ── CATEGORÍAS ────────────────────────────────────────────────────────
    if (categories.length > 0) {
      const catText = categories.join('   ');
      let catFontSize = 64;
      doc.setFontSize(catFontSize);
      while (doc.getTextWidth(catText) > maxWidth && catFontSize > 24) {
        catFontSize -= 2;
        doc.setFontSize(catFontSize);
      }
      const catY = divY + infoH * 0.30;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(20, 20, 20);
      doc.text(catText, cx, catY, { align: 'center' });
    }

    // ── HORA DE SALIDA ────────────────────────────────────────────────────
    if (transport.departureTime) {
      const timeY = splitY + infoH * 0.76;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(42);
      doc.setTextColor(30, 30, 30);
      doc.text(`SALIDA: ${this.formatTime(transport.departureTime)}`, cx, timeY, { align: 'center' });
    }

    // ── Empresa / notas ───────────────────────────────────────────────────
    const detailY = splitY + infoH * 0.90;
    if (transport.company) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.setTextColor(120, 120, 120);
      doc.text(transport.company.toUpperCase(), cx, detailY, { align: 'center' });
    }
    if (transport.notes) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(160, 160, 160);
      doc.text(transport.notes, cx, detailY + (transport.company ? 8 : 0), {
        align: 'center', maxWidth,
      });
    }

      // ── Pie ───────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text('lostordos.com.ar', cx, H - 5, { align: 'center' });
  }

  private formatTime(time: string): string {
    // Extraer solo HH:MM ignorando cualquier sufijo AM/PM preexistente
    const match = time.match(/(\d{1,2}):(\d{2})/);
    if (!match) return time;
    const h = parseInt(match[1], 10);
    const m = match[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${ampm}`;
  }

  private getTransportCategories(participants: TripParticipant[], transport: TripTransport): string[] {
    const cats = new Set<string>();
    for (const p of participants) {
      if (p.transportId !== transport.id) continue;
      if (p.type === TripParticipantTypeEnum.PLAYER) {
        const cat = (p.player as any)?.category;
        if (cat) cats.add(getCategoryLabel(cat));
      }
    }
    return [...cats].sort();
  }

  private async loadLogo(): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = this.LOGO_PATH;
    });
  }
}
