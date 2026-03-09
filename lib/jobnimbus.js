/**
 * JobNimbus API client
 * Docs: https://app.jobnimbus.com/api1/
 */

const axios = require('axios');

const BASE_URL = 'https://app.jobnimbus.com/api1';

function client() {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${process.env.JOBNIMBUS_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });
}

/**
 * Fetch a single contact/lead by its JobNimbus record ID.
 * Returns the raw contact object from JobNimbus.
 */
async function getContact(contactId) {
  const { data } = await client().get(`/contacts/${contactId}`);
  return data;
}

/**
 * Fetch a single job by its JobNimbus record ID.
 */
async function getJob(jobId) {
  const { data } = await client().get(`/jobs/${jobId}`);
  return data;
}

/**
 * Extract a clean address string from a JobNimbus contact or job record.
 * JobNimbus may store address fields as top-level keys.
 */
function extractAddress(record) {
  const parts = [
    record.address_line1 || record.address,
    record.city,
    record.state_text || record.state,
    record.zip,
  ].filter(Boolean);

  return parts.join(', ');
}

/**
 * Upload a PDF buffer as a file attachment to a JobNimbus job.
 *
 * @param {string} jobId       - The JobNimbus job record ID
 * @param {Buffer} pdfBuffer   - The generated PDF as a Node.js Buffer
 * @param {string} filename    - Filename to use in JobNimbus (e.g. "NOC-123.pdf")
 */
async function uploadDocument(jobId, pdfBuffer, filename) {
  const FormData = require('form-data');
  const form = new FormData();

  form.append('file', pdfBuffer, {
    filename,
    contentType: 'application/pdf',
  });

  const { data } = await axios.post(
    `${BASE_URL}/jobs/${jobId}/files`,
    form,
    {
      headers: {
        Authorization: `Bearer ${process.env.JOBNIMBUS_API_KEY}`,
        ...form.getHeaders(),
      },
      timeout: 30000,
    }
  );

  return data;
}

/**
 * Add a note to a JobNimbus job record.
 */
async function addNote(jobId, noteText) {
  const { data } = await client().post(`/activities`, {
    jnid: jobId,
    note: noteText,
    type: 1, // 1 = Note
  });
  return data;
}

module.exports = { getContact, getJob, extractAddress, uploadDocument, addNote };
