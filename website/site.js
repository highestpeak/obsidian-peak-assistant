/* Keeps the canvas painters alive after background-tab throttling. */
setInterval(() => {
  if (document.hidden) return;
  if (!window.__peakBoot) return;
  if (window.__peakAnimBeat && Date.now() - window.__peakAnimBeat <= 1500) return;
  window.__peakBoot();
}, 700);
