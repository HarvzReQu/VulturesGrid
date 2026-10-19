import { loadRecord, recordStats, bestKey, clearRecord } from '../sim/record.js';
import { DIFFICULTIES } from '../sim/difficulty.js';
import { escapeHtml } from './format.js';

// "Your record" dialog: headline stats, best grade per Hunt and difficulty, recent cases.
export function createRecordView({ hunts }) {
  const dialog = document.getElementById('record');
  const body = dialog.querySelector('.record-body');
  const openLink = document.getElementById('record-open');
  const rows = [{ id: 'daily', name: 'Daily Hunt' }, ...hunts.map((h) => ({ id: h.id, name: h.name }))];
  const levels = Object.entries(DIFFICULTIES);

  function render() {
    const record = loadRecord();
    const stats = recordStats(record);
    const cell = (id, level) => {
      // The Daily Hunt is only ever played on Vulture.
      if (id === 'daily' && level !== 'vulture') return '<td class="na">–</td>';
      const best = record.best[bestKey(id, level)];
      return best
        ? `<td class="grade grade-${best.grade}" title="${best.score}/100">${best.grade}<small>${best.score}</small></td>`
        : '<td class="empty">·</td>';
    };
    const when = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

    body.innerHTML = `
      <dl class="record-stats">
        <div><dt>Rounds</dt><dd>${stats.rounds}</dd></div>
        <div><dt>Contained</dt><dd>${stats.containedRate}%</dd></div>
        <div><dt>A grades</dt><dd>${stats.aGrades}</dd></div>
        <div><dt>Streak</dt><dd>${stats.streak}</dd></div>
      </dl>
      <h3>Best grades</h3>
      <table class="record-grid">
        <thead><tr><th></th>${levels.map(([, d]) => `<th>${d.name}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr><th>${r.name}</th>${levels.map(([k]) => cell(r.id, k)).join('')}</tr>`).join('')}</tbody>
      </table>
      <h3>Recent cases</h3>
      ${
        record.cases.length
          ? `<ol class="record-cases">${record.cases
              .slice(0, 8)
              .map(
                (c) => `<li class="${c.outcome === 'CONTAINED' ? 'is-contained' : 'is-consumed'}">
                  <span class="rc-grade">${c.grade}</span>
                  <span class="rc-main"><b>${escapeHtml(c.huntName)}</b><em>${escapeHtml(c.profile)} · ${DIFFICULTIES[c.difficulty]?.name ?? ''}</em></span>
                  <span class="rc-date">${when(c.at)}</span>
                </li>`,
              )
              .join('')}</ol>`
          : '<p class="record-empty">No cases yet. Finish a Hunt and it will be filed here.</p>'
      }`;
    dialog.querySelector('[data-clear]').hidden = !record.cases.length;
    openLink.textContent = stats.rounds ? `Your record (${stats.rounds}) →` : 'Your record →';
  }

  openLink.addEventListener('click', () => {
    render();
    dialog.showModal();
  });
  dialog.addEventListener('click', (e) => {
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target === dialog && outside) dialog.close();
    if (e.target.closest('[data-close]')) dialog.close();
    if (e.target.closest('[data-clear]') && confirm('Clear your whole record? This cannot be undone.')) {
      clearRecord();
      render();
    }
  });

  render();
  return { refresh: render };
}
