import skull from '../assets/skull.svg?raw';

const TAGLINE = 'We circle what is already rotten.';
const SKULL_FADE_MS = 900;
const TYPE_MS = 55;
const HOLD_MS = 700;

// Loading screen: the skull fades in, the tagline types out, then the curtain lifts.
// Click or press any key to skip. Resolves once the screen is gone.
export function runLoading() {
  const el = document.getElementById('loading');
  const tagline = el.querySelector('.loading-tagline');
  el.querySelector('.loading-skull').innerHTML = skull;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return new Promise((resolve) => {
    const timers = [];
    let done = false;

    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      tagline.textContent = TAGLINE;
      el.classList.add('is-done');
      setTimeout(() => {
        el.remove();
        resolve();
      }, 600);
    };

    el.addEventListener('click', finish);
    window.addEventListener('keydown', finish, { once: true });

    if (reduced) {
      tagline.textContent = TAGLINE;
      timers.push(setTimeout(finish, 1200));
      return;
    }
    [...TAGLINE].forEach((_, i) => {
      timers.push(setTimeout(() => (tagline.textContent = TAGLINE.slice(0, i + 1)), SKULL_FADE_MS + i * TYPE_MS));
    });
    timers.push(setTimeout(finish, SKULL_FADE_MS + TAGLINE.length * TYPE_MS + HOLD_MS));
  });
}
