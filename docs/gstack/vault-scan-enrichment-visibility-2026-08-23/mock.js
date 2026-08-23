document.querySelectorAll('.switch').forEach((control) => {
  control.addEventListener('click', () => {
    control.classList.toggle('on');
    control.setAttribute('aria-checked', String(control.classList.contains('on')));
  });
});

document.querySelectorAll('[data-open-detail]').forEach((row) => {
  row.addEventListener('click', () => {
    window.location.href = '03-document-detail.html';
  });
});
