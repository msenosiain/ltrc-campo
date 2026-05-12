import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Match, SquadEntry } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../common/category-options';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GpsPlayerData {
  shirtNumber: number;
  fullName: string;
  distanceM: number;
  hir: number;
  hsr: number;
  distancePerMin: number;
  topSpeed: number;
  playerLoad: number;
  powerPlays: number;
  impacts: number;
  accelTotal: number;
  decelTotal: number;
  acdPerMin: number;
}

interface ChartDef {
  title: string;
  data: { label: string; value: number }[];
  color: RGB;
  fmt: (v: number) => string;
}

type RGB = [number, number, number];

// ─── Layout constants ─────────────────────────────────────────────────────────

const PW = 210, PH = 297;
const ML = 10, MR = 10, MT = 10, MB = 9;
const CW = PW - ML - MR;

// ─── Color palette ────────────────────────────────────────────────────────────

const NAVY: RGB    = [27, 42, 74];
const MAROON: RGB  = [130, 45, 45];
const SALMON: RGB  = [218, 108, 88];
const WHITE: RGB   = [255, 255, 255];
const OFF_W: RGB   = [248, 249, 252];
const ALT: RGB     = [242, 244, 250];
const BORDER: RGB  = [205, 209, 220];
const TXT: RGB     = [30, 34, 50];
const TXT_MID: RGB = [105, 110, 130];

const LOGO_PATH = '/escudo.png';

// ─── Metric-to-color mapping ──────────────────────────────────────────────────

const TOTAL_SPLIT_NAMES = new Set(['all', 'total', 'full game', 'match', 'game', 'full match', 'all periods', 'todo']);

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class GpsReportPdfService {
  async generateReport(match: Match, csvText: string): Promise<Blob> {
    const players = parseGpsCsv(csvText, match.squad ?? []);
    if (!players.length) {
      const found = [...new Set(csvToObjects(csvText).map(r => r['Split Name']).filter(Boolean))];
      throw new Error(
        `No se encontraron filas para el total del partido. ` +
        `Valores de "Split Name" encontrados: ${found.length ? found.join(', ') : '(ninguno)'}`
      );
    }

    const byDist = [...players].sort((a, b) => b.distanceM - a.distanceM);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const logoB64 = await loadImageAsBase64(LOGO_PATH).catch(() => null);

    drawPage1(doc, match, byDist, logoB64);
    drawPage2(doc, byDist);
    drawPage3(doc, byDist);
    drawPage4(doc, byDist, match);

    return doc.output('blob');
  }
}

// ─── Page 1: Header + KPIs + Table + Resistencia bars ────────────────────────

function drawPage1(doc: jsPDF, match: Match, players: GpsPlayerData[], logoB64: string | null): void {
  let y = MT;
  y = drawHeader(doc, match, players, logoB64, y);
  y = drawMetricKpis(doc, players, y + 5);
  y = drawSectionBar(doc, 'Tabla General de Rendimiento', y + 5, NAVY);
  y = drawTable(doc, players, y + 1);
  y = drawSectionBar(doc, 'Balance de Resistencia', y + 5, MAROON);
  const remainH = PH - MB - y;
  drawBarPair(doc,
    chartDef('Distancia Total (m)',       sorted(players, p => p.distanceM), NAVY,   v => String(Math.round(v))),
    chartDef('HIR — Alta Intensidad (m)', sorted(players, p => p.hir),       MAROON, v => String(Math.round(v))),
    y, remainH);
}

// ─── Page 2: HSR + m/min bars, HIR vs HSR scatter ─────────────────────────────

function drawPage2(doc: jsPDF, players: GpsPlayerData[]): void {
  doc.addPage();
  let y = MT;
  const pairH = calcPairH(players.length, PH - MT - MB - 9 * 3);
  y = drawBarPair(doc,
    chartDef('HSR — Sprint (m)',      sorted(players, p => p.hsr),           MAROON, v => String(Math.round(v))),
    chartDef('Metros por Minuto',     sorted(players, p => p.distancePerMin), NAVY,   v => v.toFixed(1)),
    y, pairH);
  y = drawSectionBar(doc, 'Cuadrante de Resistencia — HIR vs HSR', y + 5, NAVY);
  y = drawSubLabel(doc, 'Dispersión HIR (m) vs HSR (m) — número = dorsal', y + 1);
  const scatterH = PH - MB - y - 13;
  drawScatter(doc, players.map(p => ({ n: p.shirtNumber, x: p.hir, y: p.hsr })),
    ML, y + 2, CW, scatterH, 'HIR (m)', 'HSR (m)');
  drawSectionBar(doc, 'Balance de Velocidad', PH - MB - 8, MAROON);
}

