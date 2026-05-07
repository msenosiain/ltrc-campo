import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { debounceTime, filter, switchMap } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';
import {
  ImportFamilyGroupsDialogComponent,
  ImportFamilyGroupsDialogResult,
} from '../import-family-groups-dialog/import-family-groups-dialog.component';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CategoryEnum, IFamilyGroup, IPlayerFeeConfig, Player, SportEnum, toTitleCase } from '@ltrc-campo/shared-api-model';
import { categoryOptions, getCategoryLabel, getCategoryOptionsBySport } from '../../../common/category-options';
import { sportOptions } from '../../../common/sport-options';
import { PlayerFeesAdminService, PlayerFeeConfigPayload, BduarRow } from '../../services/player-fees-admin.service';
import { PlayersService } from '../../../players/services/players.service';

@Component({
  selector: 'ltrc-player-fees-settings',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatExpansionModule,
    MatAutocompleteModule,
    MatChipsModule,
    MatTooltipModule,
    MatDividerModule,
    MatTableModule,
    MatPaginatorModule,
    DecimalPipe,
    RouterLink,
  ],
  templateUrl: './player-fees-settings.component.html',
  styleUrl: './player-fees-settings.component.scss',
})
export class PlayerFeesSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly adminService = inject(PlayerFeesAdminService);
  private readonly playersService = inject(PlayersService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly sportOptions = sportOptions;
  readonly categoryOptions = categoryOptions;

  configs = signal<IPlayerFeeConfig[]>([]);
  families = signal<IFamilyGroup[]>([]);
  loading = signal(false);

  // Config table
  configFilterTerm = signal('');
  configSportFilter = signal<SportEnum | null>(null);
  expandedConfig = signal<IPlayerFeeConfig | null>(null);
  configPage = signal(0);
  readonly configPageSize = 8;

  readonly filteredConfigs = computed(() => {
    const term = this.configFilterTerm().toLowerCase().trim();
    const sport = this.configSportFilter();
    return this.configs().filter(c => {
      if (sport && c.sport !== sport) return false;
      if (term && !c.label.toLowerCase().includes(term) && !c.season.includes(term)) return false;
      return true;
    });
  });

  readonly pagedConfigs = computed(() => {
    const page = this.configPage();
    return this.filteredConfigs().slice(page * this.configPageSize, (page + 1) * this.configPageSize);
  });

  // Config form
  configFormOpen = signal(false);
  editingConfigId = signal<string | null>(null);
  savingConfig = signal(false);

  configForm: FormGroup = this.fb.group({
    season: ['', Validators.required],
    sport: [null as SportEnum | null, Validators.required],
    label: ['', Validators.required],
    description: [''],
    addMpFee: [false],
    familyDiscount: [false],
    blocks: this.fb.array([]),
  });

  get blocks(): FormArray {
    return this.configForm.get('blocks') as FormArray;
  }

  // Family table
  familyFilter = signal('');
  familyPage = signal(0);
  readonly familyPageSize = 20;

  readonly filteredFamilies = computed(() => {
    const term = this.familyFilter().toLowerCase().trim();
    if (!term) return this.families();
    return this.families().filter(f =>
      f.name.toLowerCase().includes(term) ||
      f.members.some(m =>
        m.playerName?.toLowerCase().includes(term) ||
        m.playerDni?.toLowerCase().includes(term)
      )
    );
  });

  readonly pagedFamilies = computed(() => {
    const page = this.familyPage();
    return this.filteredFamilies().slice(page * this.familyPageSize, (page + 1) * this.familyPageSize);
  });

  // Family form
  familyFormOpen = signal(false);
  editingFamilyId = signal<string | null>(null);
  savingFamily = signal(false);
  playerSearchResults = signal<Player[]>([]);
  private readonly playerSearch$ = new Subject<string>();

  familyForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    sport: [SportEnum.RUGBY, Validators.required],
    members: this.fb.array([]),
  });

  get familyMembers(): FormArray {
    return this.familyForm.get('members') as FormArray;
  }

  ngOnInit(): void {
    this.loadAll();

    this.configForm.get('sport')!.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.blocks.controls.forEach(ctrl => ctrl.get('categories')?.setValue([], { emitEvent: false }));
      });

    this.playerSearch$.pipe(
      debounceTime(300),
      switchMap(term => term.length >= 2
        ? this.playersService.getPlayers({ page: 1, size: 30, filters: { searchTerm: term, sport: SportEnum.RUGBY } })
        : of({ items: [], total: 0, page: 1, size: 10 })
      ),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(res => this.playerSearchResults.set(res.items));
  }

  private loadAll(): void {
    this.loading.set(true);
    this.adminService.getConfigs()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (c) => { this.configs.set(c); this.loading.set(false); }, error: () => this.loading.set(false) });

    this.adminService.getFamilies()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (f) => { this.families.set(f); this.familyPage.set(0); }, error: () => {} });
  }

  // ── Configs ───────────────────────────────────────────────────────────────

  openNewConfig(): void {
    this.editingConfigId.set(null);
    this.configForm.reset({ addMpFee: false, familyDiscount: false });
    while (this.blocks.length) this.blocks.removeAt(0);
    this.addBlock();
    this.configFormOpen.set(true);
  }

  openEditConfig(config: IPlayerFeeConfig): void {
    this.editingConfigId.set(config.id);
    this.configForm.patchValue({
      season: config.season,
      sport: config.sport,
      label: config.label,
      description: config.description ?? '',
      addMpFee: config.addMpFee,
      familyDiscount: config.familyDiscount,
    });
    while (this.blocks.length) this.blocks.removeAt(0);
    config.blocks.forEach(b => this.blocks.push(this.newBlock(b)));
    this.configFormOpen.set(true);
  }

  closeConfigForm(): void {
    this.configFormOpen.set(false);
    this.editingConfigId.set(null);
  }

  availableCategoryOptions(blockIndex: number): typeof this.categoryOptions {
    const sport = this.configForm.get('sport')?.value as SportEnum | null;
    const forSport = sport ? getCategoryOptionsBySport(sport) : this.categoryOptions;
    const usedInOtherBlocks = new Set<CategoryEnum>(
      this.blocks.controls.flatMap((ctrl, i) =>
        i !== blockIndex ? (ctrl.get('categories')?.value as CategoryEnum[] ?? []) : []
      )
    );
    return forSport.filter(cat => !usedInOtherBlocks.has(cat.id as CategoryEnum));
  }

  addBlock(data?: { name: string; categories: CategoryEnum[]; amount: number }): void {
    this.blocks.push(this.newBlock(data));
  }

  removeBlock(i: number): void {
    this.blocks.removeAt(i);
  }

  private newBlock(data?: { name: string; categories: CategoryEnum[]; amount: number; expiresAt?: Date | string }): FormGroup {
    const expiresAt = data?.expiresAt
      ? new Date((data.expiresAt as string).slice(0, 10) + 'T12:00:00Z')
      : null;
    return this.fb.group({
      name: [data?.name ?? '', Validators.required],
      categories: [data?.categories ?? [], Validators.required],
      amount: [data?.amount ?? 0, [Validators.required, Validators.min(0)]],
      expiresAt: [expiresAt, Validators.required],
    });
  }

  saveConfig(): void {
    if (this.configForm.invalid) return;
    this.savingConfig.set(true);
    const v = this.configForm.value;
    const payload: PlayerFeeConfigPayload = {
      season: v.season,
      sport: v.sport,
      feeType: v.sport as string,
      label: v.label,
      description: v.description || undefined,
      addMpFee: v.addMpFee,
      familyDiscount: v.familyDiscount,
      blocks: (v.blocks as { name: string; categories: CategoryEnum[]; amount: number; expiresAt: Date }[]).map(b => ({
        name: b.name,
        categories: b.categories,
        amount: b.amount,
        expiresAt: b.expiresAt.toISOString(),
      })),
    };
    const id = this.editingConfigId();
    const req = id
      ? this.adminService.updateConfig(id, payload)
      : this.adminService.createConfig(payload);

    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.configs.update(list =>
          id ? list.map(c => c.id === id ? saved : c) : [...list, saved]
        );
        this.savingConfig.set(false);
        this.closeConfigForm();
        this.snackBar.open(id ? 'Configuración actualizada' : 'Configuración creada', 'Cerrar', { duration: 3000 });
      },
      error: () => {
        this.savingConfig.set(false);
        this.snackBar.open('Error al guardar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  toggleActive(config: IPlayerFeeConfig): void {
    const req = config.active
      ? this.adminService.deactivateConfig(config.id)
      : this.adminService.activateConfig(config.id);
    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => this.configs.update(list => list.map(c => c.id === updated.id ? updated : c)),
      error: () => this.snackBar.open('Error al cambiar estado', 'Cerrar', { duration: 3000 }),
    });
  }

  deleteConfig(config: IPlayerFeeConfig): void {
    if (!confirm(`¿Eliminar configuración "${config.label}"?`)) return;
    this.adminService.deleteConfig(config.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.configs.update(list => list.filter(c => c.id !== config.id)),
        error: () => this.snackBar.open('Error al eliminar (puede tener pagos asociados)', 'Cerrar', { duration: 4000 }),
      });
  }

  // ── Familias ──────────────────────────────────────────────────────────────

  openNewFamily(): void {
    this.editingFamilyId.set(null);
    this.familyForm.reset({ sport: SportEnum.RUGBY });
    while (this.familyMembers.length) this.familyMembers.removeAt(0);
    this.addMember();
    this.addMember();
    this.familyFormOpen.set(true);
  }

  openEditFamily(family: IFamilyGroup): void {
    this.editingFamilyId.set(family.id);
    this.familyForm.patchValue({ name: family.name, sport: family.sport });
    while (this.familyMembers.length) this.familyMembers.removeAt(0);
    family.members.forEach(m => this.familyMembers.push(this.newMember(m.playerId, m.playerName ?? '', m.order)));
    this.familyFormOpen.set(true);
  }

  closeFamilyForm(): void {
    this.familyFormOpen.set(false);
    this.editingFamilyId.set(null);
  }

  addMember(): void {
    const order = this.familyMembers.length + 1;
    this.familyMembers.push(this.newMember('', '', order));
  }

  removeMember(i: number): void {
    this.familyMembers.removeAt(i);
  }

  private newMember(playerId: string, playerName: string, order: number): FormGroup {
    return this.fb.group({
      playerId: [playerId, Validators.required],
      playerName: [playerName],
      order: [order, Validators.required],
    });
  }

  availablePlayerResults(excludeIndex: number): Player[] {
    const selectedIds = new Set(
      this.familyMembers.controls
        .map((c, i) => i !== excludeIndex ? c.get('playerId')?.value : null)
        .filter(Boolean)
    );
    return this.playerSearchResults().filter(p => !selectedIds.has(p.id));
  }

  onPlayerSearch(term: string): void {
    this.playerSearch$.next(term);
  }

  selectPlayer(memberIndex: number, player: Player): void {
    const member = this.familyMembers.at(memberIndex);
    member.patchValue({ playerId: player.id, playerName: player.name ?? player.nickName ?? '' });
  }

  readonly displayPlayerName = (player: Player | string | null): string => {
    if (!player) return '';
    if (typeof player === 'string') return player;
    return player.name ?? player.nickName ?? '';
  };

  saveFamily(): void {
    if (this.familyForm.invalid) return;
    this.savingFamily.set(true);
    const v = this.familyForm.value;
    const payload = {
      name: v.name,
      sport: v.sport,
      members: (v.members as { playerId: string; order: number }[]).map(m => ({ playerId: m.playerId, order: m.order })),
    };
    const id = this.editingFamilyId();
    const req = id
      ? this.adminService.updateFamily(id, payload)
      : this.adminService.createFamily(payload);

    req.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        this.families.update(list =>
          id ? list.map(f => f.id === id ? saved : f) : [...list, saved]
        );
        this.savingFamily.set(false);
        this.closeFamilyForm();
        this.snackBar.open(id ? 'Grupo actualizado' : 'Grupo creado', 'Cerrar', { duration: 3000 });
      },
      error: () => {
        this.savingFamily.set(false);
        this.snackBar.open('Error al guardar', 'Cerrar', { duration: 4000 });
      },
    });
  }

  readonly toTitleCase = toTitleCase;

  onFamilyFilterChange(value: string): void {
    this.familyFilter.set(value);
    this.familyPage.set(0);
  }

  deleteFamily(family: IFamilyGroup): void {
    this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Eliminar grupo familiar',
        message: `¿Eliminar el grupo "${family.name}"? Esta acción no se puede deshacer.`,
        confirmLabel: 'Eliminar',
      },
    }).afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.adminService.deleteFamily(family.id)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => this.families.update(list => list.filter(f => f.id !== family.id)),
        error: () => this.snackBar.open('Error al eliminar', 'Cerrar', { duration: 3000 }),
      });
  }

  toggleExpand(config: IPlayerFeeConfig): void {
    this.expandedConfig.update(cur => cur?.id === config.id ? null : config);
  }

  blocksInline(blocks: IPlayerFeeConfig['blocks']): string {
    return blocks.map(b => `${b.name} $${b.amount.toLocaleString('es-AR')}`).join(' · ');
  }

  categoriesLabel(cats: CategoryEnum[]): string {
    return cats.map(c => getCategoryLabel(c)).join(', ');
  }

  onAmountFocus(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    if (input.value === '0') {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
    input.select();
  }

  sportLabel(sport: SportEnum): string {
    return sportOptions.find(s => s.id === sport)?.label ?? sport;
  }

  discountLabel(order: number): string {
    if (order === 1) return '100%';
    if (order === 2) return '75%';
    return '50%';
  }

  // ── Import BDUAR ──────────────────────────────────────────────────────────

  readonly bduarSeasonOptions = (() => {
    const y = new Date().getFullYear();
    return [String(y + 1), String(y), String(y - 1)];
  })();

  bduarSeason = signal(String(new Date().getFullYear()));
  bduarRows = signal<BduarRow[]>([]);
  bduarFileName = signal('');
  bduarImporting = signal(false);
  bduarResult = signal<{ total: number; created: number; updated: number; recordsSet: number } | null>(null);

  private readonly COLUMN_MAP: Record<string, keyof BduarRow> = {
    documento: 'documento', doc: 'documento', dni: 'documento',
    apellido: 'apellido',
    nombre: 'nombre',
    'fecha nac.': 'fechaNac', 'fecha nac': 'fechaNac', fechanac: 'fechaNac',
    'fecha de nacimiento': 'fechaNac',
    sexo: 'sexo',
    puesto: 'puesto', posicion: 'puesto', posición: 'puesto',
    peso: 'peso',
    estatura: 'estatura', altura: 'estatura',
    email: 'email', 'e-mail': 'email', correo: 'email',
    'o. social': 'oSocial', osocial: 'oSocial', 'obra social': 'oSocial',
    'g.sang.': 'grupoSanguineo', 'g. sang.': 'grupoSanguineo', 'grupo sanguineo': 'grupoSanguineo', 'grupo sanguíneo': 'grupoSanguineo', gsang: 'grupoSanguineo',
    'f.fichaje': 'fechaFichaje', 'f. fichaje': 'fechaFichaje', 'fecha fichaje': 'fechaFichaje', fechafichaje: 'fechaFichaje',
    estado: 'estado', habilitacion: 'estado', habilitación: 'estado',
  };

  onBduarFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.bduarFileName.set(file.name);
    this.bduarRows.set([]);
    this.bduarResult.set(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

      const rows: BduarRow[] = raw
        .map((r) => {
          const mapped: Partial<BduarRow> = {};
          for (const key of Object.keys(r)) {
            const field = this.COLUMN_MAP[key.toLowerCase().trim()];
            if (field) mapped[field] = String(r[key] ?? '').trim();
          }
          return mapped as BduarRow;
        })
        .filter((r) => r.documento && r.nombre);

      this.bduarRows.set(rows);
    };
    reader.readAsArrayBuffer(file);
  }

  runBduarImport(): void {
    const rows = this.bduarRows();
    if (!rows.length) return;
    this.bduarImporting.set(true);
    this.bduarResult.set(null);
    this.adminService.importBduar(rows, this.bduarSeason())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.bduarResult.set(res);
          this.bduarImporting.set(false);
          this.bduarRows.set([]);
          this.bduarFileName.set('');
        },
        error: () => {
          this.bduarImporting.set(false);
          this.snackBar.open('Error al importar', 'Cerrar', { duration: 4000 });
        },
      });
  }

  openImportFamilyDialog(): void {
    this.dialog
      .open(ImportFamilyGroupsDialogComponent, { width: '480px', maxWidth: '95vw' })
      .afterClosed()
      .subscribe((result: ImportFamilyGroupsDialogResult | undefined) => {
        if (result?.created) this.loadAll();
      });
  }
}
