import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { ChartJSNodeCanvas } from 'chartjs-node-canvas';
import type { ChartConfiguration } from 'chart.js';
import * as fs from 'fs';
import * as path from 'path';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CmjReportData, CmrjReportData } from './forcedeck-aggregation.service';

// ── Colors ────────────────────────────────────────────────────────────────────
const NAVY = '#1B2A4A';
const RED = '#A80E19';
const GREEN = '#1D9E75';
const BLUE = '#378ADD';
const AMBER = '#BA7517';
const GRAY = '#888780';
const LIGHT_GRAY = '#F5F5F5';
const WHITE = '#FFFFFF';

// ── Layout ────────────────────────────────────────────────────────────────────
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 40;
const MR = 40;
const MT = 40;
const CONTENT_W = PAGE_W - ML - MR;

type PDFDoc = PDFKit.PDFDocument;

async function renderChart(cfg: ChartConfiguration, w = 900, h = 400): Promise<Buffer> {
  const c = new ChartJSNodeCanvas({ width: w, height: h, backgroundColour: 'white' });
  return c.renderToBuffer(cfg);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(v: number | null | undefined, d = 1): string {
  if (v == null) return '—';
  return v.toFixed(d);
}

function fmtDate(s: string): string {
  try {
    return format(new Date(s + 'T12:00:00Z'), 'dd/MM/yyyy', { locale: es });
  } catch {
    return s;
  }
}

function fmtDateShort(s: string): string {
  try {
    return format(new Date(s + 'T12:00:00Z'), 'dd MMM', { locale: es });
  } catch {
    return s;
  }
}

function loadLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(__dirname, 'assets', 'escudo.png'));
  } catch {
    return null;
  }
}

function linearRegression(pts: { x: number; y: number }[]) {
  const n = pts.length;
  if (n < 2) return null;
  const sx = pts.reduce((s, p) => s + p.x, 0);
  const sy = pts.reduce((s, p) => s + p.y, 0);
  const sxy = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sx2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const d = n * sx2 - sx * sx;
  if (!d) return null;
  const slope = (n * sxy - sx * sy) / d;
  const intercept = (sy - slope * sx) / n;
  const yMean = sy / n;
  const ssTot = pts.reduce((s, p) => s + (p.y - yMean) ** 2, 0);
  const ssRes = pts.reduce((s, p) => s + (p.y - (slope * p.x + intercept)) ** 2, 0);
  return { slope, intercept, r2: ssTot ? 1 - ssRes / ssTot : 1 };
}

// ── PDF structure helpers ─────────────────────────────────────────────────────

function addPage(doc: PDFDoc) {
  doc.addPage({ size: 'A4', margins: { top: MT, bottom: 40, left: ML, right: MR } });
}

// Footer y must stay inside doc.page.maxY() = PAGE_H - bottom_margin (= 841.89 - 40 = 801.89).
// Using PAGE_H - 28 = 813.89 exceeds maxY and triggers pdfkit auto page insertion (blank pages).
const FOOTER_Y = PAGE_H - 54; // 787.89 — safely within page bounds

function drawFooter(doc: PDFDoc, title: string) {
  const savedY = doc.y;
  doc.save();
  doc.fontSize(7.5).font('Helvetica').fillColor(GRAY).text(
    `Los Tordos Rugby Club · ${title} · ${format(new Date(), 'dd/MM/yyyy HH:mm', { locale: es })}`,
    ML, FOOTER_Y, { width: CONTENT_W, align: 'center', lineBreak: false },
  );
  doc.restore();
  // Restore cursor so subsequent addPage() starts clean
  doc.y = savedY;
}

function drawSectionHeader(doc: PDFDoc, title: string, y: number): number {
  doc.fontSize(14).font('Helvetica-Bold').fillColor(NAVY).text(title, ML, y);
  const lineY = doc.y + 2;
  doc.moveTo(ML, lineY).lineTo(PAGE_W - MR, lineY).strokeColor(RED).lineWidth(1.5).stroke();
  return lineY + 8;
}

function drawSubtitle(doc: PDFDoc, text: string, y: number): number {
  doc.fontSize(9).font('Helvetica').fillColor(GRAY).text(text, ML, y, { width: CONTENT_W });
  // doc.y reflects the actual bottom after potential wrapping
  return doc.y + 6;
}

