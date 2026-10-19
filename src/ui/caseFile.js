import { clockLabel, escapeHtml } from './format.js';

// End-of-round "Case File": a stamped investigative document with the grade.
export function createCaseFile({ onReplay, onNewHunt }) {
  const dialog = document.getElementById('casefile');
  const body = dialog.querySelector('.cf-body');

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
    const action = e.target.closest('[data-cf]')?.dataset.cf;
    if (action === 'close') dialog.close();
    if (action === 'replay') {
      dialog.close();
      onReplay();
    }
    if (action === 'new') {
      dialog.close();
      onNewHunt();
    }
  });

  function show(r) {
    const outcomeClass = r.outcome === 'CONTAINED' ? 'is-contained' : 'is-consumed';
    body.innerHTML = `
      <header class="cf-head">
        <p class="cf-org">The Vultures · Incident Division</p>
        <h2 class="cf-title" id="cf-title">Case File</h2>
        <dl class="cf-meta">
          <dt>Case No.</dt><dd>${r.caseNumber}</dd>
          <dt>Hunt</dt><dd>${escapeHtml(r.huntName)}</dd>
          <dt>Closed</dt><dd>${escapeHtml(r.date)}</dd>
          <dt>Outside source</dt><dd>${escapeHtml(r.outsideIp)}</dd>
        </dl>
        <div class="cf-grade ${outcomeClass}" aria-label="Grade ${r.grade}, score ${r.score}">
          <span>${r.grade}</span><small>${r.score} / 100</small>
        </div>
      </header>

      <div class="cf-stamp ${outcomeClass}" aria-label="Outcome">${r.outcome}</div>

      <section>
        <h3>Findings</h3>
        <dl class="cf-stats">
          ${r.stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}
        </dl>
      </section>

      <section>
        <h3>Summary</h3>
        <p class="cf-summary">${escapeHtml(r.summary)}</p>
      </section>

      <div class="cf-cols">
        <section>
          <h3>Timeline</h3>
          <ol class="cf-list">
            ${r.timeline.map((e) => `<li class="lvl-${e.level}"><time>${clockLabel(e.time)}</time>${escapeHtml(e.text)}</li>`).join('')}
            ${r.timelineTruncated ? '<li class="cf-more">… see The Watch for the full log</li>' : ''}
          </ol>
        </section>
        <section>
          <h3>Actions taken</h3>
          <ol class="cf-list">
            ${
              r.actions.length
                ? r.actions.map((a) => `<li><time>${clockLabel(a.time)}</time>${escapeHtml(a.text)}</li>`).join('')
                : '<li class="cf-more">None. The vultures were left to feed.</li>'
            }
          </ol>
        </section>
      </div>

      <footer class="cf-actions">
        <button class="btn" data-cf="close">Close</button>
        <button class="btn" data-cf="new">New Hunt</button>
        <button class="btn btn-ink" data-cf="replay">Replay round</button>
      </footer>`;
    dialog.showModal();
    dialog.scrollTop = 0;
  }

  return {
    show,
    close: () => dialog.open && dialog.close(),
  };
}
