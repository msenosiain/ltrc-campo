import { Component, inject, OnInit, signal, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { SportEnum, getCategoryLabel, CategoryEnum } from '@ltrc-campo/shared-api-model';
import {
  AnalyticsService,
  GrowthStats,
  AgeDistribution,
  AttendanceTrend,
  NonCompByCategory,
  PaymentStats,
} from '../../services/analytics.service';
import { PlayerFeesAdminService, PlayerFeeStats } from '../../../player-fees/services/player-fees-admin.service';

type Period = '1m' | '3m' | '6m';
type SportFilter = 'all' | SportEnum;

const COLOR_RUGBY = '#36445f';
const COLOR_HOCKEY = '#a60a14';
const COLOR_NAVY = '#36445f';
const COLOR_GREEN = '#2e7d32';

@Component({
  selector: 'ltrc-analytics-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonToggleModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatFormFieldModule,
    BaseChartDirective,
  ],
  templateUrl: './analytics-dashboard.component.html',
  styleUrl: './analytics-dashboard.component.scss',
})
export class AnalyticsDashboardComponent implements OnInit {
  private readonly analyticsService = inject(AnalyticsService);
  private readonly playerFeesService = inject(PlayerFeesAdminService);
  private readonly destroyRef = inject(DestroyRef);

  period = signal<Period>('3m');
  sportFilter = signal<SportFilter>('all');

  loading = signal(true);

  // Raw data
  growth = signal<GrowthStats | null>(null);
  ageDistribution = signal<AgeDistribution | null>(null);
  trainingCompetitive = signal<AttendanceTrend | null>(null);
  nonCompByCategory = signal<NonCompByCategory | null>(null);
  paymentStats = signal<PaymentStats | null>(null);

  // KPI cards
  readonly kpiNewPlayers = computed(() => {
    const g = this.growth();
    if (!g) return 0;
    return [...(g.rugby?.altas ?? []), ...(g.hockey?.altas ?? [])].reduce((s, v) => s + v, 0);
  });
  readonly kpiLostPlayers = computed(() => {
    const g = this.growth();
    if (!g) return 0;
    return [...(g.rugby?.bajas ?? []), ...(g.hockey?.bajas ?? [])].reduce((s, v) => s + v, 0);
  });
  readonly kpiMpAdoption = computed(() => this.paymentStats()?.mpAdoptionPct ?? 0);
  readonly kpiPendingLinks = computed(() => this.paymentStats()?.activePendingLinks ?? 0);

  // Carousel indices
  ageCarouselIdx = signal(0);
  nonCompCatIdx = signal(0);

  // ── Derechos de Jugador ───────────────────────────────────────────────────
  readonly feeSeasonOptions = (() => {
    const y = new Date().getFullYear();
    return [String(y + 1), String(y), String(y - 1)];
  })();
  feeSeason = signal(String(new Date().getFullYear()));
  feeSportFilter = signal<SportEnum>(SportEnum.RUGBY);
  feeStats = signal<PlayerFeeStats | null>(null);
  feeStatsLoading = signal(false);

