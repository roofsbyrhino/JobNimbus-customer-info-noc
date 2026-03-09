/**
 * POST /api/generate-noc
 *
 * Manual trigger endpoint for generating and uploading a NOC PDF.
 * Useful for testing without a live JobNimbus webhook.
 *
 * Request body (JSON):
 *   { "jobId": "abc123", "address": "1234 Main St, Port Saint Lucie, FL 34952" }
 *
 * The jobId is required. The address is optional — if omitted, the job is
 * fetched from JobNimbus and the address is extracted from it.
 */

require('dotenv').config();

const { getJob, extractAddress, uploadDocument, addNote } = require('../lib/jobnimbus');
const { getPropertyData } = require('../lib/propertyradar');
const { generateNOC } = require('../lib/noc-generator');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Basic API key guard for the manual endpoint
  const secret = process.env.WEBHOOK_SECRET;
  if (secret && secret !== 'YOUR_RANDOM_WEBHOOK_SECRET') {
    const provided = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    if (provided !== secret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const { jobId, address: rawAddress } = req.body || {};

  if (!jobId) {
    return res.status(400).json({ error: 'jobId is required' });
  }

  try {
    // Resolve address
    let address = rawAddress;
    if (!address) {
      const job = await getJob(jobId);
      address = extractAddress(job);
    }

    if (!address) {
      return res.status(400).json({ error: 'Could not determine property address for this job' });
    }

    // BatchData lookup
    const propertyData = await getPropertyData(address);

    // Generate PDF
    const pdfBuffer = await generateNOC(propertyData, jobId);

    // Upload
    const filename = `NOC-${jobId}-${Date.now()}.pdf`;
    await uploadDocument(jobId, pdfBuffer, filename);

    // Note
    const noteText =
      `✅ Florida Notice of Commencement auto-generated and uploaded.\n` +
      `Property: ${propertyData.address?.full}\n` +
      `Owner: ${propertyData.owner?.fullName}\n` +
      `Tax Folio: ${propertyData.parcel?.apn}\n` +
      `File: ${filename}\n` +
      `Next step: Owner must sign and notarize, then file with the County Clerk before first inspection.`;

    await addNote(jobId, noteText);

    return res.status(200).json({
      success: true,
      jobId,
      filename,
      owner: propertyData.owner?.fullName,
      address: propertyData.address?.full,
    });

  } catch (err) {
    console.error('[generate-noc] Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
