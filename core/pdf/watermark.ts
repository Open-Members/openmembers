import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
  type PDFFont,
} from 'pdf-lib';
import type { Locale } from '@/core/i18n/config';
import {
  fillCertificateCopy,
  formatCertificateDate,
  getCertificateWatermarkCopy,
} from '@/core/certificates/localization';

export type WatermarkInfo = {
  /** Student display name (or email fallback). */
  name: string;
  /** Student email. */
  email: string;
  /** Effective profile locale. */
  locale: Locale;
  /** Stable ISO instant captured by the download endpoint. */
  downloadedAt: string;
};

export type RotatedWatermarkPlacement = {
  x: number;
  y: number;
  size: number;
  bounds: { left: number; right: number; bottom: number; top: number };
};

const WATERMARK_ROTATION_DEGREES = -30;
const WATERMARK_MARGIN = 40;

/** Fit and center the full axis-aligned projection of a -30 degree label. */
export function fitRotatedWatermarkPlacement(
  font: PDFFont,
  text: string,
  pageWidth: number,
  pageHeight: number,
): RotatedWatermarkPlacement {
  const radians = (Math.abs(WATERMARK_ROTATION_DEGREES) * Math.PI) / 180;
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);
  const availableWidth = pageWidth - WATERMARK_MARGIN * 2;
  const availableHeight = pageHeight - WATERMARK_MARGIN * 2;

  for (
    let size = Math.max(6, Math.min(pageWidth, pageHeight) * 0.04);
    size >= 6;
    size -= 0.5
  ) {
    const textWidth = font.widthOfTextAtSize(text, size);
    const textHeight = font.heightAtSize(size, { descender: true });
    const projectedWidth = textWidth * cosine + textHeight * sine;
    const projectedHeight = textWidth * sine + textHeight * cosine;
    if (
      projectedWidth <= availableWidth &&
      projectedHeight <= availableHeight
    ) {
      const left = (pageWidth - projectedWidth) / 2;
      const bottom = (pageHeight - projectedHeight) / 2;
      return {
        x: left,
        y: bottom + textWidth * sine,
        size,
        bounds: {
          left,
          right: left + projectedWidth,
          bottom,
          top: bottom + projectedHeight,
        },
      };
    }
  }
  throw new Error('watermarkIdentityTooLong');
}

/**
 * Adds a diagonal translucent watermark to every page of a PDF. The watermark
 * prints the student's name, email, and the date so any leaked copy is
 * traceable to the account that downloaded it.
 *
 * Runs on the server with pdf-lib (no native deps).
 */
export async function addWatermark(
  source: ArrayBuffer | Uint8Array,
  info: WatermarkInfo,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(source, {
    ignoreEncryption: true,
    updateMetadata: false,
  });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const date = formatCertificateDate(info.downloadedAt, info.locale, 'medium');
  const copy = getCertificateWatermarkCopy(info.locale);

  const line1 = `${info.name} · ${info.email}`;
  const line2 = fillCertificateCopy(copy.downloaded, { date });

  const pages = pdfDoc.getPages();
  for (const page of pages) {
    const { width, height } = page.getSize();

    // A muted gray, low opacity — visible enough to deter sharing, not so
    // opaque it blocks reading.
    const color = rgb(0.4, 0.4, 0.4);
    const opacity = 0.22;

    // Fit the rotated bounding box in both axes, then center its projection.
    const main = fitRotatedWatermarkPlacement(font, line1, width, height);
    page.drawText(line1, {
      x: main.x,
      y: main.y,
      size: main.size,
      font,
      color,
      opacity,
      rotate: degrees(WATERMARK_ROTATION_DEGREES),
    });

    // Smaller date line, bottom-right corner (upright, easier to read on print).
    let dateSize = 9;
    while (font.widthOfTextAtSize(line2, dateSize) > width - 48 && dateSize > 6) {
      dateSize -= 0.5;
    }
    const dateWidth = font.widthOfTextAtSize(line2, dateSize);
    if (dateWidth > width - 48) throw new Error('watermarkDateTooLong');
    page.drawText(line2, {
      x: width - dateWidth - 24,
      y: 18,
      size: dateSize,
      font,
      color,
      opacity: 0.4,
    });
  }

  return await pdfDoc.save();
}
