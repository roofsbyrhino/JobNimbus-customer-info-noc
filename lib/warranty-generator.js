/**
 * Rhino Roofs — Workmanship Warranty Certificate Generator
 *
 * Produces a professional PDF warranty certificate based on:
 *   • The job record (customer name, address, job ID)
 *   • The warranty spec resolved from the material order parser
 *   • The parsed material details (product name, squares, color, supplier)
 *
 * Layout mirrors the NOC style (Rhino Blue header, branded footer).
 */

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const CONTRACTOR = require('./contractor');

// ─── Layout ───────────────────────────────────────────────────────────────────
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const COL_W  = PAGE_W - MARGIN * 2;

// ─── Colors ───────────────────────────────────────────────────────────────────
const BLACK      = rgb(0, 0, 0);
const DARK_GRAY  = rgb(0.2, 0.2, 0.2);
const LIGHT_GRAY = rgb(0.85, 0.85, 0.85);
const WHITE      = rgb(1, 1, 1);
const RHINO_BLUE = rgb(0.1, 0.25, 0.55);
const GREEN      = rgb(0.0, 0.45, 0.1);

// ─── Text helpers ─────────────────────────────────────────────────────────────
function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawField(page, { fonts, label, value, x, y, width = COL_W }) {
  page.drawText(label.toUpperCase(), {
    x, y, size: 7.5, font: fonts.bold, color: DARK_GRAY,
  });
  const lines = wrapText(value || '', fonts.regular, 10, width);
  let cy = y - 14;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size: 10, font: fonts.regular, color: BLACK });
    cy -= 13;
  }
  page.drawLine({
    start: { x, y: cy + 4 },
    end:   { x: x + width, y: cy + 4 },
    thickness: 0.5, color: DARK_GRAY,
  });
  return cy - 6;
}

function drawSectionHeading(page, fonts, text, y) {
  page.drawRectangle({ x: MARGIN, y: y - 4, width: COL_W, height: 16, color: RHINO_BLUE });
  page.drawText(text.toUpperCase(), {
    x: MARGIN + 6, y, size: 8, font: fonts.bold, color: WHITE,
  });
  return y - 20;
}

function drawDivider(page, y, color = LIGHT_GRAY) {
  page.drawLine({
    start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y },
    thickness: 0.75, color,
  });
  return y - 10;
}

// ─── Certificate number ───────────────────────────────────────────────────────
function buildCertNumber(jobId) {
  const now = new Date();
  const yr  = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, '0');
  return `WW-${yr}${mo}-${(jobId || 'XXXX').toString().slice(-6).toUpperCase()}`;
}

// ─── Main generator ───────────────────────────────────────────────────────────

/**
 * Generate a workmanship warranty certificate PDF.
 *
 * @param {Object} job          Full JobNimbus job record
 * @param {Object} warrantySpec Resolved from warranty-lookup.js
 * @param {Object} parsed       Extracted material details from material-parser.js
 * @returns {Promise<Buffer>}   PDF as Node.js Buffer
 */
