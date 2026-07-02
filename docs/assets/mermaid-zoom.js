// Mermaid diagram zoom overlay — used by all root docs.
// Adds a "放大" button on hover to each .mermaid block and opens a full-viewport
// overlay with wheel-zoom + drag-pan. No external dependencies.

(function () {
  const OVERLAY_ID = 'mermaid-zoom-overlay';
  const EXPAND_ICON =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="15 3 21 3 21 9"></polyline>' +
    '<polyline points="9 21 3 21 3 15"></polyline>' +
    '<line x1="21" y1="3" x2="14" y2="10"></line>' +
    '<line x1="3" y1="21" x2="10" y2="14"></line>' +
    '</svg>';

  function ensureButton(container) {
    if (container.querySelector(':scope > .mermaid-zoom-btn')) return;
    if (!container.querySelector('svg')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mermaid-zoom-btn';
    btn.title = '放大查看 (点击)';
    btn.setAttribute('aria-label', '放大查看 Mermaid 图');
    btn.innerHTML = EXPAND_ICON;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openOverlay(container);
    });
    container.appendChild(btn);
  }

  function attachAll() {
    document.querySelectorAll('.mermaid').forEach(ensureButton);
  }

  function openOverlay(source) {
    const svg = source.querySelector('svg');
    if (!svg) return;
    closeOverlay();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'mermaid-zoom-overlay';
    overlay.innerHTML =
      '<div class="mermaid-zoom-toolbar">' +
      '<button type="button" class="mermaid-zoom-tool" data-act="reset" title="重置缩放">重置</button>' +
      '<button type="button" class="mermaid-zoom-tool" data-act="close" title="关闭 (Esc)">×</button>' +
      '</div>' +
      '<div class="mermaid-zoom-hint">滚轮缩放 · 拖拽平移 · Esc 关闭</div>' +
      '<div class="mermaid-zoom-stage"></div>';

    const stage = overlay.querySelector('.mermaid-zoom-stage');
    const clone = svg.cloneNode(true);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    clone.style.width = 'auto';
    clone.style.height = 'auto';
    stage.appendChild(clone);
    document.body.appendChild(overlay);
    document.body.classList.add('mermaid-zoom-open');

    let scale = 1;
    let tx = 0;
    let ty = 0;
    const apply = () => {
      clone.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    };

    // Fit-to-stage and center on open
    requestAnimationFrame(() => {
      const stageRect = stage.getBoundingClientRect();
      const svgRect = clone.getBoundingClientRect();
      if (svgRect.width > 0 && svgRect.height > 0) {
        const fit = Math.min(
          1,
          (stageRect.width - 80) / svgRect.width,
          (stageRect.height - 120) / svgRect.height
        );
        scale = fit;
        tx = (stageRect.width - svgRect.width * scale) / 2;
        ty = (stageRect.height - svgRect.height * scale) / 2;
        apply();
      }
    });

    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartTx = 0;
    let dragStartTy = 0;

    stage.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = stage.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const factor = Math.exp(-e.deltaY * 0.0015);
        const nextScale = Math.max(0.15, Math.min(8, scale * factor));
        tx = px - ((px - tx) * nextScale) / scale;
        ty = py - ((py - ty) * nextScale) / scale;
        scale = nextScale;
        apply();
      },
      { passive: false }
    );

    stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragStartTx = tx;
      dragStartTy = ty;
      stage.classList.add('dragging');
    });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    function onMove(e) {
      if (!dragging) return;
      tx = dragStartTx + (e.clientX - dragStartX);
      ty = dragStartTy + (e.clientY - dragStartY);
      apply();
    }
    function onUp() {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove('dragging');
    }

    overlay.addEventListener('click', (e) => {
      // Click on backdrop (stage or overlay itself, not toolbar/hint) closes.
      const t = e.target;
      if (t === overlay || t === stage) closeOverlay();
    });
    overlay.querySelector('[data-act="close"]').addEventListener('click', closeOverlay);
    overlay
      .querySelector('[data-act="reset"]')
      .addEventListener('click', () => {
        const stageRect = stage.getBoundingClientRect();
        // recompute fit
        scale = 1;
        tx = 0;
        ty = 0;
        apply();
        requestAnimationFrame(() => {
          const svgRect = clone.getBoundingClientRect();
          if (svgRect.width > 0 && svgRect.height > 0) {
            const fit = Math.min(
              1,
              (stageRect.width - 80) / svgRect.width,
              (stageRect.height - 120) / svgRect.height
            );
            scale = fit;
            tx = (stageRect.width - svgRect.width * scale) / 2;
            ty = (stageRect.height - svgRect.height * scale) / 2;
            apply();
          }
        });
      });
    document.addEventListener('keydown', escHandler);

    overlay._cleanup = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', escHandler);
    };
  }

  function closeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;
    if (overlay._cleanup) overlay._cleanup();
    overlay.remove();
    document.body.classList.remove('mermaid-zoom-open');
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeOverlay();
  }

  // Mermaid renders after DOMContentLoaded via startOnLoad. Poll briefly
  // until each .mermaid contains an <svg>, then attach buttons.
  function boot() {
    const start = Date.now();
    const tick = () => {
      attachAll();
      const nodes = Array.from(document.querySelectorAll('.mermaid'));
      const allReady = nodes.length > 0 && nodes.every((n) => n.querySelector('svg'));
      if (allReady || Date.now() - start > 12000) return;
      setTimeout(tick, 250);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
