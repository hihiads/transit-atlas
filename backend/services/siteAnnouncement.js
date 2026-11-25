import mongoose from 'mongoose';
import { connectDatabase } from '../config/database.js';

const id = 'current';

async function getCollection() {
  await connectDatabase();
  return mongoose.connection.db.collection('site_announcements');
}

export async function readAnnouncement() {
  if (!process.env.MONGODB_URI) return null;
  const collection = await getCollection();
  return collection.findOne({ _id: id, $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }] },
    { projection: { _id: 0, text: 1, level: 1, expiresAt: 1, updatedAt: 1 } });
}

export async function publishAnnouncement({ text, level, expiresAt }) {
  const collection = await getCollection();
  const announcement = { text, level, expiresAt: expiresAt ? new Date(expiresAt) : null, updatedAt: new Date() };
  await collection.replaceOne({ _id: id }, { _id: id, ...announcement }, { upsert: true });
  return announcement;
}

export async function unpublishAnnouncement() {
  const collection = await getCollection();
  await collection.deleteOne({ _id: id });
}
