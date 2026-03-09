/**
 * Florida Notice of Commencement (NOC) PDF Generator
 * Conforms to Florida Statute § 713.13
 *
 * Generates a fully drawn, text-based PDF (no fillable AcroForm required).
 * Uses pdf-lib for pure Node.js PDF creation with no native dependencies.
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const CONTRACTOR = require('./contractor');

// ─── Layout constants (points; 1 pt = 1/72 inch) ────────────────────────────
const PAGE_W = 612;   // 8.5 in
const PAGE_H = 792;   // 11 in
const MARGIN = 50;
const COL_W = PAGE_W - MARGIN * 2;

// ─── Color palette ───────────────────────────────────────────────────────────
const BLACK = rgb(0, 0, 0);
const DARK_GRAY = rgb(0.2, 0.2, 0.2);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const WHITE = rgb(1, 1, 1);
const RHINO_BLUE = rgb(0.1, 0.25, 0.55); // Dark navy, professional

// ─── Typography helpers ───────────────────────────────────────────────────────
function fontSize(base) { return base; }

/**
 * Word-wrap text to fit within maxWidth, returning an array of lines.
 * Operates purely on character count approximation using monospace logic;
 * accurate enough for the font sizes used here.
 */
function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const w = font.widthOfTextAtSize(candidate, size);
    if (w > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draw a labeled field row.
 * Returns the y position after drawing (for chaining).
 */
function drawField(page, opts) {
  const {
    fonts,
    label,
    value,
    x,
    y,
    width = COL_W,
    labelSize = 8,
    valueSize = 10,
    lineHeight = 14,
  } = opts;

  // Label
  page.drawText(label.toUpperCase(), {
    x,
    y,
    size: labelSize,
    font: fonts.bold,
    color: DARK_GRAY,
  });

  // Value (may wrap)
  const lines = wrapText(value || '', fonts.regular, valueSize, width);
  let cy = y - lineHeight;
  for (const line of lines) {
    page.drawText(line, {
      x,
      y: cy,
      size: valueSize,
      font: fonts.regular,
      color: BLACK,
    });
    cy -= lineHeight;
  }

  // Underline for the value area
  const underlineY = cy + 2;
  page.drawLine({
    start: { x, y: underlineY },
    end: { x: x + width, y: underlineY },
    thickness: 0.5,
    color: DARK_GRAY,
  });

  return underlineY - 8; // return next Y with some padding
}

/**
 * Draw a horizontal divider.
 */
function drawDivider(page, y, color = LIGHT_GRAY) {
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75,
    color,
  });
  return y - 12;
}

/**
 * Draw a section heading.
 */
function drawSectionHeading(page, fonts, text, y) {
  // Background bar
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: COL_W,
    height: 16,
    color: RHINO_BLUE,
  });
  page.drawText(text.toUpperCase(), {
    x: MARGIN + 6,
    y: y,
    size: 8,
    font: fonts.bold,
    color: WHITE,
  });
  return y - 20;
}

/**
 * Main entry point.
 *
 * @param {Object} property  Normalized BatchData property object
 * @param {string} jobId     JobNimbus job ID (used in filename / header)
 * @returns {Buffer}         PDF as Node.js Buffer
 */
