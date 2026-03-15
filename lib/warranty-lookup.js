/**
 * Rhino Roofs — Warranty Lookup Table
 *
 * Maps identified product types to workmanship warranty terms and
 * manufacturer warranty details. Claude reads the material order PDF
 * and returns a product key; this module resolves it to the full
 * warranty spec used on the certificate.
 *
 * ─── Workmanship Warranty Terms ────────────────────────────────────────────
 *   Metal  — 5V Crimp:      10 years
 *   Metal  — Standing Seam: 15 years  (all seam heights: 1", 1.5", 1.75", 2")
 *   Shingle — Standard:     10 years
 *   Shingle — GAF Master Elite (when certified): 25 years
 *   Shingle — OC Preferred  (when certified):    25 years
 *   Tile   — 1-Ply system:  10 years
 *   Tile   — 2-Ply system:  12 years
 */

// ─── Contractor certification flags ─────────────────────────────────────────
// Flip these to true once the certifications are obtained.
// They override the standard shingle workmanship term.
const CERTIFICATIONS = {
  gafMasterElite:       false, // GAF Master Elite → 25yr workmanship
  owensCorningPreferred: false, // OC Preferred Contractor → 25yr workmanship
};

// ─── Lookup table ─────────────────────────────────────────────────────────────
// Keys are the canonical product identifiers Claude returns in its JSON response.
const WARRANTY_TABLE = {

  // ── Metal: Exposed Fastener ───────────────────────────────────────────────
  metal_5v_crimp: {
    category:         'Metal Roofing',
    label:            '5V Crimp Metal Roof Panel',
    workmanshipYears: 10,
    panelType:        'Exposed Fastener',
    // 5V crimp is typically their own stock or Drexel / Dyme — no Englert mfg warranty
    mfgWarranty:      null,
    keywords:         ['5v', '5-v', 'five v', '5v crimp', 'exposed fastener', '5v panel'],
  },

  // ── Metal: Standing Seam (all heights) ────────────────────────────────────
  metal_standing_seam: {
    category:         'Metal Roofing',
    label:            'Standing Seam Metal Roof Panel',
    workmanshipYears: 15,
    panelType:        'Standing Seam',
    seamHeights:      ['1"', '1.5"', '1-1/2"', '1.75"', '1-3/4"', '2"'],
    // Englert paint warranty: 40yr PVDF / 35yr SMP (applied at certificate time if supplier = Englert)
    mfgWarranty: {
      englert: { paintYears: 40, substrateYears: 40, finish: 'PVDF' },
      drexel:  { paintYears: 35, substrateYears: 35, finish: 'SMP'  },
      dyme:    null, // local supplier, no mfg warranty program
      own:     null, // Rhino-manufactured — workmanship only
    },
    keywords: [
      'standing seam', 'snap lock', 'snap-lock', 'snaplock',
      'mechanical seam', 'batten seam', 'concealed fastener',
      '1 inch seam', '1.5 inch', '1-1/2', '1 3/4', '1.75', '2 inch seam',
      'englert', 'drexel', 'dyme',
    ],
  },

  // ── Shingles: GAF ─────────────────────────────────────────────────────────
  shingle_gaf: {
    category:         'Asphalt Shingles',
    label:            'GAF Architectural Shingles',
    get workmanshipYears() {
      return CERTIFICATIONS.gafMasterElite ? 25 : 10;
    },
    certificationNote: CERTIFICATIONS.gafMasterElite
      ? 'GAF Master Elite® Certified Contractor — 25-Year Workmanship Warranty'
      : null,
    mfgWarranty: {
      standard:    { years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
      // Product-line overrides (Claude fills product name; these are informational)
      products: {
        'Timberline HDZ':   { years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
        'Timberline AS':    { years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
        'Timberline CS':    { years: 'Limited Lifetime', windMph: 150, algaeYears: 25 },
        'Timberline Ultra': { years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
        'Royal Sovereign':  { years: '25-Year Limited',  windMph: 60,  algaeYears: 0  },
      },
    },
    keywords: ['gaf', 'timberline', 'hdz', 'royal sovereign', 'gaf shingle', 'gaf architectural'],
  },

  // ── Shingles: Owens Corning ───────────────────────────────────────────────
  shingle_owens_corning: {
    category:         'Asphalt Shingles',
    label:            'Owens Corning Architectural Shingles',
    get workmanshipYears() {
      return CERTIFICATIONS.owensCorningPreferred ? 25 : 10;
    },
    certificationNote: CERTIFICATIONS.owensCorningPreferred
      ? 'Owens Corning Preferred Contractor™ — 25-Year Workmanship Warranty'
      : null,
    mfgWarranty: {
      standard: { years: 'Limited Lifetime', windMph: 130, algaeYears: 10 },
      products: {
        'Duration':             { years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
        'TruDefinition Duration':{ years: 'Limited Lifetime', windMph: 130, algaeYears: 25 },
        'Oakridge':             { years: 'Limited Lifetime', windMph: 110, algaeYears: 10 },
        'Berkshire':            { years: 'Limited Lifetime', windMph: 110, algaeYears: 25 },
      },
    },
    keywords: [
      'owens corning', 'owens-corning', 'duration', 'oakridge',
      'trudef', 'tru definition', 'berkshire', 'oc shingle',
    ],
  },

  // ── Tile: 1-Ply System ────────────────────────────────────────────────────
  tile_one_ply: {
    category:         'Concrete / Clay Tile',
    label:            'Tile Roof — 1-Ply Underlayment System',
    workmanshipYears: 10,
    plySystem:        '1-Ply',
    mfgWarranty: {
      westlake: { years: 50, coverage: 'Limited — material defects and manufacturing flaws' },
    },
    keywords: [
      'tile', 'concrete tile', 'clay tile', 'westlake', 'saxony', 'majestic', 'villa',
      '1 ply', '1-ply', 'one ply', 'single ply',
      // If no ply keyword found on a tile job → default to 1-ply (flag for review)
    ],
  },

  // ── Tile: 2-Ply System ────────────────────────────────────────────────────
  tile_two_ply: {
    category:         'Concrete / Clay Tile',
    label:            'Tile Roof — 2-Ply Underlayment System',
    workmanshipYears: 12,
    plySystem:        '2-Ply',
    mfgWarranty: {
      westlake: { years: 50, coverage: 'Limited — material defects and manufacturing flaws' },
    },
    keywords: [
      '2 ply', '2-ply', 'two ply', 'double ply', 'two-ply',
      'bur', 'modified bitumen', 'hot mop', // common 2-ply underlayment terms for tile
    ],
  },
};

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Resolve a product key to its full warranty spec.
 * Returns null if the key is not in the table.
 *
 * @param {string} productKey  e.g. "metal_standing_seam"
 * @returns {Object|null}
 */
function getWarrantySpec(productKey) {
  const spec = WARRANTY_TABLE[productKey];
  if (!spec) return null;

  return {
    ...spec,
    // Evaluate any getter-based dynamic fields (certifications)
    workmanshipYears: spec.workmanshipYears,
    productKey,
  };
}

/**
 * All valid product keys — used to validate Claude's response.
 */
const VALID_PRODUCT_KEYS = Object.keys(WARRANTY_TABLE);

/**
 * Human-readable summary of all current warranty terms.
 * Useful for logging or debugging.
 */
function summarizeWarranties() {
  return VALID_PRODUCT_KEYS.map(key => {
    const spec = getWarrantySpec(key);
    return `${key}: ${spec.label} → ${spec.workmanshipYears}yr workmanship`;
  });
}

module.exports = {
  getWarrantySpec,
  VALID_PRODUCT_KEYS,
  CERTIFICATIONS,
  summarizeWarranties,
};