async function generateWarranty(job, warrantySpec, parsed) {
  const doc  = await PDFDocument.create();
  const page = doc.addPage([PAGE_W, PAGE_H]);

  const regularFont = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
  const italicFont  = await doc.embedFont(StandardFonts.HelveticaOblique);
  const fonts = { regular: regularFont, bold: boldFont, italic: italicFont };

  // ── Dates ──────────────────────────────────────────────────────────────────
  const today      = new Date();
  const expiryDate = new Date(today);
  expiryDate.setFullYear(today.getFullYear() + warrantySpec.workmanshipYears);

  const fmt = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const installDate  = fmt(today);
  const expiryString = fmt(expiryDate);
  const certNumber   = buildCertNumber(job?.jnid || job?.number);

  const customerName = job?.name || job?.display_name || 'Homeowner';
  const address      = [
    job?.address_line1 || job?.address,
    job?.city,
    job?.state_text || job?.state,
    job?.zip,
  ].filter(Boolean).join(', ');

  let y = PAGE_H - MARGIN;

  // ── Header bar ─────────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 80, width: PAGE_W, height: 80, color: RHINO_BLUE });

  page.drawText('LIMITED WORKMANSHIP WARRANTY', {
    x: MARGIN, y: PAGE_H - 30, size: 17, font: boldFont, color: WHITE,
  });
  page.drawText('Rhino Roofs  ·  Residential Roofing', {
    x: MARGIN, y: PAGE_H - 50, size: 10, font: italicFont, color: rgb(0.75, 0.85, 1),
  });
  page.drawText(`Certificate No: ${certNumber}`, {
    x: PAGE_W - MARGIN - 180, y: PAGE_H - 30, size: 9, font: boldFont, color: WHITE,
  });
  page.drawText(`Issue Date: ${installDate}`, {
    x: PAGE_W - MARGIN - 180, y: PAGE_H - 46, size: 8, font: regularFont, color: rgb(0.75, 0.85, 1),
  });

  y = PAGE_H - 90;

  // ── Warranty term banner ───────────────────────────────────────────────────
  page.drawRectangle({ x: MARGIN, y: y - 26, width: COL_W, height: 32, color: rgb(0.9, 0.96, 0.9) });
  page.drawRectangle({ x: MARGIN, y: y - 26, width: 4, height: 32, color: GREEN });
  page.drawText(
    `${warrantySpec.workmanshipYears}-YEAR LIMITED WORKMANSHIP WARRANTY`,
    { x: MARGIN + 14, y: y - 6, size: 13, font: boldFont, color: GREEN }
  );
  page.drawText(warrantySpec.label, {
    x: MARGIN + 14, y: y - 20, size: 9, font: italicFont, color: DARK_GRAY,
  });

  if (warrantySpec.certificationNote) {
    page.drawText(warrantySpec.certificationNote, {
      x: PAGE_W - MARGIN - 260, y: y - 13, size: 8, font: boldFont, color: GREEN,
    });
  }

  y -= 38;

  // ── Section 1: Property & Owner ────────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '1. Property & Owner Information', y);
  y -= 4;

  const halfW = COL_W / 2 - 10;
  const leftY = y;
  drawField(page, { fonts, label: 'Homeowner Name', value: customerName, x: MARGIN, y: leftY, width: halfW });
  y = drawField(page, { fonts, label: 'Property Address', value: address, x: MARGIN + halfW + 20, y: leftY, width: halfW });
  y -= 4;

  // ── Section 2: Installation Details ───────────────────────────────────────
  y = drawSectionHeading(page, fonts, '2. Installation Details', y);
  y -= 4;

  const col2Y = y;
  drawField(page, { fonts, label: 'Product Installed', value: parsed?.productName || warrantySpec.label, x: MARGIN, y: col2Y, width: halfW });
  y = drawField(page, { fonts, label: 'Manufacturer / Supplier', value: [parsed?.manufacturer, parsed?.supplier].filter(Boolean).join(' / ') || 'See Material Order', x: MARGIN + halfW + 20, y: col2Y, width: halfW });
  y -= 2;

  const col3Y = y;
  const colorVal  = parsed?.color   || '—';
  const squaresVal = parsed?.squares ? `${parsed.squares} squares` : '—';
  const seamVal   = parsed?.seamHeight ? `${parsed.seamHeight}" Standing Seam` : (warrantySpec.plySystem ? `${warrantySpec.plySystem}-Ply System` : '—');

  drawField(page, { fonts, label: 'Color / Finish',  value: colorVal,   x: MARGIN, y: col3Y, width: halfW });
  y = drawField(page, { fonts, label: warrantySpec.panelType ? 'Panel Type / Detail' : 'System Detail', value: seamVal, x: MARGIN + halfW + 20, y: col3Y, width: halfW });
  y -= 2;

  drawField(page, { fonts, label: 'Area Covered', value: squaresVal, x: MARGIN, y, width: halfW });
  y = drawField(page, { fonts, label: 'Installation Date', value: installDate, x: MARGIN + halfW + 20, y, width: halfW });
  y -= 4;

  // ── Section 3: Warranty Terms ──────────────────────────────────────────────
  y = drawSectionHeading(page, fonts, '3. Warranty Coverage', y);
  y -= 4;

  const termY = y;
  drawField(page, { fonts, label: 'Warranty Period', value: `${warrantySpec.workmanshipYears} Years`, x: MARGIN, y: termY, width: halfW });
  y = drawField(page, { fonts, label: 'Expiration Date', value: expiryString, x: MARGIN + halfW + 20, y: termY, width: halfW });
  y -= 4;

  const coverageText =
    'Rhino Roofs warrants that the roofing installation described above will be free from defects ' +
    'in workmanship for the warranty period shown. If a covered defect is found, Rhino Roofs will, ' +
    'at its option, repair or re-roof the affected area at no additional labor cost to the original homeowner.';

  y = drawField(page, { fonts, label: 'What is Covered', value: coverageText, x: MARGIN, y, width: COL_W, });
  y -= 4;

  const exclusionsText =
    'This warranty does not cover: (a) damage caused by acts of God, hurricane, hail, ' +
    'fire, or other extreme weather events; (b) damage from foot traffic, falling objects, ' +
    'or alterations by others; (c) pre-existing structural deficiencies; ' +
    '(d) manufacturer product defects (covered separately by manufacturer warranty); ' +
    '(e) normal wear and weathering.';

  y = drawField(page, { fonts, label: 'Exclusions', value: exclusionsText, x: MARGIN, y, width: COL_W });
  y -= 4;

  // ── Section 4: Manufacturer Warranty (if applicable) ──────────────────────
  const mfgWarranty = warrantySpec.mfgWarranty;
  const hasMfgWarranty = mfgWarranty && (
    (typeof mfgWarranty === 'object' && (mfgWarranty.standard || mfgWarranty.years)) ||
    (parsed?.supplier && mfgWarranty[parsed.supplier?.toLowerCase()])
  );

  if (hasMfgWarranty) {
    y = drawSectionHeading(page, fonts, '4. Manufacturer Product Warranty (Informational)', y);
    y -= 4;

    let mfgText = '';
    if (mfgWarranty.standard) {
      const s = mfgWarranty.standard;
      mfgText = `${parsed?.manufacturer || 'Manufacturer'} provides a ${s.years} limited warranty ` +
                `with ${s.windMph}mph wind resistance` +
                (s.algaeYears ? ` and ${s.algaeYears}-year algae resistance.` : '.');
    } else if (mfgWarranty.westlake) {
      mfgText = `Westlake Royal provides a ${mfgWarranty.westlake.years}-year limited product warranty. ` +
                mfgWarranty.westlake.coverage + '.';
    } else if (parsed?.supplier && mfgWarranty[parsed.supplier.toLowerCase()]) {
      const s = mfgWarranty[parsed.supplier.toLowerCase()];
      mfgText = `${parsed.supplier} provides a ${s.paintYears}-year ${s.finish} paint warranty ` +
                `and ${s.substrateYears}-year substrate warranty on the metal panels.`;
    }

    if (mfgText) {
      y = drawField(page, { fonts, label: 'Manufacturer Warranty Summary', value: mfgText, x: MARGIN, y, width: COL_W });
      y = drawField(page, { fonts, label: 'Warranty Registration', value: 'Homeowner must register product warranty directly with the manufacturer. Details provided separately.', x: MARGIN, y, width: COL_W });
      y -= 4;
    }
  }

  // ── Section 5: Transferability ─────────────────────────────────────────────
  const sectionNum = hasMfgWarranty ? '5' : '4';
  y = drawSectionHeading(page, fonts, `${sectionNum}. Transferability & Claims`, y);
  y -= 4;

  y = drawField(page, {
    fonts, label: 'Warranty Transfer',
    value: 'This warranty is transferable one time to a subsequent owner of the property within the warranty period. Transfer must be requested in writing to Rhino Roofs within 30 days of property sale.',
    x: MARGIN, y, width: COL_W,
  });
  y -= 4;

  y = drawField(page, {
    fonts, label: 'How to File a Claim',
    value: `Contact Rhino Roofs at ${CONTRACTOR.phone} or in writing at ${CONTRACTOR.address.full}. ` +
           `Claims must be submitted within the warranty period. A site inspection will be scheduled within 10 business days of a valid claim.`,
    x: MARGIN, y, width: COL_W,
  });
  y -= 8;

  // ── Signature block ────────────────────────────────────────────────────────
  drawDivider(page, y, RHINO_BLUE);
  y -= 8;

  page.drawText('AUTHORIZED SIGNATURES', {
    x: MARGIN, y, size: 8, font: boldFont, color: RHINO_BLUE,
  });
  y -= 18;

  // Contractor sig
  page.drawText('On behalf of Rhino Roofs:', { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({ start: { x: MARGIN + 160, y: y - 2 }, end: { x: MARGIN + 340, y: y - 2 }, thickness: 0.75, color: BLACK });
  page.drawText('Date: ', { x: MARGIN + 350, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({ start: { x: MARGIN + 382, y: y - 2 }, end: { x: MARGIN + COL_W, y: y - 2 }, thickness: 0.75, color: BLACK });
  y -= 22;

  page.drawText(`Name: ${CONTRACTOR.ownerName}`, { x: MARGIN, y, size: 8, font: regularFont, color: DARK_GRAY });
  page.drawText(`FL License: ${CONTRACTOR.licenseNumber}`, { x: MARGIN + 200, y, size: 8, font: regularFont, color: DARK_GRAY });
  y -= 22;

  // Homeowner acknowledgment
  page.drawText('Homeowner Acknowledgment:', { x: MARGIN, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({ start: { x: MARGIN + 190, y: y - 2 }, end: { x: MARGIN + 370, y: y - 2 }, thickness: 0.75, color: BLACK });
  page.drawText('Date: ', { x: MARGIN + 380, y, size: 9, font: boldFont, color: BLACK });
  page.drawLine({ start: { x: MARGIN + 412, y: y - 2 }, end: { x: MARGIN + COL_W, y: y - 2 }, thickness: 0.75, color: BLACK });
  y -= 22;

  // ── Footer ─────────────────────────────────────────────────────────────────
  y = MARGIN + 12;
  page.drawLine({ start: { x: MARGIN, y: y + 8 }, end: { x: PAGE_W - MARGIN, y: y + 8 }, thickness: 0.5, color: LIGHT_GRAY });
  page.drawText(
    `Cert No: ${certNumber}  ·  Rhino Roofs  ·  ${CONTRACTOR.address.full}  ·  ${CONTRACTOR.phone}  ·  FL License: ${CONTRACTOR.licenseNumber}`,
    { x: MARGIN, y, size: 6.5, font: italicFont, color: DARK_GRAY }
  );

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateWarranty };
