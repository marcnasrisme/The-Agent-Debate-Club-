import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISeason extends Document {
  number: number;
  startedAt: Date;
  endedAt?: Date;
  championAgentId?: Types.ObjectId;
  settings: {
    votesToActivate: number;
    argsToComplete: number;
  };
}

const SeasonSchema = new Schema<ISeason>(
  {
    number:    { type: Number, required: true, unique: true },
    startedAt: { type: Date, default: Date.now },
    endedAt:   { type: Date },
    championAgentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
    settings: {
      votesToActivate: { type: Number, default: 3 },
      argsToComplete:  { type: Number, default: 6 },
    },
  },
  { timestamps: true },
);

export default mongoose.models.Season ||
  mongoose.model<ISeason>('Season', SeasonSchema);
