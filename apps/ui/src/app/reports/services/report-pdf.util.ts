import jsPDF from 'jspdf';

export const REPORT_PDF_LOGO_PATH = '/escudo.png';

export const REPORT_PDF_COLORS = {
  primary: [30, 30, 30] as [number, number, number],
  headerBg: [20, 20, 20] as [number, number, number],
  sectionBg: [245, 245, 245] as [number, number, number],
  groupBg: [55, 71, 99] as [number, number, number],
};

export function loadImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Draws the club logo + title + report subtitle + divider shared by every
 * report PDF. Returns the y coordinate where the report-specific context
 * rows should start (39 in every existing report).
 */
export async function drawReportPdfHeader(
  doc: jsPDF,
  opts: { pageW: number; marginL: number; subtitle: string }
): Promise<number> {
  const logoSize = 18;

  try {
    const logoBase64 = await loadImageAsBase64(REPORT_PDF_LOGO_PATH);
    doc.addImage(logoBase64, 'PNG', opts.marginL, 10, logoSize, logoSize);
  } catch {
    // sin logo
  }

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...REPORT_PDF_COLORS.primary);
  doc.text('LOS TORDOS RUGBY CLUB', opts.marginL + logoSize + 5, 17);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(80, 80, 80);
  doc.text(opts.subtitle, opts.marginL + logoSize + 5, 24);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(opts.marginL, 32, opts.pageW - opts.marginL, 32);

  return 39;
}

export function drawReportPdfContextRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number
): void {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...REPORT_PDF_COLORS.primary);
  const labelText = `${label}: `;
  const labelW = doc.getTextWidth(labelText);
  doc.text(labelText, x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(value, x + labelW, y);
}

export function drawReportPdfPageFooter(doc: jsPDF, pageW: number, marginL: number): void {
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `Página ${doc.getNumberOfPages()}`,
    pageW - marginL,
    doc.internal.pageSize.getHeight() - 8,
    { align: 'right' }
  );
}
