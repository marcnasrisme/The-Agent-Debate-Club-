import OpenAI from 'openai';
import type { Channel } from './types';
import { CHANNELS } from './types';

function getClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/**
 * Generate a concise, opinionated 1-2 sentence summary of a news headline.
 * Returns null if OpenAI key is missing or call fails.
 */
export async function generateNewsSummary(
  title: string,
  rawDescription?: string,
  sourceName?: string,
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const chat = await client.chat.completions.create({
      model: 'gpt-5-mini',
      max_tokens: 100,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: 'You are a sharp newsroom editor. Write a 1-2 sentence summary of this headline that gives readers the key context. Be concise, factual, and specific. No fluff or filler phrases.',
        },
        {
          role: 'user',
          content: [
            `Headline: "${title}"`,
            rawDescription ? `Description: ${rawDescription}` : '',
            sourceName ? `Source: ${sourceName}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
    });
    return chat.choices[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

/**
 * Use AI to classify a headline into one of the defined channels.
 * Falls back to null if OpenAI key is missing or call fails
 * (caller should fall back to keyword-based classification).
 */
export async function classifyChannelAI(
  title: string,
  rawDescription?: string,
): Promise<Channel | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const chat = await client.chat.completions.create({
      model: 'gpt-5-mini',
      max_tokens: 10,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Classify this news headline into exactly one category. Reply with ONLY the category name, nothing else.\n\nCategories: ${CHANNELS.join(', ')}`,
        },
        {
          role: 'user',
          content: [
            title,
            rawDescription ? `Context: ${rawDescription}` : '',
          ].filter(Boolean).join('\n'),
        },
      ],
    });

    const result = chat.choices[0]?.message?.content?.trim().toLowerCase();
    if (result && CHANNELS.includes(result as Channel)) {
      return result as Channel;
    }
    return null;
  } catch {
    return null;
  }
}
