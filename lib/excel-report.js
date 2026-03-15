/**
 * Excel Report Generator — Stalled Jobs
 *
 * Produces a formatted .xlsx workbook with two sheets:
 *   • Production Board — jobs stalled N business days
 *   • Sales Board      — leads stalled N business days
 *
 * Uses exceljs for pure-Node spreadsheet creation.
 */

const ExcelJS = require('exceljs');

// ─── Brand colors ─────────────────────────────────────────────────────────────
const RHINO_NAVY   = '1A3D8F';
const RHINO_BLUE   = '2E5FA3';
const ROW_ALT      = 'EEF2FB';
const RED_TEXT     = 'CC0000';
const ORANGE_TEXT  = 'CC6600';
const WHITE        = 'FFFFFF';
const LIGHT_GRAY   = 'F5F7FA';

// ─── Column definitions ───────────────────────────────────────────────────────
const COLUMNS = [
  { header: 'Job #',         key: 'jobNumber',            width: 12 },
  { header: 'Customer Name', key: 'customerName',         width: 24 },
  { header: 'Address',       key: 'address',              width: 36 },
  { header: 'Stage',         key: 'stage',                width: 28 },
  { header: 'Assigned To',   key: 'assignedTo',           width: 18 },
  { header: 'Days Idle',     key: 'businessDaysStalled',  width: 12 },
  { header: 'Last Activity', key: 'lastActivityDate',     width: 16 },
  { header: 'Last Note',     key: 'lastNote',             width: 55 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyHeaderRow(sheet) {
  const header = sheet.getRow(1);
  header.height = 22;
  COLUMNS.forEach((col, i) => {
    const cell = header.getCell(i + 1);
    cell.value = col.header.toUpperCase();
    cell.font  = { bold: true, color: { argb: WHITE }, size: 10 };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: RHINO_BLUE } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
    cell.border = {
      bottom: { style: 'medium', color: { argb: RHINO_NAVY } },
    };
  });
}

function applyTitleRow(sheet, title, reportDate, colCount) {
  sheet.spliceRows(1, 0, []); // insert blank row at top — becomes title
  sheet.mergeCells(1, 1, 1, colCount);
  const cell = sheet.getCell('A1');
  cell.value = `${title}   ·   ${reportDate}`;
  cell.font  = { bold: true, size: 13, color: { argb: WHITE } };
  cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: RHINO_NAVY } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 28;
}

function addDataRows(sheet, jobs, startRow) {
  jobs.forEach((job, i) => {
    const row = sheet.getRow(startRow + i);
    row.height = 18;

    COLUMNS.forEach((col, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = job[col.key] ?? '';
      cell.alignment = { vertical: 'middle', wrapText: col.key === 'lastNote' };

      // Alternate row fill
      cell.fill = {
        type: 'pattern', pattern: 'solid',
        fgColor: { argb: i % 2 === 0 ? ROW_ALT : LIGHT_GRAY },
      };
    });

    // Color the "Days Idle" cell by urgency
    const daysCell = row.getCell(6); // column F
    const days = job.businessDaysStalled;
    daysCell.font = {
      bold: true,
      color: { argb: days >= 5 ? RED_TEXT : ORANGE_TEXT },
    };
    daysCell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // "All clear" placeholder when nothing is stalled
  if (jobs.length === 0) {
    const row = sheet.getRow(startRow);
    sheet.mergeCells(startRow, 1, startRow, COLUMNS.length);
    const cell = row.getCell(1);
    cell.value = '✓  No stalled jobs — all clear!';
    cell.font  = { italic: true, color: { argb: '007700' }, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = 24;
  }
}

function buildSheet(workbook, sheetName, title, reportDate, jobs) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = COLUMNS;

  // Freeze top two rows (title + header) after we finish inserting them
  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  // Auto-filter on the data (will be row 2 after title insert)
  applyHeaderRow(sheet); // row 1 before title insert
  addDataRows(sheet, jobs, 2); // data starts row 2 before title insert

  // Insert the title row above everything (shifts existing rows down)
  applyTitleRow(sheet, title, reportDate, COLUMNS.length);

  // After title insert, data starts at row 3
  // (applyTitleRow inserts row 1, original header is now row 2, data is row 3+)

  // Auto-filter on header row (now row 2)
  sheet.autoFilter = {
    from: { row: 2, column: 1 },
    to:   { row: 2, column: COLUMNS.length },
  };

  // Freeze rows 1+2 (title + header)
  sheet.views = [{ state: 'frozen', ySplit: 2 }];

  return sheet;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate the stalled-jobs Excel workbook.
 *
 * @param {Object[]} productionJobs  Stalled production jobs
 * @param {Object[]} salesJobs       Stalled sales jobs
 * @param {string}   reportDate      Human-readable date string for title rows
 * @param {number}   thresholdDays   Days threshold used (for sheet title)
 * @returns {Promise<Buffer>}        .xlsx file as a Node.js Buffer
 */
async function generateStalledJobsExcel(productionJobs, salesJobs, reportDate, thresholdDays) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator  = 'Rhino Roofs Automation';
  workbook.created  = new Date();
  workbook.modified = new Date();

  const label = `${thresholdDays}+ Business Days No Activity`;

  buildSheet(workbook, 'Production Board', `PRODUCTION BOARD — ${label}`, reportDate, productionJobs);
  buildSheet(workbook, 'Sales Board',      `SALES BOARD — ${label}`,      reportDate, salesJobs);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = { generateStalledJobsExcel };
