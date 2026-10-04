// Run before body parsing: saved startup preferences arrive in the preload,
// independently of state IPC and addon initialization.
document.documentElement.classList.toggle('intro-disabled', !window.nymora.startup.intro);
window.addEventListener('DOMContentLoaded', () => {
  if (window.nymora.startup.sound) {
    const cue = new Audio('nymora-cue.wav'); cue.volume = .28;
    // Retain the local sound for its short lifetime, including intro-off startup.
    window.nymoraStartupAudio = cue;
    cue.addEventListener('ended', () => { window.nymoraStartupAudio = null; }, { once: true });
    cue.play().catch(() => { window.nymoraStartupAudio = null; });
  }
  const intro = document.getElementById('startup-intro');
  if (!window.nymora.startup.intro) intro.remove();
  else setTimeout(() => intro.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 1400);
}, { once: true });
