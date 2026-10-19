import { DIFFICULTIES, DEFAULT_DIFFICULTY } from '../sim/difficulty.js';
import { dailyRound, dailyKey, untilNextDaily, loadDailyBest } from '../sim/daily.js';

const DIFFICULTY_KEY = 'vg-difficulty';

function loadDifficulty() {
  try {
    const saved = localStorage.getItem(DIFFICULTY_KEY);
    return DIFFICULTIES[saved] ? saved : DEFAULT_DIFFICULTY;
  } catch {
    return DEFAULT_DIFFICULTY;
  }
}

// Hunt picker (Daily Hunt, the four Hunts, Random), difficulty switch, Begin / Reset,
// and a live status line. onBegin(huntId, difficulty).
export function createHuntPanel({ hunts, onBegin, onReset }) {
  const select = document.getElementById('hunt-select');
  const blurb = document.getElementById('hunt-blurb');
  const status = document.getElementById('hunt-status');
  const levelButtons = [...document.querySelectorAll('#difficulty [data-level]')];
  const levelNote = document.getElementById('difficulty-note');
  let difficulty = loadDifficulty();

  select.add(new Option(`Daily Hunt #${dailyRound().daily.number}`, 'daily'));
  for (const hunt of hunts) select.add(new Option(hunt.name, hunt.id));
  select.add(new Option('Random', 'random'));
  select.value = 'daily';

  const isDaily = () => select.value === 'daily';

  function describe() {
    if (isDaily()) {
      const today = dailyRound();
      const best = loadDailyBest(dailyKey());
      const bestText = best ? ` Your best today: ${best.grade} (${best.score}).` : '';
      blurb.textContent = `Today it's ${today.baseName}. Same round for everyone, on Vulture difficulty. Next one in ${untilNextDaily()}.${bestText}`;
    } else {
      const hunt = hunts.find((h) => h.id === select.value);
      blurb.textContent = hunt ? hunt.blurb : 'One of the four Hunts, chosen at random.';
    }
    syncLevels();
  }

  // The Daily Hunt pins difficulty to the default so grades are comparable.
  function syncLevels() {
    const shown = isDaily() ? DEFAULT_DIFFICULTY : difficulty;
    for (const b of levelButtons) {
      b.setAttribute('aria-checked', String(b.dataset.level === shown));
      b.disabled = isDaily() || select.disabled;
    }
    levelNote.textContent = isDaily() ? 'Daily Hunts are always played on Vulture.' : DIFFICULTIES[shown].blurb;
  }

  for (const b of levelButtons) {
    b.addEventListener('click', () => {
      difficulty = b.dataset.level;
      try {
        localStorage.setItem(DIFFICULTY_KEY, difficulty);
      } catch {
        // Not remembered; fine.
      }
      syncLevels();
    });
  }

  select.addEventListener('change', describe);
  setInterval(() => isDaily() && describe(), 30000); // keep the countdown fresh
  describe();

  document.getElementById('hunt-begin').addEventListener('click', () => onBegin(select.value, difficulty));
  document.getElementById('hunt-reset').addEventListener('click', onReset);

  let last = '';
  // replayAt: playhead time while replaying, otherwise null. override: a ready-made status line.
  function update(engine, replayAt = null, override = null) {
    let text = 'Quiet. Choose a Hunt and begin.';
    if (override) {
      text = override;
    } else if (replayAt !== null) {
      text = `${engine.hunt.name} · Replay T+${replayAt.toFixed(1)}s`;
    } else if (engine.hunt) {
      const parts = [
        engine.hunt.name,
        `T+${engine.time.toFixed(1)}s`,
        `${engine.countState('rotting')} rotting`,
      ];
      if (engine.dataLostMB > 0) parts.push(`${engine.dataLostMB.toFixed(1)} MB lost`);
      if (engine.finished) parts.push('Hunt over');
      text = parts.join(' · ');
    }
    if (text !== last) status.textContent = last = text;
  }

  return {
    update,
    refresh: describe,
    setValue(id) {
      select.value = id;
      describe();
    },
  };
}
