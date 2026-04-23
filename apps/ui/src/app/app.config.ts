import {
  ApplicationConfig,
  InjectionToken,
  LOCALE_ID,
  Provider,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { MAT_DATEPICKER_SCROLL_STRATEGY } from '@angular/material/datepicker';
import { Overlay } from '@angular/cdk/overlay';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { es } from 'date-fns/locale';
import { authInterceptor } from './auth/auth.interceptor';
import { environment } from '../environments/environment';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';

function getEsArPaginatorIntl(): MatPaginatorIntl {
  const intl = new MatPaginatorIntl();
  intl.itemsPerPageLabel = 'Elementos por página:';
  intl.nextPageLabel = 'Siguiente';
  intl.previousPageLabel = 'Anterior';
  intl.firstPageLabel = 'Primera página';
  intl.lastPageLabel = 'Última página';
  intl.getRangeLabel = (page, pageSize, length) => {
    if (length === 0) return '0 de 0';
    const start = page * pageSize + 1;
    const end = Math.min((page + 1) * pageSize, length);
    return `${start} – ${end} de ${length}`;
  };
  return intl;
}

export interface ApiConfig {
  baseUrl: string;
}

export const API_CONFIG: ApiConfig = {
  baseUrl: environment.apiBaseUrl,
};
export const API_CONFIG_TOKEN = new InjectionToken<ApiConfig>(
  'API_CONFIG_TOKEN'
);

const apiConfigProvider: Provider = {
  provide: API_CONFIG_TOKEN,
  useValue: API_CONFIG,
};

// Registrar los datos específicos para Argentina
registerLocaleData(localeEsAr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    apiConfigProvider,
    { provide: LOCALE_ID, useValue: 'es-AR' },
    { provide: MAT_DATE_LOCALE, useValue: es },
    { provide: MatPaginatorIntl, useFactory: getEsArPaginatorIntl },
    {
      provide: MAT_DATEPICKER_SCROLL_STRATEGY,
      deps: [Overlay],
      useFactory: (overlay: Overlay) => () => overlay.scrollStrategies.reposition(),
    },
    provideCharts(withDefaultRegisterables()),
    provideDateFnsAdapter({
      parse: {
        dateInput: 'dd/MM/yyyy',
        timeInput: 'HH:mm',
      },
      display: {
        dateInput: 'dd/MM/yyyy',
        monthYearLabel: 'MMM yyyy',
        dateA11yLabel: 'dd/MM/yyyy',
        monthYearA11yLabel: 'MMMM yyyy',
        timeInput: 'HH:mm',
        timeOptionLabel: 'HH:mm',
      },
    }),
  ],
};
