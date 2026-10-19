import { OUTSIDE_ID } from './topology.js';
import { seededRandom } from './random.js';
import { DIFFICULTIES } from './difficulty.js';

// Turns an engine summary into a graded Case File report. Every report is shaped by how
// the round was actually played: an analyst profile, marks earned, and a summary written
// from the round's own facts (with varied wording, so no two files read alike).

const GRADES = [
  [90, 'A'],
  [80, 'B'],
  [70, 'C'],
  [60, 'D'],
  [-Infinity, 'F'],
];

// Score weights. Tweak here to rebalance grading.
const PENALTY = {
  perNodeLost: 6, // every node that rotted at any point
  perStillRotting: 12, // nodes still rotting when the Hunt ends
  perMB: 0.35, // data lost
  noResponse: 25, // never acted at all
  slowResponseAfter: 8, // seconds of grace after the first alert
  perSlowSecond: 1.2,
  perIsolated: 1, // quarantine has a cost: those nodes are offline
};
const CONSUMED_CAP = 69; // a round that ends with rot still spreading can't beat a D
// Endless Watch is graded on weighted seconds survived: 144 weighted seconds is an A.
const ENDLESS_SECONDS_PER_POINT = 1.6;

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const ACTION_VERB = {
  isolate: 'Isolated',
  release: 'Released',
  block: 'Blocked outside source',
  restore: 'Restore started on',
  trace: 'Traced',
};
const ACTION_PHRASE = {
  isolate: (h) => `isolating ${h}`,
  release: (h) => `releasing ${h}`,
  block: () => 'blocking the outside source',
  restore: (h) => `restoring ${h}`,
  trace: (h) => `tracing ${h}`,
};

const fmtSeconds = (s) => `${s.toFixed(1)}s`;
// True if the round is (or, for a Twin Hunt, includes) the given Hunt.
const huntHas = (hunt, id) => hunt.id === id || Boolean(hunt.parts?.includes(id));
const clock = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function scoreRound(s) {
  if (s.hunt.endless) {
    const weight = DIFFICULTIES[s.hunt.difficulty ?? 'vulture'].endlessWeight;
    const score = Math.max(0, Math.min(100, Math.round((s.time * weight) / ENDLESS_SECONDS_PER_POINT)));
    return { score, grade: GRADES.find(([min]) => score >= min)[1], outcome: 'OVERRUN' };
  }
  let score = 100;
  score -= s.nodesLost.length * PENALTY.perNodeLost;
  score -= s.stillRotting * PENALTY.perStillRotting;
  score -= s.dataLostMB * PENALTY.perMB;
  score -= s.isolated * PENALTY.perIsolated;
  if (s.firstResponse === null) score -= PENALTY.noResponse;
  else score -= Math.max(0, s.firstResponse - PENALTY.slowResponseAfter) * PENALTY.perSlowSecond;

  const outcome = s.stillRotting === 0 ? 'CONTAINED' : 'CONSUMED';
  if (outcome === 'CONSUMED') score = Math.min(score, CONSUMED_CAP);
  score = Math.max(0, Math.round(score));
  const grade = GRADES.find(([min]) => score >= min)[1];
  return { score, grade, outcome };
}

