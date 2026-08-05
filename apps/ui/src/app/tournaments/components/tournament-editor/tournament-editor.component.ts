import {
  Component,
  HostListener,
  inject,
  OnInit,
  DestroyRef,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatListModule } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, ActivatedRoute } from '@angular/router';
import { concat } from 'rxjs';
import {
  TournamentsService,
  TournamentFormValue,
} from '../../services/tournaments.service';
import { Tournament, TournamentAttachment } from '@ltrc-campo/shared-api-model';
import { TournamentFormComponent } from '../tournament-form/tournament-form.component';
import { FormSkeletonComponent } from '../../../common/components/form-skeleton/form-skeleton.component';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { getErrorMessage } from '../../../common/utils/error-message';

@Component({
  selector: 'ltrc-tournament-editor',
  standalone: true,
  imports: [
    DatePipe,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDividerModule,
    MatListModule,
    TournamentFormComponent,
    FormSkeletonComponent,
  ],
  templateUrl: './tournament-editor.component.html',
  styleUrl: './tournament-editor.component.scss',
})
export class TournamentEditorComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  tournament?: Tournament;
  editing = false;
  submitting = false;
  uploading = signal(false);
  loading = signal(false);

  /** Files queued for upload (used in create mode before tournament exists) */
  pendingFiles: File[] = [];

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.editing = !!id;

    if (id) {
      this.loading.set(true);
      this.tournamentsService
        .getTournamentById(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: (tournament) => { this.tournament = tournament; this.loading.set(false); }, error: () => { this.loading.set(false); } });
    }
  }

  onFormSubmit(payload: TournamentFormValue): void {
    this.submitting = true;

    const onError = (err: unknown) => {
      this.submitting = false;
      this.snackBar.open(getErrorMessage(err, 'Error al guardar el torneo'), 'Cerrar', { duration: 5000 });
    };

    if (this.editing && this.tournament?.id) {
      this.tournamentsService
        .updateTournament(this.tournament.id, payload)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.submitting = false;
            this.router.navigate(['/dashboard/tournaments']);
          },
          error: onError,
        });
      return;
    }

    // Create mode: create tournament then upload pending files
    this.tournamentsService
      .createTournament(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          if (this.pendingFiles.length) {
            this.uploadPendingFiles(created.id!);
          } else {
            this.submitting = false;
            this.router.navigate(['/dashboard/tournaments']);
          }
        },
        error: onError,
      });
  }

  private uploadPendingFiles(tournamentId: string): void {
    const uploads = this.pendingFiles.map((f) =>
      this.tournamentsService.uploadAttachment(tournamentId, f)
    );

    concat(...uploads)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { /* ignore: side effects handled via error/complete */ },
        error: (err) => {
          this.submitting = false;
          this.snackBar.open(
            getErrorMessage(err, 'Torneo creado pero falló la subida de algunos archivos'),
            'Cerrar',
            { duration: 5000 }
          );
          this.router.navigate(['/dashboard/tournaments', tournamentId, 'edit']);
        },
        complete: () => {
          this.submitting = false;
          this.pendingFiles = [];
          this.router.navigate(['/dashboard/tournaments']);
        },
      });
  }

  onDelete(): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar torneo',
        message: `¿Estás seguro que querés eliminar "${this.tournament?.name}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
      },
    });

    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.tournamentsService
          .deleteTournament(this.tournament!.id!)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.router.navigate(['/dashboard/tournaments']));
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (this.editing && this.tournament?.id) {
      // Edit mode: upload immediately
      this.uploading.set(true);
      this.tournamentsService
        .uploadAttachment(this.tournament.id, file)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (tournament) => {
            this.tournament = tournament;
            this.uploading.set(false);
          },
          error: (err) => {
            this.uploading.set(false);
            this.snackBar.open(
              getErrorMessage(err, 'Error al subir archivo'),
              'Cerrar',
              { duration: 5000 }
            );
          },
        });
    } else {
      // Create mode: queue file for upload after create
      this.pendingFiles.push(file);
    }

    input.value = '';
  }

  removePendingFile(index: number): void {
    this.pendingFiles.splice(index, 1);
  }

  removeAttachment(att: TournamentAttachment): void {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '380px',
      data: {
        title: 'Eliminar adjunto',
        message: `¿Eliminar "${att.filename}"?`,
        confirmLabel: 'Eliminar',
      },
    });

    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.tournamentsService
          .deleteAttachment(this.tournament!.id!, att.id!)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (tournament) => (this.tournament = tournament),
            error: (err) =>
              this.snackBar.open(
                getErrorMessage(err, 'Error al eliminar adjunto'),
                'Cerrar',
                { duration: 5000 }
              ),
          });
      });
  }

  getAttachmentIcon(mimetype: string): string {
    if (mimetype === 'application/pdf') return 'picture_as_pdf';
    if (mimetype.startsWith('image/')) return 'image';
    return 'description';
  }

  getFileIcon(file: File): string {
    if (file.type === 'application/pdf') return 'picture_as_pdf';
    if (file.type.startsWith('image/')) return 'image';
    return 'description';
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dialog.openDialogs.length > 0) return;
    this.onCancel();
  }

  onCancel(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }
}
