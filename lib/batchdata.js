/**
 * BatchData API client
 * Docs: https://batchdata.com/docs
 *
 * Set BATCHDATA_MOCK=true in .env to use sample data without a live API key.
 */

const axios = require('axios');

const BASE_URL = 'https://api.batchdata.com/api/v1';

/**
 * Returns mocked property data that mirrors the shape of a real BatchData
 * response. Replace individual fields here to test different NOC scenarios.
 */
function getMockPropertyData(address) {
  return {
    address: {
      full: address || '1234 Mockingbird Lane, Port Saint Lucie, FL 34952',
      street: '1234 Mockingbird Lane',
      city: 'Port Saint Lucie',
      state: 'FL',
      zip: '34952',
      county: 'St. Lucie',
    },
    parcel: {
      apn: '3415-500-0042-000-5',            // Tax Folio / APN
      legalDescription:
        'LOT 42, BLOCK 500, PORT ST LUCIE SECTION 15, ACCORDING TO THE ' +
        'PLAT THEREOF AS RECORDED IN PLAT BOOK 13, PAGE 67, OF THE ' +
        'PUBLIC RECORDS OF ST. LUCIE COUNTY, FLORIDA.',
    },
    owner: {
      fullName: 'JOHN A HOMEOWNER',
      mailingAddress: {
        full: '1234 Mockingbird Lane, Port Saint Lucie, FL 34952',
        street: '1234 Mockingbird Lane',
        city: 'Port Saint Lucie',
        state: 'FL',
        zip: '34952',
      },
    },
    mortgage: {
      lenderName: 'ROCKET MORTGAGE LLC',
      loanAmount: 285000,
      recordingDate: '2021-06-15',
    },
    valuation: {
      estimatedValue: 340000,
      assessedValue: 298000,
    },
    structure: {
      yearBuilt: 2002,
      roofAge: 22,             // calculated as current year - yearBuilt (approx)
    },
  };
}

/**
 * Fetch property data from BatchData by address.
 *
 * @param {string} address  Full property address string
 * @returns {Object}        Normalized property data object
 */
async function getPropertyData(address) {
  if (process.env.BATCHDATA_MOCK === 'true') {
    console.log('[BatchData] MOCK mode — returning sample property data');
    return getMockPropertyData(address);
  }

  const { data } = await axios.post(
    `${BASE_URL}/property/search`,
    { address },
    {
      headers: {
        Authorization: `Bearer ${process.env.BATCHDATA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  // Normalize the live BatchData response into our standard shape.
  // BatchData returns results[0] for a single-address lookup.
  const result = data?.results?.[0];
  if (!result) {
    throw new Error(`BatchData returned no results for address: ${address}`);
  }

  return {
    address: {
      full: result.address?.formattedAddress || address,
      street: result.address?.street,
      city: result.address?.city,
      state: result.address?.state,
      zip: result.address?.zip,
      county: result.address?.county,
    },
    parcel: {
      apn: result.parcel?.apn || result.parcel?.taxId,
      legalDescription: result.parcel?.legalDescription,
    },
    owner: {
      fullName: result.owner?.fullName,
      mailingAddress: {
        full: result.owner?.mailingAddress?.formattedAddress,
        street: result.owner?.mailingAddress?.street,
        city: result.owner?.mailingAddress?.city,
        state: result.owner?.mailingAddress?.state,
        zip: result.owner?.mailingAddress?.zip,
      },
    },
    mortgage: {
      lenderName: result.mortgage?.lenderName,
      loanAmount: result.mortgage?.loanAmount,
      recordingDate: result.mortgage?.recordingDate,
    },
    valuation: {
      estimatedValue: result.valuation?.estimatedValue,
      assessedValue: result.valuation?.assessedValue,
    },
    structure: {
      yearBuilt: result.structure?.yearBuilt,
      roofAge: result.structure?.roofAge,
    },
  };
}

module.exports = { getPropertyData };
