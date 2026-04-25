import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { Match, SquadEntry } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';
import { API_CONFIG_TOKEN } from '../../app.config';

@Injectable({ providedIn: 'root' })
export class SquadPdfService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_CONFIG_TOKEN).baseUrl;
  private readonly LOGO_PATH = '/escudo.png';
  private readonly PRIMARY = [30, 30, 30] as [number, number, number];
  private readonly HEADER_BG = [20, 20, 20] as [number, number, number];
  private readonly SECTION_BG = [245, 245, 245] as [number, number, number];

  async generateSquad(match: Match, squadRows: SquadEntry[]): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();

    let y = await this.drawHeader(doc, match, pageW);

    const titulares = squadRows.filter((e) => e.shirtNumber <= 15).sort((a, b) => a.shirtNumber - b.shirtNumber);
    const suplentes = squadRows.filter((e) => e.shirtNumber > 15).sort((a, b) => a.shirtNumber - b.shirtNumber);

    if (titulares.length) {
      y = this.drawSection(doc, 'TITULARES', titulares, y, pageW);
    }
    if (suplentes.length) {
      this.drawSection(doc, 'SUPLENTES', suplentes, y + 4, pageW);
    }

    doc.save(this.buildFilename(match, 'plantel'));
  }

  async generatePosters(match: Match, squadRows: SquadEntry[]): Promise<void> {
    const PAGE_W = 210;
    const PAGE_H = 297;
    const STRIP_H = PAGE_H / 4;   // 74.25 mm — 4 horizontal bands per page

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const escudoB64 = await this.loadImageAsBase64(this.LOGO_PATH).catch(() => null);
    const tourneyB64 = await this.loadTournamentLogo(match).catch(() => null);

    const dateStr = match.date ? format(new Date(match.date), 'dd/MM/yyyy') : '';
    const rival = match.opponent ?? '';
    const sorted = [...squadRows].sort((a, b) => a.shirtNumber - b.shirtNumber);

    sorted.forEach((entry, i) => {
      if (i > 0 && i % 4 === 0) {
        this.drawStripGuides(doc, PAGE_W, PAGE_H, STRIP_H);
        doc.addPage();
      }
      const slot = i % 4;
      this.drawPosterStrip(doc, entry, slot * STRIP_H, PAGE_W, STRIP_H,
        escudoB64, tourneyB64, dateStr, rival);
    });

    this.drawStripGuides(doc, PAGE_W, PAGE_H, STRIP_H);
    doc.save(this.buildFilename(match, 'carteles'));
  }

  private drawPosterStrip(
    doc: jsPDF,
    entry: SquadEntry,
    y0: number,
    pageW: number,
    stripH: number,
    escudoB64: string | null,
    tourneyB64: string | null,
    dateStr: string,
    rival: string
  ): void {
    const NAVY: [number, number, number] = [15, 23, 74];
    const vCenter = y0 + stripH / 2;
    const padding = 6;

    // ── Left zone: tournament logo (0 → 58mm) ───────────────────────────────
    const logoZoneW = 58;
    if (tourneyB64) {
      const maxLogoH = stripH - padding * 2;
      const maxLogoW = logoZoneW - padding * 2;
      const logoSize = Math.min(maxLogoH, maxLogoW, 34);
      doc.addImage(
        tourneyB64, 'PNG',
        logoZoneW / 2 - logoSize / 2,
        vCenter - logoSize / 2,
        logoSize, logoSize
      );
    }

    // ── Right zone: club escudo (155mm → 210mm) ──────────────────────────────
    const escudoZoneX = 155;
    const escudoZoneW = pageW - escudoZoneX;
    if (escudoB64) {
      const escudoSize = Math.min(stripH - padding * 2, escudoZoneW - padding * 2, 34);
      doc.addImage(
        escudoB64, 'PNG',
        escudoZoneX + escudoZoneW / 2 - escudoSize / 2,
        vCenter - escudoSize / 2,
        escudoSize, escudoSize
      );
    }

    // ── Center zone: surname + info (58mm → 155mm) ──────────────────────────
    const nameZoneX = logoZoneW;
    const nameZoneW = escudoZoneX - logoZoneW;  // 97mm
    const cx = nameZoneX + nameZoneW / 2;

    const surname = this.extractSurname(entry.player.name);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);

    let fontSize = 48;
    doc.setFontSize(fontSize);
    while (doc.getTextWidth(surname) > nameZoneW - 4 && fontSize > 16) {
      fontSize -= 2;
      doc.setFontSize(fontSize);
    }

    // Position surname slightly above center to leave room for date/rival
    const surnameY = vCenter + fontSize * 0.18;
    doc.text(surname, cx, surnameY, { align: 'center' });

    // Date + rival — small, below surname
    const infoLine = [dateStr, rival].filter(Boolean).join('  ·  ');
    if (infoLine) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 130);
      doc.text(infoLine, cx, surnameY + fontSize * 0.38 + 2, { align: 'center' });
    }
  }

  private drawStripGuides(doc: jsPDF, pageW: number, pageH: number, stripH: number): void {
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.4);
    // Horizontal cut lines between the 4 strips
    for (let i = 1; i < 4; i++) {
      doc.line(0, i * stripH, pageW, i * stripH);
    }
  }

  private extractSurname(fullName: string | undefined): string {
    if (!fullName) return '—';
    // Format assumed: "Apellido Nombre" — take the first word
    return fullName.trim().split(/\s+/)[0].toUpperCase();
  }

  private async loadTournamentLogo(match: Match): Promise<string> {
    const tournament = match.tournament as any;
    if (!tournament?.id || !tournament?.logoFileId) return Promise.reject('no tournament logo');
    const url = `${this.apiBase}/tournaments/${tournament.id}/logo`;
    const blob = await firstValueFrom(this.http.get(url, { responseType: 'blob' }));
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async generateRunSheet(match: Match): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    await this.drawRunSheet(doc, match, pageW, false);
    doc.save(this.buildFilename(match, 'run-sheet'));
  }

  private async drawHeader(doc: jsPDF, match: Match, pageW: number): Promise<number> {
    const logoSize = 18;
    const marginL = 14;

    // Load logo
    try {
      const logoBase64 = await this.loadImageAsBase64(this.LOGO_PATH);
      doc.addImage(logoBase64, 'PNG', marginL, 10, logoSize, logoSize);
    } catch {
      // Logo not available, skip
    }

    // Club name
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...this.PRIMARY);
    doc.text('LOS TORDOS RUGBY CLUB', marginL + logoSize + 5, 17);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('PLANTEL — PARTIDO', marginL + logoSize + 5, 24);

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(marginL, 32, pageW - marginL, 32);

    // Match data
    const date = match.date ? new Date(match.date) : null;
    const dateStr = date ? format(date, 'dd/MM/yyyy HH:mm') : '—';
    const localidad = match.isHome === true ? 'Local' : match.isHome === false ? 'Visitante' : '—';
    const rival = match.opponent || 'Sin rival';
    const torneo = (match.tournament as any)?.name ?? '—';

    doc.setFontSize(9);
    doc.setTextColor(...this.PRIMARY);

    const col1x = marginL;
    const col2x = pageW / 2;
    let y = 39;
    const lineH = 6;

    const row = (label: string, value: string, x: number, yy: number) => {
      doc.setFont('helvetica', 'bold');
      const labelText = `${label}: `;
      const labelW = doc.getTextWidth(labelText);
      doc.text(labelText, x, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(value, x + labelW, yy);
    };

    row('Fecha', dateStr, col1x, y);
    row('Condición', localidad, col2x, y);
    y += lineH;
    row('Sede', match.venue ?? '—', col1x, y);
    row('Rival', rival, col2x, y);
    y += lineH;
    row('Categoría', getCategoryLabel(match.category) || '—', col1x, y);
    row('División', match.division ?? '—', col2x, y);
    y += lineH;
    row('Torneo', torneo, col1x, y);
    y += lineH;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y + 1, pageW - marginL, y + 1);

    return y + 5;
  }

  private drawSection(doc: jsPDF, title: string, rows: SquadEntry[], startY: number, pageW: number): number {
    const marginL = 14;

    // Section title
    doc.setFillColor(...this.HEADER_BG);
    doc.rect(marginL, startY, pageW - marginL * 2, 7, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(title, marginL + 3, startY + 5);

    const tableData = rows.map((e) => {
      const dorsal = e.dorsalNumber !== undefined && e.dorsalNumber !== e.shirtNumber
        ? String(e.dorsalNumber)
        : String(e.shirtNumber);
      const name = e.player.name ?? '—';
      return [
        String(e.shirtNumber),
        dorsal,
        this.formatDni(e.player.idNumber),
        e.isCaptain ? `${name} (C)` : name,
        e.player.clothingSizes?.jersey ?? '—',
        e.player.clothingSizes?.shorts ?? '—',
      ];
    });

    autoTable(doc, {
      startY: startY + 7,
      head: [['Pos', 'Dorsal', 'DNI', 'Nombre', 'Camiseta', 'Short']],
      body: tableData,
      theme: 'grid',
      headStyles: {
        fillColor: [60, 60, 60],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      bodyStyles: {
        fontSize: 8.5,
        textColor: this.PRIMARY,
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
      },
      alternateRowStyles: {
        fillColor: this.SECTION_BG,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 14 },
        2: { halign: 'center', cellWidth: 28 },
        3: { cellWidth: 'auto' },
        4: { halign: 'center', cellWidth: 20 },
        5: { halign: 'center', cellWidth: 20 },
      },
      margin: { left: marginL, right: marginL },
    });

    return (doc as any).lastAutoTable.finalY as number;
  }

  private formatDni(dni: string | undefined): string {
    if (!dni) return '—';
    const clean = dni.replace(/\D/g, '');
    if (clean.length === 8) {
      return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
    }
    return dni;
  }

  private async drawRunSheet(doc: jsPDF, match: Match, pageW: number, addPage = true): Promise<void> {
    if (addPage) doc.addPage();
    const marginL = 14;
    const contentW = pageW - marginL * 2;

    // ── Header ───────────────────────────────────────────────────────────────
    const logoSize = 16;
    try {
      const logoBase64 = await this.loadImageAsBase64(this.LOGO_PATH);
      doc.addImage(logoBase64, 'PNG', marginL, 10, logoSize, logoSize);
    } catch { /* skip */ }

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...this.PRIMARY);
    doc.text('LOS TORDOS RUGBY CLUB', marginL + logoSize + 4, 16);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('HOJA DE RUTA — DIA DEL PARTIDO', marginL + logoSize + 4, 22);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.4);
    doc.line(marginL, 30, pageW - marginL, 30);

    // ── Datos del partido ────────────────────────────────────────────────────
    const kickoffTime = this.resolveKickoffTime(match);
    const dateStr = match.date
      ? format(new Date(match.date), 'dd/MM/yyyy')
      : '—';
    const timeLabel = match.time ?? (kickoffTime ? format(kickoffTime, 'HH:mm') : '—');
    const localidad = match.isHome === true ? 'Local' : match.isHome === false ? 'Visitante' : '—';
    const torneo = (match.tournament as any)?.name ?? '—';

    doc.setFontSize(8.5);
    doc.setTextColor(...this.PRIMARY);

    const col1 = marginL;
    const col2 = marginL + contentW * 0.38;
    const col3 = marginL + contentW * 0.68;

    const infoRow = (label: string, value: string, x: number, yy: number) => {
      doc.setFont('helvetica', 'bold');
      const lw = doc.getTextWidth(`${label}: `);
      doc.text(`${label}: `, x, yy);
      doc.setFont('helvetica', 'normal');
      doc.text(value, x + lw, yy);
    };

    let y = 37;
    infoRow('Fecha', dateStr, col1, y);
    infoRow('Hora', timeLabel, col2, y);
    infoRow('Condición', localidad, col3, y);
    y += 6;
    infoRow('Rival', match.opponent ?? '—', col1, y);
    infoRow('Sede', match.venue ?? '—', col2, y);
    infoRow('Torneo', torneo, col3, y);
    y += 6;
    infoRow('Categoría', getCategoryLabel(match.category) || '—', col1, y);
    infoRow('División', match.division ?? '—', col2, y);
    y += 5;

    doc.setDrawColor(200, 200, 200);
    doc.line(marginL, y, pageW - marginL, y);
    y += 4;

    // ── Árbitros ─────────────────────────────────────────────────────────────
    doc.setFillColor(...this.HEADER_BG);
    doc.rect(marginL, y, contentW, 6.5, 'F');
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('ÁRBITROS', marginL + 3, y + 4.5);
    y += 6.5;

    const md = (match as any).matchDay ?? {};
    const colW = contentW / 3;
    autoTable(doc, {
      startY: y,
      head: [['Arbitro principal', 'Juez de linea 1', 'Juez de linea 2']],
      body: [
        [md.referee ?? '', md.ar1 ?? '', md.ar2 ?? ''],
        [{ content: `Head Coach: ${md.headCoach ?? ''}`, colSpan: 3, styles: { fontStyle: 'normal' } }],
      ],
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60], textColor: 255, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      bodyStyles: { fontSize: 8, textColor: this.PRIMARY, lineColor: [200, 200, 200], lineWidth: 0.3, cellPadding: 3, minCellHeight: 9, halign: 'center' },
      columnStyles: {
        0: { cellWidth: colW },
        1: { cellWidth: colW },
        2: { cellWidth: colW },
      },
      margin: { left: marginL, right: marginL },
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    // ── Cronograma ───────────────────────────────────────────────────────────
    const abs = (offsetMin: number): string =>
      kickoffTime ? format(new Date(kickoffTime.getTime() + offsetMin * 60000), 'HH:mm') : '—';

    const tableOpts = (rows: [string, string, string][], showHead: boolean) => ({
      theme: 'grid' as const,
      head: showHead ? [['Hora', 'Actividad', 'Responsable']] : undefined,
      body: rows,
      headStyles: { fillColor: [60, 60, 60] as [number,number,number], textColor: 255 as unknown as [number,number,number], fontStyle: 'bold' as const, fontSize: 7.5, halign: 'center' as const },
      bodyStyles: { fontSize: 7.5, textColor: this.PRIMARY, lineColor: [200, 200, 200] as [number,number,number], lineWidth: 0.3, cellPadding: 2 },
      columnStyles: {
        0: { halign: 'center' as const, cellWidth: 16, fontStyle: 'bold' as const },
        1: { cellWidth: 'auto' as const },
        2: { cellWidth: 34 },
      },
      margin: { left: marginL, right: marginL },
    });

    const sectionBar = (title: string, yy: number) => {
      doc.setFillColor(50, 50, 50);
      doc.rect(marginL, yy, contentW, 6, 'F');
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text(title, marginL + 3, yy + 4.2);
    };

    // PRE-PARTIDO
    sectionBar('PRE-PARTIDO', y);
    y += 6;
    autoTable(doc, {
      ...tableOpts([
        [abs(-120), 'Llegada del plantel al club. El manager verifica vestuarios y campo.', 'Manager'],
        [abs(-105), 'Inicio de vendajes y kinesioterapia. Confirmacion de medico y ambulancia (Fondo Solidario UAR).', 'Medico / Kinesiologo'],
        [abs(-90),  'Cierre administrativo: carga final de la TEP en el sistema BD.UAR.', 'Manager'],
        [abs(-75),  'Charla tecnica: repaso del plan de juego y objetivos del dia.', 'Staff tecnico'],
        [abs(-60),  'Entrada en calor: movilidad, destrezas por unidad (scrum/line) y drills de alta intensidad.', 'DT'],
        [abs(-25),  'Regreso al vestuario: ultima hidratacion, camisetas y arenga final.', 'Capitan'],
        [abs(-15),  'Control de arbitros: sorteo (toss) y revision de equipamiento (tapones y bucales).', 'Arbitro'],
      ], true),
      startY: y,
    });
    y = (doc as any).lastAutoTable.finalY + 1;

    // EL PARTIDO
    sectionBar('EL PARTIDO', y);
    y += 6;
    autoTable(doc, {
      ...tableOpts([
        [abs(0),   '>> KICK-OFF: inicio del encuentro.',                                         'Arbitro'],
        [abs(40),  'Entretiempo: descanso de 10 a 15 minutos para ajustes tacticos.',            'DT'],
        [abs(55),  'Inicio del segundo tiempo.',                                                  'Arbitro'],
        [abs(100), '>> FINAL DEL PARTIDO: saludo protocolar entre jugadores y arbitros.',        'Arbitro'],
      ], false),
      startY: y,
    });
    y = (doc as any).lastAutoTable.finalY + 1;

    // POST-PARTIDO
    sectionBar('POST-PARTIDO Y TERCER TIEMPO', y);
    y += 6;
    autoTable(doc, {
      ...tableOpts([
        [abs(105), 'Hidratacion y evaluacion de lesionados. El medico reporta sospechas de concusion cerebral.', 'Medico'],
        [abs(135), 'Firma de acta: el arbitro y los capitanes cierran la TEP con el resultado final.', 'Arbitro / Capitanes'],
        [abs(180), 'Tercer tiempo: evento social de camaraderia entre ambos clubes y los arbitros.', ''],
      ], false),
      startY: y,
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    // ── Notas ────────────────────────────────────────────────────────────────
    const remaining = doc.internal.pageSize.getHeight() - y - 10;
    if (remaining > 18) {
      doc.setFillColor(...this.HEADER_BG);
      doc.rect(marginL, y, contentW, 6.5, 'F');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(255, 255, 255);
      doc.text('NOTAS', marginL + 3, y + 4.5);
      y += 6.5;

      const noteH = Math.min(remaining - 6.5, 30);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.rect(marginL, y, contentW, noteH);

      // Horizontal lines inside notes box
      const lineSpacing = 6;
      for (let ly = y + lineSpacing; ly < y + noteH - 2; ly += lineSpacing) {
        doc.setDrawColor(220, 220, 220);
        doc.line(marginL + 2, ly, marginL + contentW - 2, ly);
      }
    }
  }

  private resolveKickoffTime(match: Match): Date | null {
    if (!match.date) return null;
    const base = new Date(match.date);
    if (match.time) {
      const parts = match.time.split(':');
      if (parts.length >= 2) {
        base.setHours(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
        return base;
      }
    }
    return base;
  }

  private buildFilename(match: Match, suffix: string): string {
    const division = match.division?.replace(/\s+/g, '-').toLowerCase() ?? 'sin-division';
    const rival = match.opponent?.replace(/\s+/g, '-').toLowerCase() ?? 'sin-rival';
    const date = match.date ? format(new Date(match.date), 'yyyyMMdd') : 'sin-fecha';
    return `${division}-${rival}-${date}-${suffix}.pdf`;
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
