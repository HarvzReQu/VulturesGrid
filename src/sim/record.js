// The player's record, kept in this browser: recent cases and the best result for each
// Hunt at each difficulty. Training rounds are never recorded.
const KEY = 'vg-record-v1';
const MAX_CASES = 60;
const empty = () => ({ cases: [], best: {} });

export const bestKey = (huntId, difficulty) => `${huntId}|${difficulty}`;

export function loadRecord() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    return data?.cases && data?.best ? data : empty();
  } catch {
    return empty();
  }
}

function save(record) {
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
  } catch {
    // Storage blocked or full: the record just isn't kept.
  }
}

// Adds a finished round. Returns { newBest, previous } for the Case File.
export function addToRecord(report) {
  const record = loadRecord();
  record.cases.unshift({
    at: Date.now(),
    huntId: report.huntId,
    huntName: report.huntName,
    difficulty: report.difficultyKey,
    grade: report.grade,
    score: report.score,
    outcome: report.outcome,
    profile: report.profile.title,
  });
  record.cases.length = Math.min(record.cases.length, MAX_CASES);

  const key = bestKey(report.daily ? 'daily' : report.huntId, report.difficultyKey);
  const previous = record.best[key] ?? null;
  const newBest = !previous || report.score > previous.score;
  if (newBest) record.best[key] = { grade: report.grade, score: report.score };
  save(record);
  return { newBest, previous };
}

export function clearRecord() {
  save(empty());
}

// Headline numbers for the record view.
export function recordStats(record) {
  // Endless Watch always ends overrun, so it doesn't count toward containment or the streak.
  const cases = record.cases;
  const hunts = cases.filter((c) => c.outcome !== 'OVERRUN');
  const contained = hunts.filter((c) => c.outcome === 'CONTAINED').length;
  let streak = 0;
  for (const c of hunts) {
    if (c.outcome !== 'CONTAINED') break;
    streak++;
  }
  return {
    rounds: cases.length,
    containedRate: hunts.length ? Math.round((contained / hunts.length) * 100) : 0,
    aGrades: cases.filter((c) => c.grade === 'A').length,
    streak,
  };
}