// Facts about how the round was played, derived once and shared by profile, marks and prose.
function readRound(s, topology) {
  const count = (a) => s.actions.filter((x) => x.action === a).length;
  const firstRot = s.log.find((e) => e.level === 'CRIT' && e.nodeId && e.message.includes('rotting'));
  const blockAt = s.actions.find((a) => a.action === 'block')?.time ?? null;
  const scented = new Set(s.log.filter((e) => e.nodeId && e.message.includes('scented')).map((e) => e.nodeId));
  const lost = new Set(s.nodesLost);
  const site = (id) => topology.byId.get(id)?.site;
  // Block only matters in Hunts that involve the outside source.
  const outsideHunt = s.hunt.steps.some((st) => st.from === OUTSIDE_ID || st.path?.includes(OUTSIDE_ID));
  return {
    outsideHunt,
    isolates: count('isolate'),
    restores: count('restore'),
    traces: count('trace'),
    blocked: outsideHunt && blockAt !== null,
    blockAt,
    firstRot,
    firstRotTime: firstRot?.time ?? null,
    origin: s.nodesLost[0] ?? null,
    nearMisses: [...scented].filter((id) => !lost.has(id)),
    sitesHit: new Set(s.nodesLost.map(site)).size,
    crownFell: s.hunt.crown ? lost.has(s.hunt.crown) : null,
    tracedBeforeClear: s.actions.some((a) => a.action === 'trace' && (s.clearedAt === null || a.time <= s.clearedAt)),
    lastSeconds: s.clearedAt !== null && s.clearedAt >= s.duration - 4,
  };
}

// The analyst profile: first matching rule wins. CONTAINED and CONSUMED draw from different sets.
const PROFILES = {
  CONTAINED: [
    {
      title: 'The Gatekeeper',
      epithet: 'Shut the gate before the carrion reached it.',
      when: (s, r) => r.blocked && (r.firstRotTime === null || r.blockAt <= r.firstRotTime),
    },
    { title: 'The Omen', epithet: 'Saw the rot before it had a smell.', when: (s) => !s.nodesLost.length && s.firstResponse <= 3 },
    { title: 'Scorched Earth', epithet: 'Burned the field to save the harvest.', when: (s, r) => r.isolates >= 4 },
    { title: 'The Surgeon', epithet: 'Cut out the rot and left the body standing.', when: (s, r) => r.restores >= 2 && r.isolates <= 1 },
    { title: 'The Tracker', epithet: 'Followed the trail back to the first wound.', when: (s, r) => r.tracedBeforeClear },
    { title: 'The Last Feather', epithet: 'Held the line with the vultures already overhead.', when: (s, r) => r.lastSeconds },
    { title: 'The Warden', epithet: 'Caged the sick before they could spread it.', when: (s, r) => r.isolates >= 1 },
    { title: 'The Steady Hand', epithet: 'No panic. Just the work.', when: () => true },
  ],
  OVERRUN: [
    { title: 'The Last Vulture', epithet: 'Held the line long after any other would have fallen.', when: (s) => s.time >= 240 },
    { title: 'The Long Watch', epithet: 'Kept the vigil through wave after wave.', when: (s) => s.time >= 150 },
    { title: 'The Bystander', epithet: 'Watched the feast from the treeline.', when: (s) => !s.actions.length },
    { title: 'Bled Dry', epithet: 'The grid bled out while the watch stood guard.', when: (s) => s.hunt.overrun === 'bleed' },
    { title: 'Swarmed', epithet: 'The waves came faster than the hands.', when: () => true },
  ],
  CONSUMED: [
    { title: 'The Bystander', epithet: 'Watched the feast from the treeline.', when: (s) => !s.actions.length },
    { title: 'Bled Dry', epithet: 'The grid bled out while the watch stood guard.', when: (s) => s.dataLostMB > 50 },
    { title: 'The Late Arrival', epithet: 'Came looking for the body and found only bones.', when: (s) => s.firstResponse > 10 },
    { title: 'The Half-Saved', epithet: 'So close. A few still rot.', when: (s) => s.stillRotting <= 2 },
    { title: 'Outflanked', epithet: 'The rot moved faster than the hand.', when: () => true },
  ],
};

