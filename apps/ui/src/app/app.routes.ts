import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';

import { AuthCallbackComponent } from './auth/components/auth-callback/auth-callback.component';
import { authGuard } from './auth/guards/auth.guard';

import { LoginComponent } from './auth/components/login/login.component';
import { ActivateAccountComponent } from './auth/components/activate-account/activate-account.component';
import { SetPasswordComponent } from './auth/components/set-password/set-password.component';
import { ForgotPasswordComponent } from './auth/components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './auth/components/reset-password/reset-password.component';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'auth/callback', component: AuthCallbackComponent },
  { path: 'auth/activate', component: ActivateAccountComponent },
  { path: 'auth/forgot-password', component: ForgotPasswordComponent },
  { path: 'auth/reset-password', component: ResetPasswordComponent },
  {
    path: 'pay/result',
    loadComponent: () =>
      import('./payments/pages/payment-result/payment-result.component').then(
        (m) => m.PaymentResultComponent
      ),
  },
  {
    path: 'pay/:token',
    loadComponent: () =>
      import('./payments/pages/payment-page/payment-page.component').then(
        (m) => m.PaymentPageComponent
      ),
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'players',
        loadChildren: () =>
          import('./players/players.routes').then((m) => m.PLAYERS_ROUTES),
      },
      {
        path: 'tournaments',
        loadChildren: () =>
          import('./tournaments/tournaments.routes').then(
            (m) => m.TOURNAMENTS_ROUTES
          ),
      },
      {
        path: 'matches',
        loadChildren: () =>
          import('./matches/matches.routes').then((m) => m.MATCHES_ROUTES),
      },
      {
        path: 'users',
        loadChildren: () =>
          import('./users/users.routes').then((m) => m.USERS_ROUTES),
      },
      {
        path: 'branches',
        loadChildren: () =>
          import('./branches/branches.routes').then((m) => m.BRANCHES_ROUTES),
      },
      {
        path: 'trainings',
        loadChildren: () =>
          import('./trainings/trainings.routes').then(
            (m) => m.TRAININGS_ROUTES
          ),
      },
      {
        path: 'trips',
        loadChildren: () =>
          import('./trips/trip.routes').then((m) => m.TRIPS_ROUTES),
      },
      {
        path: 'physical',
        loadChildren: () =>
          import('./physical-training/physical-training.routes').then(
            (m) => m.PHYSICAL_TRAINING_ROUTES
          ),
      },
      {
        path: 'my-workout',
        loadComponent: () =>
          import('./physical-training/components/my-workout/my-workout.component').then(
            (m) => m.MyWorkoutComponent
          ),
      },
      {
        path: 'calendar',
        loadChildren: () =>
          import('./calendar/calendar.routes').then((m) => m.CALENDAR_ROUTES),
      },
      {
        path: 'analytics',
        loadChildren: () =>
          import('./analytics/analytics.routes').then((m) => m.ANALYTICS_ROUTES),
      },
      {
        path: 'evaluations',
        loadChildren: () =>
          import('./evaluations/evaluations.routes').then((m) => m.EVALUATIONS_ROUTES),
      },
      {
        path: 'reports',
        loadChildren: () =>
          import('./reports/reports.routes').then((m) => m.REPORTS_ROUTES),
      },
      {
        path: 'settings',
        loadChildren: () =>
          import('./settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
      { path: 'set-password', component: SetPasswordComponent },
    ],
  },
  // Fallback to dashboard for any unknown route
  {
    path: 'checkin/:sessionId',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./trainings/components/checkin-page/checkin-page.component').then(
        (m) => m.CheckinPageComponent
      ),
  },
  { path: '**', redirectTo: '/dashboard' },
];
