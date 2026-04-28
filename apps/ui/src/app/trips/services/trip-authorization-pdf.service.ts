import { Injectable } from '@angular/core';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { AuthorizationData } from './trips.service';

@Injectable({ providedIn: 'root' })
export class TripAuthorizationPdfService {
  async generateCalibration(): Promise<void> {
    const pdfBytes = await fetch('/autorizacion_micros.pdf').then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.getPages()[0];
    const { height } = page.getSize();

    const mark = (label: string, x: number, yFromTop: number) => {
      page.drawCircle({ x, y: height - yFromTop, size: 3, color: rgb(1, 0, 0) });
      page.drawText(label, { x: x + 4, y: height - yFromTop - 3, size: 6, font, color: rgb(1, 0, 0) });
    };

    mark('NOMBRE-L1', 483, 176);
    mark('NOMBRE-L2', 78, 178);
    mark('DNI', 331, 180);
    mark('ORIGEN', 94, 194);
    mark('DESTINO', 345, 193);
    mark('EMPRESA', 58, 211);
    mark('F.SALIDA', 430, 575);
    mark('F.REGRESO', 472, 606);

    const resultBytes = await pdfDoc.save();
    this.download(resultBytes as Uint8Array<ArrayBuffer>, 'calibration.pdf');
  }

  async generate(data: AuthorizationData): Promise<void> {
    const pdfBytes = await fetch('/autorizacion_micros.pdf').then((r) => r.arrayBuffer());
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const page = pdfDoc.getPages()[0];
    const { height } = page.getSize();

    const draw = (text: string, x: number, yFromTop: number, size = 9) => {
      page.drawText(text, {
        x,
        y: height - yFromTop,
        size,
        font,
        color: rgb(0, 0, 0),
      });
    };

    const firstSpace = data.passengerName.indexOf(' ');
    const nameLine1 = firstSpace > -1 ? data.passengerName.slice(0, firstSpace) : data.passengerName;
    const nameLine2 = firstSpace > -1 ? data.passengerName.slice(firstSpace + 1) : '';

    draw(nameLine1, 483, 162, 9);
    if (nameLine2) draw(nameLine2, 78, 178, 9);
    draw(data.passengerDni, 331, 180, 9);
    draw('Mendoza', 94, 194, 9);
    draw(data.destination, 345, 193, 9);
    draw(data.transportCompany ?? '', 58, 211, 9);

    draw(this.formatDate(data.departureDate), 430, 575, 9);
    if (data.returnDate) draw(this.formatDate(data.returnDate), 472, 606, 9);

    const resultBytes = await pdfDoc.save();
    this.download(resultBytes as Uint8Array<ArrayBuffer>, `autorizacion_${this.sanitize(data.passengerName)}.pdf`);
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    const day = String(d.getUTCDate()).padStart(2, '0');
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const year = d.getUTCFullYear();
    return `${day}/${month}/${year}`;
  }

  private sanitize(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  }

  private download(bytes: Uint8Array<ArrayBuffer>, filename: string): void {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
