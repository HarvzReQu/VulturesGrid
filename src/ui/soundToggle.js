// Header speaker button (and the M key) for the ambience. Off by default.
export function createSoundToggle(ambience) {
  const button = document.getElementById('sound-toggle');

  const sync = () => {
    const on = ambience.enabled;
    button.setAttribute('aria-pressed', String(on));
    button.setAttribute('aria-label', on ? 'Mute ambient sound' : 'Play ambient sound');
    button.title = on ? 'Ambient sound on (M)' : 'Ambient sound off (M)';
  };

  const toggle = () => {
    ambience.toggle();
    sync();
  };

  button.addEventListener('click', toggle);
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm' && !e.metaKey && !e.ctrlKey && !(e.target instanceof Element && e.target.closest('input, select, textarea'))) {
      toggle();
    }
  });
  sync();
}
