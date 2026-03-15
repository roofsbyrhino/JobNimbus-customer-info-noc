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
 * List all files attached to a JobNimbus job.
 * Returns an array of file metadata objects.
 *
 * @param {string} jobId
 * @returns {Object[]}
 */
async function getJobFiles(jobId) {
  const { data } = await client().get(`/jobs/${jobId}/files`);
  return data.results || data.data || data || [];
}

/**
 * Download a file from JobNimbus and return it as a Buffer.
 *
 * @param {string} fileUrl  The download URL from a file metadata object
 * @returns {Buffer}
 */
async function downloadFile(fileUrl) {
  const { data } = await axios.get(fileUrl, {
    headers: { Authorization: `Bearer ${process.env.JOBNIMBUS_API_KEY}` },
    responseType: 'arraybuffer',
    timeout: 30000,
  });
  return Buffer.from(data);
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

/**
 * Fetch all jobs currently in any of the given stage names.
 * Handles pagination automatically.
 *
 * @param {string[]} stages  Array of JobNimbus status/stage display names
 * @returns {Object[]}       Array of job records
 */
async function getJobsByStages(stages) {
  const stageSet = new Set(stages.map(s => s.toLowerCase()));
  const allJobs = [];
  let from = 0;
  const size = 100;

  while (true) {
    const { data } = await client().get('/jobs', {
      params: { size, from, sort: '-date_updated' },
    });

    const results = data.results || data.data || [];
    if (results.length === 0) break;

    const filtered = results.filter(j => {
      const status = (j.status_name || j.status || '').toLowerCase();
      return stageSet.has(status);
    });
    allJobs.push(...filtered);

    from += size;
    const total = data.total ?? data.count ?? results.length;
    if (from >= total || results.length < size) break;
  }

  return allJobs;
}

/**
 * Fetch the most recent meaningful activity (note, status change, file upload)
 * for a given job. Returns null if none found.
 *
 * @param {string} jobId  JobNimbus job record ID
 * @returns {Object|null}
 */
async function getLastActivity(jobId) {
  try {
    const { data } = await client().get('/activities', {
      params: { jnid: jobId, size: 10, sort: '-date_created' },
    });
    const activities = data.results || data.data || [];
    const withNote = activities.find(a => a.note && a.note.trim().length > 0);
    return withNote || activities[0] || null;
  } catch {
    return null;
  }
}

module.exports = {
  getContact,
  getJob,
  extractAddress,
  uploadDocument,
  addNote,
  getJobsByStages,
  getLastActivity,
  getJobFiles,
  downloadFile,
};