// ─── Page 3: VMax + PowerPlays bars, PowerPlays vs VMax scatter ───────────────

function drawPage3(doc: jsPDF, players: GpsPlayerData[]): void {
  doc.addPage();
  let y = MT;
  const pairH = calcPairH(players.length, PH - MT - MB - 9 * 3);
  y = drawBarPair(doc,
    chartDef('Velocidad Máxima (km/h)', sorted(players, p => p.topSpeed),  MAROON, v => v.toFixed(1)),
    chartDef('Power Plays',             sorted(players, p => p.powerPlays), NAVY,   v => String(Math.round(v))),
    y, pairH);
  y = drawSectionBar(doc, 'Cuadrante de Velocidad — Power Plays vs Velocidad Máxima', y + 5, NAVY);
  y = drawSubLabel(doc, 'Dispersión Power Plays vs Velocidad Máxima (km/h) — número = dorsal', y + 1);
  const scatterH = PH - MB - y - 13;
  drawScatter(doc, players.map(p => ({ n: p.shirtNumber, x: p.powerPlays, y: p.topSpeed })),
    ML, y + 2, CW, scatterH, 'Power Plays', 'Vel. Máx (km/h)');
  drawSectionBar(doc, 'Balance de Fuerza e Impactos', PH - MB - 8, MAROON);
}

// ─── Page 4: 5 bar charts + footer ───────────────────────────────────────────

function drawPage4(doc: jsPDF, players: GpsPlayerData[], match: Match): void {
  doc.addPage();
  let y = MT;

  const tripleW = (CW - 8) / 3;
  const tripleH = calcSlottedH(players.length, (PH - MT - MB - 14 - 4) / 2);
  const triple = [
    chartDef('Aceleraciones',    sorted(players, p => p.accelTotal), NAVY,   v => String(Math.round(v))),
    chartDef('Desaceleraciones', sorted(players, p => p.decelTotal), MAROON, v => String(Math.round(v))),
    chartDef('Player Load',      sorted(players, p => p.playerLoad), NAVY,   v => v.toFixed(1)),
  ];
  triple.forEach((c, i) => {
    drawSingleChart(doc, c, ML + i * (tripleW + 4), y, tripleW, tripleH);
  });
  y += tripleH + 4;

  const pairH = calcSlottedH(players.length, PH - MB - y - 10);
  drawBarPair(doc,
    chartDef('Impactos por Jugador',    sorted(players, p => p.impacts),   NAVY,   v => String(Math.round(v))),
    chartDef('Acel + Desac por Minuto', sorted(players, p => p.acdPerMin), MAROON, v => v.toFixed(1)),
    y, pairH);

  drawFooter(doc, match);
}

// ─── Header block ─────────────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, match: Match, players: GpsPlayerData[], logoB64: string | null, y: number): number {
  const h = 36;
  // Outer card with rounded corners
  doc.setFillColor(...OFF_W);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.4);
  (doc as any).roundedRect(ML, y, CW, h, 2.5, 2.5, 'FD');

  // Logo
  if (logoB64) {
    doc.addImage(logoB64, 'PNG', ML + 3, y + 4, 20, 20);
  }

  // Vertical accent
  doc.setFillColor(...NAVY);
  doc.rect(ML + 26, y + 4, 0.8, 22, 'F');

  // Title
  const titleRaw = match.name
    ?? [(match.division ?? ''), 'vs', (match.opponent ?? '—')].filter(Boolean).join(' ');

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  const titleLines = doc.splitTextToSize(titleRaw, 108) as string[];
  doc.text(titleLines.slice(0, 2), ML + 29, y + 10);

  // Club + tournament
  const tourneyName = (match.tournament as any)?.name;
  const subLine = ['Los Tordos Rugby Club', tourneyName].filter(Boolean).join(' · ');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MAROON);
  doc.text(subLine, ML + 29, y + 10 + titleLines.slice(0, 2).length * 7.2);

  // Metadata
  const dateStr = match.date
    ? (() => { const d = format(new Date(match.date), "EEEE dd 'de' MMMM 'de' yyyy", { locale: es }); return d.charAt(0).toUpperCase() + d.slice(1); })()
    : '—';
  const condition = match.isHome === true ? 'Local' : match.isHome === false ? 'Visitante' : '—';
  const metaLine = [dateStr, condition, getCategoryLabel(match.category), 'Datos GPS: Catapult'].filter(Boolean).join(' | ');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TXT_MID);
  doc.text(metaLine, ML + 29, y + 31);

  // Player count badge (single box, top-right)
  const bx = ML + CW - 22, by = y + 4, bw = 20, bh = 14;
  doc.setFillColor(...NAVY);
  (doc as any).roundedRect(bx, by, bw, bh, 1.5, 1.5, 'F');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text('JUGADORES', bx + bw / 2, by + 5, { align: 'center' });
  doc.setFontSize(13);
  doc.text(String(players.length), bx + bw / 2, by + 12, { align: 'center' });

  return y + h;
}

