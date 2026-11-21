import mongoose from 'mongoose';

const pendingRegistrationSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, default: null },
  googleSubject: { type: String, default: null },
  guardianEmail: { type: String, required: true, lowercase: true, trim: true },
  tokenHash: { type: String, required: true, unique: true },
  termsVersion: { type: String, required: true },
  termsAcceptedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

export default mongoose.model('PendingRegistration', pendingRegistrationSchema);
