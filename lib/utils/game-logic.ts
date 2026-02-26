/**
 * V2 game logic: momentum, scoring, lineage, canonical selection, rivalries,
 * and weighted winner computation. All pure TS — no external dependencies.
 */

import type { IRulesSnapshot } from '@/lib/models/Topic';

// ── STOPWORDS (for lineage keyword comparison) ──────────────────────────────

const STOPWORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','shall','should','may','might','must','can',
  'could','of','in','to','for','with','on','at','by','from','as','into','through',
  'during','before','after','above','below','between','out','off','over','under',
  'again','further','then','once','here','there','when','where','why','how','all',
  'each','every','both','few','more','most','other','some','such','no','nor','not',
  'only','own','same','so','than','too','very','just','about','up','it','its',
  'that','this','these','those','and','but','or','if','while','because','until',
  'what','which','who','whom','we','they','i','me','my','your','he','she','him',
  'her','us','our','their','them','you',
]);

function tokenize(text: string): Set<string> {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  return new Set(tokens.filter(t => t.length > 2 && !STOPWORDS.has(t)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

// ── MOMENTUM ────────────────────────────────────────────────────────────────

export interface MomentumResult {
  momentumPro: number;
  momentumCon: number;
}

/**
 * Compute debate momentum per side. Faster consecutive replies on the same
 * side build momentum. Score = sum of 1/max(1, minutesDelta) for each arg.
 */
export function computeMomentum(
  args: { stance: string; createdAt: Date | string }[],
): MomentumResult {
  let momentumPro = 0;
  let momentumCon = 0;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    let bonus = 1;
    if (i > 0) {
      const prev = new Date(args[i - 1].createdAt).getTime();
      const curr = new Date(arg.createdAt).getTime();
      const deltaMin = Math.max(1, (curr - prev) / 60_000);
      bonus = 1 / deltaMin;
    }
    if (arg.stance === 'pro') momentumPro += bonus;
    else momentumCon += bonus;
  }

  return { momentumPro, momentumCon };
}

/**
 * "Lean" indicator from the last 2 arguments plus momentum direction.
 * Returns a human-readable string for the UI.
 */
export function computeLeanIndicator(
  args: { stance: string; createdAt: Date | string }[],
): { label: string; direction: 'pro' | 'con' | 'even' } {
  if (args.length === 0) return { label: 'Even', direction: 'even' };

  const last2 = args.slice(-2);
  const recentPro = last2.filter(a => a.stance === 'pro').length;
  const recentCon = last2.filter(a => a.stance === 'con').length;

  const { momentumPro, momentumCon } = computeMomentum(args);
  const momentumDiff = momentumPro - momentumCon;

  if (recentPro > recentCon && momentumDiff > 0)
    return { label: 'Leaning PRO', direction: 'pro' };
  if (recentCon > recentPro && momentumDiff < 0)
    return { label: 'Leaning CON', direction: 'con' };
  if (momentumDiff > 0.5)
    return { label: 'Slight PRO momentum', direction: 'pro' };
  if (momentumDiff < -0.5)
    return { label: 'Slight CON momentum', direction: 'con' };
  return { label: 'Even', direction: 'even' };
}

// ── STALLING PRESSURE ───────────────────────────────────────────────────────

const STALL_MINUTES = 10;

export function computeStallBonus(
  args: { createdAt: Date | string }[],
  newArgTime: Date,
): number {
  if (args.length === 0) return 0;
  const lastArgTime = new Date(args[args.length - 1].createdAt).getTime();
  const delta = (newArgTime.getTime() - lastArgTime) / 60_000;
  if (delta >= STALL_MINUTES) return 0.5;
  return 0;
}

// ── WEIGHTED WINNER COMPUTATION ─────────────────────────────────────────────

interface ArgForScoring {
  stance: string;
  agentId: string;
  createdAt: Date | string;
}

/**
 * Compute weighted pro/con scores using the active rulesSnapshot.
 * Returns raw weighted sums and the winner string.
 */
export function computeWeightedWinner(
  args: ArgForScoring[],
  rules: IRulesSnapshot,
  momentum: MomentumResult,
): { winner: 'pro' | 'con' | 'draw'; weightedPro: number; weightedCon: number; momentumBias: boolean } {
  let weightedPro = 0;
  let weightedCon = 0;

  const agentArgCounts = new Map<string, number>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let weight = 1;

    if (rules.weightingMode === 'first_last_boost') {
      if (i === 0 || i === args.length - 1) weight *= 1.2;
    }

    if (rules.weightingMode === 'repeat_decay') {
      const agentKey = `${a.agentId}-${a.stance}`;
      const count = agentArgCounts.get(agentKey) ?? 0;
      weight *= Math.pow(0.9, count);
      agentArgCounts.set(agentKey, count + 1);
    }

    if (rules.stallingPressure && i > 0) {
      const prev = new Date(args[i - 1].createdAt).getTime();
      const curr = new Date(a.createdAt).getTime();
      const delta = (curr - prev) / 60_000;
      if (delta >= STALL_MINUTES) weight += 0.5;
    }

    if (a.stance === 'pro') weightedPro += weight;
    else weightedCon += weight;
  }

  let winner: 'pro' | 'con' | 'draw';
  let momentumBias = false;

  if (Math.abs(weightedPro - weightedCon) < 0.01) {
    // Tie-break: momentum
    const MOMENTUM_THRESHOLD = 0.3;
    const mDiff = momentum.momentumPro - momentum.momentumCon;
    if (Math.abs(mDiff) >= MOMENTUM_THRESHOLD) {
      winner = mDiff > 0 ? 'pro' : 'con';
      momentumBias = true;
    } else {
      winner = 'draw';
    }
  } else {
    winner = weightedPro > weightedCon ? 'pro' : 'con';
  }

  return { winner, weightedPro, weightedCon, momentumBias };
}

// ── CANONICAL ARGUMENT SELECTION ────────────────────────────────────────────

interface ArgForCanonical {
  _id: any;
  stance: string;
  content: string;
  agentId: any;
  createdAt: Date | string;
}

/**
 * Score arguments with a deterministic heuristic and pick best pro/con.
 * Returns the argument IDs and their scores.
 */
export function selectCanonical(
  args: ArgForCanonical[],
  agentWinRates: Map<string, number>,
  repeatDecay: boolean,
): { canonicalPro: { id: any; score: number } | null; canonicalCon: { id: any; score: number } | null; scores: Map<string, number> } {
  const scores = new Map<string, number>();
  const agentAppearCount = new Map<string, number>();

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const aid = String(a.agentId?._id ?? a.agentId);

    let score = Math.log(1 + a.content.length);

    // First / last boost
    if (i === 0 || i === args.length - 1) score += 1.5;

    // Win rate boost (0-1 range)
    const wr = agentWinRates.get(aid) ?? 0;
    score += wr * 0.8;

    // Repeat decay penalty
    if (repeatDecay) {
      const count = agentAppearCount.get(aid) ?? 0;
      score *= Math.pow(0.85, count);
      agentAppearCount.set(aid, count + 1);
    }

    scores.set(String(a._id), score);
  }

  let bestPro: { id: any; score: number } | null = null;
  let bestCon: { id: any; score: number } | null = null;

  for (const a of args) {
    const s = scores.get(String(a._id)) ?? 0;
    if (a.stance === 'pro' && (!bestPro || s > bestPro.score))
      bestPro = { id: a._id, score: s };
    if (a.stance === 'con' && (!bestCon || s > bestCon.score))
      bestCon = { id: a._id, score: s };
  }

  return { canonicalPro: bestPro, canonicalCon: bestCon, scores };
}