// Marks: small badges for specific things done (or suffered) this round.
function earnMarks(s, r, outcome, hostOf) {
  const marks = [];
  const add = (name, detail) => marks.push({ name, detail });
  if (outcome === 'CONTAINED' && s.hunt.difficulty === 'carrion') add('Crowned', 'Contained on Carrion King');
  if (outcome === 'CONTAINED' && s.hunt.parts) add('Two Fronts', 'Held off two Hunts at once');
  if (s.hunt.endless) {
    add(`Wave ${s.hunt.wave}`, `Survived ${s.hunt.wave} wave${s.hunt.wave === 1 ? '' : 's'}`);
    if (s.time >= 180) add('Long Watch', `Held for ${mmss(s.time)}`);
  }
  if (!s.nodesLost.length) add('Clean Bones', 'Not a single node rotted');
  if (s.firstResponse !== null && s.firstResponse <= 3) add('Quick Talons', `Acted ${fmtSeconds(s.firstResponse)} after the first alert`);
  if (r.blocked && r.firstRotTime !== null && r.blockAt > r.firstRotTime && outcome === 'CONTAINED')
    add('Shut the Door', 'Blocked the outside source mid-hunt');
  else if (r.blocked && (r.firstRotTime === null || r.blockAt <= r.firstRotTime)) add('Iron Gate', 'Blocked the source before anything fell');
  if (r.traces) add('Patient Zero', 'Traced the rot back toward its source');
  if (r.crownFell === false) add('Crown Intact', `${hostOf(s.hunt.crown)} never fell`);
  if (huntHas(s.hunt, 'bleed') && s.dataLostMB < 1) add('Vault Sealed', 'Nothing left the grid');
  if (huntHas(s.hunt, 'rot') && r.sitesHit && r.sitesHit <= 2) add('Firebreak', `Rot held to ${r.sitesHit} branch${r.sitesHit === 1 ? '' : 'es'}`);
  if (r.nearMisses.length >= 2) add('Close Calls', `${r.nearMisses.length} nodes caught while still Scented`);
  if (outcome === 'CONTAINED' && s.actions.length && s.actions.length <= 2) add('Light Touch', `Contained in ${s.actions.length} move${s.actions.length === 1 ? '' : 's'}`);
  if (r.lastSeconds && outcome === 'CONTAINED') add('Last Light', `Red cleared at ${clock(s.clearedAt)}, just before the end`);
  if (r.isolates >= 4) add('Cage Keeper', `${r.isolates} nodes quarantined`);
  if (s.nodesLost.length >= 10) add('Feast', `${s.nodesLost.length} nodes picked to the bone`);
  if (s.dataLostMB > 50) add('Open Vein', `${s.dataLostMB.toFixed(0)} MB bled out`);
  return marks.slice(0, 4);
}

// The moves that turned the round: the action that cleared the last red (else the first
// move), plus the isolate or block that set it up, when the clearing move was a restore.
function turningPoint(s) {
  const moves = s.actions.filter((a) => a.action !== 'trace' && a.action !== 'release');
  if (!moves.length) return [];
  const before = s.clearedAt === null ? [] : moves.filter((a) => a.time <= s.clearedAt + 0.05);
  const last = before.at(-1) ?? moves[0];
  if (last.action !== 'restore') return [last];
  const setup = moves.filter((a) => a.time <= last.time && (a.action === 'isolate' || a.action === 'block')).at(-1);
  return setup ? [setup, last] : [last];
}

