import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';

@Component({
  selector: 'ltrc-reports-shell',
  standalone: true,
  imports: [RouterModule, MatTabsModule],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="tabPanel">
      <a mat-tab-link routerLink="payments" routerLinkActive #rlaPayments="routerLinkActive"
         [active]="rlaPayments.isActive">
        Pagos
      </a>
      <a mat-tab-link routerLink="player-fees" routerLinkActive #rlaFees="routerLinkActive"
         [active]="rlaFees.isActive">
        Derechos
      </a>
      <a mat-tab-link routerLink="payment-links" routerLinkActive #rlaLinks="routerLinkActive"
         [active]="rlaLinks.isActive">
        Links de Pago
      </a>
      <a mat-tab-link routerLink="birthdays" routerLinkActive #rlaBirthdays="routerLinkActive"
         [active]="rlaBirthdays.isActive">
        Cumpleaños
      </a>
      <a mat-tab-link routerLink="attendance" routerLinkActive #rlaAttendance="routerLinkActive"
         [active]="rlaAttendance.isActive">
        Asistencia
      </a>
    </nav>
    <mat-tab-nav-panel #tabPanel>
      <router-outlet />
    </mat-tab-nav-panel>
  `,
  styles: [`
    :host { display: block; }
    nav[mat-tab-nav-bar] { margin-bottom: 0; }
  `],
})
export class ReportsShellComponent {}
