import { createHmac, timingSafeEqual } from 'node:crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const secret = process.env.ADMIN_TOTP_SECRET?.trim().toUpperCase();
const key = /^[A-Z2-7]{32}$/.test(secret || '') ? Buffer.alloc(20) : null;
if (key) {
  for (let offset = 0; offset < secret.length; offset += 8) {
    const block = secret.slice(offset, offset + 8);
    let value = 0;
    for (const letter of block) value = value * 32 + alphabet.indexOf(letter);
    key.writeUIntBE(value, offset / 8 * 5, 5);
  }
}

export const adminTotpConfigured = Boolean(key);

// A single instance owns the admin sessions and replay protection.
let lastAcceptedStep = -1n;

export function consumeAdminTotp(code) {
  if (!key || typeof code !== 'string' || !/^\d{6}$/.test(code)) return false;
  const currentStep = BigInt(Math.floor(Date.now() / 30_000));
  const counter = Buffer.alloc(8);
  const candidate = Buffer.from(code);
  for (const step of [currentStep, currentStep - 1n, currentStep + 1n]) {
    if (step <= lastAcceptedStep) continue;
    counter.writeBigUInt64BE(step);
    const digest = createHmac('sha1', key).update(counter).digest();
    const offset = digest[digest.length - 1] & 15;
    const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
    const expected = Buffer.from(String(value).padStart(6, '0'));
    if (timingSafeEqual(candidate, expected)) {
      lastAcceptedStep = step;
      return true;
    }
  }
  return false;
}
