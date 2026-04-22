import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'ltrc-reports-shell',
  standalone: true,
  imports: [RouterModule, MatTabsModule],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="tabPanel">
      <a mat-tab-link routerLink="encounter" routerLinkActive #rlaEncounter="routerLinkActive"
         [active]="rlaEncounter.isActive">
        Encuentros
      </a>
      @if (canSeePayments()) {
        <a mat-tab-link routerLink="payments" routerLinkActive #rlaPayments="routerLinkActive"
           [active]="rlaPayments.isActive">
          Pagos
        </a>
      }
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
export class ReportsShellComponent {
  private readonly authService = inject(AuthService);
  private readonly currentUser = toSignal(this.authService.user$);

  readonly canSeePayments = computed(() => {
    const roles = this.currentUser()?.roles ?? [];
    return roles.some((r) =>
      [RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.COORDINATOR].includes(r as RoleEnum)
    );
  });
}
