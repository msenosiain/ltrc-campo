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
        title: 'Informe de Pagos',
        loadComponent: () =>
          import('./pages/payments-report/payments-report.component').then(
            (m) => m.PaymentsReportComponent
          ),
      },
      {
        path: 'player-fees',
        title: 'Derechos de Jugador',
        loadComponent: () =>
          import('./pages/player-fees-report/player-fees-report.component').then(
            (m) => m.PlayerFeesReportComponent
          ),
      },
      {
        path: 'payment-links',
        title: 'Links de Pago',
        loadComponent: () =>
          import('./pages/payment-links-report/payment-links-report.component').then(
            (m) => m.PaymentLinksReportComponent
          ),
      },
      {
        path: 'birthdays',
        title: 'Listado de Cumpleaños',
        loadComponent: () =>
          import('./pages/birthdays-report/birthdays-report.component').then(
            (m) => m.BirthdaysReportComponent
          ),
      },
      {
        path: 'attendance',
        title: 'Reporte de Asistencia',
        loadComponent: () =>
          import('./pages/attendance-report/attendance-report.component').then(
            (m) => m.AttendanceReportComponent
          ),
      },
    ],
  },
];