async function generateNOC(property, jobId) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  // Embed fonts
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fonts = { regular: regularFont, bold: boldFont, italic: italicFont };

  let y = PAGE_H - MARGIN;

  // ── Header ─────────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 75,
    width: PAGE_W,
    height: 75,
    color: RHINO_BLUE,
  });

  page.drawText('NOTICE OF COMMENCEMENT', {
    x: MARGIN,
    y: PAGE_H - 30,
    size: 18,
    font: boldFont,
    color: WHITE,
  });

  page.drawText('Florida Statute § 713.13', {
    x: MARGIN,
    y: PAGE_H - 48,
    size: 10,
    font: italicFont,
    color: rgb(0.75, 0.85, 1),
  });

  page.drawText(`Rhino Roofs  |  Job ID: ${jobId || 'N/A'}`, {
    x: PAGE_W - MARGIN - 200,
    y: PAGE_H - 30,
    size: 9,
    font: boldFont,
    color: WHITE,
  });

  const today = new Date();
  const formattedDate = today.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });
  const expiryDate = new Date(today);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1);
  const formattedExpiry = expiryDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  page.drawText(`Date Prepared: ${formattedDate}`, {
    x: PAGE_W - MARGIN - 200,
    y: PAGE_H - 48,
    size: 8,
    font: regularFont,
    color: rgb(0.75, 0.85, 1),
  });

  y = PAGE_H - 85;

  // ── Statutory notice ───────────────────────────────────────────────────────
  const statLine =
    'State of Florida, County of ' + (property.address?.county || '_____________');
  page.drawText(statLine, {
    x: MARGIN,
    y,
    size: 9,
    font: italicFont,
    color: DARK_GRAY,
  });
  y -= 12;

  const noticeText =
    'The undersigned hereby gives notice that improvement will be made to certain real property, ' +
    'and in accordance with Chapter 713, Florida Statutes, the following information is provided:';
  const noticeLines = wrapText(noticeText, italicFont, 8.5, COL_W);
  for (const line of noticeLines) {
    page.drawText(line, { x: MARGIN, y, size: 8.5, font: italicFont, color: DARK_GRAY });
    y -= 12;
  }
  y -= 6;

  // ── Section 1: Property Information ───────────────────────────────────────
  y = drawSectionHeading(page, fonts, '1. Property Information', y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'Property Address',
    value: property.address?.full,
    x: MARGIN, y, width: COL_W,
  });

  y = drawField(page, {
    fonts, label: 'Legal Description',
    value: property.parcel?.legalDescription,
    x: MARGIN, y, width: COL_W,
    valueSize: 9,
  });

  y = drawField(page, {
    fonts, label: 'Tax Folio Number / APN',
    value: property.parcel?.apn,
    x: MARGIN, y, width: COL_W / 2 - 5,
  });

  y -= 4;

  // ── Section 2: Owner Information ───────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '2. Owner Information', y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'Owner Full Legal Name',
    value: property.owner?.fullName,
    x: MARGIN, y, width: COL_W,
  });

  y = drawField(page, {
    fonts, label: 'Owner Mailing Address',
    value: property.owner?.mailingAddress?.full,
    x: MARGIN, y, width: COL_W,
  });

  y = drawField(page, {
    fonts, label: 'Interest in Property',
    value: 'Fee Simple Owner',
    x: MARGIN, y, width: COL_W / 2 - 5,
  });

  y -= 4;

  // ── Section 3: Contractor Information ─────────────────────────────────────
  y = drawSectionHeading(page, fonts, '3. Contractor Information', y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'Contractor Name',
    value: CONTRACTOR.companyName,
    x: MARGIN, y, width: COL_W,
  });

  y = drawField(page, {
    fonts, label: 'Contractor Address',
    value: CONTRACTOR.address.full,
    x: MARGIN, y, width: COL_W,
  });

  // Two-column: license | phone
  const halfW = COL_W / 2 - 10;
  const licY = y;
  drawField(page, {
    fonts, label: 'FL License Number',
    value: CONTRACTOR.licenseNumber,
    x: MARGIN, y: licY, width: halfW,
  });
  y = drawField(page, {
    fonts, label: 'Phone',
    value: CONTRACTOR.phone,
    x: MARGIN + halfW + 20, y: licY, width: halfW,
  });

  y -= 4;

  // ── Section 4: Improvement Description ────────────────────────────────────
  y = drawSectionHeading(page, fonts, '4. Description of Improvement', y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'General Description',
    value: 'Residential roofing replacement including removal of existing roofing materials, ' +
           'installation of new roofing system, underlayment, flashing, and all associated components.',
    x: MARGIN, y, width: COL_W,
    valueSize: 9,
  });

  y -= 4;

  // ── Section 5: Lender / Mortgage ──────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '5. Lender / Mortgagee Information', y);
  y -= 4;

  const lenderName = property.mortgage?.lenderName || 'None';
  y = drawField(page, {
    fonts, label: 'Lender / Mortgagee Name',
    value: lenderName,
    x: MARGIN, y, width: COL_W,
  });

  y = drawField(page, {
    fonts, label: 'Lender Address',
    value: property.mortgage?.lenderName ? 'See recorded mortgage document' : 'N/A',
    x: MARGIN, y, width: COL_W,
    valueSize: 9,
  });

  y -= 4;

  // ── Section 6: Surety / Bond ──────────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '6. Surety Bond Information (if applicable)', y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'Surety Company',
    value: CONTRACTOR.bond.suretyCo || 'N/A',
    x: MARGIN, y, width: halfW,
  });

  y -= 4;

  // ── Section 7: Expiration ─────────────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '7. NOC Expiration', y);
  y -= 4;

  y = drawField(page, {
    fonts,
    label: 'This Notice of Commencement expires on',
    value: `${formattedExpiry}  (one year from date of recording unless a different date is specified)`,
    x: MARGIN, y, width: COL_W,
    valueSize: 9,
  });

  y -= 12;

  // ── Signature block ───────────────────────────────────────────────────────
  drawDivider(page, y, RHINO_BLUE);
  y -= 8;

  page.drawText('OWNER SIGNATURE BLOCK — NOTARIZATION REQUIRED', {
    x: MARGIN, y,
    size: 8, font: boldFont, color: RHINO_BLUE,
  });
  y -= 18;

  // Signature line
  page.drawText('Owner Signature: ', { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({
    start: { x: MARGIN + 110, y: y - 2 },
    end: { x: MARGIN + 340, y: y - 2 },
    thickness: 0.75, color: BLACK,
  });
  page.drawText('Date: ', { x: MARGIN + 355, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({
    start: { x: MARGIN + 380, y: y - 2 },
    end: { x: MARGIN + COL_W, y: y - 2 },
    thickness: 0.75, color: BLACK,
  });
  y -= 24;

  page.drawText('Printed Name: ', { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({
    start: { x: MARGIN + 90, y: y - 2 },
    end: { x: MARGIN + 300, y: y - 2 },
    thickness: 0.75, color: BLACK,
  });
  y -= 30;

  // Notary block
  page.drawRectangle({
    x: MARGIN, y: y - 70,
    width: COL_W, height: 80,
    borderColor: DARK_GRAY, borderWidth: 0.75,
    color: rgb(0.97, 0.97, 0.97),
  });

  page.drawText('NOTARY PUBLIC', { x: MARGIN + 8, y: y - 10, size: 9, font: boldFont, color: BLACK });
  page.drawText('The foregoing instrument was acknowledged before me this _______ day of ____________, 20______,',
    { x: MARGIN + 8, y: y - 24, size: 7.5, font: regularFont, color: BLACK });
  page.drawText('by ____________________________________________, who is personally known to me or has produced',
    { x: MARGIN + 8, y: y - 36, size: 7.5, font: regularFont, color: BLACK });
  page.drawText('__________________________ as identification.',
    { x: MARGIN + 8, y: y - 48, size: 7.5, font: regularFont, color: BLACK });

  page.drawText('Notary Signature: ', { x: MARGIN + 8, y: y - 64, size: 7.5, font: boldFont, color: BLACK });
  page.drawLine({
    start: { x: MARGIN + 105, y: y - 66 },
    end: { x: MARGIN + 280, y: y - 66 },
    thickness: 0.5, color: BLACK,
  });
  page.drawText('Notary Public, State of Florida', { x: MARGIN + 290, y: y - 64, size: 7, font: regularFont, color: BLACK });

  y -= 80;

  // ── Footer ─────────────────────────────────────────────────────────────────
  y = MARGIN + 12;
  page.drawLine({
    start: { x: MARGIN, y: y + 8 },
    end: { x: PAGE_W - MARGIN, y: y + 8 },
    thickness: 0.5, color: LIGHT_GRAY,
  });
  page.drawText(
    'Generated by Rhino Roofs NOC Automation  |  This document must be recorded with the County Clerk prior to the first inspection.',
    { x: MARGIN, y, size: 6.5, font: italicFont, color: DARK_GRAY }
  );

  // ── Serialize ──────────────────────────────────────────────────────────────
  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateNOC };
