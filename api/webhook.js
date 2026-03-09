/**
 * POST /api/webhook
 *
 * Receives JobNimbus "record_created" webhook events.
 * Workflow:
 *   1. Validate the incoming payload
 *   2. Extract property address from the new lead/job
 *   3. Pull property data from PropertyRadar (or mock)
 *   4. Generate the Florida NOC PDF
 *   5. Upload the PDF back to the JobNimbus job file
 *   6. Add a note to the job confirming the NOC was generated
 */

require('dotenv').config();

const { getContact, getJob, extractAddress, uploadDocument, addNote } = require('../lib/jobnimbus');
const { getPropertyData } = require('../lib/propertyradar');
const { generateNOC } = require('../lib/noc-generator');

/**
 * Determine the job/record ID and address from a JobNimbus webhook payload.
 * JobNimbus webhooks send slightly different shapes for contacts vs. jobs.
 */
function parseWebhookPayload(body) {
  // JobNimbus webhook envelope: { event, data: { record } }
  const record = body?.data?.record || body?.record || body;

  const recordId = record?.jnid || record?.id;
  const recordType = (record?.record_type || '').toLowerCase(); // 'contact' | 'job'

  const address = extractAddress(record);

  return { recordId, recordType, record, address };
}

/**
 * Optional lightweight signature check.
 * JobNimbus does not currently sign webhooks, but we support a shared-secret
 * header check as a basic safeguard. Set WEBHOOK_SECRET in env to enable.
 */
function validateSecret(req) {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret || secret === 'YOUR_RANDOM_WEBHOOK_SECRET') return true; // not configured

  const provided = req.headers['x-webhook-secret'] || req.headers['x-jobnimbus-secret'];
  return provided === secret;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!validateSecret(req)) {
    console.warn('[webhook] Invalid webhook secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let body = req.body;

  // Vercel parses JSON automatically, but guard against string bodies
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
  }

  const { recordId, recordType, record, address } = parseWebhookPayload(body);

  if (!recordId) {
    console.warn('[webhook] No record ID found in payload', JSON.stringify(body));
    return res.status(400).json({ error: 'Missing record ID in payload' });
  }

  console.log(`[webhook] Received event — type: ${recordType}, id: ${recordId}, address: ${address}`);

  // ── Only process new leads or jobs that have an address ──────────────────
  if (!address) {
    console.log('[webhook] No address found on record — skipping NOC generation');
    return res.status(200).json({ skipped: true, reason: 'No property address on record' });
  }

  try {
    // ── Step 1: Fetch full record from JobNimbus if needed ──────────────────
    // The webhook payload may not include all fields, so fetch the full record.
    let jobId = recordId;
    let fullRecord = record;

    try {
      if (recordType === 'contact') {
        fullRecord = await getContact(recordId);
      } else {
        fullRecord = await getJob(recordId);
      }
      jobId = fullRecord?.jnid || recordId;
    } catch (fetchErr) {
      // Non-fatal: proceed with what we have from the webhook payload
      console.warn(`[webhook] Could not re-fetch record ${recordId}: ${fetchErr.message}`);
    }

    // ── Step 2: Pull property data from BatchData ───────────────────────────
    console.log(`[BatchData] Looking up address: ${address}`);
    const propertyData = await getPropertyData(address);
    console.log(`[BatchData] Got data for: ${propertyData.owner?.fullName}`);

    // ── Step 3: Generate NOC PDF ────────────────────────────────────────────
    console.log('[NOC] Generating PDF...');
    const pdfBuffer = await generateNOC(propertyData, jobId);
    console.log(`[NOC] PDF generated — ${pdfBuffer.length} bytes`);

    // ── Step 4: Upload PDF to JobNimbus ─────────────────────────────────────
    const filename = `NOC-${jobId}-${Date.now()}.pdf`;
    console.log(`[JobNimbus] Uploading ${filename} to job ${jobId}...`);
    await uploadDocument(jobId, pdfBuffer, filename);
    console.log('[JobNimbus] Upload complete');

    // ── Step 5: Add confirmation note to job ───────────────────────────────
    const noteText =
      `✅ Florida Notice of Commencement auto-generated and uploaded.\n` +
      `Property: ${propertyData.address?.full}\n` +
      `Owner: ${propertyData.owner?.fullName}\n` +
      `Tax Folio: ${propertyData.parcel?.apn}\n` +
      `File: ${filename}\n` +
      `Next step: Owner must sign and notarize, then file with the County Clerk before first inspection.`;

    await addNote(jobId, noteText);
    console.log('[JobNimbus] Confirmation note added');

    return res.status(200).json({
      success: true,
      jobId,
      filename,
      owner: propertyData.owner?.fullName,
      address: propertyData.address?.full,
    });

  } catch (err) {
    console.error('[webhook] Error processing NOC:', err);
    return res.status(500).json({
      error: 'NOC generation failed',
      message: err.message,
    });
  }
};
