import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';


const zagrebDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zagreb', year: 'numeric', month: '2-digit', day: '2-digit' });

export const dashboardDefaults = { hideLiveVehicles: false, pauseReports: false, statusMessage: '' };
let settings = dashboardDefaults;
let settingsRefresh = 0;
let reading;

export async function dashboardCollection(name) {
  await connectDatabase();
  return mongoose.connection.db.collection(name);
}

export async function readDashboardSettings() {
  if (!process.env.MONGODB_URI || Date.now() < settingsRefresh) return settings;
  reading ??= (async () => {
    try {
      const current = await (await dashboardCollection('dashboard_settings')).findOne({ _id: 'main' }, { maxTimeMS: 2000 });
      settings = {
        hideLiveVehicles: current?.hideLiveVehicles === true,
        pauseReports: current?.pauseReports === true,
        statusMessage: typeof current?.statusMessage === 'string' ? current.statusMessage : ''
      };
    } catch (error) {
      console.error('[dashboard settings]', error.name);
    } finally {
      settingsRefresh = Date.now() + 5000;
      reading = undefined;
    }
    return settings;
  })();
  return reading;
}

export async function saveDashboardSettings(next) {
  await reading;
  await (await dashboardCollection('dashboard_settings')).replaceOne({ _id: 'main' }, { _id: 'main', ...next }, { upsert: true });
  settings = next;
  settingsRefresh = Date.now() + 5000;
}

export function cleanText(value, max) {
  return typeof value === 'string' && value.trim().length <= max ? value.trim() : null;
}

export function parseBulletin(input, now = Date.now()) {
  const { kind, audience, level, line, startsAt, expiresAt } = input ?? {};
  const text = cleanText(input?.text, 280);
  const textEn = cleanText(input?.textEn ?? '', 280);
  const start = typeof startsAt === 'string' ? Date.parse(startsAt) : NaN;
  const end = typeof expiresAt === 'string' ? Date.parse(expiresAt) : NaN;
  if (!text || textEn === null || !['all', 'zet', 'hzpp'].includes(audience) ||
      !['announcement', 'detour', 'stop', 'replacement'].includes(kind) || !['info', 'warning'].includes(level) ||
      (kind !== 'announcement' && (audience !== 'zet' || typeof line !== 'string' || !/^[A-Za-z0-9-]{1,16}$/.test(line))) ||
      !Number.isFinite(start) || !Number.isFinite(end) || end <= now || end <= start) return null;
  return { kind, audience, level, line: kind === 'announcement' ? null : line, text, textEn, startsAt: new Date(start), expiresAt: new Date(end) };
}

export async function listBulletins(audience) {
  if (!process.env.MONGODB_URI) return [];
  const now = new Date();
  const filter = audience ? { audience: { $in: ['all', audience] }, startsAt: { $lte: now }, expiresAt: { $gt: now } } : {};
  return (await dashboardCollection('dashboard_bulletins')).find(filter, { maxTimeMS: 2000 })
    .sort({ startsAt: audience ? 1 : -1 }).limit(audience ? 20 : 80).toArray();
}

export async function addBulletin(entry) {
  await (await dashboardCollection('dashboard_bulletins')).insertOne({ _id: randomUUID(), ...entry });
}

export async function listRareVehicles() {
  if (!process.env.MONGODB_URI) return [];
  const day = zagrebDate.format(new Date());
  return (await dashboardCollection('dashboard_rare_vehicles')).find({}, { maxTimeMS: 2000 }).sort({ _id: 1 })
    .map(row => ({ ...row, sighting: row.sighting?.day === day ? row.sighting : null })).toArray();
}

export async function markRareVehicles(vehicles) {
  const rare = new Map((await listRareVehicles()).map(row => [row._id, row]));
  if (!rare.size) return;
  const sightings = new Map();
  for (const vehicle of vehicles) {
    const entry = rare.get(vehicle.zetId);
    if (!entry || entry.type !== vehicle.type) continue;
    vehicle.rare = entry.rare !== false;
    vehicle.model = entry.model;
    if (entry.garageNumber) vehicle.garageNumber = entry.garageNumber;
    vehicle.modelSource = entry.source;
    if (!vehicle.rare || !Number.isFinite(vehicle.lastUpdate)) continue;
    const seenAt = new Date(vehicle.lastUpdate);
    if (+seenAt <= +(entry.sighting?.seenAt ?? 0) || +seenAt <= +(sightings.get(entry._id)?.seenAt ?? 0)) continue;
    sightings.set(entry._id, { day: zagrebDate.format(seenAt), line: vehicle.line, seenAt });
  }
  if (sightings.size) await (await dashboardCollection('dashboard_rare_vehicles')).bulkWrite(
    [...sightings].map(([id, sighting]) => ({ updateOne: {
      filter: { _id: id, $or: [{ 'sighting.seenAt': { $lt: sighting.seenAt } }, { sighting: { $exists: false } }] },
      update: { $set: { sighting } }
    } }))
  );
}

export async function auditDashboard(action, target = '') {
  if (!process.env.MONGODB_URI) return;
  try {
    await (await dashboardCollection('dashboard_audit')).insertOne({ action, target, at: new Date() });
  } catch (error) {
    console.error('[dashboard audit]', action, error.name);
  }
}

let feedbackIndex;
export async function feedbackCollection() {
  const feedback = await dashboardCollection('dashboard_feedback');
  feedbackIndex ??= feedback.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => {
    feedbackIndex = undefined;
    throw error;
  });
  await feedbackIndex;
  return feedback;
}
