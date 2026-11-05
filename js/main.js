// Toggle mobile navigation & hide/show header based on scroll direction
// Immediate hide/show without delay + reveal when cursor enters top 50px
// Also: project pop-ups (<dialog class="modal">) and the footer year.

document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menu-btn');
  const navLinks = document.querySelector('.nav-links');
  const header = document.querySelector('.site-header');
  const arrow = document.getElementById('scroll-arrow');

  let lastScrollY = window.scrollY;
  let travelled = 0;               // px moved in the current direction
  let frameQueued = false;
  const scrollThreshold = 24;      // px of travel in one direction before the header reacts
  const hideArrowThreshold = 10;   // px scroll to hide chevron
  const mouseReveal = 50;          // px from top to reveal header

  function setMenuOpen(open) {
    navLinks.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  }

  // Mobile nav toggle
  menuBtn.addEventListener('click', () => {
    setMenuOpen(!navLinks.classList.contains('open'));
  });

  navLinks.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuOpen(false));
  });

  // Show/hide header and hide arrow after small scroll.
  // Runs once per animation frame, needs a little sustained travel in one
  // direction before reacting (so wheel jitter and small reversals do not
  // flicker it), and ignores the rubber-band bounce at the page edges.
  function updateHeader() {
    frameQueued = false;
    const maxY = document.documentElement.scrollHeight - window.innerHeight;
    const currentY = Math.min(Math.max(window.scrollY, 0), Math.max(maxY, 0));
    const delta = currentY - lastScrollY;
    lastScrollY = currentY;

    // Restart the tally whenever the direction changes
    travelled = Math.sign(delta) === Math.sign(travelled) ? travelled + delta : delta;

    // Header logic
    if (currentY <= header.offsetHeight) {
      header.style.transform = 'translateY(0)';
    } else if (travelled > scrollThreshold) {
      header.style.transform = 'translateY(-100%)';
      if (navLinks.classList.contains('open')) setMenuOpen(false);
    } else if (travelled < -scrollThreshold) {
      header.style.transform = 'translateY(0)';
    }

    // Arrow hide logic
    if (arrow) {
      arrow.style.display = currentY > hideArrowThreshold ? 'none' : '';
    }
  }

  window.addEventListener('scroll', () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(updateHeader);
  }, { passive: true });

  // Reveal header when cursor enters top 50px
  window.addEventListener('mousemove', (e) => {
    if (e.clientY <= mouseReveal) {
      header.style.transform = 'translateY(0)';
    }
  });

  // Project pop-ups ----------------------------------------------------
  // Cards carry data-modal="<dialog id>". The URL hash mirrors the open
  // dialog so case studies can be linked to directly.
  const modalFromHash = () => {
    const el = location.hash ? document.getElementById(location.hash.slice(1)) : null;
    return el?.matches('dialog.modal') ? el : null;
  };

  const openModal = (dialog, updateHash) => {
    if (dialog.open) return;
    dialog.showModal();
    dialog.scrollTop = 0;
    if (updateHash) history.replaceState(null, '', `#${dialog.id}`);
  };

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-modal]');
    const dialog = trigger && document.getElementById(trigger.dataset.modal);
    if (!dialog) return;
    event.preventDefault();
    openModal(dialog, true);
  });

  document.querySelectorAll('dialog.modal').forEach((dialog) => {
    dialog.querySelector('.modal-close')?.addEventListener('click', () => dialog.close());
    // A click on the dimmed area outside the panel lands on the dialog itself
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (location.hash === `#${dialog.id}`) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    });
  });

  const initial = modalFromHash();
  if (initial) openModal(initial, false);
  window.addEventListener('hashchange', () => {
    const dialog = modalFromHash();
    if (dialog) openModal(dialog, false);
  });

  // Dynamic footer year
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
});
