import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'ltrc-widget-shell',
  standalone: true,
  imports: [MatIconModule, MatProgressBarModule],
  templateUrl: './widget-shell.component.html',
  styleUrl: './widget-shell.component.scss',
})
export class WidgetShellComponent {
  @Input() icon = '';
  @Input() iconFontSet = '';
  @Input() iconColor = '';
  @Input() title = '';
  @Input() subtitle = '';
  @Input() loading = false;
  @Input() height = '400px';
}
