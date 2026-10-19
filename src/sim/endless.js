import { HUNTS } from './hunts.js';
import { OUTSIDE_ID } from './topology.js';
import { DEFAULT_HOP, DEFAULT_DWELL } from './engine.js';

// Endless Watch controller: launches a random Hunt as a wave, again and again, each one
// faster and sooner than the last, until the grid is overrun.
export const OVERRUN_ROTTING = 8;
export const OVERRUN_MB = 120;

const FIRST_WAVE_AT = 0.5;
const SPEEDUP_PER_WAVE = 0.05; // each wave runs 5% faster...
const MIN_WAVE_PACE = 0.5; // ...down to twice the normal speed
const BASE_INTERVAL = 18; // seconds between waves, shrinking each wave
const MIN_INTERVAL = 7;
const ROT_WAVE_CUTOFF = 6.3; // a Rot wave stops after about 5 nodes across 2 branches

const touchesOutside = (steps) => steps.some((s) => s.from === OUTSIDE_ID || s.path?.includes(OUTSIDE_ID));

export function createEndless(engine) {
  let active = false;
  let wave = 0;
  let nextAt = 0;

  function launch() {
    wave++;
    const def = HUNTS[Math.floor(Math.random() * HUNTS.length)];
    const built = def.build(Math.random);
    const pace = (engine.hunt.pace ?? 1) * Math.max(MIN_WAVE_PACE, 1 - SPEEDUP_PER_WAVE * (wave - 1));
    const tag = (id) => `${id}-w${wave}`; // stream ids stay unique across waves
    const t0 = engine.time;

    // Every outside wave after the first brings a new attacker the blocklist doesn't cover.
    if (wave > 1 && touchesOutside(built.steps)) engine.rotateOutside();

    const raw = def.id === 'rot' ? built.steps.filter((s) => s.at <= ROT_WAVE_CUTOFF) : built.steps;
    const steps = raw.map(({ stage, ...s }) => ({
      ...s,
      at: t0 + s.at * pace,
      ...(s.do === 'spread' ? { hop: (s.hop ?? DEFAULT_HOP) * pace, dwell: (s.dwell ?? DEFAULT_DWELL) * pace } : {}),
      ...(s.id ? { id: tag(s.id) } : {}),
      ...(s.requires ? { requires: tag(s.requires) } : {}),
    }));
    engine.note('WARN', `Wave ${wave}: ${def.name}`);
    engine.inject(steps);
    engine.hunt.wave = wave;
    nextAt = t0 + Math.max(MIN_INTERVAL, BASE_INTERVAL - wave * 1.2) * (engine.hunt.pace ?? 1);
  }

  function pressure() {
    return Math.max(engine.countState('rotting') / OVERRUN_ROTTING, engine.dataLostMB / OVERRUN_MB);
  }

  return {
    get active() {
      return active;
    },

    start() {
      active = true;
      wave = 0;
      nextAt = FIRST_WAVE_AT;
    },

    stop() {
      active = false;
    },

    update() {
      if (!active || !engine.running) return;
      if (engine.time >= nextAt) launch();
      const rotting = engine.countState('rotting');
      if (rotting >= OVERRUN_ROTTING || engine.dataLostMB >= OVERRUN_MB) {
        engine.hunt.overrun = rotting >= OVERRUN_ROTTING ? 'rot' : 'bleed';
        active = false;
        engine.endNow(
          engine.hunt.overrun === 'rot'
            ? `Overrun: ${rotting} nodes rotting at once after ${wave} waves`
            : `Overrun: ${engine.dataLostMB.toFixed(0)} MB bled out after ${wave} waves`,
        );
      }
    },

    // The kill chain shows pressure during Endless Watch: how close the grid is to overrun.
    chainView: {
      running: true,
      get stageIndex() {
        return Math.min(3, Math.floor(pressure() * 4));
      },
      stageProgress(i) {
        return Math.min(1, Math.max(0, pressure() * 4 - i));
      },
    },

    status() {
      const t = Math.floor(engine.time);
      const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
      const parts = [`Endless · Wave ${wave}`, `${clock} survived`, `${engine.countState('rotting')}/${OVERRUN_ROTTING} rotting`];
      if (engine.dataLostMB > 0) parts.push(`${engine.dataLostMB.toFixed(0)}/${OVERRUN_MB} MB`);
      return parts.join(' · ');
    },
  };
}
