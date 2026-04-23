import { Component } from '@angular/core';
import { MatTabsModule } from '@angular/material/tabs';
import { MatIconModule } from '@angular/material/icon';
import { PaymentSettingsComponent } from '../payment-settings/payment-settings.component';
import { EvaluationSettingsComponent } from '../../../evaluations/components/evaluation-settings/evaluation-settings.component';
import { PlayerFeesSettingsComponent } from '../../../player-fees/components/player-fees-settings/player-fees-settings.component';

@Component({
  selector: 'ltrc-settings-shell',
  standalone: true,
  imports: [
    MatTabsModule,
    MatIconModule,
    PaymentSettingsComponent,
    EvaluationSettingsComponent,
    PlayerFeesSettingsComponent,
  ],
  templateUrl: './settings-shell.component.html',
  styleUrl: './settings-shell.component.scss',
})
export class SettingsShellComponent {}
