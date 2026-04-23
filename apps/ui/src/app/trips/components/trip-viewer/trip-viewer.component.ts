import {
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { concat, of, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, filter, last, map, switchMap } from 'rxjs/operators';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  CategoryEnum,
  PaymentEntityTypeEnum,
  Player,
  RoleEnum,
  SportEnum,
  TransportTypeEnum,
  Trip,
  TripParticipant,
  TripParticipantStatusEnum,
  TripParticipantTypeEnum,
  TripTransport,
} from '@ltrc-campo/shared-api-model';
import { PaymentLinksPanelComponent } from '../../../payments/components/payment-links-panel/payment-links-panel.component';
import { TripRecordPaymentDialogComponent } from '../trip-record-payment-dialog/trip-record-payment-dialog.component';
import { TripsService, AddParticipantPayload, AddTransportPayload } from '../../services/trips.service';
import { ConfirmDialogComponent } from '../../../common/components/confirm-dialog/confirm-dialog.component';
import { AllowedRolesDirective } from '../../../auth/directives/allowed-roles.directive';
import { AuthService } from '../../../auth/auth.service';
import { ViewAsRoleService } from '../../../auth/services/view-as-role.service';
import { sportOptions } from '../../../common/sport-options';
import { getCategoryLabel } from '../../../common/category-options';
import { PlayersService } from '../../../players/services/players.service';
import { UsersService } from '../../../users/services/users.service';
import { User } from '../../../users/User.interface';
import {
  getParticipantStatusLabel,
  getParticipantTypeLabel,
  getTransportTypeLabel,
  getTripStatusLabel,
  participantStatusOptions,
  participantTypeOptions,
  transportTypeOptions,
} from '../../trip-options';
import { getErrorMessage } from '../../../common/utils/error-message';

