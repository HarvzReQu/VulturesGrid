const KEY = 'vg-contrast';

// High-contrast mode: brighter UI text and borders, stronger lines and outlines in the scene.
// Toggled by the header button or the C key; remembered between visits.
export function createContrast({ stage, nodes, links }) {
  const button = document.getElementById('contrast-toggle');
  let on = false;
  try {
    on = localStorage.getItem(KEY) === '1';
  } catch {
    // Not remembered; starts off.
  }

  function apply() {
    document.body.classList.toggle('hc', on);
    stage.setContrast(on);
    nodes.setContrast(on);
    links.setContrast(on);
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'High contrast on (C)' : 'High contrast off (C)';
  }

  function toggle() {
    on = !on;
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // Fine; not remembered.
    }
    apply();
  }

  button.addEventListener('click', toggle);
  apply();
  return { toggle };
}
