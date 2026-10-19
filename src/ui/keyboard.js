// Keyboard play, so the whole loop works without a mouse:
//   N / Shift+N   jump to the next / previous pinned node (Rotting, Leaking, Incoming, Scented)
//   1 2 3 4       Isolate, Block, Restore, Trace in the open dossier
//   C             toggle high contrast
// (Space pauses, M toggles sound, Esc closes the dossier and arrow keys pan: handled elsewhere.)
const ACTION_KEYS = { 1: 'isolate', 2: 'block', 3: 'restore', 4: 'trace' };
const KIND_WORD = { rotting: 'rotting', leak: 'leaking data', incoming: 'under attack', scented: 'scented' };

const typing = (e) => e.target instanceof Element && e.target.closest('input, select, textarea, [contenteditable]');

export function createKeyboard({ topology, beacons, dossier, flyToNode, contrast, announce }) {
  let cursor = -1;

  function cycle(step) {
    const list = beacons.threats();
    if (!list.length) {
      announce('No nodes need attention.');
      return;
    }
    const current = list.findIndex((t) => t.id === dossier.nodeId);
    cursor = ((current === -1 ? (step > 0 ? -1 : 0) : current) + step + list.length) % list.length;
    const target = list[cursor];
    flyToNode(target.id);
    document.getElementById('dossier').focus({ preventScroll: true });
    announce(`${topology.byId.get(target.id).label}, ${KIND_WORD[target.kind]}. ${cursor + 1} of ${list.length}.`);
  }

  window.addEventListener('keydown', (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
    const key = e.key.toLowerCase();
    if (key === 'n') {
      e.preventDefault();
      cycle(e.shiftKey ? -1 : 1);
    } else if (key === 'c') {
      contrast.toggle();
    } else if (ACTION_KEYS[e.key] && dossier.nodeId) {
      const button = document.querySelector(`#dossier [data-action="${ACTION_KEYS[e.key]}"]`);
      if (button && !button.disabled) button.click();
    }
  });
}
