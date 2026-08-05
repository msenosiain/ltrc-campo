import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../auth.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

@Component({
  selector: 'ltrc-auth-callback',
  imports: [CommonModule],
  templateUrl: './auth-callback.component.html',
  styleUrl: './auth-callback.component.scss',
})
export class AuthCallbackComponent implements OnInit {
  destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private router = inject(Router);

  ngOnInit(): void {
    this.route.queryParams
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        map((params) => {
          return {
            access_token: params['access_token'],
            refresh_token: params['refresh_token'],
          };
        })
      )
      .subscribe((token) => {
        const hasAccess = !!token?.access_token;
        const hasRefresh = !!token?.refresh_token;

        // If we received both tokens, save them and continue to dashboard.
        if (hasAccess && hasRefresh) {
          this.authService.setAccessToken(token.access_token);
          this.authService.setRefreshToken(token.refresh_token);
          this.router.navigate(['/dashboard']);
          return;
        }

        // If neither token present, start OAuth flow. If only one is present, show an error instead of retrying.
        if (!hasAccess && !hasRefresh) {
          this.authService.loginWithGoogle();
          return;
        }

        // Partial or invalid result: navigate to login with an error message.
        this.router.navigate(['/login'], {
          queryParams: { error: 'authentication_failed' },
        });
      });
  }
}
