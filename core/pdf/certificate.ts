import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFImage,
  type PDFFont,
} from 'pdf-lib';
import type { Locale } from '@/core/i18n/config';
import {
  fillCertificateCopy,
  formatCertificateDate,
  type CertificatePdfCopy,
} from '@/core/certificates/localization';
import { fetchCertificateImage } from '@/core/pdf/safe-image';

export type CertificateTemplate = {
  title: string;
  body: string;
  signatureUrl: string | null;
  signatureName: string | null;
  signatureRole: string | null;
  footer: string | null;
  accentColor: string;
  logoUrl: string | null;
  /** Global branding fallback; incompatible assets are omitted from the PDF. */
  logoFallbackUrl?: string | null;
};

export type CertificateData = {
  recipientName: string;
  courseTitle: string;
  date: string;
  verificationCode: string;
};

export type CertificateRenderContext = {
  locale: Locale;
  copy: CertificatePdfCopy;
};

const A4_LANDSCAPE = { width: 841.89, height: 595.28 };

function hexToRgb(hex: string) {
  const match = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!match) return rgb(0.14, 0.21, 0.66);
  const value = match[1];
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

async function embedImage(
  pdf: PDFDocument,
  url: string | null,
): Promise<PDFImage | null> {
  if (!url) return null;
  const image = await fetchCertificateImage(url);
  return image.contentType === 'image/png'
    ? pdf.embedPng(image.bytes)
    : pdf.embedJpg(image.bytes);
}

