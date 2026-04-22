import { Routes } from '@angular/router';
import { hasRoleGuard } from '../auth/guards/has-role.guard';
import { RoleEnum } from '@ltrc-campo/shared-api-model';

export const REPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./reports-shell.component').then((m) => m.ReportsShellComponent),
    canActivate: [hasRoleGuard],
    data: { allowedRoles: [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR] },
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
        path: 'eligibility',
        loadComponent: () =>
          import('./pages/eligibility-report/eligibility-report.component').then(
            (m) => m.EligibilityReportComponent
          ),
      },
    ],
  },
];
