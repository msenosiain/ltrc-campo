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
      <a mat-tab-link routerLink="eligibility" routerLinkActive #rlaEligibility="routerLinkActive"
         [active]="rlaEligibility.isActive">
        Habilitación
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
