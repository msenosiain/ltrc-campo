import { Component, OnInit, inject, DestroyRef, signal, computed } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { debounceTime, startWith } from 'rxjs';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { DecimalPipe } from '@angular/common';
import {
  CategoryEnum,
  EvaluationLevelEnum,
  EvaluationSkillEnum,
  PlayerEvaluation,
  RoleEnum,
  SportEnum,
} from '@ltrc-campo/shared-api-model';
import { EvaluationsService } from '../../services/evaluations.service';
import { CategoryOption, getCategoryOptionsBySport } from '../../../common/category-options';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { UserFilterContextService } from '../../../common/services/user-filter-context.service';

@Component({
  selector: 'ltrc-evaluations-list',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    MatSnackBarModule,
    DecimalPipe,
    AllowedRolesDirective,
  ],
  templateUrl: './evaluations-list.component.html',
  styleUrl: './evaluations-list.component.scss',
})
export class EvaluationsListComponent implements OnInit {
  private readonly evaluationsService = inject(EvaluationsService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly filterContext = inject(UserFilterContextService);

  readonly RoleEnum = RoleEnum;
  readonly skills = Object.values(EvaluationSkillEnum);
  readonly skillLabels: Record<EvaluationSkillEnum, string> = {
    [EvaluationSkillEnum.TACKLE]: 'Tackle',
    [EvaluationSkillEnum.PASE]: 'Pase',
    [EvaluationSkillEnum.PATADA]: 'Patada',
    [EvaluationSkillEnum.JUEGO]: 'Juego',
    [EvaluationSkillEnum.FISICO]: 'Físico',
  };

  filterForm: FormGroup = this.fb.group({
    sport: [SportEnum.RUGBY],
    category: [null],
    period: [this.currentPeriod()],
  });

  private readonly selectedSport = toSignal(
    this.filterForm.get('sport')!.valueChanges.pipe(startWith(this.filterForm.get('sport')!.value as SportEnum | null))
  );

  readonly availableSports = computed(() => this.filterContext.filterContext().sportOptions);

  readonly availableCategories = computed((): CategoryOption[] => {
    const sport = this.selectedSport();
    const ctxCats = this.filterContext.filterContext().categoryOptions;
    if (!sport) return ctxCats;
    const forSport = getCategoryOptionsBySport(sport);
    return ctxCats.filter(c => forSport.some(o => o.id === c.id));
  });

  evaluations: PlayerEvaluation[] = [];
  loading = signal(false);
  searched = false;

  get periodOptions(): { value: string; label: string }[] {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return { value, label };
    });
  }

  get displayedColumns(): string[] {
    return ['player', ...this.skills, 'overall', 'actions'];
  }

  ngOnInit(): void {
    this.filterContext.filterContext$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((ctx) => {
        if (ctx.forcedSport) this.filterForm.get('sport')!.setValue(ctx.forcedSport, { emitEvent: false });
        if (ctx.forcedCategory) {
          this.filterForm.get('category')!.setValue(ctx.forcedCategory, { emitEvent: false });
        } else if (!this.filterForm.get('category')?.value) {
          const cats = this.availableCategories();
          if (cats.length) this.filterForm.get('category')!.setValue(cats[0].id, { emitEvent: false });
        }
        this.search();
      });

    this.filterForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const currentCat = this.filterForm.get('category')?.value;
        if (currentCat && !this.availableCategories().some(c => c.id === currentCat)) {
          this.filterForm.get('category')?.setValue(null, { emitEvent: false });
        }
        this.evaluations = [];
        this.searched = false;
      });

    this.filterForm.valueChanges
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.search());
  }

  search(): void {
    const { sport, category, period } = this.filterForm.value;
    if (!period) return;
    this.loading.set(true);
    this.evaluationsService
      .getByCategory(category, sport, period)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => { this.evaluations = data; this.loading.set(false); this.searched = true; },
        error: () => { this.loading.set(false); },
      });
  }

  getSkillLevel(eval_: PlayerEvaluation, skill: EvaluationSkillEnum): EvaluationLevelEnum | null {
    return eval_.skills?.find(s => s.skill === skill)?.level ?? null;
  }

  getSkillTotal(eval_: PlayerEvaluation, skill: EvaluationSkillEnum): number | null {
    return eval_.skills?.find(s => s.skill === skill)?.total ?? null;
  }

  getPlayerName(eval_: PlayerEvaluation): string {
    const p = eval_.player as any;
    return p?.name ?? p?.nickName ?? '—';
  }

  goToHistory(eval_: PlayerEvaluation): void {
    const p = eval_.player as any;
    this.router.navigate(['/dashboard/evaluations/player', p?.id ?? p?._id ?? p]);
  }

  delete(eval_: PlayerEvaluation): void {
    if (!confirm(`¿Eliminar evaluación de ${this.getPlayerName(eval_)}?`)) return;
    this.evaluationsService
      .delete(eval_.id!)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.evaluations = this.evaluations.filter(e => e.id !== eval_.id);
          this.snackBar.open('Evaluación eliminada', 'Cerrar', { duration: 3000 });
        },
        error: () => this.snackBar.open('Error al eliminar', 'Cerrar', { duration: 4000 }),
      });
  }

  private currentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
