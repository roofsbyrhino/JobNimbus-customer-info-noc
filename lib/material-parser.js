/**
 * Material Order Parser
 *
 * Uses the Claude API to read a material order PDF attached to a JobNimbus job,
 * extract the roofing product details, and map them to a warranty spec.
 *
 * Confidence levels:
 *   HIGH   — product key is unambiguous, qty found → auto-generate warranty
 *   MEDIUM — product identified but one detail is uncertain (e.g. seam height
 *             not listed, or ply system unclear for tile) → hold + note on job
 *   LOW    — cannot determine product type → hold + notify admin
 *
 * On MEDIUM or LOW, this module adds a note to the JobNimbus job asking for
 * clarification and does NOT generate the warranty automatically.
 */

const Anthropic          = require('@anthropic-ai/sdk');
const { getJobFiles, downloadFile, addNote } = require('./jobnimbus');
const { getWarrantySpec, VALID_PRODUCT_KEYS } = require('./warranty-lookup');

// ─── Candidate file detection ─────────────────────────────────────────────────

const MATERIAL_ORDER_PATTERNS = [
  /material.?order/i,
  /purchase.?order/i,
  /\bP\.?O\.?\b/,
  /supply.?order/i,
  /order.?confirm/i,
  /invoice/i,
  /order\b/i,
];

/**
 * From a list of JobNimbus file metadata objects, find the most likely
 * material order PDF. Returns the best candidate or null.
 */
