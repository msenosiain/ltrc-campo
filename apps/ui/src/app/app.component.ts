import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { UserProfileMenuComponent } from './common/components/user-profile-menu/user-profile-menu.component';
import { SidenavService } from './common/services/sidenav.service';

@Component({
  selector: 'ltrc-root',
  imports: [
    RouterOutlet,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    UserProfileMenuComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly sidenavService = inject(SidenavService);
  private readonly router = inject(Router);

  private isPublicRoute(url: string): boolean {
    return (
      url.startsWith('/auth') ||
      url.startsWith('/login') ||
      url.startsWith('/pay') ||
      url.startsWith('/votar') ||
      url.startsWith('/player-fee') ||
      url.startsWith('/authorization')
    );
  }

  readonly showToolbar = toSignal(
    this.router.events.pipe(map(() => !this.isPublicRoute(this.router.url))),
    { initialValue: !this.isPublicRoute(this.router.url) }
  );

  toggleSidenav(): void {
    this.sidenavService.toggle();
  }
}
