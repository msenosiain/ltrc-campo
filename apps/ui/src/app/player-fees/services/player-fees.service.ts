import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG_TOKEN } from '../../app.config';
import { IPlayerFeePublicInfo, IPlayerFeeValidateResult } from '@ltrc-campo/shared-api-model';

export interface PlayerFeeCheckoutResult {
  checkoutUrl: string;
}

export interface PlayerFeeConfirmResult {
  status: string;
}

@Injectable({ providedIn: 'root' })
export class PlayerFeesPublicService {
  private readonly http = inject(HttpClient);
  private readonly apiBase = inject(API_CONFIG_TOKEN);

  private url(path: string) {
    return `${this.apiBase}/player-fees/public/${path}`;
  }

  getPublicInfo(token: string) {
    return this.http.get<IPlayerFeePublicInfo>(this.url(token));
  }

  validateDni(token: string, dni: string) {
    return this.http.post<IPlayerFeeValidateResult>(this.url(`${token}/validate`), { dni });
  }

  initiateCheckout(token: string, dni: string) {
    return this.http.post<PlayerFeeCheckoutResult>(this.url(`${token}/checkout`), { dni });
  }

  confirmPayment(externalReference: string, paymentId?: string, status?: string) {
    return this.http.post<PlayerFeeConfirmResult>(`${this.apiBase}/player-fees/public/confirm`, {
      externalReference,
      paymentId,
      status,
    });
  }
}
