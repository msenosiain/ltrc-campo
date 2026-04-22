import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RoleEnum } from '@ltrc-campo/shared-api-model';
import { AuthService } from '../auth.service';

@Injectable({ providedIn: 'root' })
export class ViewAsRoleService {
  private readonly authService = inject(AuthService);
  private readonly currentUser = toSignal(this.authService.user$);
  private readonly isAdmin = computed(
    () => this.currentUser()?.roles?.includes(RoleEnum.ADMIN) ?? false
  );

  private readonly _viewAsRole = signal<RoleEnum | null>(null);
  readonly viewAsRole = this._viewAsRole.asReadonly();

  constructor() {
    // Auto-clear view-as when the current user is no longer admin
    effect(() => {
      if (!this.isAdmin()) {
        this._viewAsRole.set(null);
      }
    });
  }

  set(role: RoleEnum | null): void {
    if (role !== null && !this.isAdmin()) return;
    this._viewAsRole.set(role);
  }

  clear(): void {
    this._viewAsRole.set(null);
  }
}
