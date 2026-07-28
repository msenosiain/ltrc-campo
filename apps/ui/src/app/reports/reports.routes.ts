import { Routes } from '@angular/router';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reports-shell.component').then((m) => m.ReportsShellComponent),
    canActivate: [hasRoleGuard],
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.COORDINATOR, RoleEnum.MANAGER] },
    children: [
      { path: '', redirectTo: 'payments', pathMatch: 'full' },
      {
        path: 'payments',
        loadComponent: () =>
          import('./pages/payments-report/payments-report.component').then(
            (m) => m.PaymentsReportComponent
          ),
      },
      {
        path: 'player-fees',
        loadComponent: () =>
          import('./pages/player-fees-report/player-fees-report.component').then(
            (m) => m.PlayerFeesReportComponent
          ),
      },
      {
        path: 'payment-links',
        loadComponent: () =>
          import('./pages/payment-links-report/payment-links-report.component').then(
            (m) => m.PaymentLinksReportComponent
          ),
      },
      {
        path: 'birthdays',
        loadComponent: () =>
          import('./pages/birthdays-report/birthdays-report.component').then(
            (m) => m.BirthdaysReportComponent
          ),
      },
      {
        path: 'attendance',
        loadComponent: () =>
          import('./pages/attendance-report/attendance-report.component').then(
            (m) => m.AttendanceReportComponent
          ),
      },
    ],
  },
];
