// Procedural ambience with the Web Audio API: wind gusts, a low rumble, and distant
// wing flaps that come more often while nodes are Rotting. No audio files.
// Nothing is created until the first enable(), which must come from a user gesture.

const MASTER_LEVEL = 0.55;
const FADE = 1.2; // seconds

function noiseBuffer(ctx, seconds, brown = false) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

const rand = (min, max) => min + Math.random() * (max - min);

export function createAmbience() {
  let ctx = null;
  let master = null;
  let cueBus = null; // alert cues are mixed in here, under the same master fade
  let white = null;
  let enabled = false;
  let threat = 0;
  const timers = [];

  function loop(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.loopStart = Math.random() * buffer.duration * 0.5; // decorrelate layers
    src.start(0, src.loopStart);
    return src;
  }

  // One wind layer: band-passed noise whose pitch and loudness drift in slow gusts.
  function windLayer(pan) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.7;
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    loop(white).connect(filter).connect(gain).connect(panner).connect(master);

    const gust = () => {
      if (!ctx) return;
      const now = ctx.currentTime;
      const strength = rand(0.03, 0.11) * (1 + threat * 0.04);
      filter.frequency.setTargetAtTime(rand(260, 760), now, rand(1.2, 2.5));
      gain.gain.setTargetAtTime(Math.min(strength, 0.16), now, rand(1, 2.2));
      timers.push(setTimeout(gust, rand(2500, 6000)));
    };
    gust();
  }

  // A low, almost-felt rumble under everything.
  function rumble() {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 140;
    const gain = ctx.createGain();
    gain.gain.value = 0.22;
    loop(noiseBuffer(ctx, 6, true)).connect(filter).connect(gain).connect(master);
  }

  // A few heavy wingbeats somewhere off to one side: soft thumps of filtered noise.
  function flapCluster() {
    const now = ctx.currentTime;
    const beats = Math.floor(rand(2, 6));
    const spacing = rand(0.24, 0.34);
    const distance = rand(0.35, 1); // quieter and duller when farther
    const panner = ctx.createStereoPanner();
    panner.pan.value = rand(-0.85, 0.85);
    panner.connect(master);

    for (let i = 0; i < beats; i++) {
      const t = now + i * spacing + rand(-0.02, 0.02);
      const src = ctx.createBufferSource();
      src.buffer = white;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = rand(180, 340) + 200 * distance;
      band.Q.value = 1.1;
      const env = ctx.createGain();
      const peak = 0.22 * distance * (1 - i * 0.12);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(peak, t + 0.035);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      src.connect(band).connect(env).connect(panner);
      src.start(t, rand(0, white.duration - 0.5), 0.3);
    }
  }

  function scheduleFlaps() {
    if (!ctx) return;
    // Calm: rare and far away. Each Rotting node draws them closer and more often.
    const delay = threat > 0 ? rand(2, 4) + 7 / (1 + threat * 0.6) : rand(10, 18);
    timers.push(
      setTimeout(() => {
        if (enabled && ctx.state === 'running') flapCluster();
        scheduleFlaps();
      }, delay * 1000),
    );
  }

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    cueBus = ctx.createGain();
    cueBus.gain.value = 1.4; // cues sit above the bed
    cueBus.connect(master);
    white = noiseBuffer(ctx, 4);
    windLayer(-0.6);
    windLayer(0.6);
    rumble();
    scheduleFlaps();
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else if (enabled) ctx.resume();
    });
  }

  function setEnabled(on) {
    enabled = on;
    if (on && !ctx) build();
    if (!ctx) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    if (on) {
      ctx.resume();
      master.gain.linearRampToValueAtTime(MASTER_LEVEL, now + FADE);
    } else {
      master.gain.linearRampToValueAtTime(0, now + FADE);
      setTimeout(() => !enabled && ctx.suspend(), FADE * 1000 + 100);
    }
  }

  return {
    toggle: () => setEnabled(!enabled),
    setThreat(rotting) {
      threat = rotting;
    },
    get enabled() {
      return enabled;
    },
    // Where alert cues play, or null while sound is off.
    get cueOutput() {
      return enabled && ctx?.state === 'running' ? { ctx, out: cueBus, noise: white } : null;
    },
  };
}
