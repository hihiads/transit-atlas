import mongoose from 'mongoose';

const rareVehicleFollowSchema = new mongoose.Schema({
  vehicleId: { type: String, required: true },
  language: { type: String, enum: ['hr', 'en'], required: true }
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  googleSubject: {
    type: String,
    default: undefined,
    unique: true,
    sparse: true
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  ageRange: { type: String, enum: ['10-15', '16+'], default: null },
  guardianEmail: { type: String, default: null },
  guardianConsentAt: { type: Date, default: null },
  termsVersion: { type: String, default: null },
  termsAcceptedAt: { type: Date, default: null },
  rareVehicleFollows: { type: [rareVehicleFollowSchema], default: undefined, select: false },
  rareAlertDay: { type: new mongoose.Schema({ date: String, vehicles: [String] }, { _id: false }), select: false },
  vehicleReportsBlockedUntil: { type: Date, select: false },
  sessionVersion: {
    type: Number,
    default: 0
  },
  emailVerificationToken: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

userSchema.index({ 'rareVehicleFollows.vehicleId': 1 }, { sparse: true });
userSchema.index({ emailVerificationToken: 1 }, { sparse: true });
userSchema.index({ passwordResetToken: 1 }, { sparse: true });
userSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400, partialFilterExpression: { emailVerified: false } });

export default mongoose.model('User', userSchema);