// ─── KPI metric cards ─────────────────────────────────────────────────────────

function drawMetricKpis(doc: jsPDF, players: GpsPlayerData[], y: number): number {
  const metrics: { label: string; unit: string; getValue: (p: GpsPlayerData) => number; fmt: (v: number) => string }[] = [
    { label: 'DIST. TOTAL PROM.', unit: 'metros por jugador',  getValue: p => p.distanceM,      fmt: v => Math.round(v).toLocaleString('es-AR') },
    { label: 'HIR PROMEDIO',      unit: 'alta intensidad (m)', getValue: p => p.hir,            fmt: v => Math.round(v).toLocaleString('es-AR') },
    { label: 'HSR PROMEDIO',      unit: 'sprint (m)',           getValue: p => p.hsr,            fmt: v => Math.round(v).toLocaleString('es-AR') },
    { label: 'VEL. MÁX PROM.',   unit: 'km/h',                 getValue: p => p.topSpeed,       fmt: v => v.toFixed(1) },
    { label: 'POWER PLAYS PROM.', unit: 'acciones potencia',   getValue: p => p.powerPlays,     fmt: v => Math.round(v).toLocaleString('es-AR') },
    { label: 'PLAYER LOAD PROM.', unit: 'carga jugador',       getValue: p => p.playerLoad,     fmt: v => v.toFixed(1) },
  ];

  const cardH = 20;
  const gap = 2;
  const cardW = (CW - gap * (metrics.length - 1)) / metrics.length;

  metrics.forEach((m, i) => {
    const vals = players.map(p => m.getValue(p));
    const avg = vals.reduce((s, v) => s + v, 0) / (vals.length || 1);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const cx = ML + i * (cardW + gap);

    doc.setFillColor(...OFF_W);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    (doc as any).roundedRect(cx, y, cardW, cardH, 1.5, 1.5, 'FD');

    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TXT_MID);
    doc.text(m.label, cx + cardW / 2, y + 4, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
    doc.text(m.fmt(avg), cx + cardW / 2, y + 12, { align: 'center' });

    doc.setFontSize(4.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TXT_MID);
    doc.text(m.unit, cx + cardW / 2, y + 16, { align: 'center' });

    const rangeText = `${m.fmt(min)}  -  ${m.fmt(max)}`;
    doc.setFontSize(4);
    doc.text(rangeText, cx + cardW / 2, y + 19.5, { align: 'center' });
  });

  return y + cardH;
}

// ─── General table ────────────────────────────────────────────────────────────

