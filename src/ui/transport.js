// Pause and 0.5x / 1x / 2x speed controls. Space toggles pause.
export function createTransport() {
  const root = document.getElementById('transport');
  const pauseBtn = root.querySelector('[data-pause]');
  const speedBtns = [...root.querySelectorAll('[data-speed]')];
  let speed = 1;
  let paused = false;

  function sync() {
    pauseBtn.textContent = paused ? '▶' : '❚❚';
    pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
    pauseBtn.setAttribute('aria-pressed', String(paused));
    speedBtns.forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.speed) === speed)));
    root.classList.toggle('is-paused', paused);
  }

  const togglePause = () => {
    paused = !paused;
    sync();
  };

  pauseBtn.addEventListener('click', togglePause);
  speedBtns.forEach((b) =>
    b.addEventListener('click', () => {
      speed = Number(b.dataset.speed);
      paused = false;
      sync();
    }),
  );
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !(e.target instanceof Element && e.target.closest('input, select, button, textarea'))) {
      e.preventDefault();
      togglePause();
    }
  });

  sync();
  return {
    get scale() {
      return paused ? 0 : speed;
    },
  };
}
