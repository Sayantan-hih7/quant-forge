import mongoose from 'mongoose';
import { env } from '../config/env.js';

export async function connectDatabase() {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000, autoIndex: false });
  // Idempotent, additive indexes: never syncIndexes/drop existing indexes during startup.
  await Promise.all(Object.values(mongoose.models).map(model => model.createIndexes()));
  const runs = mongoose.models.SourceRun;
  if (runs) await runs.updateMany({ errors: { $exists: true }, failures: { $exists: false } }, { $rename: { errors: 'failures' } }, { strict: false });
}
export async function disconnectDatabase() { await mongoose.disconnect(); }
export const databaseReady = () => mongoose.connection.readyState === 1;
