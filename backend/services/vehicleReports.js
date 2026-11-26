import { createHash, createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';
import { dashboardCollection } from './dashboard.js';

const lifetime = 45 * 60 * 1000;
let collectionPromise;

async function collection() {
  collectionPromise ??= connectDatabase().then(async () => {
    const reports = mongoose.connection.db.collection('vehicle_reports');
    await reports.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return reports;
  }).catch(error => {
    collectionPromise = undefined;
    throw error;
  });
  return collectionPromise;
}

export function validateVehicleReport(body) {
  if (!body || Object.keys(body).length !== 3 ||
      typeof body.vehicleId !== 'string' || !/^[\w.-]{1,100}$/.test(body.vehicleId) ||
      typeof body.tripId !== 'string' || !/^[\w.:-]{1,100}$/.test(body.tripId) ||
      !['breakdown', 'delay'].includes(body.reason)) return null;
  return { vehicleId: body.vehicleId, tripId: body.tripId, reason: body.reason };
}

export async function recordVehicleReport(vehicle, userId, reason) {
  const ride = createHash('sha256')
    .update(JSON.stringify([vehicle.zetId || vehicle.id, vehicle.tripId, vehicle.line, vehicle.type])).digest('hex');
  const id = createHmac('sha256', process.env.SESSION_SECRET)
    .update(JSON.stringify(['vehicle-report', ride, userId])).digest('hex');
  const reports = await collection();
  const now = new Date();
  const report = { ride, vehicleId: vehicle.zetId || vehicle.id, line: vehicle.line, type: vehicle.type, reason, expiresAt: new Date(+now + lifetime) };
  try {
    await reports.replaceOne({ _id: id, expiresAt: { $lte: now } }, { _id: id, ...report }, { upsert: true });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

export function publicReportPipeline(now = new Date(), admin = false) {
  return [
    { $match: { expiresAt: { $gt: now } } },
    { $group: { _id: { ride: '$ride', reason: '$reason' }, line: { $first: '$line' }, type: { $first: '$type' },
      vehicleId: { $max: '$vehicleId' }, count: { $sum: 1 }, expiresAt: { $min: '$expiresAt' } } },
    { $set: { id: { $concat: ['$_id.ride', '/', '$_id.reason'] }, reason: '$_id.reason' } },
    ...(!admin ? [{ $match: { count: { $gte: 3 } } }] : []),
    { $lookup: { from: 'dashboard_report_moderation', localField: 'id', foreignField: '_id', as: 'moderation' } },
    { $set: { moderation: { $first: '$moderation' } } },
    ...(!admin ? [{ $match: { $or: [{ moderation: { $exists: false } }, { 'moderation.expiresAt': { $lte: now } }] } }] : []),
    { $sort: { count: -1, expiresAt: -1, id: 1 } },
    { $limit: admin ? 100 : 20 },
    { $project: { _id: 0, id: 1, line: 1, type: 1, reason: 1, count: 1, expiresAt: 1, ...(admin ? {
      vehicleId: 1, state: { $cond: [{ $gt: ['$moderation.expiresAt', now] }, '$moderation.state', 'visible'] }
    } : {}) } }
  ];
}

export async function readVehicleNotices(admin = false) {
  if (!process.env.MONGODB_URI) return [];
  return (await collection()).aggregate(publicReportPipeline(new Date(), admin), { maxTimeMS: 2000 }).toArray();
}

let moderationIndex;
export async function moderateVehicleNotice(id, state) {
  const moderation = await dashboardCollection('dashboard_report_moderation');
  moderationIndex ??= moderation.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(error => {
    moderationIndex = undefined;
    throw error;
  });
  await moderationIndex;
  if (state === 'visible') await moderation.deleteOne({ _id: id });
  else await moderation.updateOne({ _id: id }, { $set: { state }, $max: { expiresAt: new Date(Date.now() + lifetime) } }, { upsert: true });
}
