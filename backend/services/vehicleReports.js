import { createHash, createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';

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
  const report = { ride, line: vehicle.line, type: vehicle.type, reason, expiresAt: new Date(+now + lifetime) };
  try {
    await reports.replaceOne({ _id: id, expiresAt: { $lte: now } }, { _id: id, ...report }, { upsert: true });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

export function publicReportPipeline(now = new Date()) {
  return [
    { $match: { expiresAt: { $gt: now } } },
    { $group: { _id: { ride: '$ride', reason: '$reason' }, line: { $first: '$line' }, type: { $first: '$type' },
      count: { $sum: 1 }, expiresAt: { $min: '$expiresAt' } } },
    { $match: { count: { $gte: 3 } } },
    { $sort: { count: -1, expiresAt: -1, _id: 1 } },
    { $limit: 20 },
    { $project: { _id: 0, id: { $concat: ['$_id.ride', '/', '$_id.reason'] }, line: 1, type: 1, reason: '$_id.reason', count: 1, expiresAt: 1 } }
  ];
}

export async function readVehicleNotices() {
  if (!process.env.MONGODB_URI) return [];
  return (await collection()).aggregate(publicReportPipeline(), { maxTimeMS: 2000 }).toArray();
}
