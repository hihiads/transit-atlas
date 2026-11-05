import nodemailer from 'nodemailer';

const transporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  disableFileAccess: true,
  disableUrlAccess: true
});

async function send(to, subject, link, action) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM || !process.env.APP_BASE_URL) {
    if (process.env.NODE_ENV !== 'production') return false;
    throw new Error('SMTP nije konfiguriran');
  }
  const url = new URL(link, process.env.APP_BASE_URL).toString();
  await transporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: `${action}: ${url}`,
    html: `<p>${action}</p><p><a href="${url}">Nastavi</a></p><p>Veza vrijedi ograničeno vrijeme. Ako niste zatražili ovu poruku, zanemarite je.</p>`
  });
  return true;
}

export const sendVerificationEmail = (to, token) => send(to, 'Potvrdite Transit Atlas račun', `/verify-email?token=${encodeURIComponent(token)}`, 'Potvrdite email adresu');
export const sendPasswordResetEmail = (to, token) => send(to, 'Promjena lozinke za Transit Atlas', `/reset-password?token=${encodeURIComponent(token)}`, 'Promijenite lozinku');
