const { sendEmail } = require('../lib/email');

const LEAD_TO = process.env.LEAD_EMAIL
  || 'info@roofsbyrhino.com';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const d = req.body || {};

  const name    = `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Unknown';
  const email   = d.email   || '—';
  const phone   = d.phone   || '—';
  const address = d.address || '—';
  const product = d.selectedProduct || d.roofingType || '—';
  const color   = d.selectedColor   || '—';
  const mfg     = d.manufacturer    || '—';
  const bestTime= d.bestTime  || '—';
  const message = d.message   || '';
  const ts      = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

  console.log(`[submit-lead] New lead: ${name} | ${phone} | ${email} | ${product}`);

  if (!LEAD_TO) {
    // Should not happen — info@roofsbyrhino.com is the default above
    console.warn('[submit-lead] No lead email resolved — lead logged only');
    return res.status(200).json({ success: true });
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f4; margin: 0; padding: 24px; }
    .card { background: #fff; border-radius: 12px; overflow: hidden; max-width: 600px; margin: 0 auto; box-shadow: 0 4px 20px rgba(0,0,0,.1); }
    .hdr  { background: #111; padding: 24px; text-align: center; }
    .hdr h1 { color: #F07E26; margin: 0; font-size: 22px; }
    .hdr p  { color: rgba(255,255,255,.6); margin: 6px 0 0; font-size: 13px; }
    .body { padding: 28px; }
    .badge { display: inline-block; background: rgba(240,126,38,.12); border: 1px solid #F07E26; color: #d96b15; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; margin-bottom: 18px; }
    h2   { font-size: 20px; margin: 0 0 4px; color: #111; }
    .sub { color: #666; font-size: 14px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; }
    td   { padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; }
    td:first-child { font-weight: 700; color: #333; width: 38%; }
    td:last-child  { color: #555; }
    .highlight td  { background: rgba(240,126,38,.06); }
    .highlight td:first-child { color: #F07E26; }
    .msg  { margin-top: 18px; padding: 14px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #F07E26; font-size: 14px; color: #444; }
    .msg-label { font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: #999; margin-bottom: 6px; }
    .cta  { margin-top: 24px; text-align: center; }
    .cta a { background: #F07E26; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; }
    .ftr  { background: #f9f9f9; padding: 16px 24px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
  </style>
</head>
<body>
<div class="card">
  <div class="hdr">
    <h1>🦏 Rhino Roofs — New Lead</h1>
    <p>Roof Visualizer · ${ts} ET</p>
  </div>
  <div class="body">
    <div class="badge">🎨 Roof Visualizer Lead</div>
    <h2>${name}</h2>
    <div class="sub">Requesting a Free 3D Roof Design</div>
    <table>
      <tr><td>📞 Phone</td><td><a href="tel:${phone}">${phone}</a></td></tr>
      <tr><td>📧 Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
      <tr><td>🏠 Address</td><td>${address}</td></tr>
      <tr><td>⏰ Best Time</td><td>${bestTime}</td></tr>
      <tr class="highlight"><td>🏗️ Product</td><td><strong>${product}</strong></td></tr>
      <tr class="highlight"><td>🎨 Color</td><td>${color}</td></tr>
      <tr class="highlight"><td>🏭 Manufacturer</td><td>${mfg}</td></tr>
    </table>
    ${message ? `<div class="msg"><div class="msg-label">Customer Notes</div>${message}</div>` : ''}
    <div class="cta">
      <a href="tel:${phone}">📞 Call ${name.split(' ')[0]} Now</a>
    </div>
  </div>
  <div class="ftr">Rhino Roofs · RoofsbyRhino.com · This lead came from the Roof Visualizer tool.</div>
</div>
</body>
</html>`;

  try {
    await sendEmail({
      to:      LEAD_TO,
      subject: `🦏 New Roof Visualizer Lead — ${name} (${product})`,
      html,
    });
  } catch (err) {
    console.error('[submit-lead] Email failed:', err.message);
    // Still return success to client — don't fail the UX over email issues
  }

  return res.status(200).json({ success: true });
};
