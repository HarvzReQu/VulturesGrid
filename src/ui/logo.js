import skull from '../assets/skull.svg?raw';

// Header emblem; pulses crimson while any node is Rotting.
export function mountLogo() {
  const el = document.getElementById('logo');
  el.innerHTML = skull;
  let threat = false;
  return {
    setThreat(on) {
      if (on === threat) return;
      threat = on;
      el.classList.toggle('is-threat', on);
    },
  };
}
