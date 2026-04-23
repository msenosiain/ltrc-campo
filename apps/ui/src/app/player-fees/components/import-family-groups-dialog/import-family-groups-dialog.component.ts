import { Component, inject, signal } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { PlayerFeesAdminService } from '../../services/player-fees-admin.service';
import { toTitleCase } from '@ltrc-campo/shared-api-model';

export interface ImportFamilyGroupsDialogResult {
  created: number;
}

@Component({
  selector: 'ltrc-import-family-groups-dialog',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './import-family-groups-dialog.component.html',
  styleUrl: './import-family-groups-dialog.component.scss',
})
export class ImportFamilyGroupsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ImportFamilyGroupsDialogComponent>);
  private readonly adminService = inject(PlayerFeesAdminService);

  fileName = signal('');
  groups = signal<{ name: string; dnis: string[] }[]>([]);
  importing = signal(false);
  result = signal<{ total: number; created: number; skipped: number; notFound: string[] } | null>(null);

  onFileChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.fileName.set(file.name);
    this.groups.set([]);
    this.result.set(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];

      const groupMap = new Map<string, string[]>();
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i] as unknown[];
        const dni = String(row[1] ?? '').trim();
        const grupo = toTitleCase(String(row[3] ?? '').trim());
        if (!dni || !grupo) continue;
        if (!groupMap.has(grupo)) groupMap.set(grupo, []);
        groupMap.get(grupo)!.push(dni);
      }

      const parsed: { name: string; dnis: string[] }[] = [];
      for (const [name, dnis] of groupMap) {
        if (dnis.length >= 2) {
          parsed.push({ name, dnis: [...dnis].sort((a, b) => Number(a) - Number(b)) });
        }
      }
      this.groups.set(parsed);
    };
    reader.readAsArrayBuffer(file);
  }

  runImport(): void {
    const groups = this.groups();
    if (!groups.length) return;
    this.importing.set(true);
    this.adminService.importFamilyGroups(groups).subscribe({
      next: (res) => {
        this.result.set(res);
        this.importing.set(false);
        this.groups.set([]);
        this.fileName.set('');
        this.downloadResults(groups, res);
      },
      error: () => this.importing.set(false),
    });
  }

  close(): void {
    const res = this.result();
    this.dialogRef.close(res?.created ? ({ created: res.created } satisfies ImportFamilyGroupsDialogResult) : undefined);
  }

  private downloadResults(
    groups: { name: string; dnis: string[] }[],
    res: { total: number; created: number; skipped: number; notFound: string[] }
  ): void {
    const rows = groups.map(g => ({
      Grupo: g.name,
      DNIs: g.dnis.join(', '),
      Estado: res.notFound.some(dni => g.dnis.includes(dni)) ? 'Parcial' : 'Creado',
    }));
    if (res.notFound.length > 0) {
      (rows as any[]).push({});
      (rows as any[]).push({ Grupo: 'DNIs no encontrados', DNIs: res.notFound.join(', '), Estado: '' });
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Resultado');
    XLSX.writeFile(wb, `grupos_familiares_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  }
}
