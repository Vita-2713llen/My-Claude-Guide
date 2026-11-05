// qa-check self-test fixture behaviour. Planted defects are commented with their registry ID.
(function () {
  'use strict';
  // Burger: opens a panel that is NOT a dialog and leaves focus on the burger (A11Y-02); the logo shifts (NAV-08, CSS).
  var burger = document.querySelector('.site-burger');
  var panel = document.getElementById('menu-panel');
  function setMenu(open) {
    if (!burger || !panel) return;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    panel.classList.toggle('is-open', open);
    document.body.classList.toggle('menu-open', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }
  if (burger) burger.addEventListener('click', function () { setMenu(burger.getAttribute('aria-expanded') !== 'true'); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && burger && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); } });
  window.addEventListener('resize', function () { if (window.innerWidth >= 992) setMenu(false); });
  document.addEventListener('click', function (e) { if (panel && panel.classList.contains('is-open') && !panel.contains(e.target) && !burger.contains(e.target)) setMenu(false); });

  // Sliders. data-stuck-next="1": the next arrow stays enabled on the last slide (INT-03). Otherwise it is disabled (clean).
  document.querySelectorAll('[data-fixture-slider]').forEach(function (root) {
    var track = root.querySelector('.slider-track');
    var slides = track ? track.children.length : 0;
    var section = root.closest('section') || root.parentElement;
    var next = section.querySelector('.slider-next');
    var prev = section.querySelector('.slider-prev');
    var stuck = root.getAttribute('data-stuck-next') === '1';
    var i = 0;
    function render() {
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      prev.disabled = i === 0;
      if (!stuck) next.disabled = i === slides - 1;
    }
    next.addEventListener('click', function () { if (i < slides - 1) { i++; render(); } });
    prev.addEventListener('click', function () { if (i > 0) { i--; render(); } });
    render();
  });

  // Tickers: a pause control toggles the paused state (clean). The "Awards" ticker has none and never pauses (INT-04).
  document.querySelectorAll('.pause-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var t = b.closest('section').querySelector('.ticker');
      var paused = t.classList.toggle('is-paused');
      b.setAttribute('aria-pressed', paused ? 'true' : 'false');
      b.textContent = paused ? 'Play' : 'Pause';
    });
  });

  // Tabs (both groups work; one group lacks the ARIA roles — A11Y-04 is about semantics, not behaviour).
  document.querySelectorAll('.tabs').forEach(function (group) {
    var tabs = group.querySelectorAll('.tab');
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        tabs.forEach(function (o) {
          var on = o === t;
          o.classList.toggle('is-active', on);
          if (o.hasAttribute('aria-selected')) o.setAttribute('aria-selected', on ? 'true' : 'false');
          var p = document.getElementById(o.getAttribute('data-panel'));
          if (p) p.hidden = !on;
        });
      });
    });
  });

  // The "dead" FAQ toggle (INT-01) deliberately has no handler: aria-expanded never changes.
})();
