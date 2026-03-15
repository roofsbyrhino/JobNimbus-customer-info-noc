/**
 * GET/POST /api/stalled-jobs-cron
 *
 * Vercel Cron Job — runs Mon–Fri at 7:00 AM Eastern (12:00 UTC).
 *
 * Logic:
 *   • Production jobs idle 2+ business days  → email Install Ops Manager
 *   • Production jobs idle 5+ business days  → also email COO
 *   • Sales jobs idle 2+ business days        → email Sales Manager
 *   • Sales jobs idle 5+ business days        → also email COO
 *
 * The COO email bundles BOTH boards into one workbook so it's one attachment.
 *
 * Authentication:
 *   Vercel sends Authorization: Bearer <CRON_SECRET> on cron invocations.
 *   Set CRON_SECRET in your Vercel project environment variables.
 */

require('dotenv').config();

const { findStalledJobs, PRODUCTION_STAGES, SALES_STAGES } = require('../lib/stalled-jobs');
const { generateStalledJobsExcel }                         = require('../lib/excel-report');
const { sendEmail }                                        = require('../lib/email');

// ─── Thresholds ───────────────────────────────────────────────────────────────
const OPS_THRESHOLD = 2; // business days → ops manager / sales manager
const COO_THRESHOLD = 5; // business days → COO escalation

// ─── Auth ─────────────────────────────────────────────────────────────────────
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — allow (dev mode)
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
}

// ─── HTML email body builder ──────────────────────────────────────────────────
function buildEmailHtml(jobs, boardLabel, thresholdDays, reportDate) {
  const urgencyColor = thresholdDays >= 5 ? '#CC0000' : '#CC6600';
  const urgencyLabel = thresholdDays >= 5 ? '🚨 ESCALATION' : '⚠️ Attention Required';

  const rows = jobs.map(j => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5;font-weight:600;white-space:nowrap">${j.jobNumber}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5">${j.customerName}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5;font-size:12px">${j.address}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5;font-size:12px">${j.stage}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5">${j.assignedTo}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5;text-align:center;font-weight:700;color:${j.businessDaysStalled >= 5 ? '#CC0000' : '#CC6600'}">${j.businessDaysStalled}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #e8edf5;font-size:11px;color:#555;max-width:260px">${j.lastNote}</td>
    </tr>
  `).join('');

  const emptyRow = `
    <tr>
      <td colspan="7" style="padding:16px;text-align:center;color:#007700;font-style:italic">
        ✓ No stalled jobs — all clear!
      </td>
    </tr>
  `;

  return `
    <div style="font-family:Arial,sans-serif;max-width:960px;margin:0 auto">
      <div style="background:#1A3D8F;padding:20px 24px;border-radius:8px 8px 0 0">
        <div style="color:#aac4ff;font-size:12px;margin-bottom:4px">${urgencyLabel}</div>
        <h2 style="color:white;margin:0;font-size:20px">
          Rhino Roofs — ${boardLabel} Stalled Jobs
        </h2>
        <p style="color:#c8d8ff;margin:6px 0 0;font-size:13px">
          ${thresholdDays}+ business days with no activity &nbsp;·&nbsp; ${reportDate}
        </p>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid #dce4f0">
        <thead>
          <tr style="background:#2E5FA3">
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Job #</th>
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Customer</th>
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Address</th>
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Stage</th>
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Assigned To</th>
            <th style="padding:10px;color:white;text-align:center;font-weight:600">Days Idle</th>
            <th style="padding:10px;color:white;text-align:left;font-weight:600">Last Note</th>
          </tr>
        </thead>
        <tbody>
          ${jobs.length > 0 ? rows : emptyRow}
        </tbody>
      </table>

      <p style="font-size:11px;color:#999;padding:10px 0;margin:0">
        Sent automatically by Rhino Roofs Job Automation &nbsp;·&nbsp;
        Full spreadsheet attached
      </p>
    </div>
  `;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today      = new Date();
  const reportDate = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
  const fileDate = today.toISOString().slice(0, 10);

  console.log(`[stalled-jobs-cron] Running for ${reportDate}`);

  try {
    // Run all four queries in parallel
    const [prod2, prod5, sales2, sales5] = await Promise.all([
      findStalledJobs(PRODUCTION_STAGES, OPS_THRESHOLD, 'Production'),
      findStalledJobs(PRODUCTION_STAGES, COO_THRESHOLD, 'Production'),
      findStalledJobs(SALES_STAGES,      OPS_THRESHOLD, 'Sales'),
      findStalledJobs(SALES_STAGES,      COO_THRESHOLD, 'Sales'),
    ]);

    const emails = [];

    // ── Install Ops Manager: production jobs idle 2+ days ─────────────────
    if (prod2.length > 0) {
      const excelBuffer = await generateStalledJobsExcel(prod2, [], reportDate, OPS_THRESHOLD);
      emails.push(sendEmail({
        to:                  process.env.OPS_MANAGER_EMAIL,
        subject:             `⚠️ ${prod2.length} Production Job(s) Need Attention — ${reportDate}`,
        html:                buildEmailHtml(prod2, 'Production Board', OPS_THRESHOLD, reportDate),
        attachmentBuffer:    excelBuffer,
        attachmentFilename:  `Production-Stalled-${fileDate}.xlsx`,
      }));
    }

    // ── Sales Manager: sales leads idle 2+ days ────────────────────────────
    if (sales2.length > 0) {
      const excelBuffer = await generateStalledJobsExcel([], sales2, reportDate, OPS_THRESHOLD);
      emails.push(sendEmail({
        to:                  process.env.SALES_MANAGER_EMAIL,
        subject:             `⚠️ ${sales2.length} Sales Lead(s) Need Follow-Up — ${reportDate}`,
        html:                buildEmailHtml(sales2, 'Sales Board', OPS_THRESHOLD, reportDate),
        attachmentBuffer:    excelBuffer,
        attachmentFilename:  `Sales-Stalled-${fileDate}.xlsx`,
      }));
    }

    // ── COO: anything idle 5+ days across both boards ──────────────────────
    const cooTotal = prod5.length + sales5.length;
    if (cooTotal > 0) {
      const excelBuffer = await generateStalledJobsExcel(prod5, sales5, reportDate, COO_THRESHOLD);
      const combinedJobs = [...prod5, ...sales5].sort(
        (a, b) => b.businessDaysStalled - a.businessDaysStalled
      );
      emails.push(sendEmail({
        to:                  process.env.COO_EMAIL,
        subject:             `🚨 ${cooTotal} Job(s) Stalled 5+ Days — Action Required — ${reportDate}`,
        html:                buildEmailHtml(combinedJobs, 'All Boards', COO_THRESHOLD, reportDate),
        attachmentBuffer:    excelBuffer,
        attachmentFilename:  `Critical-Stalled-${fileDate}.xlsx`,
      }));
    }

    await Promise.all(emails);

    console.log(
      `[stalled-jobs-cron] Done — prod2:${prod2.length} prod5:${prod5.length} ` +
      `sales2:${sales2.length} sales5:${sales5.length} — ${emails.length} email(s) sent`
    );

    return res.status(200).json({
      success: true,
      reportDate,
      production: { ops: prod2.length, coo: prod5.length },
      sales:      { manager: sales2.length, coo: sales5.length },
      emailsSent: emails.length,
    });

  } catch (err) {
    console.error('[stalled-jobs-cron] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
