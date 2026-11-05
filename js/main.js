// Toggle mobile navigation & hide/show header based on scroll direction
// Immediate hide/show without delay + reveal when cursor enters top 50px
// Also: project pop-ups (<dialog class="modal">) and the footer year.

document.addEventListener('DOMContentLoaded', () => {
  const menuBtn = document.getElementById('menu-btn');
  const navLinks = document.querySelector('.nav-links');
  const header = document.querySelector('.site-header');
  const arrow = document.getElementById('scroll-arrow');

  let lastScrollY = window.scrollY;
  const scrollThreshold = 5;       // px delta to reduce jitter
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

  // Show/hide header and hide arrow after small scroll
  window.addEventListener('scroll', () => {
    const currentY = window.scrollY;

    // Header logic
    if (currentY > lastScrollY + scrollThreshold) {
      header.style.transform = 'translateY(-100%)';
    } else if (currentY < lastScrollY - scrollThreshold) {
      header.style.transform = 'translateY(0)';
    }

    // Close mobile menu if scrolling down more than 20px
    if (navLinks.classList.contains('open') && currentY > lastScrollY + 20) {
      setMenuOpen(false);
    }

    // Arrow hide logic
    if (arrow) {
      arrow.style.display = currentY > hideArrowThreshold ? 'none' : '';
    }

    lastScrollY = currentY;
  });

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