function drawColorLegend(
  doc: PDFDoc,
  items: { color: string; label: string }[],
  y: number,
): number {
  const sq = 10;
  const pad = 5;
  let x = ML;
  doc.fontSize(8.5).font('Helvetica');
  for (const item of items) {
    doc.rect(x, y, sq, sq).fill(item.color);
    doc.fillColor('#444').text(item.label, x + sq + pad, y + 1, { lineBreak: false });
    x += sq + pad + doc.widthOfString(item.label) + 16;
  }
  return y + sq + 8;
}

function drawFigureCaption(doc: PDFDoc, text: string, y: number): number {
  doc.fontSize(8).font('Helvetica-Oblique').fillColor(GRAY)
    .text(text, ML, y, { width: CONTENT_W, align: 'center', lineBreak: false });
  return doc.y + 8;
}

function drawCoverHeader(doc: PDFDoc, title: string, subtitle: string, logo: Buffer | null): number {
  // Navy card
  doc.roundedRect(ML, 20, CONTENT_W, 85, 8).fill(NAVY);

  let tx = ML + 16;
  if (logo) {
    doc.image(logo, ML + 14, 28, { width: 58, height: 58 });
    tx = ML + 82;
  }

  doc.fontSize(10).font('Helvetica').fillColor('#B0BBD5').text('Los Tordos Rugby Club', tx, 34);
  doc.fontSize(18).font('Helvetica-Bold').fillColor(WHITE).text(title, tx, 50, { width: CONTENT_W - tx + ML - 10 });
  doc.fontSize(10).font('Helvetica').fillColor('#B0BBD5').text(subtitle, tx, 75);

  // Red accent line below card
  doc.moveTo(ML, 112).lineTo(PAGE_W - MR, 112).strokeColor(RED).lineWidth(1.5).stroke();
  return 120;
}

function drawKpiRow(
  doc: PDFDoc,
  cards: { label: string; value: string; sub?: string }[],
  y: number,
): number {
  const n = cards.length;
  const gap = 8;
  const cardW = (CONTENT_W - gap * (n - 1)) / n;
  const cardH = 58;

  cards.forEach((c, i) => {
    const cx = ML + i * (cardW + gap);
    doc.roundedRect(cx, y, cardW, cardH, 5).fill(LIGHT_GRAY);
    doc.fontSize(8).font('Helvetica').fillColor(GRAY)
      .text(c.label, cx + 8, y + 8, { width: cardW - 16, lineBreak: false });
    doc.fontSize(20).font('Helvetica-Bold').fillColor(NAVY)
      .text(c.value, cx + 8, y + 20, { width: cardW - 16, lineBreak: false });
    if (c.sub) {
      doc.fontSize(7.5).font('Helvetica').fillColor(GRAY)
        .text(c.sub, cx + 8, y + 44, { width: cardW - 16, ellipsis: true, lineBreak: false });
    }
  });
  // Reset cursor to end of KPI row so next element starts correctly
  doc.y = y + cardH;

  return y + cardH + 10;
}

function embedChart(doc: PDFDoc, imgBuf: Buffer, y: number, h: number): number {
  doc.image(imgBuf, ML, y, { width: CONTENT_W, height: h });
  return y + h + 6;
}

function drawTable(
  doc: PDFDoc,
  headers: string[],
  rows: string[][],
  colW: number[],
  x: number,
  y: number,
  headerBg = NAVY,
  rowH = 16,
): number {
  const totalW = colW.reduce((a, b) => a + b, 0);
  const drawHeader = (atY: number) => {
    doc.rect(x, atY, totalW, rowH).fill(headerBg);
    let cx = x;
    doc.fontSize(8).font('Helvetica-Bold').fillColor(WHITE);
    headers.forEach((h, i) => {
      doc.text(h, cx + 4, atY + 4, { width: colW[i] - 8, lineBreak: false });
      cx += colW[i];
    });
    return atY + rowH;
  };

  y = drawHeader(y);
  rows.forEach((row, ri) => {
    if (y + rowH > PAGE_H - 50) {
      addPage(doc);
      y = MT;
      y = drawHeader(y);
    }
    if (ri % 2 === 0) doc.rect(x, y, totalW, rowH).fill(LIGHT_GRAY);
    let cx = x;
    doc.fontSize(8).font('Helvetica').fillColor('#1A1A2E');
    row.forEach((cell, ci) => {
      doc.text(cell, cx + 4, y + 4, { width: colW[ci] - 8, lineBreak: false, ellipsis: true });
      cx += colW[ci];
    });
    y += rowH;
  });
  return y + 6;
}

// ── Chart generators ──────────────────────────────────────────────────────────