@Component({
  selector: 'ltrc-trip-viewer',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatCheckboxModule,
    MatMenuModule,
    RouterLink,
    MatCardModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
    MatDatepickerModule,
    MatTooltipModule,
    AllowedRolesDirective,
    PaymentLinksPanelComponent,
  ],
  templateUrl: './trip-viewer.component.html',
  styleUrl: './trip-viewer.component.scss',
})
export class TripViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly tripsService = inject(TripsService);
  private readonly playersService = inject(PlayersService);
  private readonly usersService = inject(UsersService);
  private readonly authService = inject(AuthService);
  private readonly viewAsService = inject(ViewAsRoleService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly RoleEnum = RoleEnum;

  private readonly currentUser = toSignal(this.authService.user$);
  readonly canViewCobros = computed(() => {
    const viewAs = this.viewAsService.viewAsRole();
    const allowed = [RoleEnum.ADMIN, RoleEnum.COORDINATOR] as RoleEnum[];
    if (viewAs) return allowed.includes(viewAs as RoleEnum);
    return (this.currentUser()?.roles ?? []).some((r) => allowed.includes(r));
  });
  readonly PaymentEntityTypeEnum = PaymentEntityTypeEnum;
  readonly TripParticipantTypeEnum = TripParticipantTypeEnum;

  showPaymentsPanel = false;
  readonly participantTypeOptions = participantTypeOptions;
  readonly participantStatusOptions = participantStatusOptions;
  readonly transportTypeOptions = transportTypeOptions;

  trip?: Trip;
  loading = signal(false);

  readonly participantColumns = [
    'select',
    'name',
    'category',
    'status',
    'cost',
    'paid',
    'balance',
    'actions',
  ];

  readonly selectedIds = new Set<string>();
  bulkUpdating = false;

  isSelected(p: TripParticipant): boolean {
    return !!p.id && this.selectedIds.has(p.id);
  }

  toggleSelection(p: TripParticipant): void {
    if (!p.id) return;
    this.selectedIds.has(p.id) ? this.selectedIds.delete(p.id) : this.selectedIds.add(p.id);
  }

  get allSelected(): boolean {
    const participants = this.trip?.participants ?? [];
    return participants.length > 0 && participants.every((p) => p.id && this.selectedIds.has(p.id));
  }

  get someSelected(): boolean {
    return this.selectedIds.size > 0 && !this.allSelected;
  }

  toggleAll(): void {
    if (this.allSelected) {
      this.selectedIds.clear();
    } else {
      this.trip?.participants.forEach((p) => p.id && this.selectedIds.add(p.id));
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  bulkUpdateStatus(status: TripParticipantStatusEnum): void {
    if (!this.trip?.id || this.selectedIds.size === 0) return;
    this.bulkUpdating = true;
    const ids = [...this.selectedIds];
    const requests$ = ids
      .map((id) => this.trip!.participants.find((p) => p.id === id))
      .filter((p): p is TripParticipant => !!p)
      .map((p) => this.tripsService.updateParticipant(this.trip!.id!, p.id!, { status }));

    concat(...requests$)
      .pipe(last(), switchMap(() => this.tripsService.getTripById(this.trip!.id!)), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.selectedIds.clear();
          this.bulkUpdating = false;
          this.snackBar.open(`${ids.length} participantes actualizados`, 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.bulkUpdating = false;
          this.snackBar.open(getErrorMessage(err, 'Error al actualizar'), 'Cerrar', { duration: 4000 });
        },
      });
  }

  // Formulario agregar participante
  addParticipantForm = this.fb.group({
    type: [TripParticipantTypeEnum.PLAYER as TripParticipantTypeEnum, Validators.required],
    externalName: [''],
    externalDni: [''],
    externalRole: [''],
    status: [TripParticipantStatusEnum.INTERESTED as TripParticipantStatusEnum],
    costAssigned: [null as number | null],
    specialNeeds: [''],
  });

  // Typeahead jugador
  readonly playerSearchCtrl = new FormControl<Player | string | null>(null);
  readonly displayPlayerFn = (p: Player | null): string => p?.name ?? '';
  playerSuggestions: Player[] = [];
  selectedPlayer: Player | null = null;
  private readonly playerSearchSubject = new Subject<string>();

  // Typeahead staff
  readonly userSearchCtrl = new FormControl<User | string | null>(null);
  readonly displayUserFn = (u: User | null): string => u?.name ?? '';
  userSuggestions: User[] = [];
  selectedUser: User | null = null;
  private readonly userSearchSubject = new Subject<string>();

  addingAllPlayers = false;

  showAddParticipant = false;

  // ── Estado transportes ────────────────────────────────────────────────────
  showAddTransport = false;
  editingTransportId: string | null = null;

  addTransportForm = this.fb.group({
    name: ['', Validators.required],
    type: [TransportTypeEnum.BUS as TransportTypeEnum, Validators.required],
    capacity: [null as number | null, [Validators.required, Validators.min(1)]],
    company: [''],
    departureTime: [''],
    notes: [''],
  });

  editTransportForm = this.fb.group({
    name: ['', Validators.required],
    type: [TransportTypeEnum.BUS as TransportTypeEnum, Validators.required],
    capacity: [null as number | null, [Validators.required, Validators.min(1)]],
    company: [''],
    departureTime: [''],
    notes: [''],
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/dashboard/trips']);
      return;
    }
    this.loadTrip(id);

    // Player typeahead
    this.playerSearchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.playersService.getPlayers({
            page: 1,
            size: 20,
            filters: {
              searchTerm: term,
              ...(this.trip?.sport && { sport: this.trip.sport }),
              ...(this.trip?.categories?.length && { categories: this.trip.categories }),
            },
          })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => (this.playerSuggestions = result.items));

    this.playerSearchCtrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (typeof value === 'string') {
          this.selectedPlayer = null;
          if (value.length >= 2) this.playerSearchSubject.next(value);
          else this.playerSuggestions = [];
        }
      });

    // Staff typeahead
    this.userSearchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) =>
          this.usersService.getUsers({ page: 1, size: 20, filters: { searchTerm: term } })
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((result) => (this.userSuggestions = result.items));

    this.userSearchCtrl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (typeof value === 'string') {
          this.selectedUser = null;
          if (value.length >= 2) this.userSearchSubject.next(value);
          else this.userSuggestions = [];
        }
      });

    // Limpiar selección y ajustar costo por defecto al cambiar tipo
    this.addParticipantForm
      .get('type')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((type) => {
        this.clearParticipantSelections();
        const defaultCost = type === TripParticipantTypeEnum.STAFF ? 0 : (this.trip?.costPerPerson ?? null);
        this.addParticipantForm.patchValue({ costAssigned: defaultCost }, { emitEvent: false });
      });
  }

  private loadTrip(id: string): void {
    this.loading.set(true);
    this.tripsService
      .getTripById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.loading.set(false);
          // Inicializar costo por defecto en form
          this.addParticipantForm.patchValue({ costAssigned: trip.costPerPerson });
        },
        error: () => this.router.navigate(['/dashboard/trips']),
      });
  }

  // ── Labels ────────────────────────────────────────────────────────────────

  get tripPaymentLabel(): string {
    if (!this.trip) return '';
    const date = new Date(this.trip.departureDate).toLocaleDateString('es-AR');
    return `${this.trip.name} — ${this.trip.destination} (${date})`;
  }

  getSportLabel(sport?: SportEnum): string {
    return sportOptions.find((s) => s.id === sport)?.label ?? '';
  }

  getCategoryLabel = getCategoryLabel;
  getStatusLabel = getTripStatusLabel;
  getParticipantTypeLabel = getParticipantTypeLabel;
  getParticipantStatusLabel = getParticipantStatusLabel;

  getParticipantCategory(p: TripParticipant): string {
    if (p.type === TripParticipantTypeEnum.PLAYER) {
      const cat = (p.player as any)?.category;
      return cat ? getCategoryLabel(cat) : '';
    }
    if (p.type === TripParticipantTypeEnum.STAFF) {
      return p.externalRole ?? 'Staff';
    }
    return p.externalRole ?? '';
  }

  getParticipantName(p: TripParticipant): string {
    if (p.type === TripParticipantTypeEnum.PLAYER) {
      return (p.player as any)?.name ?? '(jugador)';
    }
    if (p.type === TripParticipantTypeEnum.STAFF) {
      return (p as any).user?.name ?? p.userName ?? '(staff)';
    }
    return p.externalName ?? '(externo)';
  }

  getParticipantDni(p: TripParticipant): string | undefined {
    if (p.type === TripParticipantTypeEnum.PLAYER) {
      return (p.player as any)?.idNumber;
    }
    if (p.type === TripParticipantTypeEnum.STAFF) {
      return (p as any).user?.idNumber;
    }
    return p.externalDni;
  }

  getTotalPaid(p: TripParticipant): number {
    return p.payments?.reduce((sum, pay) => sum + pay.amount, 0) ?? 0;
  }

  getBalance(p: TripParticipant): number {
    return p.costAssigned - this.getTotalPaid(p);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────

  get confirmedCount(): number {
    return this.trip?.participants.filter(
      (p) => p.status === TripParticipantStatusEnum.CONFIRMED
    ).length ?? 0;
  }

  /** Cupo efectivo: suma de capacidades de transportes o maxParticipants como fallback */
  get effectiveCapacity(): number | null {
    const transports = this.trip?.transports ?? [];
    if (transports.length > 0) {
      return transports.reduce((sum, t) => sum + t.capacity, 0);
    }
    return this.trip?.maxParticipants ?? null;
  }

  get totalCollected(): number {
    return this.trip?.participants.reduce(
      (sum, p) => sum + this.getTotalPaid(p), 0
    ) ?? 0;
  }

  get totalDebt(): number {
    return this.trip?.participants
      .filter((p) => p.status !== TripParticipantStatusEnum.CANCELLED)
      .reduce((sum, p) => sum + Math.max(0, this.getBalance(p)), 0) ?? 0;
  }

  // ── Acciones participantes ────────────────────────────────────────────────

  private clearParticipantSelections(): void {
    this.selectedPlayer = null;
    this.selectedUser = null;
    this.playerSearchCtrl.setValue(null, { emitEvent: false });
    this.userSearchCtrl.setValue(null, { emitEvent: false });
    this.playerSuggestions = [];
    this.userSuggestions = [];
  }

  toggleAddParticipant(): void {
    this.showAddParticipant = !this.showAddParticipant;
    if (!this.showAddParticipant) {
      this.addParticipantForm.reset({
        type: TripParticipantTypeEnum.PLAYER,
        status: TripParticipantStatusEnum.INTERESTED,
        costAssigned: this.trip?.costPerPerson ?? 0,
      });
      this.clearParticipantSelections();
    }
  }

  onPlayerSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectedPlayer = event.option.value as Player;
  }

  onUserSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectedUser = event.option.value as User;
  }

  submitAddParticipant(): void {
    if (!this.trip?.id || this.addParticipantForm.invalid) return;
    const v = this.addParticipantForm.getRawValue();

    if (v.type === TripParticipantTypeEnum.PLAYER && !this.selectedPlayer?.id) {
      this.snackBar.open('Seleccioná un jugador de la lista', 'Cerrar', { duration: 3000 });
      return;
    }
    if (v.type === TripParticipantTypeEnum.STAFF && !this.selectedUser?.id) {
      this.snackBar.open('Seleccioná un usuario de la lista', 'Cerrar', { duration: 3000 });
      return;
    }

    const defaultCost = v.type === TripParticipantTypeEnum.STAFF ? 0 : this.trip.costPerPerson;
    const payload: AddParticipantPayload = {
      type: v.type!,
      status: v.status ?? undefined,
      costAssigned: v.costAssigned ?? defaultCost,
      specialNeeds: v.specialNeeds || undefined,
    };

    if (v.type === TripParticipantTypeEnum.PLAYER) {
      payload.playerId = this.selectedPlayer!.id!;
    } else if (v.type === TripParticipantTypeEnum.STAFF) {
      payload.userId = this.selectedUser!.id!;
    } else {
      payload.externalName = v.externalName || undefined;
      payload.externalDni = v.externalDni || undefined;
      payload.externalRole = v.externalRole || undefined;
    }

    this.tripsService
      .addParticipant(this.trip.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.toggleAddParticipant();
        },
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error al agregar participante'), 'Cerrar', {
            duration: 4000,
          }),
      });
  }

  removeAllParticipants(): void {
    if (!this.trip?.id || !this.trip.participants.length) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Quitar todos los participantes',
          message: `¿Quitar los ${this.trip.participants.length} participantes del viaje? Esta acción no se puede deshacer.`,
          confirmLabel: 'Quitar todos',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() =>
          concat(
            ...this.trip!.participants.map((p) =>
              this.tripsService.removeParticipant(this.trip!.id!, p.id!)
            )
          ).pipe(last())
        ),
        switchMap(() => this.tripsService.getTripById(this.trip!.id!)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.snackBar.open('Todos los participantes fueron quitados', 'Cerrar', { duration: 3000 });
        },
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error al quitar participantes'), 'Cerrar', { duration: 4000 }),
      });
  }

  addAllPlayersFromCategory(category: CategoryEnum): void {
    if (!this.trip?.id) return;
    this.addingAllPlayers = true;

    this.playersService
      .getPlayers({
        page: 1,
        size: 200,
        filters: {
          ...(this.trip.sport && { sport: this.trip.sport }),
          categories: [category],
        },
      })
      .pipe(
        switchMap((result) => {
          const existingPlayerIds = new Set(
            this.trip!.participants
              .filter((p) => p.type === TripParticipantTypeEnum.PLAYER)
              .map((p) => (p.player as any)?.id ?? (p.player as any)?._id)
          );
          const toAdd = result.items.filter((p) => p.id && !existingPlayerIds.has(p.id));
          if (toAdd.length === 0) return of({ added: 0 });

          // Secuencial para evitar race conditions en MongoDB
          return concat(
            ...toAdd.map((p) =>
              this.tripsService.addParticipant(this.trip!.id!, {
                type: TripParticipantTypeEnum.PLAYER,
                playerId: p.id!,
                status: TripParticipantStatusEnum.INTERESTED,
                costAssigned: this.trip!.costPerPerson,
              })
            )
          ).pipe(last(), map(() => ({ added: toAdd.length })));
        }),
        // Recargar el viaje para tener los datos populados correctamente
        switchMap(({ added }) =>
          this.tripsService.getTripById(this.trip!.id!).pipe(map((trip) => ({ added, trip })))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: ({ added, trip }) => {
          this.addingAllPlayers = false;
          this.trip = trip;
          const msg = added === 0 ? 'Todos los jugadores ya están en el viaje' : `${added} jugadores agregados`;
          this.snackBar.open(msg, 'Cerrar', { duration: 3000 });
        },
        error: (err) => {
          this.addingAllPlayers = false;
          this.snackBar.open(getErrorMessage(err, 'Error al agregar jugadores'), 'Cerrar', { duration: 4000 });
        },
      });
  }

  updateParticipantStatus(p: TripParticipant, status: TripParticipantStatusEnum): void {
    if (!this.trip?.id || !p.id) return;
    this.tripsService
      .updateParticipant(this.trip.id, p.id, { status })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (trip) => (this.trip = trip) });
  }

  removeParticipant(p: TripParticipant): void {
    if (!this.trip?.id) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Quitar participante',
          message: `¿Quitar a ${this.getParticipantName(p)} del viaje?`,
          confirmLabel: 'Quitar',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() =>
          this.tripsService.removeParticipant(this.trip!.id!, p.id!)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: (trip) => (this.trip = trip) });
  }

  // ── Pagos ─────────────────────────────────────────────────────────────────

  openManualPaymentDialog(): void {
    if (!this.trip) return;
    this.dialog
      .open(TripRecordPaymentDialogComponent, {
        width: '440px',
        data: { trip: this.trip },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updatedTrip: Trip | undefined) => {
        if (updatedTrip) this.trip = updatedTrip;
      });
  }

  removePayment(p: TripParticipant, paymentId: string): void {
    if (!this.trip?.id) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar pago',
          message: '¿Eliminar este pago?',
          confirmLabel: 'Eliminar',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() =>
          this.tripsService.removePayment(this.trip!.id!, p.id!, paymentId)
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: (trip) => (this.trip = trip) });
  }

  // ── Transportes ───────────────────────────────────────────────────────────

  getTransportTypeLabel = getTransportTypeLabel;

  getParticipantsForTransport(transportId: string): TripParticipant[] {
    return this.trip?.participants.filter((p) => p.transportId === transportId) ?? [];
  }

  getUnassignedParticipants(): TripParticipant[] {
    return (
      this.trip?.participants.filter(
        (p) => !p.transportId && p.status === TripParticipantStatusEnum.CONFIRMED
      ) ?? []
    );
  }

  getOccupancy(t: TripTransport): number {
    return this.trip?.participants.filter((p) => p.transportId === t.id).length ?? 0;
  }

  toggleAddTransport(): void {
    this.showAddTransport = !this.showAddTransport;
    if (!this.showAddTransport) {
      this.addTransportForm.reset({ type: TransportTypeEnum.BUS, capacity: null });
    }
  }

  submitAddTransport(): void {
    if (!this.trip?.id || this.addTransportForm.invalid) return;
    const v = this.addTransportForm.getRawValue();
    const payload: AddTransportPayload = {
      name: v.name!,
      type: v.type!,
      capacity: v.capacity!,
      company: v.company || undefined,
      departureTime: v.departureTime || undefined,
      notes: v.notes || undefined,
    };
    this.tripsService
      .addTransport(this.trip.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.toggleAddTransport();
        },
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error al agregar transporte'), 'Cerrar', {
            duration: 4000,
          }),
      });
  }

  startEditTransport(t: TripTransport): void {
    this.editingTransportId = t.id ?? null;
    this.editTransportForm.patchValue({
      name: t.name,
      type: t.type,
      capacity: t.capacity,
      company: t.company ?? '',
      departureTime: t.departureTime ?? '',
      notes: t.notes ?? '',
    });
  }

  cancelEditTransport(): void {
    this.editingTransportId = null;
  }

  submitEditTransport(): void {
    if (!this.trip?.id || !this.editingTransportId || this.editTransportForm.invalid) return;
    const v = this.editTransportForm.getRawValue();
    this.tripsService
      .updateTransport(this.trip.id, this.editingTransportId, {
        name: v.name!,
        type: v.type!,
        capacity: v.capacity!,
        company: v.company || undefined,
        departureTime: v.departureTime || undefined,
        notes: v.notes || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.cancelEditTransport();
        },
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error al actualizar transporte'), 'Cerrar', {
            duration: 4000,
          }),
      });
  }

  removeTransport(t: TripTransport): void {
    if (!this.trip?.id) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Eliminar transporte',
          message: `¿Eliminar "${t.name}"? Los participantes asignados quedarán sin transporte.`,
          confirmLabel: 'Eliminar',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() => this.tripsService.removeTransport(this.trip!.id!, t.id!)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({ next: (trip) => (this.trip = trip) });
  }

  draftTransports(): void {
    if (!this.trip?.id) return;
    this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Asignación automática',
          message:
            'Se calcularán las asignaciones de transporte según categoría. Las asignaciones existentes serán reemplazadas. ¿Continuar?',
          confirmLabel: 'Calcular',
        },
      })
      .afterClosed()
      .pipe(
        filter((confirmed) => !!confirmed),
        switchMap(() => this.tripsService.draftTransportAssignment(this.trip!.id!)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (trip) => {
          this.trip = trip;
          this.snackBar.open('Asignaciones calculadas', 'Cerrar', { duration: 3000 });
        },
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error en asignación automática'), 'Cerrar', {
            duration: 4000,
          }),
      });
  }

  assignTransport(p: TripParticipant, transportId: string | null): void {
    if (!this.trip?.id || !p.id) return;
    this.tripsService
      .moveParticipant(this.trip.id, p.id, transportId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (trip) => (this.trip = trip),
        error: (err) =>
          this.snackBar.open(getErrorMessage(err, 'Error al asignar transporte'), 'Cerrar', {
            duration: 4000,
          }),
      });
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  goToEdit(): void {
    this.router.navigate(['/dashboard/trips', this.trip?.id, 'edit']);
  }

  backToList(): void {
    this.router.navigate(['/dashboard/trips']);
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.dialog.openDialogs.length > 0) return;
    this.backToList();
  }
}
