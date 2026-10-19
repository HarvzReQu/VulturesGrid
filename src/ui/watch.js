import { clockLabel, escapeHtml } from './format.js';

const MAX_ROWS = 400;

// "The Watch": live event log with severity filter and text search.
export function createWatch({ onSelectNode }) {
  const root = document.getElementById('watch');
  const list = root.querySelector('.watch-list');
  const search = root.querySelector('.watch-search');
  const count = root.querySelector('.watch-count');
  const chips = [...root.querySelectorAll('[data-level]')];
  let entries = [];
  let level = 'ALL';
  let cutoff = null; // during replay, only events up to the playhead are shown
  let visibleCount = -1;

  const matches = (e) =>
    (cutoff === null || e.time <= cutoff) &&
    (level === 'ALL' || e.level === level) &&
    (!search.value || e.message.toLowerCase().includes(search.value.toLowerCase()));

  function row(e) {
    const li = document.createElement('li');
    li.className = `watch-row lvl-${e.level}`;
    if (e.nodeId) {
      li.dataset.node = e.nodeId;
      li.tabIndex = 0;
    }
    li.innerHTML = `<time>${clockLabel(e.time)}</time><span class="tag tag-${e.level}">${e.level}</span><span class="msg">${escapeHtml(e.message)}</span>`;
    return li;
  }

  function renderAll() {
    list.replaceChildren(...entries.filter(matches).slice(-MAX_ROWS).reverse().map(row));
    updateCount();
  }

  function updateCount() {
    const shown = list.children.length;
    count.textContent = shown === entries.length ? `${shown}` : `${shown} / ${entries.length}`;
  }

  function add(entry) {
    entries.push(entry);
    if (!matches(entry)) return updateCount();
    list.prepend(row(entry));
    if (list.children.length > MAX_ROWS) list.lastElementChild.remove();
    updateCount();
  }

  function clear() {
    entries = [];
    renderAll();
  }

  function setCutoff(t) {
    // Re-render only when the set of visible events changes (-1 = live, no cutoff).
    const count = t === null ? -1 : entries.filter((e) => e.time <= t).length;
    cutoff = t;
    if (count === visibleCount) return;
    visibleCount = count;
    renderAll();
  }

  search.addEventListener('input', renderAll);
  for (const chip of chips) {
    chip.addEventListener('click', () => {
      level = chip.dataset.level;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      renderAll();
    });
  }
  const pick = (e) => {
    const li = e.target.closest('[data-node]');
    if (li) onSelectNode(li.dataset.node);
  };
  list.addEventListener('click', pick);
  list.addEventListener('keydown', (e) => e.key === 'Enter' && pick(e));

  root.querySelector('.watch-toggle').addEventListener('click', () => root.classList.toggle('open'));

  renderAll();
  return { add, clear, setCutoff };
}
