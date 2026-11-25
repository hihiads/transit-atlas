import 'dotenv/config';

export const isDev = process.env.NODE_ENV === 'development';

export function hasStrongAdminPassword() {
  const password = process.env.ADMIN_PANEL_PASSWORD;
  return Boolean(password && password.trim().length >= 24 && password.length <= 256 && !password.startsWith('replace-with-'));
}
