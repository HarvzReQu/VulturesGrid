// Short alert cues, synthesized on the fly: they mark the moments that matter without
// the player having to watch every corner of the map. Each cue can be panned toward the
// node it's about. getOutput() returns { ctx, out, noise } or null when sound is off.

// Minimum seconds between two cues of the same kind (The Rot can fire many at once).
const MIN_GAP = { scent: 0.35, rot: 0.6, revive: 0.3, act: 0.08, block: 0.3, stamp: 1, consumed: 1 };

export function createCues(getOutput) {
  const last = {};

  // One enveloped oscillator: quick attack, exponential decay.
  function tone(ctx, dest, { freq, to, type = 'sine', at = 0, dur = 0.3, gain = 0.05, attack = 0.01 }) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur * 0.8);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return env;
  }

  // A filtered burst of noise: clicks, thuds, the stamp.
  function burst(ctx, dest, noise, { type = 'lowpass', freq = 400, at = 0, dur = 0.15, gain = 0.2 }) {
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(dest);
    src.start(t, Math.random() * (noise.duration - 1), dur + 0.05);
  }

  function play(kind, pan = 0) {
    const output = getOutput();
    if (!output) return;
    const { ctx, out, noise } = output;
    if (ctx.currentTime - (last[kind] ?? -Infinity) < MIN_GAP[kind]) return;
    last[kind] = ctx.currentTime;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    panner.connect(out);

    switch (kind) {
      case 'scent': // two soft rising notes: something to look at
        tone(ctx, panner, { freq: 587.3, type: 'triangle', dur: 0.22, gain: 0.07 });
        tone(ctx, panner, { freq: 740, type: 'triangle', at: 0.12, dur: 0.3, gain: 0.06 });
        break;
      case 'rot': {
        // a low toll with a sour beat and a minor overtone
        const low = ctx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = 700;
        low.connect(panner);
        tone(ctx, low, { freq: 98, type: 'sawtooth', dur: 1.2, gain: 0.12, attack: 0.02 });
        tone(ctx, low, { freq: 103.8, type: 'sawtooth', dur: 1.2, gain: 0.08, attack: 0.02 });
        tone(ctx, panner, { freq: 311.1, type: 'triangle', dur: 0.9, gain: 0.035 });
        break;
      }
      case 'revive': // a rising shimmer
        tone(ctx, panner, { freq: 523.3, to: 1046.5, dur: 0.45, gain: 0.05 });
        tone(ctx, panner, { freq: 1568, at: 0.18, dur: 0.4, gain: 0.025 });
        break;
      case 'act': // a dry click for analyst actions
        burst(ctx, panner, noise, { type: 'bandpass', freq: 2200, dur: 0.035, gain: 0.25 });
        tone(ctx, panner, { freq: 880, type: 'square', dur: 0.04, gain: 0.015 });
        break;
      case 'block': // a gate slamming shut
        burst(ctx, panner, noise, { freq: 300, dur: 0.25, gain: 0.35 });
        tone(ctx, panner, { freq: 110, to: 70, type: 'square', dur: 0.25, gain: 0.05 });
        break;
      case 'stamp': // the Case File stamp
        burst(ctx, panner, noise, { freq: 380, dur: 0.18, gain: 0.45 });
        tone(ctx, panner, { freq: 72, to: 48, dur: 0.35, gain: 0.18 });
        break;
      case 'consumed': // the stamp, then a dark drone
        burst(ctx, panner, noise, { freq: 380, dur: 0.18, gain: 0.45 });
        tone(ctx, panner, { freq: 73.4, dur: 2.4, gain: 0.08, attack: 0.3 });
        tone(ctx, panner, { freq: 77.8, dur: 2.4, gain: 0.06, attack: 0.3 });
        break;
    }
  }

  return { play };
}
