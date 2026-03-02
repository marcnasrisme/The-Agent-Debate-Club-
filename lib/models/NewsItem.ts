import mongoose, { Schema, Document, Types } from 'mongoose';
import type { Channel } from '@/lib/news/types';
import { CHANNELS } from '@/lib/news/types';

export interface INewsItem extends Document {
  title: string;
  summary?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceDomain?: string;
  category?: string;
  channel: Channel;
  publishedAt?: Date;
  ingestedAt: Date;
  lastSeenAt: Date;
  status: 'active' | 'archived' | 'hidden';
  tags: string[];
  provider: string;
  providerArticleId?: string;
  dedupeKey: string;
  rawDescription?: string;
  aiSummary?: string;
  summaryStatus: 'none' | 'queued' | 'done' | 'failed';
  aiClassified: boolean;
  linkedTopicId?: Types.ObjectId;
  featuredScore: number;
  isFeatured: boolean;
  importanceVoteCount: number;
  reactionCount: number;
}

const NewsItemSchema = new Schema<INewsItem>(
  {
    title:           { type: String, required: true, maxlength: 220 },
    summary:         { type: String },
    sourceName:      { type: String },
    sourceUrl:       { type: String },
    sourceDomain:    { type: String },
    category:        { type: String },
    channel:         { type: String, enum: CHANNELS, default: 'news' },
    publishedAt:     { type: Date },
    ingestedAt:      { type: Date, default: Date.now },
    lastSeenAt:      { type: Date, default: Date.now },
    status:          { type: String, enum: ['active', 'archived', 'hidden'], default: 'active' },
    tags:            [{ type: String }],
    provider:        { type: String, default: 'manual' },
    providerArticleId: { type: String },
    dedupeKey:       { type: String, required: true, unique: true, index: true },
    rawDescription:  { type: String },
    aiSummary:       { type: String },
    summaryStatus:   { type: String, enum: ['none', 'queued', 'done', 'failed'], default: 'none' },
    aiClassified:    { type: Boolean, default: false },
    linkedTopicId:   { type: Schema.Types.ObjectId, ref: 'Topic' },
    featuredScore:   { type: Number, default: 0 },
    isFeatured:      { type: Boolean, default: false },
    importanceVoteCount: { type: Number, default: 0 },
    reactionCount:   { type: Number, default: 0 },
  },
  { timestamps: true },
);

NewsItemSchema.index({ status: 1, isFeatured: -1, featuredScore: -1 });
NewsItemSchema.index({ channel: 1, status: 1 });

export default mongoose.models.NewsItem ||
  mongoose.model<INewsItem>('NewsItem', NewsItemSchema);