function writeSummary(s, r, outcome, grade, hostOf, siteOf, rand) {
  const huntName = s.hunt.baseName ?? s.hunt.name; // "The Siege", not "Daily #3 · The Siege"
  const say = (...options) => options[Math.floor(rand() * options.length)];
  const lines = [];

  if (s.hunt.endless) {
    lines.push(
      say(
        `The Endless Watch held for ${mmss(s.time)} across ${s.hunt.wave} waves.`,
        `${s.hunt.wave} waves came in ${mmss(s.time)} before the grid gave way.`,
      ),
    );
    if (s.firstResponse !== null) lines.push(`The first response came ${fmtSeconds(s.firstResponse)} after the first alert.`);
    else lines.push('No analyst action was taken.');
    lines.push(`${s.nodesLost.length} node${s.nodesLost.length === 1 ? '' : 's'} rotted over the watch.`);
    lines.push(
      s.hunt.overrun === 'bleed'
        ? `It ended when ${s.dataLostMB.toFixed(0)} MB had bled out.`
        : 'It ended when too many nodes were rotting at once.',
    );
    lines.push(say('Every watch ends. The question is when.', 'The birds were patient. They always are.'));
    return lines.join(' ');
  }

  if (r.firstRot) {
    const host = hostOf(r.firstRot.nodeId);
    const site = siteOf(r.firstRot.nodeId);
    lines.push(
      say(
        `${huntName} took hold at ${host} in ${site} at ${clock(r.firstRot.time)}.`,
        `The first rot surfaced at ${clock(r.firstRot.time)}: ${host}, ${site}.`,
        `It began in ${site}, where ${host} turned at ${clock(r.firstRot.time)}.`,
      ),
    );
  } else {
    lines.push(say(`${huntName} never found purchase.`, `${huntName} circled, but nothing gave way.`, 'The rot came looking and found nothing to feed on.'));
  }

  if (s.firstResponse === null) {
    lines.push(say('No analyst action was taken.', 'Nobody moved.', 'The watch was silent.'));
  } else {
    const fast = s.firstResponse <= 3;
    lines.push(
      fast
        ? say(`The first response came ${fmtSeconds(s.firstResponse)} after the alarm.`, `The analyst was moving within ${fmtSeconds(s.firstResponse)}.`)
        : say(`The first response came ${fmtSeconds(s.firstResponse)} after the first alert.`, `It took ${fmtSeconds(s.firstResponse)} for the watch to answer.`),
    );
  }

  const turn = turningPoint(s);
  if (turn.length && outcome === 'CONTAINED') {
    const phrase = turn.map((a) => ACTION_PHRASE[a.action](a.id ? hostOf(a.id) : '')).join(', then ');
    const at = clock(turn[0].time);
    lines.push(say(`The turning point: ${phrase}, from ${at}.`, `What broke it was ${phrase}, starting ${at}.`));
  }

  if (s.nodesLost.length) {
    const n = s.nodesLost.length;
    const where = r.sitesHit > 1 ? ` across ${r.sitesHit} sites` : '';
    lines.push(
      s.clearedAt !== null
        ? `${n} node${n === 1 ? '' : 's'} rotted${where}; the last of the red was cleared at ${clock(s.clearedAt)}.`
        : `${n} node${n === 1 ? '' : 's'} rotted${where}.`,
    );
  }
  if (r.nearMisses.length) {
    const names = r.nearMisses.slice(0, 2).map(hostOf).join(' and ');
    lines.push(say(`${names} caught the scent but never turned.`, `${names} came close and were spared.`));
  }
  if (r.crownFell === true) lines.push(say(`${hostOf(s.hunt.crown)}, the prize, fell.`, `They reached ${hostOf(s.hunt.crown)}.`));
  if (r.crownFell === false && s.nodesLost.length) lines.push(`${hostOf(s.hunt.crown)} was kept out of reach.`);
  if (s.dataLostMB > 0.05) lines.push(`${s.dataLostMB.toFixed(1)} MB bled out to ${s.outsideIp}.`);
  else if (huntHas(s.hunt, 'bleed')) lines.push('Nothing left the grid.');

  const VERDICT = {
    CONTAINED: {
      A: ['Picked clean before the first feather landed.', 'The vultures left hungry.', 'A clean watch.'],
      B: ['The carcass was picked clean in time.', 'Contained, with a few scars.'],
      C: ['Contained, but the sky was dark with wings for a while.', 'Held, barely tidy.'],
      D: ['Contained at a cost.', 'Saved, though the bones show it.'],
      F: ['Contained, somehow.', 'The rot stopped, but not because of speed.'],
    },
    CONSUMED: {
      D: ['Nearly held. Nearly.', 'A few still rot when the watch ends.'],
      F: ['The vultures ate well.', 'The carcass belongs to the birds now.', 'Consumed, end to end.'],
    },
  };
  const verdicts = VERDICT[outcome][grade] ?? VERDICT[outcome].F ?? VERDICT.CONSUMED.F;
  const tail =
    outcome === 'CONSUMED' ? ` ${s.stillRotting} node${s.stillRotting === 1 ? ' was' : 's were'} still rotting at the end.` : '';
  lines.push(say(...verdicts) + tail);
  return lines.join(' ');
}

