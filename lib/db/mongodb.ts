import mongoose from 'mongoose';

let cached = (global as any).mongoose;
if (!cached) cached = (global as any).mongoose = { conn: null, promise: null };

export async function connectDB() {
  const MONGODB_URI = process.env.MONGODB_URI!;
  const MONGODB_DB = process.env.MONGODB_DB || 'debate-forum';

  if (!MONGODB_URI) throw new Error('Missing MONGODB_URI environment variable');

  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so the next request tries a fresh connection with current env vars
    cached.promise = null;
    throw err;
  }

  return cached.conn;
}
