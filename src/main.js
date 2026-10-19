import './style.css';
import { runLoading } from './ui/loading.js';
import { webglAvailable, showUnsupported } from './ui/unsupported.js';

// Entry point: kept tiny so the loading screen starts at once while Three.js and
// the rest of the app download in parallel.
const params = new URLSearchParams(location.search);
const deepLinked = params.has('hunt') || params.has('focus'); // deep links skip the intro

if (!webglAvailable()) {
  document.getElementById('loading').remove();
  showUnsupported();
} else {
  const intro = deepLinked ? (document.getElementById('loading').remove(), Promise.resolve()) : runLoading();
  const app = import('./app.js').then(({ startApp }) => startApp(params));
  Promise.all([app, intro]).then(([started]) => {
    if (!deepLinked) started.showHelpIfFirstVisit();
  });
}
