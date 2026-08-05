(() => {
  // Edit this list to update the astrophotography gallery everywhere on the site.
  const galleryItems = [
    { src: 'Images/eaglegoodsmol.jpg', alt: 'Eagle Nebula' },
    { src: 'Images/Whirlpool Galaxy.jpg', alt: 'Whirlpool Galaxy' },
    { src: 'Images/Dumbbell Nebula smol.jpg', alt: 'Dumbbell Nebula' },
    { src: 'Images/smallm81.jpg', alt: "Bode's Galaxy" },
    { src: 'Images/Total Solar Eclipse.jpg', alt: 'Total Solar Eclipse' },
    { src: 'Images/Partial Solar Eclipse.jpg', alt: 'Partial Solar Eclipse' },
    { src: 'Images/Pleiades.jpg', alt: 'Pleiades Star Cluster' },
    { src: 'Images/Crecent_Nebula.webp', alt: 'Crescent Nebula' }
  ];

  function renderGalleries() {
    document.querySelectorAll('[data-site-gallery]').forEach((container) => {
      const cards = container.dataset.siteGallery === 'cards';
      const elements = galleryItems.map((item) => {
        const image = document.createElement('img');
        image.src = item.src;
        image.alt = item.alt;
        image.loading = 'lazy';

        if (!cards) return image;

        const figure = document.createElement('figure');
        figure.className = 'gallery-item';
        figure.tabIndex = 0;
        figure.setAttribute('role', 'button');
        figure.setAttribute('aria-label', `View ${item.alt} fullscreen`);

        const caption = document.createElement('figcaption');
        caption.textContent = item.alt;
        figure.append(image, caption);
        return figure;
      });

      container.replaceChildren(...elements);
    });

    document.querySelectorAll('[data-site-gallery-caption]').forEach((caption) => {
      const names = galleryItems.map((item) => item.alt).join(', ');
      caption.textContent = `Click any image to view fullscreen. ${names}.`;
    });
  }

  const lightbox = document.createElement('div');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('role', 'dialog');
  lightbox.setAttribute('aria-modal', 'true');
  lightbox.setAttribute('aria-label', 'Image viewer');
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Close image viewer">&times;</button>
    <div class="lightbox-counter" aria-live="polite"></div>
    <img class="lightbox-img" alt="">
    <div class="lightbox-caption"></div>
    <div class="lightbox-nav">
      <button class="lightbox-nav-btn lightbox-prev" type="button">&#8592; Prev</button>
      <button class="lightbox-nav-btn lightbox-next" type="button">Next &#8594;</button>
    </div>`;

  const lightboxImage = lightbox.querySelector('.lightbox-img');
  const lightboxCaption = lightbox.querySelector('.lightbox-caption');
  const lightboxCounter = lightbox.querySelector('.lightbox-counter');
  const closeButton = lightbox.querySelector('.lightbox-close');
  let sources = [];
  let currentIndex = 0;
  let previousFocus = null;
  let touchStartX = 0;

  function showImage(index) {
    if (!sources.length) return;
    currentIndex = (index + sources.length) % sources.length;
    lightboxImage.src = sources[currentIndex].src;
    lightboxImage.alt = sources[currentIndex].alt;
    lightboxCaption.textContent = sources[currentIndex].alt;
    lightboxCounter.textContent = `${currentIndex + 1} / ${sources.length}`;
  }

  function openLightbox(group, startIndex, trigger) {
    sources = Array.from(group.querySelectorAll('img')).map((image) => ({
      src: image.currentSrc || image.src,
      alt: image.alt
    }));
    previousFocus = trigger;
    showImage(startIndex);
    lightbox.style.display = 'flex';
    requestAnimationFrame(() => lightbox.classList.add('visible'));
    document.body.style.overflow = 'hidden';
    closeButton.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove('visible');
    window.setTimeout(() => { lightbox.style.display = 'none'; }, 300);
    document.body.style.overflow = document.querySelector('.modal-overlay.visible') ? 'hidden' : '';
    previousFocus?.focus();
  }

  document.addEventListener('click', (event) => {
    const clickedImage = event.target.closest('[data-site-gallery] img, .modal-images img');
    if (!clickedImage) return;
    const group = clickedImage.closest('[data-site-gallery], .modal-images');
    const images = Array.from(group.querySelectorAll('img'));
    event.stopPropagation();
    openLightbox(group, images.indexOf(clickedImage), clickedImage.closest('.gallery-item') || clickedImage);
  });

  document.querySelectorAll('[data-gallery-carousel-track]').forEach((track) => {
    const carousel = track.closest('.gallery-carousel');
    const previousButton = carousel.querySelector('[data-gallery-prev]');
    const nextButton = carousel.querySelector('[data-gallery-next]');
    const autoplayButton = carousel.querySelector('[data-gallery-autoplay]');
    const position = carousel.querySelector('[data-gallery-position]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const edgeTolerance = 4;
    const autoplayDelay = 4800;
    let carouselTouchStartX = 0;
    let touchStartedAtStart = false;
    let touchStartedAtEnd = false;
    let autoplayRequested = !reducedMotion.matches;
    let autoplayTimer = null;
    let pointerPaused = false;
    let focusPaused = false;
    let wrapTimer = null;

    function carouselMetrics() {
      const cards = Array.from(track.querySelectorAll('.gallery-item'));
      const firstCard = cards[0];
      if (!firstCard) return { cards, firstIndex: 0, visibleCount: 0 };

      const gap = Number.parseFloat(getComputedStyle(track).gap) || 0;
      const step = firstCard.getBoundingClientRect().width + gap;
      const firstIndex = Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollLeft / step)));
      const visibleCount = Math.max(1, Math.floor((track.clientWidth + gap) / step));
      return { cards, firstIndex, visibleCount };
    }

    function updateCarousel() {
      const { cards, firstIndex, visibleCount } = carouselMetrics();
      if (!cards.length) return;
      const lastVisible = Math.min(cards.length, firstIndex + visibleCount);
      position.textContent = `${firstIndex + 1}–${lastVisible} of ${cards.length}`;
    }

    function jumpCarousel(left) {
      if (track.classList.contains('is-wrapping')) return;
      track.classList.add('is-wrapping');
      window.clearTimeout(wrapTimer);
      wrapTimer = window.setTimeout(() => {
        track.style.scrollBehavior = 'auto';
        track.style.scrollSnapType = 'none';
        track.scrollLeft = left;
        void track.offsetWidth;
        requestAnimationFrame(() => {
          track.style.removeProperty('scroll-behavior');
          track.style.removeProperty('scroll-snap-type');
          track.classList.remove('is-wrapping');
          updateCarousel();
        });
      }, reducedMotion.matches ? 0 : 180);
    }

    function moveCarousel(direction) {
      const maximumScroll = track.scrollWidth - track.clientWidth;
      const atStart = track.scrollLeft <= edgeTolerance;
      const atEnd = track.scrollLeft >= maximumScroll - edgeTolerance;

      if (direction > 0 && atEnd) {
        jumpCarousel(0);
        return;
      }
      if (direction < 0 && atStart) {
        jumpCarousel(maximumScroll);
        return;
      }
      track.scrollBy({ left: direction * track.clientWidth, behavior: 'smooth' });
    }

    function stopAutoplayTimer() {
      window.clearInterval(autoplayTimer);
      autoplayTimer = null;
    }

    function scheduleAutoplay() {
      stopAutoplayTimer();
      if (!autoplayRequested || pointerPaused || focusPaused || document.hidden) return;
      autoplayTimer = window.setInterval(() => moveCarousel(1), autoplayDelay);
    }

    function updateAutoplayControl() {
      autoplayButton.textContent = autoplayRequested ? 'Pause' : 'Play';
      autoplayButton.setAttribute(
        'aria-label',
        autoplayRequested ? 'Pause automatic carousel' : 'Play automatic carousel'
      );
      position.setAttribute('aria-live', autoplayRequested ? 'off' : 'polite');
    }

    function setAutoplay(requested) {
      autoplayRequested = requested;
      updateAutoplayControl();
      scheduleAutoplay();
    }

    previousButton.addEventListener('click', () => {
      moveCarousel(-1);
      scheduleAutoplay();
    });
    nextButton.addEventListener('click', () => {
      moveCarousel(1);
      scheduleAutoplay();
    });
    autoplayButton.addEventListener('click', () => setAutoplay(!autoplayRequested));
    carousel.addEventListener('mouseenter', () => {
      pointerPaused = true;
      stopAutoplayTimer();
    });
    carousel.addEventListener('mouseleave', () => {
      pointerPaused = false;
      scheduleAutoplay();
    });
    track.addEventListener('focusin', () => {
      focusPaused = true;
      stopAutoplayTimer();
    });
    track.addEventListener('focusout', () => {
      focusPaused = false;
      scheduleAutoplay();
    });
    track.addEventListener('scroll', updateCarousel, { passive: true });
    track.addEventListener('touchstart', (event) => {
      const maximumScroll = track.scrollWidth - track.clientWidth;
      stopAutoplayTimer();
      carouselTouchStartX = event.touches[0].clientX;
      touchStartedAtStart = track.scrollLeft <= edgeTolerance;
      touchStartedAtEnd = track.scrollLeft >= maximumScroll - edgeTolerance;
    }, { passive: true });
    track.addEventListener('touchend', (event) => {
      const difference = carouselTouchStartX - event.changedTouches[0].clientX;
      if (difference > 50 && touchStartedAtEnd) moveCarousel(1);
      if (difference < -50 && touchStartedAtStart) moveCarousel(-1);
      scheduleAutoplay();
    }, { passive: true });
    track.addEventListener('keydown', (event) => {
      if (event.target !== track) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveCarousel(-1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveCarousel(1);
      }
    });
    document.addEventListener('visibilitychange', scheduleAutoplay);
    reducedMotion.addEventListener('change', (event) => {
      if (event.matches) setAutoplay(false);
    });
    window.addEventListener('resize', updateCarousel);
    updateAutoplayControl();
    requestAnimationFrame(() => {
      updateCarousel();
      scheduleAutoplay();
    });
  });

  document.addEventListener('keydown', (event) => {
    const focusedCard = event.target.closest?.('.gallery-item');
    if (focusedCard && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const group = focusedCard.closest('[data-site-gallery]');
      const cards = Array.from(group.querySelectorAll('.gallery-item'));
      openLightbox(group, cards.indexOf(focusedCard), focusedCard);
      return;
    }

    const focusedModalImage = event.target.matches?.('.modal-images img') ? event.target : null;
    if (focusedModalImage && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const group = focusedModalImage.closest('.modal-images');
      const images = Array.from(group.querySelectorAll('img'));
      openLightbox(group, images.indexOf(focusedModalImage), focusedModalImage);
      return;
    }

    if (!lightbox.classList.contains('visible')) return;
    if (event.key === 'ArrowLeft') showImage(currentIndex - 1);
    if (event.key === 'ArrowRight') showImage(currentIndex + 1);
    if (event.key === 'Escape') {
      event.stopImmediatePropagation();
      closeLightbox();
    }
  });

  closeButton.addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => showImage(currentIndex - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => showImage(currentIndex + 1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox) closeLightbox();
  });
  lightbox.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    const difference = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(difference) > 50) {
      showImage(difference > 0 ? currentIndex + 1 : currentIndex - 1);
    }
  }, { passive: true });

  renderGalleries();
  document.querySelectorAll('.modal-images img').forEach((image) => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', `View ${image.alt} fullscreen`);
  });
  document.body.appendChild(lightbox);
})();
