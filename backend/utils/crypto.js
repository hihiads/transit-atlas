import { hash, verify } from '@node-rs/argon2';
import crypto from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

let generatedPepper;

export async function ensurePasswordPepper() {
  if (process.env.PASSWORD_PEPPER) return process.env.PASSWORD_PEPPER;
  if (!generatedPepper) generatedPepper = (async () => {
    const file = join(process.cwd(), 'backend', 'data', 'password-pepper.key');
    await mkdir(join(process.cwd(), 'backend', 'data'), { recursive: true });
    try {
      return (await readFile(file, 'utf8')).trim();
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const value = crypto.randomBytes(48).toString('base64url');
      try {
        await writeFile(file, value, { flag: 'wx', mode: 0o600 });
        return value;
      } catch (writeError) {
        if (writeError.code !== 'EEXIST') throw writeError;
        return (await readFile(file, 'utf8')).trim();
      }
    }
  })();
  return generatedPepper;
}

export async function hashPassword(password) {
  const pepperedPassword = password + await ensurePasswordPepper();
  return await hash(pepperedPassword, ARGON2_OPTIONS);
}

export async function verifyPassword(password, passwordHash) {
  const pepperedPassword = password + await ensurePasswordPepper();
  return await verify(passwordHash, pepperedPassword);
}

export function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
