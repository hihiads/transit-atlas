import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

const settingsFile = process.env.ADMIN_SETTINGS_FILE || join(process.cwd(), 'backend', 'data', 'runtime-settings.json');
let settings = {
  loginEnabled: process.env.AUTH_LOGIN_ENABLED !== 'false',
  registrationEnabled: process.env.AUTH_REGISTRATION_ENABLED !== 'false',
  googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID) && process.env.AUTH_GOOGLE_ENABLED !== 'false',
  appleEnabled: Boolean(process.env.APPLE_CLIENT_ID) && process.env.AUTH_APPLE_ENABLED !== 'false'
};

export function getRuntimeSettings() {
  return { ...settings };
}

export function isAuthenticationEnabled() {
  return settings.loginEnabled || settings.registrationEnabled;
}

export async function loadRuntimeSettings() {
  try {
    const stored = JSON.parse(await readFile(settingsFile, 'utf8'));
    if (typeof stored.loginEnabled !== 'boolean' || typeof stored.registrationEnabled !== 'boolean') {
      throw new Error('Neispravne postavke administratora');
    }
    settings = {
      loginEnabled: stored.loginEnabled,
      registrationEnabled: stored.registrationEnabled,
      googleEnabled: typeof stored.googleEnabled === 'boolean' ? stored.googleEnabled : Boolean(process.env.GOOGLE_CLIENT_ID),
      appleEnabled: typeof stored.appleEnabled === 'boolean' ? stored.appleEnabled : Boolean(process.env.APPLE_CLIENT_ID)
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return getRuntimeSettings();
}

export async function saveRuntimeSettings(next) {
  const contents = JSON.stringify(next, null, 2);
  await mkdir(dirname(settingsFile), { recursive: true });
  const temporaryFile = `${settingsFile}.tmp`;
  await writeFile(temporaryFile, contents, { mode: 0o600 });
  await rename(temporaryFile, settingsFile);
  settings = { ...next };
  return getRuntimeSettings();
}

export function missingAuthenticationEnvironment(next = settings) {
  return ['MONGODB_URI', 'ADMIN_PANEL_PASSWORD'].filter(key => !process.env[key]);
}
