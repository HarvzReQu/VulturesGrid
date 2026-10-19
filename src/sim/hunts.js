import { OUTSIDE_ID } from './topology.js';

// Hunt definitions. Each Hunt builds a fresh timeline of steps every time it starts,
// so rounds differ (starting branch, direction, target). To add a Hunt, append an
// object to HUNTS with a build(rand) function; no engine changes needed.
//
// build(rand) returns { steps, crown? }:
//   crown        (optional) the node this round is after; the Case File notes if it survived
//
// Step fields:
//   at           seconds from Hunt start
//   stage        (optional) kill-chain stage index this step begins (0-3)
//   do           'scent' | 'rot' | 'spread' | 'stream' | 'stream-stop'
//   node         scent / rot: target node id
//   from, to     spread: a red pulse travels the shortest path; on arrival `to` turns
//                Scented, then Rotting after `dwell` seconds. Skipped if `from` is no longer Rotting.
//   hop, dwell   spread timing overrides (seconds per link, seconds Scented before Rotting)
//   id, path     stream: continuous particles along a list of node ids ('@outside' = off-map)
//   rate         stream: particles per second
//   leak         stream: MB per second counted as data lost while it runs
//   update       stream: only change an existing stream's rate; don't restart a stopped one
//   requires     scent / rot: skipped unless this stream is still getting through
//                (not stopped by Isolate, not bounced by Block)

export const STAGES = ['Initial Access', 'Execution', 'Lateral Movement', 'Impact'];

const RING = ['ashford', 'bramble', 'cinder', 'dunmore', 'elmstead', 'fenwick'];
const HQ_SERVERS = ['hq-dc', 'hq-files', 'hq-db'];

const pick = (rand, list) => list[Math.floor(rand() * list.length)];

// The Lure: one branch workstation (every branch has at least three) hops toward an HQ server.
function lure(rand) {
  const branch = pick(rand, RING);
  const ws = `${branch}-ws${1 + Math.floor(rand() * 3)}`;
  const crown = pick(rand, HQ_SERVERS);
  return {
    crown,
    steps: [
      { at: 0, stage: 0, do: 'scent', node: ws },
      { at: 3, do: 'rot', node: ws },
      { at: 5, stage: 1, do: 'spread', from: ws, to: `${branch}-rtr` },
      { at: 9, do: 'spread', from: `${branch}-rtr`, to: `${branch}-fw` },
      { at: 12, stage: 2, do: 'spread', from: `${branch}-fw`, to: 'hq-core' },
      { at: 16, do: 'spread', from: 'hq-core', to: crown },
      { at: 17, stage: 3 },
    ],
  };
}

// The Rot: fast spread from a random branch around the ring, in a random direction.
function rot(rand) {
  const start = Math.floor(rand() * RING.length);
  const dir = rand() < 0.5 ? 1 : -1;
  const order = RING.map((_, i) => RING[(start + dir * i + RING.length) % RING.length]);

  const hop = 0.4;
  const dwell = 1;
  const pathHops = 6; // ws -> rtr -> fw -> core -> fw -> rtr -> ws
  const legTime = 0.5 + pathHops * hop + dwell;
  const first = `${order[0]}-ws1`;

  const steps = [
    { at: 0, stage: 0, do: 'scent', node: first },
    { at: 2, do: 'rot', node: first },
  ];
  order.forEach((branch, i) => {
    const rotAt = 2 + i * legTime;
    steps.push(
      { at: rotAt + 0.3, do: 'spread', from: `${branch}-ws1`, to: `${branch}-ws2`, hop: 0.5, dwell: 0.8 },
      { at: rotAt + 0.6, do: 'spread', from: `${branch}-ws1`, to: `${branch}-ws3`, hop: 0.5, dwell: 0.8 },
    );
    const next = order[i + 1];
    if (next) {
      const step = { at: rotAt + 0.5, do: 'spread', from: `${branch}-ws1`, to: `${next}-ws1`, hop, dwell };
      if (i === 0) step.stage = 1;
      if (i === 1) step.stage = 2;
      if (i === 3) step.stage = 3;
      steps.push(step);
    }
  });
  return { steps: steps.sort((a, b) => a.at - b.at) };
}

// The Siege: an outside flood on the web server, then lateral moves to two HQ servers.
function siege(rand) {
  const [second, third] = [...HQ_SERVERS].sort(() => rand() - 0.5);
  const path = [OUTSIDE_ID, 'hq-fw', 'hq-web'];
  return {
    crown: 'hq-web',
    steps: [
      { at: 0, stage: 0, do: 'stream', id: 'siege', path, rate: 4 },
      { at: 5, stage: 1, do: 'scent', node: 'hq-web', requires: 'siege' },
      { at: 5, do: 'stream', id: 'siege', path, rate: 16, update: true },
      { at: 12, do: 'rot', node: 'hq-web', requires: 'siege' },
      { at: 12, do: 'stream-stop', id: 'siege' },
      { at: 13, stage: 2, do: 'spread', from: 'hq-web', to: second },
      { at: 17.5, stage: 3, do: 'spread', from: second, to: third },
    ],
  };
}

