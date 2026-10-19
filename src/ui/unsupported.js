export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

// Shown instead of the map when the browser can't do 3D.
export function showUnsupported() {
  document.body.classList.add('no-webgl');
  document.getElementById('app').innerHTML = `
    <div class="unsupported">
      <h2>The grid won't render here.</h2>
      <p>VulturesGrid needs WebGL, which this browser or device has turned off or doesn't support.
      Try a recent Chrome, Firefox, Safari or Edge, or turn on hardware acceleration.</p>
    </div>`;
}