function drawTable(doc: jsPDF, players: GpsPlayerData[], y: number): number {
  autoTable(doc, {
    startY: y,
    head: [['JUGADOR', 'DIST (M)', 'HIR (M)', 'HSR (M)', 'M/MIN', 'VEL MÁX', 'LOAD', 'P.PLAYS', 'IMPACTOS', 'ACEL.', 'DESAC.', 'A+D/MIN']],
    body: players.map(p => {
      const isTit = p.shirtNumber > 0 && p.shirtNumber <= 15;
      return [
        `${p.shirtNumber > 0 ? p.shirtNumber + ' ' : ''}${playerBarLabel(p.shirtNumber, p.fullName).replace(/^\d+ /, '')}${isTit ? ' ★' : ''}`,
        Math.round(p.distanceM),
        Math.round(p.hir),
        Math.round(p.hsr),
        p.distancePerMin.toFixed(1),
        p.topSpeed.toFixed(1),
        p.playerLoad.toFixed(1),
        Math.round(p.powerPlays),
        Math.round(p.impacts),
        Math.round(p.accelTotal),
        Math.round(p.decelTotal),
        p.acdPerMin.toFixed(1),
      ];
    }),
    theme: 'plain',
    headStyles: {
      fillColor: NAVY, textColor: WHITE, fontStyle: 'bold',
      fontSize: 6.5, halign: 'center', cellPadding: { top: 2, bottom: 2, left: 1, right: 1 },
    },
    bodyStyles: {
      fontSize: 6.5, textColor: TXT,
      cellPadding: { top: 1.5, bottom: 1.5, left: 1, right: 1 },
    },
    alternateRowStyles: { fillColor: ALT },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const txt = String(data.cell.raw ?? '');
        if (txt.endsWith('★')) data.cell.styles.textColor = MAROON;
      }
    },
    columnStyles: {
      0:  { cellWidth: 36, overflow: 'ellipsize' },
      1:  { halign: 'right', cellWidth: 16 },
      2:  { halign: 'right', cellWidth: 14 },
      3:  { halign: 'right', cellWidth: 14 },
      4:  { halign: 'right', cellWidth: 12 },
      5:  { halign: 'right', cellWidth: 13 },
      6:  { halign: 'right', cellWidth: 13 },
      7:  { halign: 'right', cellWidth: 13 },
      8:  { halign: 'right', cellWidth: 14 },
      9:  { halign: 'right', cellWidth: 12 },
      10: { halign: 'right', cellWidth: 12 },
      11: { halign: 'right', cellWidth: 13 },
    },
    margin: { left: ML, right: MR },
  });
  return (doc as any).lastAutoTable.finalY as number;
}

// ─── Section / sub-label bars ─────────────────────────────────────────────────

function drawSectionBar(doc: jsPDF, text: string, y: number, color: RGB): number {
  const h = 8;
  // Left accent stripe
  doc.setFillColor(...color);
  doc.rect(ML, y + 1, 2.5, h - 2, 'F');
  // Title text
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...TXT);
  doc.text(text, ML + 5.5, y + h * 0.73);
  // Bottom hairline
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(ML, y + h, ML + CW, y + h);
  return y + h;
}

function drawSubLabel(doc: jsPDF, text: string, y: number): number {
  const h = 6;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TXT_MID);
  doc.text(text, ML + 1, y + h * 0.75);
  return y + h;
}

// ─── Bar charts ───────────────────────────────────────────────────────────────

function drawBarPair(doc: jsPDF, c1: ChartDef, c2: ChartDef, y: number, maxH: number): number {
  const w = (CW - 4) / 2;
  const h = calcSlottedH(Math.max(c1.data.length, c2.data.length), maxH);
  drawSingleChart(doc, c1, ML, y, w, h);
  drawSingleChart(doc, c2, ML + w + 4, y, w, h);
  return y + h;
}

function drawSingleChart(doc: jsPDF, chart: ChartDef, x: number, y: number, w: number, h: number): void {
  const TITLE_H = 7;
  const n = chart.data.length;
  if (!n) return;

  const LABEL_W = w * 0.41;
  const VAL_W   = w * 0.14;
  const BAR_W   = w - LABEL_W - VAL_W;
  const slotH   = (h - TITLE_H) / n;

  // Title bar
  doc.setFillColor(...chart.color);
  doc.rect(x, y, w, TITLE_H, 'F');
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...WHITE);
  doc.text(chart.title, x + 2, y + TITLE_H * 0.72);

  const dataY = y + TITLE_H;
  const maxVal = Math.max(...chart.data.map(d => d.value), 0.001);

  chart.data.forEach((d, i) => {
    const ry = dataY + i * slotH;
    const barY = ry + slotH * 0.2;
    const barH = slotH * 0.6;
    const barW = Math.max(0, (d.value / maxVal) * BAR_W);

    if (i % 2 === 0) {
      doc.setFillColor(...ALT);
      doc.rect(x, ry, w, slotH, 'F');
    }

    // Player label
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TXT);
    doc.text(d.label, x + LABEL_W - 1, ry + slotH * 0.72, { align: 'right', maxWidth: LABEL_W - 2 });

    // Bar
    doc.setFillColor(...chart.color);
    if (barW > 0) doc.rect(x + LABEL_W, barY, barW, barH, 'F');

    // Value
    const valStr = chart.fmt(d.value);
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...TXT);
    doc.text(valStr, x + LABEL_W + BAR_W + VAL_W - 1, ry + slotH * 0.72, { align: 'right' });
  });
}

