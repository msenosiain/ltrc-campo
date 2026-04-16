import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { format } from 'date-fns';
import { debounceTime, switchMap } from 'rxjs/operators';
import { of, Subject } from 'rxjs';
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
import { DecimalPipe, DatePipe } from '@angular/common';
import { CategoryEnum, IFamilyGroup, IPlayerFeeConfig, Player, SportEnum } from '@ltrc-campo/shared-api-model';
import { categoryOptions, getCategoryLabel } from '../../../common/category-options';
import { sportOptions } from '../../../common/sport-options';
import { PlayerFeesAdminService, PlayerFeeConfigPayload } from '../../services/player-fees-admin.service';
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
    DatePipe,
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
  private readonly router = inject(Router);

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
    expiresAt: [null as Date | null, Validators.required],
    familyDiscount: [false],
    blocks: this.fb.array([]),
  });

  get blocks(): FormArray {
    return this.configForm.get('blocks') as FormArray;
  }

  // Family table
  familyFilter = signal('');

  readonly filteredFamilies = computed(() => {
    const term = this.familyFilter().toLowerCase().trim();
    if (!term) return this.families();
    return this.families().filter(f =>
      f.name.toLowerCase().includes(term) ||
      f.members.some(m => m.playerName?.toLowerCase().includes(term))
    );
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
      .subscribe({ next: (f) => this.families.set(f), error: () => {} });
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
      expiresAt: new Date((config.expiresAt as unknown as string).slice(0, 10) + 'T12:00:00Z'),
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
    const usedInOtherBlocks = new Set<CategoryEnum>(
      this.blocks.controls.flatMap((ctrl, i) =>
        i !== blockIndex ? (ctrl.get('categories')?.value as CategoryEnum[] ?? []) : []
      )
    );
    return this.categoryOptions.filter(cat => !usedInOtherBlocks.has(cat.id as CategoryEnum));
  }

  addBlock(data?: { name: string; categories: CategoryEnum[]; amount: number }): void {
    this.blocks.push(this.newBlock(data));
  }

  removeBlock(i: number): void {
    this.blocks.removeAt(i);
  }

  private newBlock(data?: { name: string; categories: CategoryEnum[]; amount: number }): FormGroup {
    return this.fb.group({
      name: [data?.name ?? '', Validators.required],
      categories: [data?.categories ?? [], Validators.required],
      amount: [data?.amount ?? 0, [Validators.required, Validators.min(0)]],
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
      expiresAt: format(v.expiresAt as Date, 'yyyy-MM-dd'),
      familyDiscount: v.familyDiscount,
      blocks: v.blocks,
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

  memberDisplayFn(member: FormGroup): string {
    return member.get('playerName')?.value ?? '';
  }

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

  deleteFamily(family: IFamilyGroup): void {
    if (!confirm(`¿Eliminar grupo "${family.name}"?`)) return;
    this.adminService.deleteFamily(family.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
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

  goToList(): void {
    this.router.navigate(['/dashboard/player-fees']);
  }

  sportLabel(sport: SportEnum): string {
    return sportOptions.find(s => s.id === sport)?.label ?? sport;
  }

  discountLabel(order: number): string {
    if (order === 1) return '100%';
    if (order === 2) return '75%';
    return '50%';
  }
}
