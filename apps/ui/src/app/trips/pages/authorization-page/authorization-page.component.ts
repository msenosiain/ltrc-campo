import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { TripsService, TripPublicInfo, AuthorizationData } from '../../services/trips.service';
import { TripAuthorizationPdfService } from '../../services/trip-authorization-pdf.service';

type PageState = 'loading' | 'ready' | 'looking-up' | 'downloading' | 'error';

@Component({
  selector: 'ltrc-authorization-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './authorization-page.component.html',
  styleUrl: './authorization-page.component.scss',
})
export class AuthorizationPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tripsService = inject(TripsService);
  private readonly pdfService = inject(TripAuthorizationPdfService);

  state: PageState = 'loading';
  tripInfo: TripPublicInfo | null = null;
  errorMessage = '';

  dniControl = new FormControl('', [
    Validators.required,
    Validators.minLength(6),
    Validators.pattern(/^\d+$/),
  ]);

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('tripId') ?? '';
    this.tripsService.getPublicTripInfo(tripId).subscribe({
      next: (info) => {
        this.tripInfo = info;
        this.state = 'ready';
      },
      error: () => {
        this.state = 'error';
        this.errorMessage = 'No se pudo cargar la información del viaje.';
      },
    });
  }

  download(): void {
    if (this.dniControl.invalid) return;
    const tripId = this.route.snapshot.paramMap.get('tripId') ?? '';
    this.state = 'looking-up';
    this.errorMessage = '';
    this.tripsService.lookupAuthorization(tripId, this.dniControl.value!).subscribe({
      next: async (data: AuthorizationData) => {
        this.state = 'downloading';
        await this.pdfService.generate(data);
        this.state = 'ready';
      },
      error: (err) => {
        this.state = 'ready';
        this.errorMessage =
          err.status === 404
            ? 'No se encontró ningún pasajero con ese DNI en este viaje.'
            : 'Error al buscar el pasajero. Intente nuevamente.';
      },
    });
  }
}
