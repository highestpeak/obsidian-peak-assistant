// Click-to-copy path chips — used by all root docs.
//
// Any <code data-copy="..."> element becomes a click-to-copy chip:
//   - Display text = short name (filename / class / symbol)
//   - data-copy   = full path (or full qualified name) placed in clipboard
//   - Click / Enter / Space copies; a toast confirms.

(function () {
  const TOAST_DURATION_MS = 1500;

  function showToast(text) {
    // Reuse a single toast to avoid stacking on rapid clicks.
    let toast = document.getElementById('copy-path-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'copy-path-toast';
      toast.className = 'copy-path-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = text;
    // Force reflow so re-triggering .show animates.
    // eslint-disable-next-line no-unused-expressions
    toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, TOAST_DURATION_MS);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        document.body.removeChild(ta);
      }
    });
  }

  function enhance(el) {
    if (el.dataset.copyEnhanced === '1') return;
    const path = el.getAttribute('data-copy');
    if (!path) return;
    el.dataset.copyEnhanced = '1';
    el.classList.add('copy-path');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    if (!el.getAttribute('title')) {
      el.setAttribute('title', '点击复制: ' + path);
    }

    const activate = (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(path)
        .then(() => {
          showToast('已复制 ' + path);
          el.classList.add('just-copied');
          setTimeout(() => el.classList.remove('just-copied'), 700);
        })
        .catch(() => {
          showToast('复制失败: ' + path);
        });
    };

    el.addEventListener('click', activate);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') activate(e);
    });
  }

  function scan() {
    document.querySelectorAll('code[data-copy]').forEach(enhance);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scan);
  } else {
    scan();
  }

  // Also expose a manual re-scan in case docs inject more chips dynamically.
  window.__copyPathScan = scan;
})();
