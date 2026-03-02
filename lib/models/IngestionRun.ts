import mongoose, { Schema, Document } from 'mongoose';

export interface IIngestionRun extends Document {
  kind: string;
  provider: string;
  startedAt: Date;
  finishedAt?: Date;
  status: 'running' | 'success' | 'partial' | 'error';
  fetchedCount: number;
  insertedCount: number;
  dedupedCount: number;
  errorMessage?: string;
  lastProviderStatus?: number;
}

const IngestionRunSchema = new Schema<IIngestionRun>(
  {
    kind:        { type: String, default: 'news_ingestion' },
    provider:    { type: String, required: true },
    startedAt:   { type: Date, default: Date.now },
    finishedAt:  { type: Date },
    status:      { type: String, enum: ['running', 'success', 'partial', 'error'], default: 'running' },
    fetchedCount:  { type: Number, default: 0 },
    insertedCount: { type: Number, default: 0 },
    dedupedCount:  { type: Number, default: 0 },
    errorMessage:  { type: String },
    lastProviderStatus: { type: Number },
  },
  { timestamps: true },
);

IngestionRunSchema.index({ kind: 1, startedAt: -1 });

export default mongoose.models.IngestionRun ||
  mongoose.model<IIngestionRun>('IngestionRun', IngestionRunSchema);
