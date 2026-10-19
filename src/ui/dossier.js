import { COOLDOWNS } from '../sim/engine.js';
import { STATES } from '../sim/states.js';
import { clockLabel, escapeHtml } from './format.js';

const ACTIONS = [
  { id: 'isolate', name: 'Isolate', sub: 'Quarantine; cut its links' },
  { id: 'block', name: 'Block', sub: 'Blocklist the outside source' },
  { id: 'restore', name: 'Restore', sub: 'Revive a Rotting node (5s)' },
  { id: 'trace', name: 'Trace', sub: 'Show the path the rot took' },
];

// Case-file side panel for the selected node: details, recent events and the four actions.
// viewState(id) is the state currently on screen (differs from the engine during replay);
// isLocked() disables the actions while replaying.
export function createDossier({ engine, topology, viewState, isLocked, onAction, onClose }) {
  const el = document.getElementById('dossier');
  const body = el.querySelector('.dossier-body');
  let nodeId = null;
  const buttonState = new Map();

  el.querySelector('.dossier-close').addEventListener('click', onClose);
  el.addEventListener('click', (e) => {
    const button = e.target.closest('[data-action]');
    if (button && !button.disabled && nodeId) onAction(button.dataset.action, nodeId);
  });

  function render() {
    if (!nodeId) return;
    const node = topology.byId.get(nodeId);
    const state = viewState(nodeId);
    const events = engine.log.filter((entry) => entry.nodeId === nodeId).slice(-6).reverse();

    body.innerHTML = `
      <p class="dossier-kicker">${escapeHtml(node.site)}</p>
      <h2 class="dossier-title">${escapeHtml(node.label)}</h2>
      <p class="dossier-state" data-state="${state}">
        <i></i>${STATES[state].name} <em>${STATES[state].plain}</em>
      </p>
      <dl class="dossier-facts">
        <dt>Hostname</dt><dd>${escapeHtml(node.hostname)}</dd>
        <dt>IP</dt><dd>${escapeHtml(node.ip)}</dd>
        <dt>OS</dt><dd>${escapeHtml(node.os)}</dd>
        <dt>Type</dt><dd>${escapeHtml(node.type)}</dd>
      </dl>
      <div class="dossier-actions">
        ${ACTIONS.map(
          (a) => `
          <button class="act" data-action="${a.id}">
            <span class="act-name">${a.name}</span>
            <span class="act-sub">${a.sub}</span>
            <span class="act-cd"></span>
          </button>`,
        ).join('')}
      </div>
      <div class="restore-bar" hidden><span></span></div>
      <p class="dossier-locked" hidden>Replaying: actions are disabled.</p>
      <h3 class="dossier-subhead">Recent events</h3>
      <ol class="dossier-events">
        ${
          events.length
            ? events
                .map(
                  (e) =>
                    `<li><time>${clockLabel(e.time)}</time><span class="tag tag-${e.level}">${e.level}</span>${escapeHtml(e.message)}</li>`,
                )
                .join('')
            : '<li class="empty">Nothing recorded. Yet.</li>'
        }
      </ol>`;
    buttonState.clear();
    tick();
  }

  // Per-frame: cooldown sweeps, labels and the restore progress bar.
  function tick() {
    if (!nodeId) return;
    const state = engine.stateOf(nodeId);
    const huntActive = Boolean(engine.hunt);
    const locked = isLocked();
    const lockNote = body.querySelector('.dossier-locked');
    if (lockNote) lockNote.hidden = !locked;

    for (const a of ACTIONS) {
      const button = body.querySelector(`[data-action="${a.id}"]`);
      if (!button) continue;
      const remaining = engine.cooldown(a.id);
      let name = a.name;
      let available = true;
      if (a.id === 'isolate') {
        if (state === 'picked') name = 'Release';
        else available = remaining === 0;
      } else if (a.id === 'block') {
        if (engine.blocked) name = 'Blocked';
        available = huntActive && !engine.blocked && remaining === 0;
      } else if (a.id === 'restore') {
        available = engine.canRestore(nodeId) && remaining === 0;
      } else if (a.id === 'trace') {
        available = engine.canTrace(nodeId) && remaining === 0;
      }
      if (locked) available = false;
      const cooling = remaining > 0 && !(a.id === 'isolate' && state === 'picked');
      const key = `${name}|${available}|${cooling ? remaining.toFixed(1) : ''}`;
      if (buttonState.get(a.id) === key) continue;
      buttonState.set(a.id, key);
      button.disabled = !available;
      button.querySelector('.act-name').textContent = name;
      button.querySelector('.act-cd').textContent = cooling ? `${remaining.toFixed(1)}s` : '';
      button.style.setProperty('--cd', cooling ? remaining / COOLDOWNS[a.id] : 0);
    }

    const progress = engine.restoreProgress(nodeId);
    const bar = body.querySelector('.restore-bar');
    if (bar) {
      bar.hidden = progress === null;
      if (progress !== null) bar.firstElementChild.style.transform = `scaleX(${progress})`;
    }
  }

  return {
    open(id) {
      nodeId = id;
      el.hidden = false;
      render();
    },
    close() {
      nodeId = null;
      el.hidden = true;
    },
    render,
    tick,
    get nodeId() {
      return nodeId;
    },
  };
}
