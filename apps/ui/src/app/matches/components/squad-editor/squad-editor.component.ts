import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormControl,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  switchMap,
} from 'rxjs/operators';
import {
  CategoryEnum,
  Match,
  Player,
  PlayerPosition,
  SportEnum,
  Squad,
  SquadEntry,
  SquadPlayerTemplate,
  Tournament,
} from '@ltrc-campo/shared-api-model';
import { getPositionOptionsBySport } from '../../../players/position-options';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';
import { PlayersService } from '../../../players/services/players.service';
import { MatchesService } from '../../services/matches.service';
import { SquadsService } from '../../../squads/services/squads.service';
import {
  SaveSquadTemplateDialogComponent,
  SaveSquadTemplateDialogResult,
} from '../save-squad-template-dialog/save-squad-template-dialog.component';
import { SquadPdfService } from '../../services/squad-pdf.service';
import { PlayerFeesAdminService } from '../../../player-fees/services/player-fees-admin.service';

@Component({
  selector: 'ltrc-squad-editor',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './squad-editor.component.html',
  styleUrl: './squad-editor.component.scss',
})
export class SquadEditorComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly matchesService = inject(MatchesService);
  private readonly playersService = inject(PlayersService);
  private readonly squadsService = inject(SquadsService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly squadPdf = inject(SquadPdfService);
  private readonly playerFeesService = inject(PlayerFeesAdminService);

  match?: Match;
  private eligiblePlayerIds = new Set<string>();
  squadRows: SquadEntry[] = [];
  isDirty = false;
  saving = false;
  squads: Squad[] = [];

  selectedSquadIdCtrl = new FormControl<string | null>(null);

  addForm = this.fb.group({
    playerSearch: [null as Player | string | null],
    shirtNumber: [
      null as number | null,
      [Validators.min(1), Validators.max(99)],
    ],
  });

  @ViewChild('playerSearchInput')
  playerSearchInput!: ElementRef<HTMLInputElement>;

  playerSuggestions: Player[] = [];
  searchingPlayers = false;
  selectedPlayer: Player | null = null;
  private readonly searchSubject = new Subject<string>();

  readonly displayedColumns = ['shirtNumber', 'dorsalNumber', 'player', 'posterLabel', 'captain', 'actions'];

  readonly displayPlayerFn = (player: Player | null): string =>
    player ? player.name : '';

  private readonly rugbyFormationGroups: number[][][] = [
    [
      [1, 2, 3],
      [4, 5],
      [6, 8, 7],
    ],
    [[9, 10, 12, 13]],
    [[11, 15, 14]],
  ];
  private readonly rugbyFormationShirts = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);

  private readonly hockeyFormationGroups: number[][][] = [
    [[1]],
    [[2, 3, 4, 5]],
    [[6, 7, 8]],
    [[9, 10, 11]],
  ];
  private readonly hockeyFormationShirts = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
  ]);

  get matchSport(): SportEnum | null {
    return (this.match?.tournament as Tournament | undefined)?.sport ?? this.match?.sport ?? null;
  }

  get formationGroups(): number[][][] {
    return this.matchSport === SportEnum.HOCKEY
      ? this.hockeyFormationGroups
      : this.rugbyFormationGroups;
  }

  private get formationShirts(): Set<number> {
    return this.matchSport === SportEnum.HOCKEY
      ? this.hockeyFormationShirts
      : this.rugbyFormationShirts;
  }

  private getEligibleCategories(sport?: SportEnum | null, category?: CategoryEnum): CategoryEnum[] {
    if (category !== CategoryEnum.PLANTEL_SUPERIOR) return category ? [category] : [];
    if (sport === SportEnum.RUGBY) return [CategoryEnum.PLANTEL_SUPERIOR, CategoryEnum.M19];
    if (sport === SportEnum.HOCKEY) return [CategoryEnum.PLANTEL_SUPERIOR, CategoryEnum.QUINTA];
    return [CategoryEnum.PLANTEL_SUPERIOR];
  }

  get opponentLabel(): string {
    if (!this.match) return '';
    const prefix = this.match.division ? `${this.match.division} ` : '';
    return `${prefix}vs ${this.match.opponent}`;
  }

  get selectedSquad(): Squad | null {
    const id = this.selectedSquadIdCtrl.value;
    return id ? this.squads.find((s) => s.id === id) ?? null : null;
  }

  get titulares(): SquadEntry[] {
    return this.squadRows
      .filter((e) => e.shirtNumber <= 15)
      .sort((a, b) => a.shirtNumber - b.shirtNumber);
  }

  get suplentes(): SquadEntry[] {
    return this.squadRows
      .filter((e) => e.shirtNumber > 15)
      .sort((a, b) => a.shirtNumber - b.shirtNumber);
  }

  getFormationRow(
    row: number[],
    players: SquadPlayerTemplate[]
  ): SquadPlayerTemplate[] {
    return row
      .map((n) => players.find((p) => p.shirtNumber === n))
      .filter((p): p is SquadPlayerTemplate => p !== undefined);
  }

  hasFormationRow(row: number[], players: SquadPlayerTemplate[]): boolean {
    return row.some((n) => players.some((p) => p.shirtNumber === n));
  }

  getExtraPlayers(players: SquadPlayerTemplate[]): SquadPlayerTemplate[] {
    return players
      .filter((p) => !this.formationShirts.has(p.shirtNumber))
      .sort((a, b) => a.shirtNumber - b.shirtNumber);
  }


  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/matches']);
      return;
    }

    this.matchesService
      .getMatchById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (match) => {
          this.match = match;
          this.squadRows = [...(match.squad ?? [])];
          this.addForm.get('shirtNumber')!.setValue(this.nextShirtNumber());
          this.loadSquads();
          this.loadEligiblePlayers(match);
        },
        error: () => this.router.navigate(['/dashboard/matches']),
      });

    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          this.searchingPlayers = true;
          const sport = this.match?.tournament?.sport ?? this.match?.sport;
          const category = this.match?.category as CategoryEnum | undefined;
          const eligibleCategories = this.getEligibleCategories(sport, category);
          const matchedPosition = this.findMatchingPosition(term);
          return this.playersService.getPlayers({
            page: 1,
            size: 20,
            filters: {
              ...(matchedPosition ? { position: matchedPosition } : { searchTerm: term }),
              ...(sport && { sport }),
              ...(eligibleCategories.length > 1
                ? { categories: eligibleCategories }
                : category ? { category } : {}),
            },
          }).pipe(map((result) => ({ result, matchedPosition })));
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(({ result, matchedPosition }) => {
        this.searchingPlayers = false;
        const existingIds = new Set(this.squadRows.map((e) => e.player?.id));
        let players = result.items.filter((p) =>
          !existingIds.has(p.id) &&
          (this.eligiblePlayerIds.size === 0 || this.eligiblePlayerIds.has(p.id!))
        );
        if (matchedPosition) {
          players = [...players].sort((a, b) => {
            const aFirst = a.positions?.[0] === matchedPosition ? 0 : 1;
            const bFirst = b.positions?.[0] === matchedPosition ? 0 : 1;
            return aFirst - bFirst;
          });
        }
        this.playerSuggestions = players;
      });

    this.addForm
      .get('playerSearch')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (typeof value === 'string') {
          this.selectedPlayer = null;
          this.searchSubject.next(value);
        }
      });
  }

  onPlayerSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectedPlayer = event.option.value as Player;
  }

  private nextShirtNumber(): number {
    if (!this.squadRows.length) return 1;
    return Math.max(...this.squadRows.map((e) => e.shirtNumber)) + 1;
  }

  addPlayer(): void {
    const shirtNumber = this.addForm.value.shirtNumber;
    if (!this.selectedPlayer || !shirtNumber) return;
    if (this.squadRows.some((e) => e.shirtNumber === shirtNumber)) {
      this.addForm.get('shirtNumber')!.setErrors({ duplicate: true });
      return;
    }
    this.squadRows = [
      ...this.squadRows,
      { shirtNumber, player: this.selectedPlayer },
    ];
    this.isDirty = true;
    this.selectedPlayer = null;
    this.addForm.reset();
    this.addForm.get('shirtNumber')!.setValue(this.nextShirtNumber());
    this.playerSuggestions = [];
    setTimeout(() => this.playerSearchInput?.nativeElement.focus());
    this.persistSquad();
  }

  defaultPosterLabel(entry: SquadEntry): string {
    return entry.player?.name?.trim().split(/\s+/)[0] ?? '';
  }

  updatePosterLabel(entry: SquadEntry, event: Event): void {
    const val = (event.target as HTMLInputElement).value.trim();
    this.squadRows = this.squadRows.map((e) =>
      e === entry ? { ...e, posterLabel: val || undefined } : e
    );
    this.isDirty = true;
    this.persistSquad();
  }

  toggleCaptain(entry: SquadEntry): void {
    const alreadyCaptain = entry.isCaptain;
    this.squadRows = this.squadRows.map((e) => ({
      ...e,
      isCaptain: e === entry ? !alreadyCaptain : false,
    }));
    this.isDirty = true;
    this.persistSquad();
  }

  updateDorsal(entry: SquadEntry, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const num = parseInt(raw, 10);
    const dorsal = isNaN(num) || raw === '' ? undefined : num;
    if (dorsal !== undefined && (dorsal < 1 || dorsal > 99)) return;
    this.squadRows = this.squadRows.map((e) =>
      e === entry ? { ...e, dorsalNumber: dorsal } : e
    );
    this.isDirty = true;
    this.persistSquad();
  }

  removePlayer(entry: SquadEntry): void {
    this.squadRows = this.squadRows.filter((e) => e !== entry);
    this.isDirty = true;
    this.persistSquad();
  }

  applyTemplate(): void {
    const squadId = this.selectedSquadIdCtrl.value;
    if (!squadId || !this.match) return;

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Aplicar plantilla',
          message: '¿Confirmar? Esto reemplazará el plantel actual.',
          confirmLabel: 'Aplicar',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() => {
          this.saving = true;
          return this.matchesService.applySquadFromTemplate(
            this.match!.id!,
            squadId
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (match) => {
          this.squadRows = [...match.squad];
          this.isDirty = false;
          this.saving = false;
          this.selectedSquadIdCtrl.reset();
        },
        error: () => (this.saving = false),
      });
  }

  saveAsTemplate(): void {
    this.dialog
      .open(SaveSquadTemplateDialogComponent, {
        width: '420px',
        maxWidth: '95vw',
        data: { squads: this.squads },
      })
      .afterClosed()
      .pipe(
        filter((result): result is SaveSquadTemplateDialogResult => !!result),
        switchMap((result) => {
          this.saving = true;
          const players = this.squadRows.map((e) => ({
            shirtNumber: e.shirtNumber,
            playerId: e.player.id!,
          }));
          if (result.mode === 'create') {
            return this.squadsService.createSquad({
              name: result.name,
              category: this.match?.category,
              players,
            });
          } else {
            return this.squadsService.updateSquad(result.squadId, { players });
          }
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.loadSquads();
          this.saving = false;
        },
        error: () => (this.saving = false),
      });
  }

  deleteTemplate(): void {
    const squadId = this.selectedSquadIdCtrl.value;
    if (!squadId) return;
    const name =
      this.squads.find((s) => s.id === squadId)?.name ?? 'esta plantilla';

    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar plantilla',
          message: `¿Eliminar "${name}"? El plantel del partido actual no se modifica.`,
          confirmLabel: 'Eliminar',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() => {
          this.saving = true;
          return this.squadsService.deleteSquad(squadId);
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.loadSquads();
          this.selectedSquadIdCtrl.reset();
          this.saving = false;
        },
        error: () => (this.saving = false),
      });
  }

  private loadEligiblePlayers(match: Match): void {
    const sport = (match.tournament as Tournament | undefined)?.sport ?? match.sport;
    if (!sport) return;
    const season = String(new Date((match as any).date).getFullYear());
    this.playerFeesService.getStatus({ season, sport })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.eligiblePlayerIds = new Set(rows.filter(r => r.eligible).map(r => r.playerId));
        },
        error: () => {},
      });
  }

  private loadSquads(): void {
    this.squadsService
      .getSquads(this.match?.category)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((squads) => (this.squads = squads));
  }

  saveSquad(): void {
    this.persistSquad(() =>
      this.router.navigate(['/dashboard/matches', this.match!.id])
    );
  }

  private persistSquad(onSuccess?: () => void): void {
    if (!this.match) return;
    this.saving = true;
    const squad = this.squadRows.map((e) => ({
      shirtNumber: e.shirtNumber,
      ...(e.dorsalNumber !== undefined && e.dorsalNumber !== e.shirtNumber && { dorsalNumber: e.dorsalNumber }),
      ...(e.isCaptain && { isCaptain: true }),
      ...(e.posterLabel && { posterLabel: e.posterLabel }),
      playerId: e.player.id!,
    }));

    this.matchesService
      .updateSquad(this.match.id!, squad)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving = false;
          this.isDirty = false;
          onSuccess?.();
        },
        error: () => (this.saving = false),
      });
  }

  private findMatchingPosition(term: string): PlayerPosition | null {
    const normalized = term.toLowerCase().trim();
    if (normalized.length < 2) return null;
    const options = getPositionOptionsBySport(this.matchSport);
    const match = options.find(
      (opt) =>
        opt.name.toLowerCase().includes(normalized) ||
        opt.id.toLowerCase().includes(normalized)
    );
    return match?.id ?? null;
  }

  getFirstPositionLabel(player: Player): string | null {
    if (!player.positions?.length) return null;
    return this.playersService.getPositionLabel(player.positions[0]);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dialog.openDialogs.length > 0) return;
    this.cancel();
  }

  cancel(): void {
    this.router.navigate(['/dashboard/matches', this.match?.id ?? '']);
  }
}