// ─── Scatter plot ─────────────────────────────────────────────────────────────

function drawScatter(
  doc: jsPDF,
  data: { n: number; x: number; y: number }[],
  x: number, y: number, w: number, h: number,
  xLabel: string, yLabel: string,
): void {
  if (!data.length) return;

  const AX_L = 14, AX_B = 12;
  const px0 = x + AX_L, py0 = y;
  const pw = w - AX_L - 2, ph = h - AX_B;

  const xs = data.map(d => d.x), ys = data.map(d => d.y);
  const xMn = Math.min(...xs), xMx = Math.max(...xs);
  const yMn = Math.min(...ys), yMx = Math.max(...ys);
  const xPad = (xMx - xMn) * 0.12 || 5;
  const yPad = (yMx - yMn) * 0.12 || 2;
  const x0 = xMn - xPad, x1 = xMx + xPad;
  const y0 = yMn - yPad, y1 = yMx + yPad;
  const xR = x1 - x0, yR = y1 - y0;

  const xMean = xs.reduce((s, v) => s + v, 0) / xs.length;
  const yMean = ys.reduce((s, v) => s + v, 0) / ys.length;
  const mxPx = px0 + ((xMean - x0) / xR) * pw;
  const myPx = py0 + ph - ((yMean - y0) / yR) * ph;

  // Background
  doc.setFillColor(...OFF_W);
  doc.rect(px0, py0, pw, ph, 'F');

  // Top-right quadrant highlight (above-average on both)
  doc.setFillColor(250, 232, 228);
  doc.rect(mxPx, py0, px0 + pw - mxPx, myPx - py0, 'F');

  // Border
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(px0, py0, pw, ph);

  // Mean lines
  doc.setDrawColor(170, 175, 200);
  doc.setLineWidth(0.4);
  doc.line(mxPx, py0, mxPx, py0 + ph);
  doc.line(px0, myPx, px0 + pw, myPx);

  // Dots
  const DOT_R = 3.2;
  data.forEach(d => {
    const dpx = px0 + ((d.x - x0) / xR) * pw;
    const dpy = py0 + ph - ((d.y - y0) / yR) * ph;
    doc.setFillColor(...SALMON);
    doc.circle(dpx, dpy, DOT_R, 'F');
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...WHITE);
    doc.text(String(d.n), dpx, dpy + DOT_R * 0.38, { align: 'center' });
  });

  // Axis labels
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...TXT_MID);
  doc.text(xLabel, px0 + pw / 2, y + h - 1, { align: 'center' });
  doc.text(yLabel, x + 3, py0 + ph / 2, { angle: 90, align: 'center' });
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function drawFooter(doc: jsPDF, match: Match): void {
  const fy = PH - MB;
  const h = 7;
  doc.setFillColor(...NAVY);
  doc.rect(0, fy - h, PW, h, 'F');
  const dateStr = match.date ? format(new Date(match.date), 'dd \'de\' MMMM \'de\' yyyy', { locale: es }) : '—';
  const catLabel = getCategoryLabel(match.category) ?? '';
  const parts = ['Los Tordos Rugby Club', `Informe GPS ${catLabel}`, `vs ${match.opponent ?? '—'} — ${dateStr}`, 'Datos: Catapult GPS'];
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...WHITE);
  doc.text(parts.join('  |  '), PW / 2, fy - h * 0.32, { align: 'center' });
}

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseGpsCsv(csvText: string, squad: SquadEntry[]): GpsPlayerData[] {
  const objects = csvToObjects(csvText);

  let rows = objects.filter(r => TOTAL_SPLIT_NAMES.has((r['Split Name'] ?? '').trim().toLowerCase()));
  if (!rows.length) rows = objects.filter(r => (r['Split Name'] ?? '').trim().toLowerCase().includes('all'));
  if (!rows.length) return [];

  return rows
    .map(r => buildPlayerData(r, squad))
    .filter((d): d is GpsPlayerData => d !== null)
    .sort((a, b) => a.shirtNumber - b.shirtNumber);
}

