import mongoose from 'mongoose';

export async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI not configured');
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log('[MongoDB] ✓ Povezano s bazom');
  } catch (error) {
    console.error('[MongoDB] ✗ Greška pri povezivanju:', error.name);
    throw new Error('MongoDB connection failed');
  }

  mongoose.connection.on('error', (err) => {
    console.error('[MongoDB] Greška:', err.name);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Veza prekinuta');
  });
}
