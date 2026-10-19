import { HUNTS } from './hunts.js';
import { seededRandom } from './random.js';

// The Daily Hunt: one round per UTC day, identical for every player in the world.
// It always plays on the default difficulty so grades are comparable.
const LAUNCH = Date.UTC(2026, 9, 19); // Daily Hunt #1
const DAY = 86400000;

export const dailyKey = (date = new Date()) => date.toISOString().slice(0, 10);

export function dailyNumber(date = new Date()) {
  const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((today - LAUNCH) / DAY) + 1;
}

export function dailyRound(date = new Date()) {
  const key = dailyKey(date);
  const rand = seededRandom(`vulturesgrid:${key}`);
  const def = HUNTS[Math.floor(rand() * HUNTS.length)];
  const number = dailyNumber(date);
  return {
    ...def,
    ...def.build(rand),
    name: `Daily #${number} · ${def.name}`,
    baseName: def.name,
    daily: { key, number },
    outsideIp: `203.0.113.${20 + Math.floor(rand() * 200)}`,
  };
}

export function untilNextDaily(now = new Date()) {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) + DAY;
  const minutes = Math.max(1, Math.round((next - now.getTime()) / 60000));
  return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

// Best result per day, kept in this browser only.
export function loadDailyBest(key) {
  try {
    return JSON.parse(localStorage.getItem(`vg-daily-${key}`));
  } catch {
    return null;
  }
}

export function saveDailyBest(key, result) {
  try {
    const best = loadDailyBest(key);
    if (!best || result.score > best.score) localStorage.setItem(`vg-daily-${key}`, JSON.stringify(result));
  } catch {
    // Storage blocked: the best grade just isn't remembered.
  }
}