async function chartHBarColor(
  labels: string[],
  values: number[],
  colors: string[],
  legendItems: { color: string; label: string }[],
  xLabel: string,
): Promise<Buffer> {
  const h = Math.max(220, labels.length * 32 + 80);
  const cfg: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderWidth: 0,
        barThickness: 22,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        legend: {
          display: legendItems.length > 0,
          position: 'bottom',
          labels: {
            generateLabels: () => legendItems.map(li => ({
              text: li.label,
              fillStyle: li.color,
              strokeStyle: li.color,
              hidden: false,
              lineWidth: 0,
            })),
            font: { size: 11 },
            boxWidth: 14,
            padding: 12,
          },
        },
        tooltip: { enabled: false },
        datalabels: undefined,
      } as any,
      scales: {
        x: {
          title: { display: true, text: xLabel, font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555' },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#333' },
        },
      },
      animation: false,
    } as any,
  };
  return renderChart(cfg, 900, h);
}

async function chartLine(
  labels: string[],
  datasets: { label: string; data: number[]; color: string }[],
  yLabel: string,
  annotations: { x: number; y: number; text: string }[] = [],
): Promise<Buffer> {
  const cfg: ChartConfiguration = {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        borderColor: d.color,
        backgroundColor: d.color + '22',
        pointBackgroundColor: WHITE,
        pointBorderColor: d.color,
        pointBorderWidth: 2,
        pointRadius: 6,
        fill: datasets.length === 1,
        tension: 0.2,
        borderWidth: 2.5,
      })),
    },
    options: {
      responsive: false,
      plugins: {
        legend: {
          display: datasets.length > 1,
          labels: { font: { size: 11 }, boxWidth: 14 },
        },
        tooltip: { enabled: false },
      } as any,
      scales: {
        y: {
          title: { display: true, text: yLabel, font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555' },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#333', maxRotation: 30 },
        },
      },
      animation: false,
    } as any,
  };
  return renderChart(cfg, 900, 380);
}

async function chartScatter(
  points: { x: number; y: number; label: string }[],
  xLabel: string,
  yLabel: string,
): Promise<Buffer> {
  const reg = linearRegression(points);
  const xs = points.map(p => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const trendData = reg ? [
    { x: minX, y: reg.slope * minX + reg.intercept },
    { x: maxX, y: reg.slope * maxX + reg.intercept },
  ] : [];

  const cfg: ChartConfiguration = {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: 'Jugadores',
          data: points,
          backgroundColor: BLUE + 'CC',
          pointRadius: 5,
          pointHoverRadius: 6,
        },
        ...(trendData.length ? [{
          label: `Tendencia (r²=${reg!.r2.toFixed(2)})`,
          data: trendData,
          type: 'line' as const,
          borderColor: RED,
          borderDash: [6, 3],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
        }] : []),
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: true, labels: { font: { size: 11 }, boxWidth: 14 } },
        tooltip: { enabled: false },
      } as any,
      scales: {
        x: {
          title: { display: true, text: xLabel, font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555' },
        },
        y: {
          title: { display: true, text: yLabel, font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555' },
        },
      },
      animation: false,
    } as any,
  };
  return renderChart(cfg, 900, 380);
}

async function chartHistogram(values: number[], xLabel: string, bins = 10): Promise<Buffer> {
  const minV = Math.min(...values), maxV = Math.max(...values);
  const bw = (maxV - minV) / bins || 1;
  const counts = Array(bins).fill(0);
  for (const v of values) {
    const i = Math.min(Math.floor((v - minV) / bw), bins - 1);
    counts[i]++;
  }
  const labels = Array.from({ length: bins }, (_, i) => fmt(minV + i * bw, 0));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  const cfg: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Frecuencia',
        data: counts,
        backgroundColor: BLUE + 'CC',
        borderWidth: 0,
      }],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        annotation: {
          annotations: {
            mean: {
              type: 'line',
              scaleID: 'x',
              value: fmt(mean, 0),
              borderColor: RED,
              borderWidth: 2,
              borderDash: [5, 3],
              label: { content: `Media: ${fmt(mean)} cm`, enabled: true, position: 'start', color: RED, font: { size: 10 } },
            },
            median: {
              type: 'line',
              scaleID: 'x',
              value: fmt(median, 0),
              borderColor: AMBER,
              borderWidth: 2,
              borderDash: [3, 3],
              label: { content: `Mediana: ${fmt(median)} cm`, enabled: true, position: 'end', color: AMBER, font: { size: 10 } },
            },
          },
        },
      } as any,
      scales: {
        x: {
          title: { display: true, text: xLabel, font: { size: 11 }, color: GRAY },
          grid: { display: false },
          ticks: { font: { size: 10 }, color: '#555' },
        },
        y: {
          title: { display: true, text: 'Frecuencia', font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555', stepSize: 1 },
        },
      },
      animation: false,
    } as any,
  };
  return renderChart(cfg, 900, 360);
}