export function buildReport(s, topology, now = new Date()) {
  const hostOf = (id) => topology.byId.get(id)?.hostname ?? id;
  const siteOf = (id) => topology.byId.get(id)?.site ?? 'the grid';
  const { score, grade, outcome } = scoreRound(s);
  const r = readRound(s, topology);

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const caseNumber = `VG-${stamp}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const rand = seededRandom(caseNumber); // wording varies per case but is stable within one
  const profile = PROFILES[outcome].find((p) => p.when(s, r));

  // Key moments: alarms, stage changes and analyst actions, in time order.
  const timeline = s.log
    .filter((e) => e.level === 'CRIT' || e.message.startsWith('Kill chain') || e.message.includes('analyst'))
    .map((e) => ({ time: e.time, level: e.level, text: e.message }));
  for (const a of s.actions) {
    if (a.action !== 'isolate') timeline.push({ time: a.time, level: 'ACT', text: actionText(a, hostOf) });
  }
  timeline.sort((a, b) => a.time - b.time);

  return {
    caseNumber,
    date: now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    huntName: s.hunt.name,
    huntId: s.hunt.id,
    difficultyKey: s.hunt.difficulty ?? 'vulture',
    difficulty: DIFFICULTIES[s.hunt.difficulty ?? 'vulture'].name,
    daily: s.hunt.daily ?? null,
    outsideIp: r.outsideHunt ? s.outsideIp : null, // only meaningful when the Hunt involves the outside
    origin: r.origin ? `${hostOf(r.origin)} · ${siteOf(r.origin)}` : 'None',
    outcome,
    grade,
    score,
    profile: { title: profile.title, epithet: profile.epithet },
    marks: earnMarks(s, r, outcome, hostOf),
    endless: s.hunt.endless ? { survived: mmss(s.time), waves: s.hunt.wave } : null,
    stats: s.hunt.endless
      ? [
          ['Survived', mmss(s.time)],
          ['Waves', String(s.hunt.wave)],
          ['First response', s.firstResponse === null ? 'None' : fmtSeconds(s.firstResponse)],
          ['Nodes lost', String(s.nodesLost.length)],
          ['Data lost', `${s.dataLostMB.toFixed(1)} MB`],
          ['Quarantined', String(s.isolated)],
        ]
      : [
      ['First response', s.firstResponse === null ? 'None' : fmtSeconds(s.firstResponse)],
      ['Red cleared at', s.clearedAt === null ? (s.nodesLost.length ? 'Never' : 'n/a') : clock(s.clearedAt)],
      ['Nodes lost', String(s.nodesLost.length)],
      ['Still rotting', String(s.stillRotting)],
      ['Data lost', `${s.dataLostMB.toFixed(1)} MB`],
      ['Quarantined', String(s.isolated)],
    ],
    timeline: timeline.slice(0, 16),
    timelineTruncated: timeline.length > 16,
    actions: s.actions.map((a) => ({ time: a.time, text: actionText(a, hostOf) })),
    summary: writeSummary(s, r, outcome, grade, hostOf, siteOf, rand),
  };
}

function actionText(a, hostOf) {
  return a.id ? `${ACTION_VERB[a.action]} ${hostOf(a.id)}` : ACTION_VERB[a.action];
}
