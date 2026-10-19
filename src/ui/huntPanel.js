// Hunt picker (dropdown + Begin / Reset) and a live status line.
export function createHuntPanel({ hunts, onBegin, onReset }) {
  const select = document.getElementById('hunt-select');
  const blurb = document.getElementById('hunt-blurb');
  const status = document.getElementById('hunt-status');

  for (const hunt of hunts) select.add(new Option(hunt.name, hunt.id));
  select.add(new Option('Random', 'random'));

  const describe = () => {
    const hunt = hunts.find((h) => h.id === select.value);
    blurb.textContent = hunt ? hunt.blurb : 'One of the four Hunts, chosen at random.';
  };
  select.addEventListener('change', describe);
  describe();

  document.getElementById('hunt-begin').addEventListener('click', () => onBegin(select.value));
  document.getElementById('hunt-reset').addEventListener('click', onReset);

  let last = '';
  // replayAt: playhead time while replaying, otherwise null.
  function update(engine, replayAt = null) {
    let text = 'Quiet. Choose a Hunt and begin.';
    if (replayAt !== null) {
      text = `${engine.hunt.name} · Replay T+${replayAt.toFixed(1)}s`;
    } else if (engine.hunt) {
      const parts = [
        engine.hunt.name,
        `T+${engine.time.toFixed(1)}s`,
        `${engine.countState('rotting')} rotting`,
      ];
      if (engine.dataLostMB > 0) parts.push(`${engine.dataLostMB.toFixed(1)} MB lost`);
      if (engine.finished) parts.push('Hunt over');
      text = parts.join(' · ');
    }
    if (text !== last) status.textContent = last = text;
  }

  return { update, setValue: (id) => ((select.value = id), describe()) };
}
