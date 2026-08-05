import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { BehaviorSubject, Observable, tap, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { User } from '../users/User.interface';
import { jwtDecode } from 'jwt-decode';
import { Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // Normalize apiBaseUrl to avoid double prefixes if env contains trailing slashes
  private normalizedApiBaseUrl = ((): string => {
    try {
      // Remove trailing slashes
      return environment.apiBaseUrl.replace(/\/+$/g, '');
    } catch {
      return environment.apiBaseUrl;
    }
  })();

  private authApiUrl = `${this.normalizedApiBaseUrl}/auth`;

  // Use keys from the environment so they can be configured per-deployment.
  // Provide sensible defaults to keep backwards compatibility.
  private accessTokenKey = environment.accessTokenKey || 'access_token';
  private refreshTokenKey = environment.refreshTokenKey || 'refresh_token';

  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  private http = inject(HttpClient);
  private router = inject(Router);

  constructor() {
    const token = localStorage.getItem(this.accessTokenKey);
    if (token) {
      try {
        const user: User = jwtDecode(token);
        this.userSubject.next(user);
      } catch {
        this.logout();
      }
    }
  }

  /**
   * Call login endpoint and store tokens on success.
   */
  login(
    email: string,
    pass: string
  ): Observable<{ access_token: string; refresh_token: string }> {
    return this.http
      .post<{ access_token: string; refresh_token: string }>(
        `${this.authApiUrl}/login`,
        {
          email,
          pass,
        }
      )
      .pipe(
        tap((tokens) => {
          this.setAccessToken(tokens.access_token);
          this.setRefreshToken(tokens.refresh_token);
        })
      );
  }

  private collapseApiPrefix(url: string) {
    // If the API prefix appears repeated (e.g. '/api/v1/api/v1'), collapse it to single occurrence
    try {
      // Extract the prefix from environment.apiBaseUrl (path part)
      const m = this.normalizedApiBaseUrl.match(/https?:\/\/[\w.:-]+(\/.*)$/i);
      const path = m
        ? m[1]
        : this.normalizedApiBaseUrl.replace(/^https?:\/\/[\w.:-]+/i, '');
      const cleanedPath = path.replace(/^\/+/, '').replace(/\/+$/g, '');
      if (!cleanedPath) return url;
      const re = new RegExp(`(/${cleanedPath})+`, 'g');
      return url.replace(re, `/${cleanedPath}`);
    } catch {
      return url;
    }
  }

  loginWithGoogle() {
    // Build redirect URL and normalize repeated prefixes
    const raw = `${this.authApiUrl}/google`;
    window.location.href = this.collapseApiPrefix(raw);
  }

  /**
   * Store access token and update user observable.
   */
  setAccessToken(accessToken: string) {
    localStorage.setItem(this.accessTokenKey, accessToken);
    const user: User = jwtDecode(accessToken);
    setTimeout(() => {
      this.userSubject.next(user);
    });
  }

  /**
   * Store refresh token.
   */
  setRefreshToken(refreshToken: string) {
    localStorage.setItem(this.refreshTokenKey, refreshToken);
  }

  activate(
    email: string,
    password: string
  ): Observable<{ access_token: string; refresh_token: string }> {
    return this.http
      .post<{ access_token: string; refresh_token: string }>(
        `${this.authApiUrl}/activate`,
        { email, password }
      )
      .pipe(
        tap((tokens) => {
          this.setAccessToken(tokens.access_token);
          this.setRefreshToken(tokens.refresh_token);
        })
      );
  }

  forgotPassword(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.authApiUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.authApiUrl}/reset-password`, { token, password });
  }

  refreshToken(): Observable<{ access_token: string; refresh_token: string }> {
    const refreshToken = localStorage.getItem(this.refreshTokenKey);
    if (refreshToken && this.isTokenExpired(refreshToken)) {
      this.logout();
      this.router.navigate(['/login']);
      return throwError(() => new Error('Refresh token expired'));
    }

    return this.http.post<{ access_token: string; refresh_token: string }>(
      `${this.authApiUrl}/refresh`,
      { refresh: refreshToken }
    );
  }

  getAccessToken(): string | null {
    return localStorage.getItem(this.accessTokenKey);
  }

  logout() {
    localStorage.clear();
    this.userSubject.next(null);
  }

  isLoggedIn(): boolean {
    return !!this.getAccessToken();
  }

  /**
   * Check if the token is expired.
   * @param token - The token to check.
   * @returns True if the token is expired, false otherwise.
   */
  private isTokenExpired(token: string): boolean {
    try {
      const decoded = jwtDecode<{ exp: number }>(token);
      const exp = decoded.exp;
      const now = Math.floor(Date.now() / 1000);
      return exp < now;
    } catch {
      return true;
    }
  }
}
