import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoose from 'mongoose';
import { createHash } from 'crypto';
import { connectDatabase } from '../config/database.js';
import { missingAuthenticationEnvironment } from '../config/runtimeSettings.js';
import { ensurePasswordPepper } from '../utils/crypto.js';
import { isNativeAppOrigin } from '../config/origins.js';

let sessionMiddleware;
let sessionCollection;

export function getAuthenticationSessionMiddleware() {
  if (!sessionMiddleware) return undefined;
  return (req, res, next) => sessionMiddleware(req, res, error => {
    if (error) return next(error);
    if (isNativeAppOrigin(req.get('origin')) && req.session) req.session.cookie.sameSite = 'none';
    next();
  });
}

export async function activateAuthentication() {
  const missing = missingAuthenticationEnvironment();
  if (missing.length) throw new Error(`Nedostaju postavke: ${missing.join(', ')}`);
  if (mongoose.connection.readyState !== 1) await connectDatabase();
  await ensurePasswordPepper();
  if (sessionMiddleware) return;
  const store = MongoStore.create({
    clientPromise: Promise.resolve(mongoose.connection.getClient()),
    touchAfter: 24 * 3600
  });
  sessionCollection = await store.collectionP;
  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || createHash('sha256').update(`transit-session:${process.env.ADMIN_PANEL_PASSWORD}`).digest('hex'),
    resave: false,
    saveUninitialized: false,
    store,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 },
    name: 'sessionId',
    rolling: true
  });
}

export async function deleteUserSessions(userId) {
  if (!sessionCollection) return;
  await sessionCollection.deleteMany({ session: { $regex: `"userId":"${userId}"` } });
}
