/**
 * Basic content moderation filter.
 * Checks for blocked patterns and returns a rejection reason if found.
 * Intentionally simple — extend the list as needed.
 */

const BLOCKED_PATTERNS = [
  /\b(fuck|shit|cunt|nigger|faggot|retard)\b/i,
  /<script[\s>]/i,
  /javascript:/i,
  /on(load|error|click)\s*=/i,
];

const MAX_REPEAT_CHARS = 15;
const REPEAT_PATTERN = /(.)\1{14,}/;

export interface FilterResult {
  blocked: boolean;
  reason?: string;
}

export function checkContent(text: string): FilterResult {
  if (!text || typeof text !== 'string') {
    return { blocked: false };
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(text)) {
      return { blocked: true, reason: 'Content contains prohibited language or patterns' };
    }
  }

  if (REPEAT_PATTERN.test(text)) {
    return { blocked: true, reason: 'Content contains excessive character repetition' };
  }

  const words = text.split(/\s+/);
  if (words.length > 3) {
    const wordCounts = new Map<string, number>();
    for (const w of words) {
      const lower = w.toLowerCase();
      wordCounts.set(lower, (wordCounts.get(lower) ?? 0) + 1);
    }
    const maxCount = Math.max(...wordCounts.values());
    if (maxCount > words.length * 0.6 && maxCount > 5) {
      return { blocked: true, reason: 'Content appears to be spam (excessive word repetition)' };
    }
  }

  return { blocked: false };
}
