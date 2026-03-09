/**
 * GET /api/health
 * Simple liveness check — confirms the service is running and env vars are set.
 */

require('dotenv').config();

module.exports = function handler(req, res) {
  const checks = {
    jobnimbus_key: !!process.env.JOBNIMBUS_API_KEY,
    batchdata_key: !!process.env.BATCHDATA_API_KEY,
    batchdata_mock: process.env.BATCHDATA_MOCK === 'true',
    webhook_secret_configured: !!(
      process.env.WEBHOOK_SECRET &&
      process.env.WEBHOOK_SECRET !== 'YOUR_RANDOM_WEBHOOK_SECRET'
    ),
  };

  return res.status(200).json({
    status: 'ok',
    service: 'Rhino Roofs NOC Automation',
    checks,
    timestamp: new Date().toISOString(),
  });
};