// The Bleed: in through the web server, down to the database, then a steady drain off-map.
function bleed(rand) {
  return {
    crown: 'hq-db',
    steps: [
      { at: 0, stage: 0, do: 'spread', from: OUTSIDE_ID, to: 'hq-web', hop: 1.2 },
      { at: 6, stage: 1, do: 'spread', from: 'hq-web', to: 'hq-db' },
      { at: 12, stage: 2, do: 'spread', from: 'hq-db', to: pick(rand, ['hq-files', 'hq-dc']) },
      {
        at: 14,
        stage: 3,
        do: 'stream',
        id: 'bleed',
        path: ['hq-db', 'hq-core', 'hq-fw', OUTSIDE_ID],
        rate: 16,
        leak: 6.5,
      },
      { at: 30, do: 'stream-stop', id: 'bleed' },
    ],
  };
}

export const HUNTS = [
  {
    id: 'lure',
    name: 'The Lure',
    blurb: 'A branch workstation takes the bait. The rot hops node by node toward an HQ server.',
    duration: 22,
    build: lure,
  },
  {
    id: 'rot',
    name: 'The Rot',
    blurb: 'Decay that will not stay put. It leaps from branch to branch around the ring.',
    duration: 27,
    build: rot,
  },
  {
    id: 'siege',
    name: 'The Siege',
    blurb: 'A swarm from outside hammers the HQ web server until it gives way.',
    duration: 23,
    build: siege,
  },
  {
    id: 'bleed',
    name: 'The Bleed',
    blurb: 'The database is opened from within, and a steady red stream drains off the map.',
    duration: 31,
    build: bleed,
  },
];

const TWIN_OFFSET = 5; // seconds before the second attack begins

// Twin Hunt: two different Hunts at once, the second a few seconds behind the first.
// The kill chain only ever moves forward, so a later "Initial Access" doesn't rewind it.
export const TWIN = {
  id: 'twin',
  name: 'Twin Hunt',
  blurb: 'Two different Hunts at once, the second a few seconds behind the first. Choose what to save.',
  duration: 0, // set by build
  build(rand) {
    const [a, b] = [...HUNTS].sort(() => rand() - 0.5);
    const ra = a.build(rand);
    const rb = b.build(rand);
    let maxStage = -1;
    const steps = [...ra.steps, ...rb.steps.map((s) => ({ ...s, at: s.at + TWIN_OFFSET }))]
      .sort((x, y) => x.at - y.at)
      .map((s) => {
        if (s.stage === undefined) return s;
        if (s.stage <= maxStage) {
          const { stage, ...rest } = s;
          return rest;
        }
        maxStage = s.stage;
        return s;
      });
    return {
      name: `Twin Hunt: ${a.name} + ${b.name}`,
      baseName: 'The Twin Hunt',
      parts: [a.id, b.id],
      duration: Math.max(a.duration, b.duration + TWIN_OFFSET),
      crown: ra.crown ?? rb.crown,
      steps,
    };
  },
};

// Endless Watch: starts empty; the Endless controller (endless.js) feeds it waves.
export const ENDLESS = {
  id: 'endless',
  name: 'Endless Watch',
  blurb: 'Waves of attacks, each faster than the last. The watch ends when 8 nodes rot at once or 120 MB bleed out. Survive as long as you can.',
  duration: Infinity,
  build: () => ({ steps: [], endless: true, wave: 0, maxCages: 4 }),
};

// The guided tutorial's round. Not in the dropdown; the tutorial holds the timeline
// between lessons, so these times only set the order of events.
export const TRAINING = {
  id: 'training',
  name: 'Training Hunt',
  blurb: 'A guided first watch.',
  duration: 24,
  build: () => ({
    crown: 'hq-web',
    steps: [
      { at: 0.5, stage: 0, do: 'scent', node: 'ashford-ws1' },
      { at: 4, do: 'rot', node: 'ashford-ws1' },
      { at: 6, stage: 1, do: 'spread', from: 'ashford-ws1', to: 'ashford-rtr' }, // fizzles once isolated
      { at: 9, stage: 2, do: 'stream', id: 'siege', path: [OUTSIDE_ID, 'hq-fw', 'hq-web'], rate: 10 },
      { at: 11, do: 'scent', node: 'hq-web', requires: 'siege' },
      { at: 14, do: 'rot', node: 'hq-web', requires: 'siege' },
      { at: 16, stage: 3, do: 'spread', from: 'hq-web', to: 'hq-db' }, // fizzles once restored
      { at: 22, do: 'stream-stop', id: 'siege' },
    ],
  }),
};

// Returns a playable round: the Hunt's definition plus this round's freshly built steps.
export function pickHunt(id, rand = Math.random) {
  const def = id === 'random' ? pick(rand, HUNTS) : ([...HUNTS, TWIN, ENDLESS].find((h) => h.id === id) ?? HUNTS[0]);
  return { ...def, ...def.build(rand) };
}
