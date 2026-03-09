/**
 * Rhino Roofs contractor information for the Florida NOC form.
 *
 * ─── HOW TO FILL THIS IN ──────────────────────────────────────────────────────
 * Replace every "PLACEHOLDER" value with your real information before going live.
 * These values are printed directly onto the NOC PDF.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CONTRACTOR = {
  companyName: 'Rhino Roofs',
  ownerName: 'PLACEHOLDER – Owner Full Legal Name',
  licenseNumber: 'PLACEHOLDER – FL Contractor License # (e.g. CCC1234567)',

  address: {
    street: 'PLACEHOLDER – Street Address',
    city: 'Port Saint Lucie',
    state: 'FL',
    zip: 'PLACEHOLDER – ZIP',
    full: 'PLACEHOLDER – Full Address, Port Saint Lucie, FL XXXXX',
  },

  phone: 'PLACEHOLDER – (772) 000-0000',
  fax: '',

  insurance: {
    carrier: 'PLACEHOLDER – Insurance Carrier Name',
    policyNumber: 'PLACEHOLDER – Policy Number',
    expirationDate: 'PLACEHOLDER – MM/DD/YYYY',
  },

  bond: {
    // Leave these blank if you are not bonded.
    suretyCo: '',
    bondAmount: '',
    bondNumber: '',
  },
};

module.exports = CONTRACTOR;