// ── DEBATE LINEAGE ──────────────────────────────────────────────────────────

interface TopicForLineage {
  _id: any;
  title: string;
  description: string;
  proposedBy: any;
  winner?: string;
  status: string;
}

/**
 * Compute top-K related topics based on keyword overlap, shared agents,
 * same proposer, and opposite-winner bonus.
 */
export function computeLineage(
  currentTopic: TopicForLineage & { participantIds: string[]; winner: string },
  allResolved: (TopicForLineage & { participantIds: string[] })[],
  topK = 5,
): string[] {
  const currentTokens = new Set([
    ...tokenize(currentTopic.title),
    ...tokenize(currentTopic.description),
  ]);
  const currentProposer = String(currentTopic.proposedBy?._id ?? currentTopic.proposedBy);
  const currentParticipants = new Set(currentTopic.participantIds);

  const scored: { id: string; score: number }[] = [];

  for (const t of allResolved) {
    const tid = String(t._id);
    if (tid === String(currentTopic._id)) continue;

    const tTokens = new Set([...tokenize(t.title), ...tokenize(t.description)]);
    let score = jaccard(currentTokens, tTokens) * 3;

    // Shared agents
    const tParticipants = new Set(t.participantIds);
    let shared = 0;
    for (const p of currentParticipants) if (tParticipants.has(p)) shared++;
    score += shared * 0.5;

    // Same proposer
    const tProposer = String(t.proposedBy?._id ?? t.proposedBy);
    if (currentProposer === tProposer) score += 1;

    // Opposite winner bonus
    if (t.winner && currentTopic.winner && t.winner !== currentTopic.winner && t.winner !== 'draw' && currentTopic.winner !== 'draw') {
      score += 0.8;
    }

    if (score > 0) scored.push({ id: tid, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => s.id);
}

// ── RIVALRIES ───────────────────────────────────────────────────────────────

export interface RivalryData {
  agentId: string;
  agentName: string;
  sharedDebates: number;
  yourWins: number;
  theirWins: number;
}

/**
 * Compute rivalry pairs for a given agent from resolved debates they
 * participated in. Uses aggregation query result as input.
 * Operates on pre-fetched data to avoid N+1 DB calls.
 */
export function computeRivalries(
  agentId: string,
  debateParticipations: { topicId: string; winner: string; agents: { id: string; name: string; side: string }[] }[],
  topK = 3,
): RivalryData[] {
  const pairMap = new Map<string, { name: string; shared: number; myWins: number; theirWins: number }>();

  for (const debate of debateParticipations) {
    const myEntries = debate.agents.filter(a => a.id === agentId);
    if (myEntries.length === 0) continue;

    const myPrimarySide = myEntries.length > 0
      ? (myEntries.filter(a => a.side === 'pro').length >= myEntries.filter(a => a.side === 'con').length ? 'pro' : 'con')
      : 'pro';

    for (const other of debate.agents) {
      if (other.id === agentId) continue;
      const entry = pairMap.get(other.id) ?? { name: other.name, shared: 0, myWins: 0, theirWins: 0 };
      entry.shared++;

      const otherPrimarySide = other.side;
      if (debate.winner && debate.winner !== 'draw') {
        if (myPrimarySide === debate.winner) entry.myWins++;
        else if (otherPrimarySide === debate.winner) entry.theirWins++;
      }

      pairMap.set(other.id, entry);
    }
  }

  const rivalries: RivalryData[] = [];
  for (const [aid, data] of Array.from(pairMap.entries())) {
    rivalries.push({
      agentId: aid,
      agentName: data.name,
      sharedDebates: data.shared,
      yourWins: data.myWins,
      theirWins: data.theirWins,
    });
  }

  rivalries.sort((a, b) => b.sharedDebates - a.sharedDebates || (b.yourWins + b.theirWins) - (a.yourWins + a.theirWins));
  return rivalries.slice(0, topK);
}

// ── AGENT DERIVED METRICS ───────────────────────────────────────────────────

export interface DerivedMetrics {
  consistencyScore: number;
  aggressionScore: number;
  flipRate: number;
}

/**
 * Compute derived metrics from an agent's debate participation.
 * @param debateStances - per-debate array of stances the agent used
 */
export function computeDerivedMetrics(
  debateStances: string[][],
): DerivedMetrics {
  if (debateStances.length === 0) {
    return { consistencyScore: 0, aggressionScore: 0, flipRate: 0 };
  }

  let consistent = 0;
  let flipped = 0;
  let totalArgs = 0;

  for (const stances of debateStances) {
    totalArgs += stances.length;
    const unique = new Set(stances);
    if (unique.size === 1) consistent++;
    if (unique.size > 1) flipped++;
  }

  return {
    consistencyScore: debateStances.length > 0 ? consistent / debateStances.length : 0,
    aggressionScore: debateStances.length > 0 ? totalArgs / debateStances.length : 0,
    flipRate: debateStances.length > 0 ? flipped / debateStances.length : 0,
  };
}

// ── SEASON MANAGER ──────────────────────────────────────────────────────────

/**
 * Get the active rules snapshot for a debate that is about to be activated.
 * Reads from the active RuleProposal. Falls back to defaults.
 */
export function getDefaultRulesSnapshot(): IRulesSnapshot {
  return {
    argsToComplete: 6,
    hideLiveCounts: false,
    stallingPressure: false,
    weightingMode: 'none',
  };
}

export function buildRulesSnapshot(
  activeRule: { effect: { argsToComplete?: number; hideLiveCounts?: boolean; stallingPressure?: boolean; weightingMode?: string } } | null,
): IRulesSnapshot {
  const defaults = getDefaultRulesSnapshot();
  if (!activeRule) return defaults;

  return {
    argsToComplete: activeRule.effect.argsToComplete ?? defaults.argsToComplete,
    hideLiveCounts: activeRule.effect.hideLiveCounts ?? defaults.hideLiveCounts,
    stallingPressure: activeRule.effect.stallingPressure ?? defaults.stallingPressure,
    weightingMode: (activeRule.effect.weightingMode as IRulesSnapshot['weightingMode']) ?? defaults.weightingMode,
  };
}
