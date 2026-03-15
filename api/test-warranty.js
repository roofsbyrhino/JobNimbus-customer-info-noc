/**
 * POST /api/test-warranty
 *
 * Manual test trigger: runs the full warranty flow for a given job number.
 * Steps:
 *   1. Look up job by its human-readable number (e.g. 9888)
 *   2. Parse the material order PDF attached to the job
 *   3. Generate the warranty certificate PDF
 *   4. Upload the PDF to the job in JobNimbus
 *   5. Add a note to the job
 *   6. Send a verification email with the PDF attached
 *
 * Request body (JSON):
 *   {
 *     "jobNumber": 9888,
 *     "email": "Info@roofsbyrhino.com",   // optional, defaults to env TEST_EMAIL or OPS_MANAGER_EMAIL
 *     "force": false                       // optional, set true to generate even on MEDIUM confidence
 *   }
 */

require('dotenv').config();

const { getJobByNumber, uploadDocument, addNote } = require('../lib/jobnimbus');
const { parseMaterialOrderForJob }                = require('../lib/material-parser');
const { generateWarranty }                        = require('../lib/warranty-generator');
const { sendEmail }                               = require('../lib/email');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { jobNumber, email, force = false } = req.body || {};

  if (!jobNumber) {
    return res.status(400).json({ error: 'jobNumber is required (e.g. 9888)' });
  }

  const verifyEmail =
    email ||
    process.env.TEST_EMAIL ||
    process.env.OPS_MANAGER_EMAIL ||
    'Info@roofsbyrhino.com';

  const log = [];
  const step = (msg) => { log.push(msg); console.log(`[test-warranty] ${msg}`); };

  try {
    // ── Step 1: Find the job ──────────────────────────────────────────────────
    step(`Looking up job #${jobNumber}…`);
    const job = await getJobByNumber(jobNumber);

    if (!job) {
      return res.status(404).json({
        error: `Job #${jobNumber} not found in JobNimbus`,
        log,
      });
    }

    const jobId       = job.jnid || job.id;
    const customerName = job.name || job.display_name || 'Unknown';
    const address     = [job.address_line1 || job.address, job.city, job.state_text || job.state, job.zip]
      .filter(Boolean).join(', ');

    step(`Found job — ID: ${jobId}, Customer: ${customerName}, Address: ${address}`);

    // ── Step 2: Parse material order ─────────────────────────────────────────
    step('Parsing material order PDF…');
    const { parsed, file: orderFile, shouldGenerate, holdReason } = await parseMaterialOrderForJob(jobId);

    if (parsed) {
      step(`Material parser result — product: ${parsed.productKey}, confidence: ${parsed.confidence}`);
      if (parsed.productName)   step(`  Product name: ${parsed.productName}`);
      if (parsed.manufacturer)  step(`  Manufacturer: ${parsed.manufacturer}`);
      if (parsed.supplier)      step(`  Supplier: ${parsed.supplier}`);
      if (parsed.color)         step(`  Color: ${parsed.color}`);
      if (parsed.squares)       step(`  Squares: ${parsed.squares}`);
    }

    if (!shouldGenerate && !force) {
      return res.status(200).json({
        success:  false,
        jobId,
        jobNumber,
        customer: customerName,
        address,
        held:     true,
        holdReason,
        parsed:   parsed || null,
        log,
        message:  `Warranty generation held. ${holdReason}. Pass "force": true to override.`,
      });
    }

    if (!shouldGenerate && force) {
      step(`⚠️  Confidence is ${parsed?.confidence} but force=true — generating anyway`);
    }

    // ── Step 3: Generate warranty PDF ─────────────────────────────────────────
    const warrantySpec = parsed?.warrantySpec;

    if (!warrantySpec) {
      return res.status(422).json({
        error:  'No warranty spec resolved — cannot generate PDF',
        parsed: parsed || null,
        log,
      });
    }

    step(`Generating warranty PDF — ${warrantySpec.workmanshipYears}-year ${warrantySpec.label}…`);
    const pdfBuffer = await generateWarranty(job, warrantySpec, parsed);
    step(`PDF generated (${(pdfBuffer.length / 1024).toFixed(1)} KB)`);

    // ── Step 4: Upload to JobNimbus ───────────────────────────────────────────
    const now      = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const filename = `Warranty-${jobNumber}-${datePart}.pdf`;

    step(`Uploading ${filename} to job #${jobNumber}…`);
    await uploadDocument(jobId, pdfBuffer, filename);
    step('Upload complete');

    // ── Step 5: Add note to job ───────────────────────────────────────────────
    const noteText =
      `✅ Workmanship warranty certificate generated and uploaded (test run).\n` +
      `Product: ${parsed?.productName || warrantySpec.label}\n` +
      `Warranty Term: ${warrantySpec.workmanshipYears} years\n` +
      `Supplier: ${parsed?.supplier || '—'}\n` +
      `File: ${filename}`;

    await addNote(jobId, noteText);
    step('Note added to job');

    // ── Step 6: Send verification email ──────────────────────────────────────
    step(`Sending verification email to ${verifyEmail}…`);

    const expiryDate = new Date(now);
    expiryDate.setFullYear(now.getFullYear() + warrantySpec.workmanshipYears);
    const fmt = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const emailHtml = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
  <div style="background:#1A3D8F;padding:20px 24px;border-radius:6px 6px 0 0">
    <h2 style="color:#fff;margin:0;font-size:18px">✅ Warranty Test — Job #${jobNumber}</h2>
    <p style="color:#b3c8f0;margin:6px 0 0;font-size:13px">Rhino Roofs Warranty Automation</p>
  </div>
  <div style="border:1px solid #ddd;border-top:none;padding:20px 24px;border-radius:0 0 6px 6px">
    <p style="margin:0 0 16px">The full warranty flow ran successfully on job <strong>#${jobNumber}</strong>. The PDF has been uploaded to the job in JobNimbus.</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr style="background:#f4f7fb">
        <td style="padding:8px 10px;font-weight:bold;color:#444;width:160px">Customer</td>
        <td style="padding:8px 10px">${customerName}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:bold;color:#444">Address</td>
        <td style="padding:8px 10px">${address}</td>
      </tr>
      <tr style="background:#f4f7fb">
        <td style="padding:8px 10px;font-weight:bold;color:#444">Product</td>
        <td style="padding:8px 10px">${parsed?.productName || warrantySpec.label}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:bold;color:#444">Manufacturer</td>
        <td style="padding:8px 10px">${parsed?.manufacturer || '—'}</td>
      </tr>
      <tr style="background:#f4f7fb">
        <td style="padding:8px 10px;font-weight:bold;color:#444">Supplier</td>
        <td style="padding:8px 10px">${parsed?.supplier || '—'}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:bold;color:#444">Warranty Term</td>
        <td style="padding:8px 10px;color:#1a7a1a;font-weight:bold">${warrantySpec.workmanshipYears} Years</td>
      </tr>
      <tr style="background:#f4f7fb">
        <td style="padding:8px 10px;font-weight:bold;color:#444">Issue Date</td>
        <td style="padding:8px 10px">${fmt(now)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:bold;color:#444">Expiry Date</td>
        <td style="padding:8px 10px">${fmt(expiryDate)}</td>
      </tr>
      <tr style="background:#f4f7fb">
        <td style="padding:8px 10px;font-weight:bold;color:#444">File Uploaded</td>
        <td style="padding:8px 10px;font-family:monospace;font-size:12px">${filename}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:bold;color:#444">Parser Confidence</td>
        <td style="padding:8px 10px">${parsed?.confidence || '—'}</td>
      </tr>
    </table>
    <p style="margin:20px 0 0;font-size:12px;color:#888">The warranty PDF is attached to this email and has been uploaded to the job in JobNimbus.</p>
  </div>
</div>`;

    await sendEmail({
      to:                 verifyEmail,
      subject:            `Warranty Test ✅ — Job #${jobNumber} — ${customerName}`,
      html:               emailHtml,
      attachmentBuffer:   pdfBuffer,
      attachmentFilename: filename,
    });

    step(`Email sent to ${verifyEmail}`);

    // ── Done ─────────────────────────────────────────────────────────────────
    return res.status(200).json({
      success:     true,
      jobId,
      jobNumber,
      customer:    customerName,
      address,
      product:     parsed?.productName || warrantySpec.label,
      warrantyYears: warrantySpec.workmanshipYears,
      expiryDate:  fmt(expiryDate),
      filename,
      emailSentTo: verifyEmail,
      log,
    });

  } catch (err) {
    step(`ERROR: ${err.message}`);
    console.error('[test-warranty]', err);
    return res.status(500).json({ error: err.message, log });
  }
};
