import { Injectable } from '@angular/core';
import * as XLSX from 'xlsx-js-style';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Trip, TripParticipant, TripParticipantStatusEnum, TripParticipantTypeEnum, TripTransport } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import { getParticipantTypeLabel } from '../trip-options';

const LOGO_PATH = '/escudo.png';
const MARGIN_L = 14;
const COLS = 5;
const PRIMARY: [number, number, number] = [30, 30, 30];

const XLSX_STYLE = {
  title:     { font: { bold: true, sz: 14 } },
  info:      { font: { sz: 10, italic: true, color: { rgb: '666666' } } },
  colHeader: {
    font:   { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
    fill:   { patternType: 'solid', fgColor: { rgb: '1E1E1E' } },
  },
  data:      { font: { sz: 10 } },
};

@Injectable({ providedIn: 'root' })
export class TripPassengerExportService {

  // ── Excel ─────────────────────────────────────────────────────────────────

  generateExcel(trip: Trip, transport?: TripTransport): void {
    const wb = XLSX.utils.book_new();

    if (transport) {
      XLSX.utils.book_append_sheet(wb, this.buildSheet(trip, transport), transport.name.substring(0, 31));
      XLSX.writeFile(wb, `pasajeros-${this.slugify(transport.name)}.xlsx`);
    } else {
      for (const t of trip.transports ?? []) {
        XLSX.utils.book_append_sheet(wb, this.buildSheet(trip, t), t.name.substring(0, 31));
      }
      XLSX.writeFile(wb, `pasajeros-${this.slugify(trip.name)}.xlsx`);
    }
  }

  private buildSheet(trip: Trip, transport: TripTransport): XLSX.WorkSheet {
    const participants = this.getConfirmedInTransport(trip, transport.id!);
    const departureDate = new Date(trip.departureDate).toLocaleDateString('es-AR', {
      timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    const metaParts: string[] = [
      `Salida: ${departureDate}`,
      `Destino: ${trip.destination}`,
      ...(transport.company     ? [`Empresa: ${transport.company}`]           : []),
      ...(transport.departureTime ? [`Hora: ${transport.departureTime}`]      : []),
      `Pasajeros: ${participants.length} / ${transport.capacity}`,
    ];

    const aoa: unknown[][] = [
      [`VIAJE: ${trip.name.toUpperCase()}  —  ${transport.name.toUpperCase()}`],
      [metaParts.join('   ·   ')],
      [],
      ['N°', 'Apellido y nombre', 'DNI', 'Categoría / Rol', 'Tipo'],
      ...participants.map((p, i) => [
        i + 1,
        this.getParticipantName(p),
        this.getParticipantDni(p) ?? '',
        this.getParticipantCategory(p),
        getParticipantTypeLabel(p.type),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: COLS - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: COLS - 1 } },
    ];
    ws['!cols'] = [{ wch: 5 }, { wch: 36 }, { wch: 15 }, { wch: 22 }, { wch: 12 }];

    this.applyXlsxStyle(ws, 'A1', XLSX_STYLE.title);
    this.applyXlsxStyle(ws, 'A2', XLSX_STYLE.info);
    for (const col of ['A', 'B', 'C', 'D', 'E']) {
      this.applyXlsxStyle(ws, `${col}4`, XLSX_STYLE.colHeader);
    }

    // Estilo a filas de datos (fila 5 en adelante, índice 0-based desde 4)
    const DATA_ROW_START = 4;
    for (let r = DATA_ROW_START; r < DATA_ROW_START + participants.length; r++) {
      for (let c = 0; c < COLS; c++) {
        this.applyXlsxStyle(ws, XLSX.utils.encode_cell({ r, c }), XLSX_STYLE.data);
      }
    }

    return ws;
  }

  private applyXlsxStyle(ws: XLSX.WorkSheet, addr: string, style: object): void {
    if (ws[addr]) (ws[addr] as any).s = style;
  }

  // ── PDF ───────────────────────────────────────────────────────────────────

  async generatePdf(trip: Trip, transport?: TripTransport): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const transports = transport ? [transport] : (trip.transports ?? []);
    const logoBase64 = await this.loadLogo();
    let firstPage = true;

    for (const t of transports) {
      if (!firstPage) doc.addPage();
      firstPage = false;
      this.drawPassengerList(doc, trip, t, logoBase64);
    }

    const suffix = transport ? this.slugify(transport.name) : this.slugify(trip.name);
    doc.save(`pasajeros-${suffix}.pdf`);
  }

  private drawPassengerList(
    doc: jsPDF,
    trip: Trip,
    transport: TripTransport,
    logoBase64: string | null,
  ): void {
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const participants = this.getConfirmedInTransport(trip, transport.id!);

    // ── Encabezado (estilo run sheet) ─────────────────────────────────────
    const logoSize = 16;
    if (logoBase64) {
      doc.addImage(logoBase64, 'PNG', MARGIN_L, 10, logoSize, logoSize);
    }

    const textX = MARGIN_L + logoSize + 4;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...PRIMARY);
    doc.text('LOS TORDOS RUGBY CLUB', textX, 16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text('LISTADO DE PASAJEROS', textX, 22);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(MARGIN_L, 30, pageW - MARGIN_L, 30);

    // ── Info del viaje ────────────────────────────────────────────────────
    const departureDate = new Date(trip.departureDate).toLocaleDateString('es-AR', {
      timeZone: 'UTC', day: '2-digit', month: '2-digit', year: 'numeric',
    });

    doc.setFontSize(8.5);
    doc.setTextColor(...PRIMARY);

    const col1 = MARGIN_L;
    const col2 = MARGIN_L + (pageW - MARGIN_L * 2) * 0.5;
    let y = 37;
    const lineH = 6;

    const infoRow = (label: string, value: string, x: number, yy: number) => {
      doc.setFont('helvetica', 'bold');
      const lw = doc.getTextWidth(`${label}: `);
      doc.text(`${label}: `, x, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(value, x + lw, yy);
    };

    infoRow('Viaje',      trip.name,       col1, y);
    infoRow('Salida',     departureDate,   col2, y);
    y += lineH;
    infoRow('Destino',    trip.destination, col1, y);
    infoRow('Transporte', transport.name,  col2, y);
    y += lineH;

    const hasMeta = transport.company || transport.departureTime;
    if (hasMeta) {
      if (transport.company)      infoRow('Empresa', transport.company,       col1, y);
      if (transport.departureTime) infoRow('Hora',   transport.departureTime, col2, y);
      y += lineH;
    }

    infoRow('Pasajeros confirmados', `${participants.length} / ${transport.capacity}`, col1, y);

    const now = new Date().toLocaleDateString('es-AR');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(160, 160, 160);
    doc.text(`Generado: ${now}`, pageW - MARGIN_L, 37, { align: 'right' });

    y += lineH;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_L, y, pageW - MARGIN_L, y);
    y += 4;

    // ── Tabla ─────────────────────────────────────────────────────────────
    autoTable(doc, {
      startY: y,
      head: [['N°', 'Apellido y nombre', 'DNI', 'Categoría / Rol', 'Tipo']],
      body: participants.map((p, i) => [
        i + 1,
        this.getParticipantName(p),
        this.getParticipantDni(p) ?? '',
        this.getParticipantCategory(p),
        getParticipantTypeLabel(p.type),
      ]),
      theme: 'grid',
      styles:         { fontSize: 9, cellPadding: 3, textColor: PRIMARY, lineColor: [200, 200, 200], lineWidth: 0.3 },
      headStyles:     { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 70 },
        2: { cellWidth: 28 },
        3: { cellWidth: 42 },
        4: { cellWidth: 28 },
      },
      margin: { left: MARGIN_L, right: MARGIN_L },
    });

    // ── Pie ───────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text('lostordos.com.ar', pageW / 2, pageH - 5, { align: 'center' });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getConfirmedInTransport(trip: Trip, transportId: string): TripParticipant[] {
    return trip.participants.filter(
      (p) => p.transportId === transportId && p.status === TripParticipantStatusEnum.CONFIRMED,
    );
  }

  private getParticipantName(p: TripParticipant): string {
    if (p.type === TripParticipantTypeEnum.PLAYER) return (p.player as any)?.name ?? '(jugador)';
    if (p.type === TripParticipantTypeEnum.STAFF)  return (p as any).user?.name ?? p.userName ?? '(staff)';
    return p.externalName ?? '(externo)';
  }

  private getParticipantDni(p: TripParticipant): string | undefined {
    if (p.type === TripParticipantTypeEnum.PLAYER) return (p.player as any)?.idNumber;
    if (p.type === TripParticipantTypeEnum.STAFF)  return (p as any).user?.idNumber;
    return p.externalDni;
  }

  private getParticipantCategory(p: TripParticipant): string {
    if (p.type === TripParticipantTypeEnum.PLAYER) {
      const cat = (p.player as any)?.category;
      return cat ? getCategoryLabel(cat) : '';
    }
    if (p.type === TripParticipantTypeEnum.STAFF) return p.externalRole ?? 'Staff';
    return p.externalRole ?? '';
  }

  private async loadLogo(): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width  = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(null);
      img.src = LOGO_PATH;
    });
  }

  private slugify(text: string): string {
    return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  }
}
