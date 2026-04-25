const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host: 'smtp.office365.com',
  port: 587,
  secure: false, // TLS via STARTTLS — do NOT use port 465 for Office365
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    ciphers: 'SSLv3',
    rejectUnauthorized: false
  }
});

async function sendEmail() {
  const info = await transporter.sendMail({
    from: `"Gova Funding" <${process.env.SMTP_FROM}>`,
    to: 'gova.funding.7@gmail.com',
    subject: 'Test Email from Exchange Plan 1',
    text: 'Plain text body here.',
    html: '<p>HTML body here.</p>'
  });

  console.log('✅ Message sent:', info.messageId);
}

sendEmail().catch(console.error);