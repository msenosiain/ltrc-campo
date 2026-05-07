import {
  Component,
  HostListener,
  inject,
  OnInit,
  DestroyRef,
  signal,
} from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import { MatchesService } from '../../services/matches.service';
import { PaymentsService } from '../../../payments/services/payments.service';
import { MatchFormValue } from '../../forms/match-form.types';
import { Match, PaymentEntityTypeEnum, PaymentTypeEnum } from '@ltrc-campo/shared-api-model';
import { format } from 'date-fns';
import { MatchFormComponent } from '../match-form/match-form.component';
import { FormSkeletonComponent } from '../../../common/components/form-skeleton/form-skeleton.component';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getErrorMessage } from '../../../common/utils/error-message';

@Component({
  selector: 'ltrc-match-editor',
  standalone: true,
  imports: [
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatchFormComponent,
    FormSkeletonComponent,
  ],
  templateUrl: './match-editor.component.html',
  styleUrl: './match-editor.component.scss',
})
export class MatchEditorComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly matchesService = inject(MatchesService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  match?: Match;
  editing = false;
  submitting = false;
  loading = signal(false);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.editing = !!id;

    if (id) {
      this.loading.set(true);
      this.matchesService
        .getMatchById(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (match) => { this.match = match; this.loading.set(false); }, error: () => { this.loading.set(false); } });
    }
  }

  onFormSubmit(payload: MatchFormValue): void {
    this.submitting = true;

    const onError = (err: unknown) => {
      this.submitting = false;
      this.snackBar.open(getErrorMessage(err, 'Error al guardar el partido'), 'Cerrar', { duration: 5000 });
    };

    if (this.editing && this.match?.id) {
      this.matchesService
        .updateMatch(this.match.id, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.router.navigate(['/dashboard/matches']);
          },
          error: onError,
        });
      return;
    }

    const onSuccess = () => { this.submitting = false; this.router.navigate(['/dashboard/matches']); };

    const createPaymentLink = (matchIds: string[]) => {
      const p = payload.payment;
      if (!p?.enabled || !p.amount || !p.expiresAt) { onSuccess(); return; }
      const time = p.expiresAtTime || '23:59';
      const expiresAt = this.toLocalIso(p.expiresAt, time);
      this.paymentsService.createLink({
        entityType: PaymentEntityTypeEnum.MATCH,
        ...(matchIds.length === 1 ? { entityId: matchIds[0] } : { entityIds: matchIds }),
        concept: p.concept || 'Tercer tiempo',
        addMpFee: p.addMpFee ?? false,
        amount: p.amount,
        paymentType: PaymentTypeEnum.FULL,
        expiresAt,
      }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (link) => {
          this.submitting = false;
          const linkUrl = `${window.location.origin}/pay/${link.linkToken}`;
          const ref = this.snackBar.open('Partidos y link de cobro creados', 'Copiar link', { duration: 10000 });
          ref.onAction().subscribe(() => navigator.clipboard.writeText(linkUrl));
          this.router.navigate(['/dashboard/matches']);
        },
        error: () => {
          this.submitting = false;
          this.snackBar.open('Partidos creados, pero hubo un error al crear el link de cobro', 'Cerrar', { duration: 5000 });
          this.router.navigate(['/dashboard/matches']);
        },
      });
    };

    const opponent = payload.opponents.length ? payload.opponents.join(', ') : (payload.opponent || undefined);

    if (payload.categories.length > 1) {
      this.matchesService
        .createMatchesBulk({
          date: payload.date!.toISOString(),
          categories: payload.categories,
          opponent,
          name: payload.name || undefined,
          venue: payload.venue,
          isHome: payload.isHome,
          status: payload.status,
          sport: payload.sport || undefined,
          branch: payload.branch,
          tournament: payload.tournament || undefined,
          notes: payload.notes || undefined,
        })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (matches) => createPaymentLink(matches.map((m) => m.id!)),
          error: onError,
        });
      return;
    }

    this.matchesService
      .createMatch({ ...payload, category: payload.categories[0] ?? payload.category, opponent: opponent ?? '' })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (match) => createPaymentLink([match.id!]),
        error: onError,
      });
  }

  onDelete(): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar partido',
        message: `¿Estás seguro que querés eliminar el partido contra "${this.match?.opponent}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
      },
    });

    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.matchesService
          .deleteMatch(this.match!.id!)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.router.navigate(['/dashboard/matches']));
      });
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dialog.openDialogs.length > 0) return;
    this.onCancel();
  }

  onCancel(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  private toLocalIso(date: Date, time: string): string {
    const dateStr = format(date, 'yyyy-MM-dd');
    const offsetMin = new Date().getTimezoneOffset();
    const sign = offsetMin <= 0 ? '+' : '-';
    const absMin = Math.abs(offsetMin);
    const hh = String(Math.floor(absMin / 60)).padStart(2, '0');
    const mm = String(absMin % 60).padStart(2, '0');
    return `${dateStr}T${time}:00${sign}${hh}:${mm}`;
  }
}
