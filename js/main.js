// Site-wide behaviour: header hide/show on scroll, mobile navigation,
// project pop-ups (<dialog class="modal">), and the footer year.
(() => {
  const header = document.querySelector('.site-header');
  const menuBtn = document.getElementById('menu-btn');
  const navLinks = document.getElementById('primary-nav');
  const scrollArrow = document.getElementById('scroll-arrow');

  // Mobile navigation --------------------------------------------------
  const setMenuOpen = (open) => {
    navLinks.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', () => setMenuOpen(!navLinks.classList.contains('open')));
  navLinks.addEventListener('click', (event) => {
    if (event.target.closest('a')) setMenuOpen(false);
  });

  // Header hides when scrolling down and returns when scrolling up or
  // when the cursor nears the top edge. The hero arrow fades once scrolled.
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY + 5) {
      header.classList.add('is-hidden');
      setMenuOpen(false);
    } else if (y < lastY - 5) {
      header.classList.remove('is-hidden');
    }
    scrollArrow?.classList.toggle('is-hidden', y > 10);
    lastY = y;
  }, { passive: true });
  window.addEventListener('mousemove', (event) => {
    if (event.clientY <= 50) header.classList.remove('is-hidden');
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

  // Footer year --------------------------------------------------------
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });
})();