  readonly feeCategoryRows = computed(() => {
    const stats = this.feeStats();
    if (!stats?.byCategory) return [];
    return Object.entries(stats.byCategory)
      .map(([cat, d]) => ({
        cat: cat as CategoryEnum,
        label: getCategoryLabel(cat as CategoryEnum),
        total: d.total,
        pagados: d.pagados,
        habilitados: d.habilitados,
        pctPagados: d.total > 0 ? Math.round((d.pagados / d.total) * 100) : 0,
        pctHab: d.total > 0 ? Math.round((d.habilitados / d.total) * 100) : 0,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  });

  // ── Chart data ────────────────────────────────────────────────────────────

  growthChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly growthChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} jugadores` } },
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  ageChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly ageChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.y} jugadores` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  trainingCompPctChartData = signal<ChartData<'line'>>({ labels: [], datasets: [] });
  // Per-category non-competitive: array indexed by nonCompCatIdx
  nonCompCatChartData = signal<ChartData<'bar'>[]>([]);
  readonly nonCompCatLabels = signal<string[]>([]);
  readonly lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {},
    },
    scales: {
      x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true },
    },
  };
  readonly absBarChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'top' } },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  };

  methodChartData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  eventsChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: true, position: 'right' } },
  };
  readonly eventsChartOptions: ChartOptions<'bar'> = {
    indexAxis: 'y',
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          title: (items) => items[0]?.label ?? '',
          label: (ctx) => ` ${ctx.parsed.x} jugadores`,
        },
      },
    },
    scales: {
      x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
      y: {
        stacked: true,
        ticks: {
          font: { size: 11 },
          callback: (val) => {
            const s = String(val);
            return s.length > 28 ? s.slice(0, 26) + '…' : s;
          },
        },
      },
    },
  };


  ngOnInit(): void {
    this.load();
    this.loadFeeStats();
  }

  onPeriodChange(p: Period): void {
    this.period.set(p);
    this.load();
  }

  onSportChange(s: SportFilter): void {
    this.sportFilter.set(s);
    this.load();
  }

  private sport(): string | undefined {
    const s = this.sportFilter();
    return s === 'all' ? undefined : s;
  }

  private load(): void {
    this.loading.set(true);
    const period = this.period();
    const sport = this.sport();

    forkJoin({
      growth: this.analyticsService.getPlayerGrowth(period, sport),
      age: this.analyticsService.getAgeDistribution(),
      trainingComp: this.analyticsService.getTrainingTrend(period, sport, 'competitive'),
      nonCompByCategory: this.analyticsService.getNonCompetitiveByCategory(period, sport),
      payments: this.analyticsService.getPaymentStats(sport),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ growth, age, trainingComp, nonCompByCategory, payments }) => {
          this.growth.set(growth);
          this.ageDistribution.set(age);
          this.trainingCompetitive.set(trainingComp);
          this.nonCompByCategory.set(nonCompByCategory);
          this.paymentStats.set(payments);
          this.nonCompCatIdx.set(0);
          this.buildCharts(growth, age, trainingComp, nonCompByCategory, payments, sport);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  private buildCharts(
    growth: GrowthStats,
    age: AgeDistribution,
    trainingComp: AttendanceTrend,
    nonCompByCategory: NonCompByCategory,
    payments: PaymentStats,
    sport?: string
  ): void {
    // Growth — filter series by selected sport
    const rugbyAltas = growth.rugby?.altas ?? [];
    const rugbyBajas = growth.rugby?.bajas ?? [];
    const hockeyAltas = growth.hockey?.altas ?? [];
    const hockeyBajas = growth.hockey?.bajas ?? [];
    const showRugby = !sport || sport === SportEnum.RUGBY;
    const showHockey = !sport || sport === SportEnum.HOCKEY;
    const growthSeries = [
      ...(showRugby  ? [rugbyAltas, rugbyBajas]   : []),
      ...(showHockey ? [hockeyAltas, hockeyBajas] : []),
    ];
    const growthTrimmed = this.trimLeadingZeros(growth.labels, ...growthSeries);
    const growthDatasets = [
      ...(showRugby  ? [
        { label: 'Rugby altas', data: growthTrimmed.series[0], backgroundColor: COLOR_RUGBY, borderRadius: 4 },
        { label: 'Rugby bajas', data: growthTrimmed.series[1], backgroundColor: `${COLOR_RUGBY}66`, borderRadius: 4 },
      ] : []),
      ...(showHockey ? [
        { label: 'Hockey altas', data: growthTrimmed.series[showRugby ? 2 : 0], backgroundColor: COLOR_HOCKEY, borderRadius: 4 },
        { label: 'Hockey bajas', data: growthTrimmed.series[showRugby ? 3 : 1], backgroundColor: `${COLOR_HOCKEY}66`, borderRadius: 4 },
      ] : []),
    ];
    this.growthChartData.set({
      labels: growthTrimmed.labels.map((l) => this.formatMonthLabel(l)),
      datasets: growthDatasets,
    });

    // Age distribution — build by selected slide
    this.buildAgeChart(age);

    const trendColor = sport === SportEnum.HOCKEY ? COLOR_HOCKEY : COLOR_RUGBY;
    const trendColorAlpha = sport === SportEnum.HOCKEY ? 'rgba(166,10,20,0.15)' : 'rgba(54,68,95,0.15)';

    // Competitive training: % asistencia
    const compTrimmed = this.trimLeadingZeros(trainingComp.labels, trainingComp.pct, trainingComp.present, trainingComp.attendees);
    const compLabels = compTrimmed.labels.map((l) => this.formatWeekLabel(l));
    this.trainingCompPctChartData.set({
      labels: compLabels,
      datasets: [{ label: '% Asistencia', data: compTrimmed.series[0], borderColor: trendColor, backgroundColor: trendColorAlpha, fill: true, tension: 0.4, yAxisID: 'y' }],
    });

    // Non-competitive carousel: slide 0 = Total, then one slide per category
    const cats = nonCompByCategory.categories;
    const buildOverlapChart = (both: number[], trainOnly: number[], matchOnly: number[], labels: string[]): ChartData<'bar'> => {
      const trimmed = this.trimLeadingZeros(labels, both, trainOnly, matchOnly);
      return {
        labels: trimmed.labels.map((l) => this.formatWeekLabel(l)),
        datasets: [
          { label: 'Entren. y partido', data: trimmed.series[0], backgroundColor: COLOR_GREEN, borderRadius: 4 },
          { label: 'Solo entrenamiento', data: trimmed.series[1], backgroundColor: trendColor, borderRadius: 4 },
          { label: 'Solo partido', data: trimmed.series[2], backgroundColor: 'rgba(245,127,23,0.75)', borderRadius: 4 },
        ],
      };
    };

    const catCharts: ChartData<'bar'>[] = [];
    const catLabels: string[] = [];

    if (cats.length > 0) {
      const refLabels = cats[0].labels;
      const totalBoth      = refLabels.map((_, i) => cats.reduce((s, c) => s + (c.both[i] ?? 0), 0));
      const totalTrainOnly = refLabels.map((_, i) => cats.reduce((s, c) => s + (c.trainOnly[i] ?? 0), 0));
      const totalMatchOnly = refLabels.map((_, i) => cats.reduce((s, c) => s + (c.matchOnly[i] ?? 0), 0));
      catCharts.push(buildOverlapChart(totalBoth, totalTrainOnly, totalMatchOnly, refLabels));
      catLabels.push('total');
      for (const c of cats) {
        catCharts.push(buildOverlapChart(c.both, c.trainOnly, c.matchOnly, c.labels));
        catLabels.push(c.category);
      }
    }

    this.nonCompCatChartData.set(catCharts);
    this.nonCompCatLabels.set(catLabels);

    // Method donut
    this.methodChartData.set({
      labels: ['MercadoPago', 'Efectivo'],
      datasets: [{
        data: [payments.byMethod.mp, payments.byMethod.cash],
        backgroundColor: [COLOR_NAVY, 'rgba(180,180,180,0.8)'],
      }],
    });

    // Recent events stacked bar
    const events = [...payments.recentEvents].reverse();
    this.eventsChartData.set({
      labels: events.map((e) => e.label),
      datasets: [
        { label: 'Pagado', data: events.map((e) => e.approved), backgroundColor: COLOR_GREEN, borderRadius: 4 },
        { label: 'Pendiente', data: events.map((e) => e.pending), backgroundColor: 'rgba(245,127,23,0.75)', borderRadius: 4 },
      ],
    });
  }

  buildAgeChart(age: AgeDistribution): void {
    const sport = this.sportFilter();
    let idx = this.ageCarouselIdx();

    // Sync carousel to global sport filter
    if (sport === SportEnum.RUGBY) idx = 1;
    else if (sport === SportEnum.HOCKEY) idx = 2;

    const dataset = idx === 0 ? age.all : idx === 1 ? age.rugby : age.hockey;
    const label = idx === 0 ? 'Todos' : idx === 1 ? 'Rugby' : 'Hockey';
    const color = idx === 0 ? 'rgba(100,100,100,0.65)' : idx === 1 ? COLOR_RUGBY : COLOR_HOCKEY;
    this.ageCarouselIdx.set(idx);
    this.ageChartData.set({
      labels: dataset.map((d) => String(d.birthYear)),
      datasets: [{
        label,
        data: dataset.map((d) => d.count),
        backgroundColor: color,
        borderRadius: 4,
      }],
    });
  }

  onAgeSlide(dir: 1 | -1): void {
    const next = Math.max(0, Math.min(2, this.ageCarouselIdx() + dir));
    this.ageCarouselIdx.set(next);
    const age = this.ageDistribution();
    if (age) this.buildAgeChart(age);
  }

  onNonCompCatSlide(dir: 1 | -1): void {
    const max = this.nonCompCatLabels().length - 1;
    this.nonCompCatIdx.set(Math.max(0, Math.min(max, this.nonCompCatIdx() + dir)));
  }

  readonly getCategoryLabel = getCategoryLabel;
  readonly SportEnum = SportEnum;

  loadFeeStats(): void {
    this.feeStatsLoading.set(true);
    this.playerFeesService.getStats(this.feeSeason(), this.feeSportFilter())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (stats) => { this.feeStats.set(stats); this.feeStatsLoading.set(false); },
        error: () => this.feeStatsLoading.set(false),
      });
  }

  formatCurrency(val: number): string {
    return val.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  }

  private trimLeadingZeros(labels: string[], ...series: number[][]): { labels: string[]; series: number[][] } {
    let first = 0;
    while (first < labels.length && series.every((s) => (s[first] ?? 0) === 0)) first++;
    return { labels: labels.slice(first), series: series.map((s) => s.slice(first)) };
  }

  private formatWeekLabel(label: string): string {
    // "2026-W03" → "13 ene"
    const [yearStr, weekStr] = label.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    // Jan 4 is always in ISO week 1
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const monday = new Date(jan4);
    monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7);
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${monday.getUTCDate()} ${months[monday.getUTCMonth()]}`;
  }

  private formatMonthLabel(label: string): string {
    // "2026-03" → "mar '26"
    const [yearStr, monthStr] = label.split('-');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${months[parseInt(monthStr, 10) - 1]} '${yearStr.slice(2)}`;
  }
}
