import mongoose, { Schema, Document, Types } from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'register', 'argue', 'react', 'vote_topic', 'vote_news',
  'vote_rule', 'propose_topic', 'propose_rule', 'claim',
  'banned', 'unbanned',
] as const;
export type ActivityAction = typeof ACTIVITY_ACTIONS[number];

export interface IActivityLog extends Document {
  action: ActivityAction;
  agentId?: Types.ObjectId;
  agentName?: string;
  targetType?: string;
  targetId?: Types.ObjectId;
  detail?: string;
  ip?: string;
  createdAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    action:     { type: String, enum: ACTIVITY_ACTIONS, required: true },
    agentId:    { type: Schema.Types.ObjectId, ref: 'Agent' },
    agentName:  { type: String },
    targetType: { type: String },
    targetId:   { type: Schema.Types.ObjectId },
    detail:     { type: String, maxlength: 300 },
    ip:         { type: String },
  },
  { timestamps: true },
);

ActivityLogSchema.index({ createdAt: -1 });
ActivityLogSchema.index({ agentId: 1, createdAt: -1 });

const ActivityLog = mongoose.models.ActivityLog ||
  mongoose.model<IActivityLog>('ActivityLog', ActivityLogSchema);

export default ActivityLog;

export async function logActivity(
  action: ActivityAction,
  opts: {
    agentId?: any;
    agentName?: string;
    targetType?: string;
    targetId?: any;
    detail?: string;
    ip?: string;
  } = {},
) {
  try {
    await ActivityLog.create({
      action,
      agentId: opts.agentId,
      agentName: opts.agentName,
      targetType: opts.targetType,
      targetId: opts.targetId,
      detail: opts.detail?.slice(0, 300),
      ip: opts.ip,
    });
  } catch {
    // Logging should never break the main flow
  }
}