async function chartGroupedBars(
  labels: string[],
  datasets: { label: string; data: (number | null)[]; color: string }[],
  xLabel: string,
): Promise<Buffer> {
  const h = Math.max(260, labels.length * 44 + 100);
  const cfg: ChartConfiguration = {
    type: 'bar',
    data: {
      labels,
      datasets: datasets.map(d => ({
        label: d.label,
        data: d.data,
        backgroundColor: d.color + 'CC',
        borderWidth: 0,
        barThickness: 14,
      })),
    },
    options: {
      indexAxis: 'y',
      responsive: false,
      plugins: {
        legend: { display: true, labels: { font: { size: 11 }, boxWidth: 14 }, position: 'bottom' },
        tooltip: { enabled: false },
      } as any,
      scales: {
        x: {
          title: { display: true, text: xLabel, font: { size: 11 }, color: GRAY },
          grid: { color: '#EEEEEE' },
          ticks: { font: { size: 10 }, color: '#555' },
        },
        y: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#333' } },
      },
      animation: false,
    } as any,
  };
  return renderChart(cfg, 900, h);
}

// ── CMJ Report ────────────────────────────────────────────────────────────────

@Injectable()
export class ForcedeckPdfService {
  async generateCmjPdf(data: CmjReportData): Promise<Buffer> {
    const logo = loadLogo();
    const reportTitle = 'CMJ — Plataformas de Fuerza';

    // Pre-render all charts
    const lastSession = data.lastSession;

    const [
      chartLastSession,
      chartEvolution,
      chartRanking,
      chartScatterImg,
      chartHistImg,
      chartIndividual,
    ] = await Promise.all([
      lastSession && lastSession.playerBests.length
        ? chartHBarColor(
            lastSession.playerBests.map(p => p.playerName),
            lastSession.playerBests.map(p => p.jumpHeightCm),
            lastSession.playerBests.map(p =>
              p.jumpHeightCm >= 45 ? GREEN : p.jumpHeightCm >= 40 ? BLUE : RED
            ),
            [
              { color: GREEN, label: '≥ 45 cm' },
              { color: BLUE, label: '40–44.9 cm' },
              { color: RED, label: '< 40 cm' },
            ],
            'Altura de salto (cm)',
          )
        : Promise.resolve(null),

      data.sessions.length > 1
        ? chartLine(
            data.sessions.map(s => fmtDateShort(s.sessionDate)),
            [{
              label: 'Promedio equipo',
              data: data.sessions.map(s => parseFloat(s.teamAvg.toFixed(1))),
              color: NAVY,
            }],
            'Promedio (cm)',
          )
        : Promise.resolve(null),

      data.playerHistories.length
        ? chartHBarColor(
            data.playerHistories.slice(0, 20).map((p, i) => `${i + 1}. ${p.playerName}`),
            data.playerHistories.slice(0, 20).map(p => p.bestJumpHeightCm),
            data.playerHistories.slice(0, 20).map((_, i) =>
              i === 0 ? AMBER : i < 3 ? GREEN : NAVY
            ),
            [
              { color: AMBER, label: '1er lugar' },
              { color: GREEN, label: 'Top 3' },
              { color: NAVY, label: 'Top 4–20' },
            ],
            'Mejor altura de salto (cm)',
          )
        : Promise.resolve(null),

      (() => {
        const pts = data.sessions
          .flatMap(s => s.playerBests)
          .filter(p => p.eccentricPowerW !== null)
          .map(p => ({ x: p.jumpHeightCm, y: p.eccentricPowerW!, label: p.playerName }));
        return pts.length >= 3
          ? chartScatter(pts, 'Altura de salto (cm)', 'Potencia media deceleración exc. (W)')
          : Promise.resolve(null);
      })(),

      data.sessions.flatMap(s => s.playerBests).length >= 5
        ? chartHistogram(
            data.sessions.flatMap(s => s.playerBests).map(p => p.jumpHeightCm),
            'Altura de salto (cm)',
          )
        : Promise.resolve(null),

      (() => {
        const multi = data.playerHistories.filter(p => p.sessions.length >= 3).slice(0, 8);
        const colors = [NAVY, BLUE, GREEN, AMBER, RED, GRAY, '#7B2D8B', '#E67E22'];
        return multi.length > 0 && data.sessions.length > 1
          ? chartLine(
              data.sessions.map(s => fmtDateShort(s.sessionDate)),
              multi.map((ph, i) => ({
                label: ph.playerName,
                color: colors[i % colors.length],
                data: data.sessions.map(s => {
                  const found = ph.sessions.find(ps => ps.sessionDate === s.sessionDate);
                  return found ? parseFloat(found.jumpHeightCm.toFixed(1)) : null as any;
                }),
              })),
              'Altura de salto (cm)',
            )
          : Promise.resolve(null);
      })(),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', autoFirstPage: false });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Page 1: Cover ────────────────────────────────────────────────────────
      doc.addPage({ size: 'A4', margins: { top: MT, bottom: 40, left: ML, right: MR } });
      let y = drawCoverHeader(doc, 'Reporte de Plataformas de Salto', 'Counter Movement Jump (CMJ)', logo);

      doc.fontSize(9).font('Helvetica').fillColor(GRAY)
        .text(`Temporada ${new Date().getFullYear()} · Actualizado al ${format(new Date(), 'dd/MM/yyyy', { locale: es })}`, ML, y);
      y += 18;

      y = drawKpiRow(doc, [
        { label: 'Altura promedio', value: fmt(data.avgJumpHeight) + ' cm', sub: 'Jump Height (Imp-Mom)' },
        { label: 'Potencia exc. media', value: data.avgEccentricPower != null ? Math.round(data.avgEccentricPower) + ' W' : '—', sub: 'Eccentric Decel. Power' },
        { label: 'Impulso conc.', value: data.avgConcentricImpulse != null ? Math.round(data.avgConcentricImpulse) + ' N·s' : '—', sub: 'Concentric Impulse' },
        { label: 'Mejor salto', value: data.bestJump ? fmt(data.bestJump.value) + ' cm' : '—', sub: data.bestJump?.playerName ?? '' },
      ], y);

      y = drawKpiRow(doc, [
        { label: 'Jugadores evaluados', value: `${data.totalPlayers}` },
        { label: 'Sesiones realizadas', value: `${data.sessions.length}` },
        { label: 'Registros (mejor por sesión)', value: `${data.totalRecords}` },
      ], y);

      doc.fontSize(9).font('Helvetica').fillColor('#333')
        .text(
          'Este reporte presenta los resultados de las mediciones de salto vertical CMJ (Counter Movement Jump) ' +
          'mediante plataformas de fuerza ForceDecks. Se analiza la altura de salto, la potencia media de deceleración ' +
          'excéntrica y el impulso concéntrico. Cuando un jugador registró más de un intento en la misma sesión, se utilizó ' +
          'su mejor marca.',
          ML, y + 6, { width: CONTENT_W },
        );
      drawFooter(doc, reportTitle);

      // ── Page 2: Last session bar chart ────────────────────────────────────────
      if (chartLastSession && lastSession) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, `1. Última sesión — ${fmtDate(lastSession.sessionDate)}`, y);
        y = drawSubtitle(doc, `Se evaluaron ${lastSession.playerCount} jugadores.`, y);
        y = drawColorLegend(doc, [
          { color: GREEN, label: '45 cm o mas' },
          { color: BLUE,  label: '40 a 44.9 cm' },
          { color: RED,   label: 'Menos de 40 cm' },
        ], y);
        const chartH = Math.min(Math.max(220, lastSession.playerBests.length * 32 + 80), 480);
        y = embedChart(doc, chartLastSession, y, chartH);
        y = drawFigureCaption(doc, `Figura 1. Altura de salto CMJ por jugador — sesión ${fmtDate(lastSession.sessionDate)}, ordenados de mayor a menor.`, y);
        drawFooter(doc, reportTitle);
      }

      // ── Page 3: Team evolution ────────────────────────────────────────────────
      if (chartEvolution) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, '2. Evolución temporal del equipo', y);
        y = drawSubtitle(doc,
          `Promedio del grupo en cada sesión desde ${fmtDate(data.sessions[0].sessionDate)} a ${fmtDate(data.sessions[data.sessions.length - 1].sessionDate)} (${data.sessions.length} sesiones).`,
          y);
        y = embedChart(doc, chartEvolution, y, 260);
        y = drawFigureCaption(doc, `Figura 2. Progresión del promedio de altura de salto del equipo a lo largo de las ${data.sessions.length} sesiones.`, y);
        drawFooter(doc, reportTitle);
      }

      // ── Page 4: Ranking top 20 ────────────────────────────────────────────────
      if (chartRanking && data.playerHistories.length) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, '3. Ranking — top 20 mejores marcas', y);
        y = drawSubtitle(doc, 'Mejor altura de salto registrada por cada jugador en cualquier sesión.', y);
        y = drawColorLegend(doc, [
          { color: AMBER, label: '1er lugar' },
          { color: GREEN, label: 'Top 3' },
          { color: NAVY,  label: 'Top 4 a 20' },
        ], y);
        const rh = Math.min(Math.max(260, Math.min(data.playerHistories.length, 20) * 32 + 100), 500);
        y = embedChart(doc, chartRanking, y, rh);
        y = drawFigureCaption(doc, `Figura 3. Ranking de los ${Math.min(data.playerHistories.length, 20)} mejores saltadores del plantel por su mejor marca histórica.`, y);
        drawFooter(doc, reportTitle);
      }

      // ── Page 5: Scatter + Histogram ───────────────────────────────────────────
      const hasScatter = chartScatterImg != null;
      const hasHist = chartHistImg != null;
      if (hasScatter || hasHist) {
        addPage(doc);
        y = MT;
        if (hasScatter) {
          y = drawSectionHeader(doc, '4. Altura de salto vs. potencia de deceleración excéntrica', y);
          y = drawSubtitle(doc, 'Relación entre la altura de salto (cm) y la potencia media de deceleración excéntrica (W) en todos los registros.', y);
          y = embedChart(doc, chartScatterImg!, y, 220);
          y = drawFigureCaption(doc, 'Figura 4. Dispersión altura vs. potencia excéntrica. La línea punteada indica la tendencia del grupo.', y);
          y += 8;
        }
        if (hasHist) {
          y = drawSectionHeader(doc, '5. Distribución de alturas de salto', y);
          y = drawSubtitle(doc, 'Frecuencia de todos los registros (mejor marca por sesion). Linea roja = media, linea naranja = mediana.', y);
          const allH = data.sessions.flatMap(s => s.playerBests).map(p => p.jumpHeightCm);
          const hh = PAGE_H - y - 60;
          y = embedChart(doc, chartHistImg!, y, Math.min(hh, 230));
          y = drawFigureCaption(doc, `Figura 5. Histograma de distribución de alturas de salto — ${allH.length} registros.`, y);
        }
        drawFooter(doc, reportTitle);
      }

      // ── Page 6: Individual evolution ─────────────────────────────────────────
      if (chartIndividual) {
        addPage(doc);
        y = MT;
        const multiCount = data.playerHistories.filter(p => p.sessions.length >= 3).length;
        y = drawSectionHeader(doc, '6. Evolución individual', y);
        y = drawSubtitle(doc, `Trayectoria de los ${Math.min(multiCount, 8)} jugadores con mayor cantidad de sesiones registradas (mínimo 3).`, y);
        y = embedChart(doc, chartIndividual, y, 260);
        drawFooter(doc, reportTitle);
      }

      // ── Page 7: Last session detail table ────────────────────────────────────
      if (lastSession && lastSession.playerBests.length) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, `6. Resultados detallados — sesión ${fmtDate(lastSession.sessionDate)}`, y);
        y = drawTable(
          doc,
          ['Jugador', 'Peso (kg)', 'Altura (cm)', 'Pot. exc. (W)', 'Impulso (N·s)'],
          lastSession.playerBests.map(p => [
            p.playerName, fmt(p.bodyWeightKg), fmt(p.jumpHeightCm),
            p.eccentricPowerW != null ? String(Math.round(p.eccentricPowerW)) : '—',
            p.concentricImpulseNs != null ? fmt(p.concentricImpulseNs) : '—',
          ]),
          [180, 70, 80, 85, 80],
          ML, y,
        );
        drawFooter(doc, reportTitle);
      }

      // ── Page 8+: Full history ─────────────────────────────────────────────────
      addPage(doc);
      y = MT;
      y = drawSectionHeader(doc, '7. Historial completo de registros', y);
      y = drawSubtitle(doc, 'Mejor marca por jugador y sesión, ordenado por fecha y altura descendente.', y);
      drawTable(
        doc,
        ['Jugador', 'Fecha', 'Peso (kg)', 'Altura (cm)', 'Pot. exc. (W)', 'Impulso (N·s)'],
        data.sessions.flatMap(s =>
          s.playerBests.map(p => [
            p.playerName,
            fmtDate(s.sessionDate),
            fmt(p.bodyWeightKg),
            fmt(p.jumpHeightCm),
            p.eccentricPowerW != null ? String(Math.round(p.eccentricPowerW)) : '—',
            p.concentricImpulseNs != null ? fmt(p.concentricImpulseNs) : '—',
          ])
        ),
        [170, 72, 60, 70, 80, 63],
        ML, y,
      );
      drawFooter(doc, reportTitle);

      doc.end();
    });
  }

  // ── CMRJ Report ───────────────────────────────────────────────────────────

  async generateCmrjPdf(data: CmrjReportData): Promise<Buffer> {
    const logo = loadLogo();
    const reportTitle = 'CMRJ — Plataformas de Fuerza';
    const lastSession = data.lastSession;
    const validBests = lastSession
      ? lastSession.playerBests.filter(p => !p.measurementError)
      : [];

    const [
      chartReboundRank,
      chartGrouped,
      chartScatterImg,
      chartStiffness,
    ] = await Promise.all([
      validBests.length
        ? chartHBarColor(
            validBests.map(p => p.playerName),
            validBests.map(p => p.reboundJumpHeightCm),
            validBests.map(p =>
              p.reboundJumpHeightCm >= 35 ? GREEN : p.reboundJumpHeightCm >= 28 ? BLUE : RED
            ),
            [{ color: GREEN, label: '≥ 35 cm' }, { color: BLUE, label: '28–34.9 cm' }, { color: RED, label: '< 28 cm' }],
            'Altura de rebote (cm)',
          )
        : Promise.resolve(null),

      validBests.filter(p => p.firstJumpHeightCm != null).length
        ? chartGroupedBars(
            validBests.filter(p => p.firstJumpHeightCm != null).map(p => p.playerName),
            [
              { label: 'Primer salto', color: BLUE, data: validBests.filter(p => p.firstJumpHeightCm != null).map(p => p.firstJumpHeightCm!) },
              { label: 'Salto de rebote', color: GREEN, data: validBests.filter(p => p.firstJumpHeightCm != null).map(p => p.reboundJumpHeightCm) },
            ],
            'Altura (cm)',
          )
        : Promise.resolve(null),

      (() => {
        const pts = validBests
          .filter(p => p.reboundContactTimeMs != null)
          .map(p => ({ x: p.reboundContactTimeMs!, y: p.reboundJumpHeightCm, label: p.playerName }));
        return pts.length >= 3
          ? chartScatter(pts, 'Tiempo de contacto (ms)', 'Altura de rebote (cm)')
          : Promise.resolve(null);
      })(),

      (() => {
        const sd = validBests.filter(p => p.activeStiffnessIndex != null)
          .sort((a, b) => b.activeStiffnessIndex! - a.activeStiffnessIndex!);
        return sd.length
          ? chartHBarColor(
              sd.map(p => p.playerName),
              sd.map(p => p.activeStiffnessIndex!),
              sd.map(p => p.activeStiffnessIndex! >= 2.5 ? GREEN : p.activeStiffnessIndex! >= 1.5 ? BLUE : RED),
              [{ color: GREEN, label: '≥ 2.5 — Alto' }, { color: BLUE, label: '1.5–2.49 — Medio' }, { color: RED, label: '< 1.5 — Bajo' }],
              'Índice de rigidez',
            )
          : Promise.resolve(null);
      })(),
    ]);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const doc = new PDFDocument({ size: 'A4', autoFirstPage: false });
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Page 1: Cover ────────────────────────────────────────────────────────
      doc.addPage({ size: 'A4', margins: { top: MT, bottom: 40, left: ML, right: MR } });
      let y = drawCoverHeader(doc, 'Reporte de Plataformas de Salto', 'Countermovement Rebound Jump (CMRJ)', logo);

      if (data.excludedOutliers > 0) {
        const excl = data.excludedOutliers;
        doc.fontSize(9).font('Helvetica').fillColor(AMBER)
          .text(`Aviso: ${excl} registro${excl > 1 ? 's' : ''} excluido${excl > 1 ? 's' : ''} por fallo de medicion (rebote < 1 cm).`, ML, y);
        y = doc.y + 4;
      } else {
        y += 4;
      }

      y = drawKpiRow(doc, [
        { label: 'Rebote promedio', value: fmt(data.avgReboundHeight) + ' cm' },
        { label: 'T. contacto prom.', value: data.avgContactTime != null ? Math.round(data.avgContactTime) + ' ms' : '—' },
        { label: 'Rigidez prom.', value: data.avgStiffness != null ? fmt(data.avgStiffness, 2) : '—' },
        { label: 'Mejor rebote', value: data.bestRebound ? fmt(data.bestRebound.value) + ' cm' : '—', sub: data.bestRebound?.playerName ?? '' },
      ], y);

      y = drawKpiRow(doc, [
        { label: 'Jugadores evaluados', value: `${data.totalPlayers}` },
        { label: 'Sesiones registradas', value: `${data.sessions.length}` },
        { label: 'Registros válidos', value: `${data.totalRecords}` },
        { label: 'Excluidos por error', value: `${data.excludedOutliers}` },
      ], y);
      drawFooter(doc, reportTitle);

      // ── Page 2: Rebound ranking ───────────────────────────────────────────────
      if (chartReboundRank && lastSession) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, `1. Ranking altura de rebote — ${fmtDate(lastSession.sessionDate)}`, y);
        y = drawSubtitle(doc, `Altura de salto de rebote por jugador.`, y);
        y = drawColorLegend(doc, [
          { color: GREEN, label: '35 cm o mas' },
          { color: BLUE,  label: '28 a 34.9 cm' },
          { color: RED,   label: 'Menos de 28 cm' },
        ], y);
        const rh = Math.min(Math.max(220, validBests.length * 32 + 100), 480);
        y = embedChart(doc, chartReboundRank, y, rh);
        drawFooter(doc, reportTitle);
      }

      // ── Page 3: First jump vs rebound ────────────────────────────────────────
      if (chartGrouped) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, '2. Primer salto vs. Salto de rebote', y);
        y = drawSubtitle(doc, 'Comparación entre la altura del primer salto (CMJ) y la altura del rebote por jugador.', y);
        const gh = Math.min(Math.max(260, validBests.filter(p => p.firstJumpHeightCm != null).length * 44 + 100), 480);
        y = embedChart(doc, chartGrouped, y, gh);
        drawFooter(doc, reportTitle);
      }

      // ── Page 4: Scatter contact time vs rebound ───────────────────────────────
      if (chartScatterImg) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, '3. Tiempo de contacto vs. Altura de rebote', y);
        y = drawSubtitle(doc, 'Zona ideal: tiempo de contacto bajo + altura de rebote alta (esquina superior izquierda del gráfico).', y);
        y = embedChart(doc, chartScatterImg, y, 260);
        drawFooter(doc, reportTitle);
      }

      // ── Page 5: Stiffness ─────────────────────────────────────────────────────
      if (chartStiffness) {
        addPage(doc);
        y = MT;
        y = drawSectionHeader(doc, '4. Indice de rigidez activa (Rebound Active Stiffness)', y);
        y = drawSubtitle(doc, 'Rigidez activa por jugador.', y);
        y = drawColorLegend(doc, [
          { color: GREEN, label: '2.5 o mas (Alto)' },
          { color: BLUE,  label: '1.5 a 2.49 (Medio)' },
          { color: RED,   label: 'Menos de 1.5 (Bajo)' },
        ], y);
        const sh = Math.min(Math.max(200, validBests.filter(p => p.activeStiffnessIndex != null).length * 32 + 100), 450);
        y = embedChart(doc, chartStiffness, y, sh);
        drawFooter(doc, reportTitle);
      }

      // ── Page 6+: Full history ─────────────────────────────────────────────────
      addPage(doc);
      y = MT;
      y = drawSectionHeader(doc, '5. Historial completo', y);
      y = drawSubtitle(doc, '* Registro excluido de gráficos y rankings por fallo de medición (rebote < 1 cm).', y);
      drawTable(
        doc,
        ['Jugador', 'Fecha', '1° salto (cm)', 'Rebote (cm)', 'T. cont. (ms)', 'Rigidez'],
        data.sessions.flatMap(s =>
          s.playerBests.map(p => [
            p.playerName + (p.measurementError ? ' *' : ''),
            fmtDate(s.sessionDate),
            fmt(p.firstJumpHeightCm),
            fmt(p.reboundJumpHeightCm),
            p.reboundContactTimeMs != null ? String(Math.round(p.reboundContactTimeMs)) : '—',
            p.activeStiffnessIndex != null ? fmt(p.activeStiffnessIndex, 2) : '—',
          ])
        ),
        [165, 68, 72, 72, 72, 66],
        ML, y,
      );
      drawFooter(doc, reportTitle);

      doc.end();
    });
  }
}
