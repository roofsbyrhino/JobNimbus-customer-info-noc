/**
 * PropertyRadar API client
 * Docs: https://developers.propertyradar.com/
 * Help: https://help.propertyradar.com/en/articles/8769755-searching-using-the-api
 *
 * Set PROPERTYRADAR_MOCK=true in .env to use sample data without a live API key.
 *
 * FIELD NAME NOTE: PropertyRadar's full field list is only accessible after
 * activating an API subscription. The field names used in normalizeResponse()
 * below are based on their published webhook schema and help articles.
 * If a field comes back undefined, log `result` and adjust the mapping.
 * Activate the 30-day API trial: https://help.propertyradar.com/en/articles/8309200-how-to-activate-30-day-api-trial
 */

const axios = require('axios');

const BASE_URL = 'https://api.propertyradar.com/v1';

/**
 * Returns mocked property data that mirrors the shape of a real PropertyRadar
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
 * Parse a full address string into components for the Criteria array.
 * Handles formats like "123 Main St, City, FL 34952" or "123 Main St City FL 34952".
 */
function parseAddress(address) {
  // Try "Street, City, State Zip" format first
  const match = address.match(/^(.+?),\s*(.+?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
  if (match) {
    return { street: match[1].trim(), city: match[2].trim(), state: match[3].toUpperCase(), zip: match[4] };
  }
  // Fallback: pass the full string as SiteAddress and let PropertyRadar parse it
  return { street: address, city: null, state: null, zip: null };
}

/**
 * Normalize a PropertyRadar property object into our standard shape.
 * Field names sourced from PropertyRadar's published webhook/API schema.
 * Reference: https://help.propertyradar.com/en/articles/7117007-working-with-webhooks
 */
function normalizeResponse(result, originalAddress) {
  const ownerFirst = result.OwnerFirstName || '';
  const ownerLast  = result.OwnerLastName  || '';
  const ownerFull  = result.LegalOwner || [ownerFirst, ownerLast].filter(Boolean).join(' ') || null;

  const streetNum  = result.SiteHouseNumber || '';
  const streetName = result.SiteStreet      || result.Address || '';
  const siteStreet = [streetNum, streetName].filter(Boolean).join(' ').trim() || null;

  const mailNum    = result.MailingHouseNumber || '';
  const mailStreet = result.MailingStreet      || result.MailingAddress || '';
  const mailFull   = result.MailingFullAddress ||
    [mailNum, mailStreet, result.MailingCity, result.MailingState, result.MailingZip]
      .filter(Boolean).join(', ') || null;

  const yearBuilt  = result.YearBuilt ? parseInt(result.YearBuilt, 10) : null;
  const roofAge    = yearBuilt ? new Date().getFullYear() - yearBuilt : null;

  return {
    address: {
      full:   result.SiteFullAddress || originalAddress,
      street: siteStreet,
      city:   result.SiteCity   || result.City,
      state:  result.SiteState  || result.State,
      zip:    result.SiteZip    || result.Zip,
      county: result.County,
    },
    parcel: {
      apn:              result.APN,
      legalDescription: result.LegalDescription,
    },
    owner: {
      fullName: ownerFull,
      mailingAddress: {
        full:   mailFull,
        street: [mailNum, mailStreet].filter(Boolean).join(' ').trim() || null,
        city:   result.MailingCity,
        state:  result.MailingState,
        zip:    result.MailingZip,
      },
    },
    mortgage: {
      lenderName:    result.LenderName   || result.Lender,
      loanAmount:    result.LoanAmount   ? Number(result.LoanAmount)   : null,
      recordingDate: result.LoanDate     || result.RecordingDate,
    },
    valuation: {
      estimatedValue: result.EstimatedValue ? Number(result.EstimatedValue) : null,
      assessedValue:  result.AssessedValue  ? Number(result.AssessedValue)  : null,
    },
    structure: {
      yearBuilt,
      roofAge,
    },
  };
}

/**
 * Fetch property data from PropertyRadar by address.
 *
 * PropertyRadar uses a "Criteria" array to filter properties. We search by
 * site address components (street, city, state) with a limit of 1 result.
 * Purchase=1 deducts a record credit; set Purchase=0 to test result counts
 * without spending credits.
 *
 * @param {string} address  Full property address string
 * @returns {Object}        Normalized property data object
 */
async function getPropertyData(address) {
  if (process.env.PROPERTYRADAR_MOCK === 'true') {
    console.log('[PropertyRadar] MOCK mode — returning sample property data');
    return getMockPropertyData(address);
  }

  const parsed = parseAddress(address);

  const criteria = [
    { name: 'SiteAddress', value: [parsed.street] },
  ];
  if (parsed.city)  criteria.push({ name: 'SiteCity',  value: [parsed.city] });
  if (parsed.state) criteria.push({ name: 'SiteState', value: [parsed.state] });
  if (parsed.zip)   criteria.push({ name: 'SiteZip',   value: [parsed.zip] });

  const { data } = await axios.post(
    `${BASE_URL}/properties`,
    {
      Purchase: 1,
      Limit: 1,
      Criteria: criteria,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.PROPERTYRADAR_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    }
  );

  // PropertyRadar returns { properties: [...] } or { results: [...] }
  const properties = data?.properties || data?.results || [];
  const result = properties[0];
  if (!result) {
    throw new Error(`PropertyRadar returned no results for address: ${address}`);
  }

  return normalizeResponse(result, address);
}

module.exports = { getPropertyData };
