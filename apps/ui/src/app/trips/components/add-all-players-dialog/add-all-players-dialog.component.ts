import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CategoryEnum } from '@ltrc-campo/shared-api-model';
import { getCategoryLabel } from '../../../common/category-options';

export interface AddAllPlayersDialogData {
  categories: CategoryEnum[];
}

export type AddAllPlayersDialogResult = CategoryEnum[];

@Component({
  selector: 'ltrc-add-all-players-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Agregar todos de...</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="full-width">
        <mat-label>Categorías</mat-label>
        <mat-select [formControl]="categoriesCtrl" multiple>
          @for (cat of data.categories; track cat) {
            <mat-option [value]="cat">{{ getCategoryLabel(cat) }}</mat-option>
          }
        </mat-select>
        @if (categoriesCtrl.hasError('required')) {
          <mat-error>Seleccioná al menos una categoría</mat-error>
        }
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        color="primary"
        [disabled]="categoriesCtrl.invalid"
        (click)="confirm()"
      >
        Agregar
      </button>
    </mat-dialog-actions>
  `,
  styles: ['.full-width { width: 100%; min-width: 280px; }'],
})
export class AddAllPlayersDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<AddAllPlayersDialogComponent>);
  readonly data = inject<AddAllPlayersDialogData>(MAT_DIALOG_DATA);

  readonly getCategoryLabel = getCategoryLabel;
  readonly categoriesCtrl = new FormControl<CategoryEnum[]>([], {
    validators: Validators.required,
    nonNullable: true,
  });

  confirm(): void {
    if (this.categoriesCtrl.invalid) return;
    this.dialogRef.close(this.categoriesCtrl.value);
  }
}
