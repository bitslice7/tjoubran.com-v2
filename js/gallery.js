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
    document.body.style.overflow = '';
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

  document.addEventListener('keydown', (event) => {
    const focusedCard = event.target.closest?.('.gallery-item');
    if (focusedCard && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      const group = focusedCard.closest('[data-site-gallery]');
      const cards = Array.from(group.querySelectorAll('.gallery-item'));
      openLightbox(group, cards.indexOf(focusedCard), focusedCard);
      return;
    }

    if (!lightbox.classList.contains('visible')) return;
    if (event.key === 'ArrowLeft') showImage(currentIndex - 1);
    if (event.key === 'ArrowRight') showImage(currentIndex + 1);
    if (event.key === 'Escape') closeLightbox();
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
  document.body.appendChild(lightbox);
})();
