// Top "Kill Chain" bar: one bone segment per stage, darkening to crimson as the Hunt advances.
export function createKillChain(el, stages) {
  const segments = stages.map((name) => {
    const seg = document.createElement('div');
    seg.className = 'kc-seg';
    seg.innerHTML = `<div class="kc-bone"><span class="kc-fill"></span></div><span class="kc-label">${name}</span>`;
    el.appendChild(seg);
    return { seg, fill: seg.querySelector('.kc-fill'), progress: -1 };
  });

  function update(engine) {
    segments.forEach((s, i) => {
      const p = Math.round(engine.stageProgress(i) * 100) / 100;
      if (p !== s.progress) {
        s.progress = p;
        s.fill.style.transform = `scaleX(${p})`;
        s.seg.classList.toggle('done', p >= 1);
      }
      s.seg.classList.toggle('active', engine.running && engine.stageIndex === i);
    });
  }

  return { update };
}
