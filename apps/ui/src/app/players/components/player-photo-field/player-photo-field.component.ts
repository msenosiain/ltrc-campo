import { Component, forwardRef, inject, Input } from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  ValidationErrors,
  Validator,
} from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PlayerPhotoDialogComponent } from '../player-photo-dialog/player-photo-dialog.component';

export interface PhotoValue {
  file?: File;
  previewUrl: string;
}

@Component({
  selector: 'ltrc-player-photo-field',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => PlayerPhotoFieldComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => PlayerPhotoFieldComponent),
      multi: true,
    },
  ],
  templateUrl: './player-photo-field.component.html',
  styleUrl: './player-photo-field.component.scss',
})
export class PlayerPhotoFieldComponent
  implements ControlValueAccessor, Validator
{
  private dialog = inject(MatDialog);

  @Input() required = false;

  value: PhotoValue | null = null;
  disabled = false;
  touched = false;

  private onChange: (value: PhotoValue | null) => void = () => { /* noop until registerOnChange */ };
  private onTouched: () => void = () => { /* noop until registerOnTouched */ };

  get showError(): boolean {
    return this.touched && this.required && !this.value;
  }

  openDialog(): void {
    if (this.disabled) return;

    const ref = this.dialog.open(PlayerPhotoDialogComponent, {
      width: '320px',
    });

    const instance = ref.componentInstance;
    instance.hasCurrentPhoto = !!this.value;
    if (this.value?.previewUrl) {
      instance.previewUrl = this.value.previewUrl;
    }

    ref.afterClosed().subscribe((result) => {
      this.markAsTouched();
      if (!result) return;

      if (result.action === 'select') {
        this.value = { file: result.file, previewUrl: result.previewUrl };
        this.onChange(this.value);
      } else if (result.action === 'remove') {
        this.value = null;
        this.onChange(null);
      }
    });
  }

  writeValue(value: PhotoValue | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: PhotoValue | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled = disabled;
  }

  validate(): ValidationErrors | null {
    if (this.required && !this.value) {
      return { required: true };
    }
    return null;
  }

  private markAsTouched(): void {
    if (!this.touched) {
      this.touched = true;
      this.onTouched();
    }
  }
}
