import { isDev } from '../config/env.js';
import nodemailer from 'nodemailer';

const transporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: Number(process.env.SMTP_PORT) === 465,
  requireTLS: !isDev,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  disableFileAccess: true,
  disableUrlAccess: true
});

async function send(to, subject, link, action, language) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.SMTP_FROM || !process.env.APP_BASE_URL) {
    if (isDev) return false;
    throw new Error('SMTP nije konfiguriran');
  }
  const destination = new URL(link, process.env.APP_BASE_URL);
  if (!isDev && destination.protocol !== 'https:') {
    throw new Error('Production email links require HTTPS');
  }
  const url = destination.toString();
  const next = language === 'en' ? 'Continue' : 'Nastavi';
  const expiry = language === 'en'
    ? 'This link expires. If you did not request this email, you can ignore it.'
    : 'Veza vrijedi ograničeno vrijeme. Ako niste zatražili ovu poruku, zanemarite je.';
  await transporter().sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text: `${action}: ${url}`,
    html: `<div lang="${language === 'en' ? 'en' : 'hr'}"><p>${action}</p><p><a href="${url}">${next}</a></p><p>${expiry}</p></div>`
  });
  return true;
}

export const sendVerificationEmail = (to, token, language) => send(
  to,
  language === 'en' ? 'Verify your Transitly account' : 'Potvrdite Transitly račun',
  `/verify-email#token=${encodeURIComponent(token)}`,
  language === 'en' ? 'Verify your email address' : 'Potvrdite email adresu',
  language
);
export const sendPasswordResetEmail = (to, token, language) => send(
  to,
  language === 'en' ? 'Reset your Transitly password' : 'Promjena lozinke za Transitly',
  `/reset-password#token=${encodeURIComponent(token)}`,
  language === 'en' ? 'Reset your password' : 'Promijenite lozinku',
  language
);

export const sendParentalConsentEmail = (to, token, language) => send(
  to,
  language === 'en' ? 'Parental consent for Transitly' : 'Potvrda roditelja/skrbnika za Transitly',
  `/confirm-parent#token=${encodeURIComponent(token)}`,
  language === 'en' ? 'Confirm that your child may use Transitly' : 'Potvrdite da dopuštate djetetu korištenje Transitlyja',
  language
);