function splitToken(
  font: PDFFont,
  token: string,
  maxWidth: number,
  size: number,
): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const character of token) {
    const candidate = `${current}${character}`;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      chunks.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function wrapCertificateText(
  font: PDFFont,
  text: string,
  maxWidth: number,
  size: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      const fragments =
        font.widthOfTextAtSize(token, size) > maxWidth
          ? splitToken(font, token, maxWidth, size)
          : [token];
      for (const fragment of fragments) {
        const candidate = `${current}${fragment}`;
        if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
          lines.push(current);
          current = fragment;
        } else {
          current = candidate;
        }
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function fitWrappedText(
  font: PDFFont,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  maxLines: number,
  maxHeight: number,
): { lines: string[]; size: number; lineHeight: number } {
  for (let size = startSize; size >= minSize; size -= 1) {
    const lines = wrapCertificateText(font, text, maxWidth, size);
    const lineHeight = size * 1.16;
    if (lines.length <= maxLines && lines.length * lineHeight <= maxHeight) {
      return { lines, size, lineHeight };
    }
  }
  throw new Error('certificateContentTooLong');
}

function drawCenteredBlock(
  page: ReturnType<PDFDocument['addPage']>,
  font: PDFFont,
  layout: { lines: string[]; size: number; lineHeight: number },
  topY: number,
  pageWidth: number,
  color: ReturnType<typeof rgb>,
): number {
  let y = topY;
  for (const line of layout.lines) {
    y -= layout.size;
    const lineWidth = font.widthOfTextAtSize(line, layout.size);
    page.drawText(line, {
      x: (pageWidth - lineWidth) / 2,
      y,
      size: layout.size,
      font,
      color,
    });
    y -= layout.lineHeight - layout.size;
  }
  return y;
}

function applyAuthoredBody(
  body: string,
  data: CertificateData,
  formattedDate: string,
): string {
  return body
    .replace(/\{name\}/g, () => data.recipientName)
    .replace(/\{course\}/g, () => data.courseTitle)
    .replace(/\{date\}/g, () => formattedDate);
}

/** Renders a single-page A4 landscape completion certificate. */
export async function generateCertificate(
  template: CertificateTemplate,
  data: CertificateData,
  context: CertificateRenderContext,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([A4_LANDSCAPE.width, A4_LANDSCAPE.height]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const accent = hexToRgb(template.accentColor);
  const dark = rgb(0.1, 0.12, 0.18);
  const muted = rgb(0.45, 0.48, 0.55);
  const { width, height } = A4_LANDSCAPE;
  const formattedDate = formatCertificateDate(data.date, context.locale);

  const borderInset = 22;
  page.drawRectangle({
    x: borderInset,
    y: borderInset,
    width: width - borderInset * 2,
    height: height - borderInset * 2,
    borderColor: accent,
    borderWidth: 1,
  });
  page.drawRectangle({
    x: borderInset + 6,
    y: borderInset + 6,
    width: width - (borderInset + 6) * 2,
    height: height - (borderInset + 6) * 2,
    borderColor: accent,
    borderWidth: 0.5,
  });

  let logo: PDFImage | null = null;
  if (template.logoUrl) {
    logo = await embedImage(pdf, template.logoUrl);
  } else if (template.logoFallbackUrl) {
    try {
      logo = await embedImage(pdf, template.logoFallbackUrl);
    } catch {
      // General branding may use formats unsupported by pdf-lib. It is optional.
      logo = null;
    }
  }
  let cursorY = height - 70;
  if (logo) {
    const scale = Math.min(150 / logo.width, 36 / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    page.drawImage(logo, {
      x: (width - logoWidth) / 2,
      y: cursorY - logoHeight,
      width: logoWidth,
      height: logoHeight,
    });
    cursorY -= logoHeight + 12;
  }

  const title = fitWrappedText(
    bold,
    template.title,
    width - 150,
    34,
    18,
    2,
    58,
  );
  cursorY = drawCenteredBlock(page, bold, title, cursorY, width, accent) - 12;
  page.drawRectangle({
    x: (width - 80) / 2,
    y: cursorY,
    width: 80,
    height: 2,
    color: accent,
  });
  cursorY -= 25;

  const intro = fitWrappedText(
    italic,
    context.copy.intro,
    width - 180,
    14,
    11,
    2,
    34,
  );
  cursorY = drawCenteredBlock(page, italic, intro, cursorY, width, muted) - 15;

  const recipient = fitWrappedText(
    bold,
    data.recipientName,
    width - 180,
    40,
    20,
    2,
    55,
  );
  cursorY = drawCenteredBlock(page, bold, recipient, cursorY, width, dark) - 16;

  const completion = fitWrappedText(
    regular,
    context.copy.completion,
    width - 180,
    13,
    10,
    2,
    30,
  );
  cursorY =
    drawCenteredBlock(page, regular, completion, cursorY, width, muted) - 13;

  const course = fitWrappedText(
    bold,
    data.courseTitle,
    width - 180,
    26,
    14,
    2,
    50,
  );
  cursorY = drawCenteredBlock(page, bold, course, cursorY, width, accent) - 15;

  if (template.body) {
    const authoredBody = applyAuthoredBody(template.body, data, formattedDate);
    const body = fitWrappedText(
      regular,
      authoredBody,
      width - 150,
      12,
      9,
      3,
      36,
    );
    cursorY = drawCenteredBlock(page, regular, body, cursorY, width, muted) - 8;
  }

  const bottomY = 100;
  if (cursorY < bottomY + 60) throw new Error('certificateContentTooLong');

  const dateLabel = context.copy.dateLabel;
  page.drawText(dateLabel, {
    x: 100,
    y: bottomY + 26,
    size: 9,
    font: bold,
    color: muted,
  });
  page.drawText(formattedDate, {
    x: 100,
    y: bottomY + 10,
    size: 12,
    font: regular,
    color: dark,
  });
  page.drawRectangle({ x: 100, y: bottomY + 4, width: 175, height: 1, color: muted });

  const signature = await embedImage(pdf, template.signatureUrl);
  const signatureX = width - 275;
  if (signature) {
    const scale = Math.min(140 / signature.width, 44 / signature.height);
    const signatureWidth = signature.width * scale;
    const signatureHeight = signature.height * scale;
    page.drawImage(signature, {
      x: signatureX + (175 - signatureWidth) / 2,
      y: bottomY + 14,
      width: signatureWidth,
      height: signatureHeight,
    });
  }
  page.drawRectangle({
    x: signatureX,
    y: bottomY + 4,
    width: 175,
    height: 1,
    color: muted,
  });
  if (template.signatureName) {
    const signatureName = fitWrappedText(
      bold,
      template.signatureName,
      175,
      11,
      8,
      1,
      13,
    );
    page.drawText(signatureName.lines[0], {
      x: signatureX,
      y: bottomY - 10,
      size: signatureName.size,
      font: bold,
      color: dark,
    });
  }
  if (template.signatureRole) {
    const signatureRole = fitWrappedText(
      regular,
      template.signatureRole,
      175,
      9,
      7,
      1,
      11,
    );
    page.drawText(signatureRole.lines[0], {
      x: signatureX,
      y: bottomY - 24,
      size: signatureRole.size,
      font: regular,
      color: muted,
    });
  }

  const code = fillCertificateCopy(context.copy.code, {
    code: data.verificationCode,
  });
  const footerText =
    template.footer === null
      ? fillCertificateCopy(context.copy.verificationCode, {
          code: data.verificationCode,
        })
      : [template.footer, code].filter(Boolean).join('  ·  ');
  const footer = fitWrappedText(
    regular,
    footerText,
    width - 100,
    8,
    6,
    2,
    18,
  );
  drawCenteredBlock(page, regular, footer, 53, width, muted);

  return await pdf.save();
}
