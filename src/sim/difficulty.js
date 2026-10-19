import { DEFAULT_HOP, DEFAULT_DWELL, RESTORE_TIME } from './engine.js';

// Difficulty reshapes a round before it starts: pace stretches or squeezes every timing
// in the attack, and the analyst's cooldowns and restore time change with it.
export const DIFFICULTIES = {
  fledgling: { name: 'Fledgling', pace: 1.4, cooldownScale: 0.6, restoreTime: 4, blurb: 'Slower rot, quicker recovery.' },
  vulture: { name: 'Vulture', pace: 1, cooldownScale: 1, restoreTime: RESTORE_TIME, blurb: 'The standard watch.' },
  carrion: { name: 'Carrion King', pace: 0.7, cooldownScale: 1.4, restoreTime: 7, blurb: 'Faster rot, longer cooldowns.' },
};
export const DEFAULT_DIFFICULTY = 'vulture';

export function applyDifficulty(round, level = DEFAULT_DIFFICULTY) {
  const d = DIFFICULTIES[level] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];
  const paced = (v) => v * d.pace;
  return {
    ...round,
    difficulty: level,
    duration: paced(round.duration),
    cooldownScale: d.cooldownScale,
    restoreTime: d.restoreTime,
    steps: round.steps.map((s) => ({
      ...s,
      at: paced(s.at),
      ...(s.do === 'spread' ? { hop: paced(s.hop ?? DEFAULT_HOP), dwell: paced(s.dwell ?? DEFAULT_DWELL) } : {}),
    })),
  };
}
