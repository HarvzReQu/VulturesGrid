import { clockLabel, escapeHtml } from './format.js';

// Plain-text result for sharing on social media.
function shareText(r) {
  const lost = r.stats.find(([k]) => k === 'Nodes lost')[1];
  const data = r.stats.find(([k]) => k === 'Data lost')[1];
  return [
    `VulturesGrid · ${r.huntName}`,
    `Grade ${r.grade} (${r.score}/100) · ${r.outcome}`,
    `Nodes lost: ${lost} · Data lost: ${data}`,
    'We circle what is already rotten.',
  ].join('\n');
}

// Clipboard API where allowed, falling back to a hidden textarea for older browsers.
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('copy failed');
  }
}

// End-of-round "Case File": a stamped investigative document with the grade.
export function createCaseFile({ onReplay, onNewHunt }) {
  const dialog = document.getElementById('casefile');
  const body = dialog.querySelector('.cf-body');
  let report = null;

  // Native share sheet where available (phones), otherwise copy to the clipboard.
  async function share(button) {
    const url = `${location.origin}${location.pathname}`;
    const text = shareText(report);
    const original = button.textContent;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'VulturesGrid', text, url });
        return;
      }
      await copy(`${text}\n${url}`);
      button.textContent = 'Copied';
    } catch (err) {
      if (err?.name === 'AbortError') return; // share sheet dismissed
      button.textContent = 'Copy failed';
    }
    setTimeout(() => (button.textContent = original), 2000);
  }

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
    const action = e.target.closest('[data-cf]')?.dataset.cf;
    if (action === 'close') dialog.close();
    if (action === 'replay') {
      dialog.close();
      onReplay();
    }
    if (action === 'share') share(e.target.closest('[data-cf]'));
    if (action === 'new') {
      dialog.close();
      onNewHunt();
    }
  });

  function show(r) {
    report = r;
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
        <button class="btn" data-cf="share">Share result</button>
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