function findMaterialOrderFile(files) {
  const pdfs = files.filter(f =>
    (f.name || f.filename || '').toLowerCase().endsWith('.pdf') ||
    (f.content_type || f.mime_type || '').includes('pdf')
  );

  // Score by how likely the filename matches a material order
  const scored = pdfs.map(f => {
    const name = (f.name || f.filename || '').toLowerCase();
    let score = 0;
    for (const pattern of MATERIAL_ORDER_PATTERNS) {
      if (pattern.test(name)) score++;
    }
    return { file: f, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Return the best match, or null if nothing looks like an order
  return scored.length > 0 && scored[0].score > 0 ? scored[0].file : null;
}

// ─── Claude prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a roofing material order analyst for Rhino Roofs, a Florida roofing contractor.
You will be given a material order PDF. Your job is to extract the roofing product details
and return structured JSON only — no prose, no explanation.

PRODUCT KEY RULES — pick exactly one:
  "metal_5v_crimp"         → 5V crimp panel (exposed fastener, corrugated-style)
  "metal_standing_seam"    → standing seam panel of any height (concealed fastener)
  "shingle_gaf"            → GAF brand asphalt shingles (any product line)
  "shingle_owens_corning"  → Owens Corning asphalt shingles (any product line)
  "tile_one_ply"           → concrete or clay tile with a 1-ply underlayment system
  "tile_two_ply"           → concrete or clay tile with a 2-ply underlayment system
  null                     → cannot determine

CONFIDENCE RULES:
  "high"   → product key is certain AND quantity is found
  "medium" → product type known but a detail is uncertain
             (e.g. standing seam but seam height not listed;
              tile found but ply system not specified)
  "low"    → cannot reliably identify the roofing product

TILE PLY NOTE: Look for underlayment line items. Keywords for 2-ply:
  "2-ply", "two ply", "BUR", "modified bitumen", "hot mop", "base sheet + cap sheet".
  If no ply info found for a tile order → use "tile_one_ply" but confidence = "medium".

Return ONLY valid JSON in this exact shape:
{
  "productKey": "<key or null>",
  "confidence": "high" | "medium" | "low",
  "productName": "<specific product name from the order, e.g. Timberline HDZ>",
  "manufacturer": "<brand name>",
  "supplier": "<ABC Supply | Drexel Metals | Dyme Metals | Englert | other | unknown>",
  "seamHeight": "<1 | 1.5 | 1.75 | 2 | null>",
  "squares": <number or null>,
  "color": "<color/finish name or null>",
  "plySystem": "<1 | 2 | null>",
  "uncertainties": ["<list any field you were unsure about>"],
  "rawProductLine": "<verbatim product description from the order>"
}`;

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse a material order PDF buffer using Claude and return a structured result.
 *
 * @param {Buffer} pdfBuffer  Raw PDF bytes
 * @returns {Object}          Parsed result with confidence + warranty spec
 */
async function parseMaterialOrderPdf(pdfBuffer) {
  const client = new Anthropic();

  const response = await client.messages.create({
    model:      'claude-opus-4-6',
    max_tokens: 1024,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: [{
        type:       'document',
        source: {
          type:      'base64',
          media_type: 'application/pdf',
          data:       pdfBuffer.toString('base64'),
        },
      }, {
        type: 'text',
        text: 'Extract the roofing product details from this material order and return the JSON.',
      }],
    }],
  });

  const rawText = response.content[0]?.text || '';

  // Strip any markdown code fences Claude might add
  const jsonText = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      confidence:    'low',
      productKey:    null,
      warrantySpec:  null,
      parseError:    'Claude returned non-JSON output',
      rawResponse:   rawText,
    };
  }

  // Validate productKey
  if (parsed.productKey && !VALID_PRODUCT_KEYS.includes(parsed.productKey)) {
    parsed.confidence = 'low';
    parsed.productKey = null;
    parsed.uncertainties = [...(parsed.uncertainties || []), 'unrecognized product key'];
  }

  const warrantySpec = parsed.productKey ? getWarrantySpec(parsed.productKey) : null;

  return {
    ...parsed,
    warrantySpec,
  };
}

// ─── Job-level orchestration ──────────────────────────────────────────────────

/**
 * Find, download, and parse the material order for a given job.
 * If confidence is not HIGH, adds a clarification note to the job and
 * returns the result without generating a warranty.
 *
 * @param {string} jobId  JobNimbus job ID
 * @returns {Object}      { parsed, file, shouldGenerate, holdReason }
 */
async function parseMaterialOrderForJob(jobId) {
  // 1. List files on the job
  const files = await getJobFiles(jobId);

  if (!files.length) {
    return {
      parsed:          null,
      file:            null,
      shouldGenerate:  false,
      holdReason:      'No files found on this job',
    };
  }

  // 2. Find the material order PDF
  const orderFile = findMaterialOrderFile(files);

  if (!orderFile) {
    const fileNames = files.map(f => f.name || f.filename || 'unnamed').join(', ');
    await addNote(jobId,
      `⚠️ WARRANTY HOLD — Could not identify a material order PDF.\n` +
      `Files found: ${fileNames}\n` +
      `Please upload the material order PDF or manually confirm the product type ` +
      `to trigger warranty generation.`
    );
    return {
      parsed:          null,
      file:            null,
      shouldGenerate:  false,
      holdReason:      'No material order PDF identified among job files',
    };
  }

  // 3. Download and parse
  const fileUrl = orderFile.url || orderFile.download_url || orderFile.file_url;
  const pdfBuffer = await downloadFile(fileUrl);
  const parsed    = await parseMaterialOrderPdf(pdfBuffer);

  console.log(
    `[material-parser] Job ${jobId} — ` +
    `product: ${parsed.productKey}, confidence: ${parsed.confidence}, ` +
    `product name: ${parsed.productName}`
  );

  // 4. Confidence gate
  if (parsed.confidence === 'high') {
    return { parsed, file: orderFile, shouldGenerate: true, holdReason: null };
  }

  // MEDIUM or LOW — add a note asking for clarification, do not auto-generate
  const uncertaintyList = (parsed.uncertainties || []).join(', ') || 'product type unclear';

  const noteLines = [
    `⚠️ WARRANTY HOLD — Material order parsed but confidence is ${parsed.confidence.toUpperCase()}.`,
    ``,
    `What was detected:`,
    `  Product:      ${parsed.productName || 'Unknown'}`,
    `  Manufacturer: ${parsed.manufacturer || 'Unknown'}`,
    `  Supplier:     ${parsed.supplier || 'Unknown'}`,
    `  Squares:      ${parsed.squares ?? 'Not found'}`,
    `  Uncertain:    ${uncertaintyList}`,
    ``,
  ];

  if (parsed.confidence === 'medium') {
    // Give specific guidance based on what's uncertain
    if ((parsed.uncertainties || []).some(u => /ply/i.test(u))) {
      noteLines.push(`ACTION NEEDED: Please confirm whether this tile job used a 1-ply or 2-ply underlayment system.`);
    } else if ((parsed.uncertainties || []).some(u => /seam.?height/i.test(u))) {
      noteLines.push(`ACTION NEEDED: Please confirm the standing seam height (1", 1.5", 1.75", or 2").`);
    } else {
      noteLines.push(`ACTION NEEDED: Please confirm the product type so the warranty can be generated.`);
    }
    noteLines.push(`Once confirmed, reply to this note or re-trigger from the warranty dashboard.`);
  } else {
    noteLines.push(`ACTION NEEDED: The material order could not be read clearly.`);
    noteLines.push(`Please manually specify the product type or re-upload a clearer PDF.`);
  }

  await addNote(jobId, noteLines.join('\n'));

  return {
    parsed,
    file:            orderFile,
    shouldGenerate:  false,
    holdReason:      `Confidence ${parsed.confidence}: ${uncertaintyList}`,
  };
}

module.exports = { parseMaterialOrderForJob, parseMaterialOrderPdf, findMaterialOrderFile };
