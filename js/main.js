// Toggle mobile navigation & hide/show header based on scroll direction
// Immediate hide/show without delay + reveal when cursor enters top 50px

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

  // Dynamic footer year
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
