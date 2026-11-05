// Image lightbox.
//
// Opens from two kinds of trigger:
//   - Gallery tiles:   <button class="gallery-item" data-full="..." data-meta="...">
//                      inside a [data-gallery] container. The caption <strong>
//                      supplies the title; data-full is the large image.
//   - Pop-up images:   <button class="zoom"><img></button> inside .modal-images.
// All triggers in the same container form one browsable set.
(() => {
  const lightbox = document.createElement('dialog');
  lightbox.className = 'lightbox';
  lightbox.setAttribute('aria-label', 'Image viewer');
  lightbox.innerHTML = `
    <div class="lightbox-bar">
      <span class="lightbox-counter" aria-live="polite"></span>
      <button class="icon-btn lightbox-close" type="button" aria-label="Close image viewer">&times;</button>
    </div>
    <div class="lightbox-stage"><img class="lightbox-img" alt=""></div>
    <div class="lightbox-foot">
      <button class="lightbox-arrow lightbox-prev" type="button" aria-label="Previous image">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <div class="lightbox-caption">
        <strong class="lightbox-title"></strong>
        <span class="lightbox-meta"></span>
      </div>
      <button class="lightbox-arrow lightbox-next" type="button" aria-label="Next image">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>`;
  document.body.append(lightbox);

  const image = lightbox.querySelector('.lightbox-img');
  const title = lightbox.querySelector('.lightbox-title');
  const meta = lightbox.querySelector('.lightbox-meta');
  const counter = lightbox.querySelector('.lightbox-counter');

  let items = [];
  let index = 0;

  const show = (i) => {
    index = (i + items.length) % items.length;
    const item = items[index];
    image.src = item.src;
    image.alt = item.title;
    title.textContent = item.title;
    meta.textContent = item.meta;
    counter.textContent = `${index + 1} / ${items.length}`;
    // Warm the cache for the neighbours so arrowing through feels instant
    [index - 1, index + 1].forEach((j) => {
      new Image().src = items[(j + items.length) % items.length].src;
    });
  };

  const open = (list, start) => {
    items = list;
    lightbox.classList.toggle('is-single', items.length < 2);
    show(start);
    lightbox.showModal();
  };

  // Triggers ---------------------------------------------------------
  const itemFromTile = (tile) => ({
    src: tile.dataset.full,
    title: tile.querySelector('.gallery-caption strong')?.textContent.trim() ?? '',
    meta: tile.dataset.meta ?? ''
  });
  const itemFromZoom = (button) => {
    const img = button.querySelector('img');
    return { src: img.currentSrc || img.src, title: img.alt, meta: '' };
  };

  document.addEventListener('click', (event) => {
    const tile = event.target.closest('[data-gallery] .gallery-item');
    if (tile) {
      const tiles = [...tile.closest('[data-gallery]').querySelectorAll('.gallery-item')];
      open(tiles.map(itemFromTile), tiles.indexOf(tile));
      return;
    }
    const zoom = event.target.closest('.modal-images .zoom');
    if (zoom) {
      const zooms = [...zoom.closest('.modal-images').querySelectorAll('.zoom')];
      open(zooms.map(itemFromZoom), zooms.indexOf(zoom));
    }
  });

  // Controls ---------------------------------------------------------
  lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
  lightbox.querySelector('.lightbox-prev').addEventListener('click', () => show(index - 1));
  lightbox.querySelector('.lightbox-next').addEventListener('click', () => show(index + 1));
  lightbox.addEventListener('click', (event) => {
    if (event.target === lightbox || event.target.classList.contains('lightbox-stage')) lightbox.close();
  });
  lightbox.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') show(index - 1);
    if (event.key === 'ArrowRight') show(index + 1);
  });

  let touchStartX = 0;
  lightbox.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });
  lightbox.addEventListener('touchend', (event) => {
    const delta = touchStartX - event.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) show(delta > 0 ? index + 1 : index - 1);
  }, { passive: true });

  // Drop the large image once closed so it is not held in memory
  lightbox.addEventListener('close', () => { image.removeAttribute('src'); });
})();
