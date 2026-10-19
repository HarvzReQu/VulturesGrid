const SEEN_KEY = 'vg-help-seen';

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Storage blocked (private mode etc.): the modal just shows again next visit.
  }
}

// "How to Hunt" modal: shown automatically on the first visit, reopened with the ? button.
export function createHelp() {
  const dialog = document.getElementById('help');
  const open = () => {
    if (!dialog.open) dialog.showModal();
  };
  dialog.addEventListener('close', markSeen);
  dialog.addEventListener('click', (e) => {
    // Backdrop click: the dialog has its own padding, so compare against its box.
    const r = dialog.getBoundingClientRect();
    const outside = e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    if (e.target === dialog && outside) dialog.close();
  });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dialog.close()));
  document.getElementById('help-open').addEventListener('click', open);

  return {
    showIfFirstVisit() {
      if (!seen()) open();
    },
  };
}
