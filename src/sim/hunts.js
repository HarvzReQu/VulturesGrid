import { OUTSIDE_ID } from './topology.js';

// Hunt definitions. Each Hunt is a timeline of steps the engine plays back.
// To add a Hunt, append an object to HUNTS; no engine changes needed.
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

// The Rot: fast spread from each branch's first workstation to the next branch around the ring.
function rotSteps() {
  const hop = 0.4;
  const dwell = 1;
  const pathHops = 6; // ws -> rtr -> fw -> core -> fw -> rtr -> ws
  const legTime = 0.5 + pathHops * hop + dwell;

  const steps = [
    { at: 0, stage: 0, do: 'scent', node: 'ashford-ws1' },
    { at: 2, do: 'rot', node: 'ashford-ws1' },
  ];
  RING.forEach((branch, i) => {
    const rotAt = 2 + i * legTime;
    steps.push(
      { at: rotAt + 0.3, do: 'spread', from: `${branch}-ws1`, to: `${branch}-ws2`, hop: 0.5, dwell: 0.8 },
      { at: rotAt + 0.6, do: 'spread', from: `${branch}-ws1`, to: `${branch}-ws3`, hop: 0.5, dwell: 0.8 },
    );
    const next = RING[i + 1];
    if (next) {
      const step = { at: rotAt + 0.5, do: 'spread', from: `${branch}-ws1`, to: `${next}-ws1`, hop, dwell };
      if (i === 0) step.stage = 1;
      if (i === 1) step.stage = 2;
      if (i === 3) step.stage = 3;
      steps.push(step);
    }
  });
  return steps.sort((a, b) => a.at - b.at);
}

export const HUNTS = [
  {
    id: 'lure',
    name: 'The Lure',
    blurb: 'A branch workstation takes the bait. The rot hops node by node toward the HQ domain controller.',
    duration: 22,
    steps: [
      { at: 0, stage: 0, do: 'scent', node: 'ashford-ws2' },
      { at: 3, do: 'rot', node: 'ashford-ws2' },
      { at: 5, stage: 1, do: 'spread', from: 'ashford-ws2', to: 'ashford-rtr' },
      { at: 9, do: 'spread', from: 'ashford-rtr', to: 'ashford-fw' },
      { at: 12, stage: 2, do: 'spread', from: 'ashford-fw', to: 'hq-core' },
      { at: 16, do: 'spread', from: 'hq-core', to: 'hq-dc' },
      { at: 17, stage: 3 },
    ],
  },
  {
    id: 'rot',
    name: 'The Rot',
    blurb: 'Decay that will not stay put. It leaps from branch to branch around the ring.',
    duration: 27,
    steps: rotSteps(),
  },
  {
    id: 'siege',
    name: 'The Siege',
    blurb: 'A swarm from outside hammers the HQ web server until it gives way.',
    duration: 23,
    steps: [
      { at: 0, stage: 0, do: 'stream', id: 'siege', path: [OUTSIDE_ID, 'hq-fw', 'hq-web'], rate: 4 },
      { at: 5, stage: 1, do: 'scent', node: 'hq-web', requires: 'siege' },
      { at: 5, do: 'stream', id: 'siege', path: [OUTSIDE_ID, 'hq-fw', 'hq-web'], rate: 16, update: true },
      { at: 12, do: 'rot', node: 'hq-web', requires: 'siege' },
      { at: 12, do: 'stream-stop', id: 'siege' },
      { at: 13, stage: 2, do: 'spread', from: 'hq-web', to: 'hq-dc' },
      { at: 17.5, stage: 3, do: 'spread', from: 'hq-dc', to: 'hq-files' },
    ],
  },
  {
    id: 'bleed',
    name: 'The Bleed',
    blurb: 'The database is opened from within, and a steady red stream drains off the map.',
    duration: 31,
    steps: [
      { at: 0, stage: 0, do: 'spread', from: OUTSIDE_ID, to: 'hq-web', hop: 1.2 },
      { at: 6, stage: 1, do: 'spread', from: 'hq-web', to: 'hq-db' },
      { at: 12, stage: 2, do: 'spread', from: 'hq-db', to: 'hq-files' },
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
  },
];

export function pickHunt(id) {
  if (id === 'random') return HUNTS[Math.floor(Math.random() * HUNTS.length)];
  return HUNTS.find((h) => h.id === id) ?? HUNTS[0];
}
