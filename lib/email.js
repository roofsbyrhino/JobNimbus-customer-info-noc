/**
 * Email sender using Resend (https://resend.com)
 *
 * Sign up free at resend.com — 100 emails/day on the free tier.
 * Set RESEND_API_KEY in your environment / Vercel project settings.
 */

const axios = require('axios');

const FROM_ADDRESS = 'Rhino Roofs Reports <reports@rhinoroofs.com>';

/**
 * Send an email with an optional file attachment.
 *
 * @param {Object}  opts
 * @param {string|string[]} opts.to              Recipient(s)
 * @param {string}  opts.subject                 Email subject line
 * @param {string}  opts.html                    HTML body
 * @param {Buffer}  [opts.attachmentBuffer]       File to attach
 * @param {string}  [opts.attachmentFilename]     Filename for the attachment
 */
async function sendEmail({ to, subject, html, attachmentBuffer, attachmentFilename }) {
  const recipients = Array.isArray(to) ? to : [to];

  const payload = {
    from:    FROM_ADDRESS,
    to:      recipients,
    subject,
    html,
  };

  if (attachmentBuffer && attachmentFilename) {
    payload.attachments = [{
      filename: attachmentFilename,
      content:  attachmentBuffer.toString('base64'),
    }];
  }

  const { data } = await axios.post('https://api.resend.com/emails', payload, {
    headers: {
      Authorization:  `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  return data;
}

module.exports = { sendEmail };