function buildPlayerData(row: Record<string, string>, squad: SquadEntry[]): GpsPlayerData | null {
  const deviceNumber = extractShirtNumber(row['Player Name'] ?? '');
  if (deviceNumber === null) return null;

  const entry = squad.find(e => e.gpsNumber === deviceNumber);
  const fullName = entry?.player?.name ?? `GPS ${deviceNumber}`;
  const shirtNumber = entry?.shirtNumber ?? 0;

  const zone3 = numCol(row, 'Speed Zone 3') * 1000;
  const zone4 = numCol(row, 'Speed Zone 4') * 1000;
  const zone5 = numCol(row, 'Speed Zone 5') * 1000;

  const accelTotal = sumByPattern(row, 'Accelerations Zone Count');
  const decelTotal = sumByPattern(row, 'Deceleration Zone Count');
  const durationMin = (numCol(row, 'Duration') || 60) / 60;

  return {
    shirtNumber,
    fullName,
    distanceM: numCol(row, 'Distance (km)') * 1000,
    hir: zone3 + zone4 + zone5,
    hsr: zone4 + zone5,
    distancePerMin: numCol(row, 'Distance Per Min'),
    topSpeed: numCol(row, 'Top Speed'),
    playerLoad: numCol(row, 'Player Load'),
    powerPlays: numCol(row, 'Power Plays'),
    impacts: numCol(row, 'Impacts'),
    accelTotal,
    decelTotal,
    acdPerMin: (accelTotal + decelTotal) / durationMin,
  };
}

function extractShirtNumber(playerName: string): number | null {
  const m = playerName.trim().match(/^(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return isNaN(n) ? null : n;
}

function numCol(row: Record<string, string>, fragment: string): number {
  const key = Object.keys(row).find(k => k.toLowerCase().includes(fragment.toLowerCase()));
  if (!key) return 0;
  const v = parseFloat((row[key] ?? '').replace(',', '.'));
  return isNaN(v) ? 0 : v;
}

function sumByPattern(row: Record<string, string>, pattern: string): number {
  return Object.entries(row).reduce((sum, [k, v]) => {
    if (!k.toLowerCase().includes(pattern.toLowerCase())) return sum;
    const n = parseFloat(v.replace(',', '.'));
    return sum + (isNaN(n) ? 0 : n);
  }, 0);
}

function csvToObjects(csvText: string): Record<string, string>[] {
  const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean);
  const headerIdx = lines.findIndex(l => l.includes('Player Name'));
  if (headerIdx === -1) throw new Error('El CSV no contiene la columna "Player Name"');

  const headers = splitCsvLine(lines[headerIdx]);
  const result: Record<string, string>[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => { obj[h.trim()] = values[idx]?.trim() ?? ''; });
    if (obj['Player Name'] || obj['Split Name']) result.push(obj);
  }
  return result;
}

function splitCsvLine(line: string): string[] {
  const src = line.startsWith('"') && line.endsWith('"') ? line.slice(1, -1) : line;
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') { inQuotes = !inQuotes; }
    else if (ch === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else current += ch;
  }
  result.push(current.trim());
  return result;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sorted(players: GpsPlayerData[], getValue: (p: GpsPlayerData) => number): { label: string; value: number }[] {
  return [...players]
    .sort((a, b) => getValue(b) - getValue(a))
    .map(p => ({ label: playerBarLabel(p.shirtNumber, p.fullName), value: getValue(p) }));
}

function chartDef(title: string, data: { label: string; value: number }[], color: RGB, fmt: (v: number) => string): ChartDef {
  return { title, data, color, fmt };
}

function playerBarLabel(shirtNumber: number, fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const prefix = shirtNumber > 0 ? `${shirtNumber} ` : '';
  if (parts.length === 1) return `${prefix}${parts[0]}`;
  const surname = parts[0];
  const nameInitial = `${parts[1][0].toUpperCase()}.`;
  return `${prefix}${surname} ${nameInitial}`;
}

function calcPairH(n: number, maxH: number): number {
  return calcSlottedH(n, maxH);
}

function calcSlottedH(n: number, maxH: number): number {
  const TITLE_H = 7;
  const slotH = Math.min(8.5, (maxH - TITLE_H) / Math.max(n, 1));
  return TITLE_H + slotH * n;
}

function loadImageAsBase64(url: string): Promise<string> {
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
