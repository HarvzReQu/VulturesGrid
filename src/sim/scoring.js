// Turns an engine summary into a graded Case File report.

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

const ACTION_VERB = {
  isolate: 'Isolated',
  release: 'Released',
  block: 'Blocked outside source',
  restore: 'Restore started on',
  trace: 'Traced',
};

const fmtSeconds = (s) => `${s.toFixed(1)}s`;
const clock = (s) => {
  const t = Math.max(0, Math.floor(s));
  return `T+${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

export function scoreRound(s) {
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

function writeSummary(s, outcome, hostOf) {
  const lines = [];
  const firstRot = s.log.find((e) => e.level === 'CRIT' && e.nodeId);
  lines.push(
    firstRot
      ? `${s.hunt.name} took hold at ${hostOf(firstRot.nodeId)} at ${clock(firstRot.time)}.`
      : `${s.hunt.name} never took hold; no node rotted.`,
  );
  lines.push(
    s.firstResponse === null
      ? 'No analyst action was taken.'
      : `The first response came ${fmtSeconds(s.firstResponse)} after the first alert.`,
  );
  if (s.nodesLost.length) {
    const n = s.nodesLost.length;
    lines.push(
      `${n} node${n === 1 ? '' : 's'} rotted` +
        (s.clearedAt !== null ? `; the last of the red was cleared at ${clock(s.clearedAt)}.` : '.'),
    );
  }
  if (s.dataLostMB > 0.05) lines.push(`${s.dataLostMB.toFixed(1)} MB bled out to ${s.outsideIp}.`);
  else if (s.hunt.id === 'bleed') lines.push('Nothing left the grid.');
  lines.push(
    outcome === 'CONTAINED'
      ? 'The carcass was picked clean in time.'
      : `${s.stillRotting} node${s.stillRotting === 1 ? ' was' : 's were'} still rotting when the watch ended.`,
  );
  return lines.join(' ');
}

export function buildReport(s, topology, now = new Date()) {
  const hostOf = (id) => topology.byId.get(id)?.hostname ?? id;
  const { score, grade, outcome } = scoreRound(s);

  // Key moments: alarms, stage changes and analyst actions, in time order.
  const timeline = s.log
    .filter((e) => e.level === 'CRIT' || e.message.startsWith('Kill chain') || e.message.includes('analyst'))
    .map((e) => ({ time: e.time, level: e.level, text: e.message }));
  for (const a of s.actions) {
    if (a.action !== 'isolate') timeline.push({ time: a.time, level: 'ACT', text: actionText(a, hostOf) });
  }
  timeline.sort((a, b) => a.time - b.time);

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return {
    caseNumber: `VG-${stamp}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`,
    date: now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }),
    huntName: s.hunt.name,
    outsideIp: s.outsideIp,
    outcome,
    grade,
    score,
    stats: [
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
    summary: writeSummary(s, outcome, hostOf),
  };
}

function actionText(a, hostOf) {
  return a.id ? `${ACTION_VERB[a.action]} ${hostOf(a.id)}` : ACTION_VERB[a.action];
}
