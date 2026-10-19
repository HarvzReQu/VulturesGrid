import { clockLabel } from './format.js';

// Replay scrubber shown after a round ends: play/pause, drag to any moment, return to live.
export function createTimeline({ onSeek, onToggle, onExit }) {
  const root = document.getElementById('timeline');
  const range = root.querySelector('input[type=range]');
  const play = root.querySelector('[data-play]');
  const label = root.querySelector('.tl-time');
  const exit = root.querySelector('[data-exit]');
  let duration = 0;
  let dragging = false;
  let lastLabel = '';

  range.addEventListener('pointerdown', () => (dragging = true));
  window.addEventListener('pointerup', () => (dragging = false));
  range.addEventListener('input', () => onSeek(Number(range.value)));
  play.addEventListener('click', onToggle);
  exit.addEventListener('click', onExit);

  return {
    show(d) {
      duration = d;
      range.max = String(d);
      root.hidden = false;
    },
    hide() {
      root.hidden = true;
    },
    update(playhead, playing, active) {
      if (root.hidden) return;
      if (!dragging) range.value = String(active ? playhead : duration);
      const text = `${clockLabel(active ? playhead : duration)} / ${clockLabel(duration)}`;
      if (text !== lastLabel) label.textContent = lastLabel = text;
      play.textContent = playing ? '❚❚' : '▶';
      play.setAttribute('aria-label', playing ? 'Pause replay' : 'Play replay');
      exit.hidden = !active;
      root.classList.toggle('is-replaying', active);
    },
  };
}
