// Pointer sorting keeps the real item in the layout; only its visual copy follows the pointer.
export function setupMotion({ commit, finish, closeMenu, reducedMotion }) {
  const sidebar = document.querySelector('.sidebar');
  const content = document.getElementById('content');
  const categoryNav = document.getElementById('category-nav');
  const marker = document.createElement('div');
  marker.className = 'nav-glider';
  marker.setAttribute('aria-hidden', 'true');
  sidebar.prepend(marker);
  let hovered, drag, frame = 0, blockClickUntil = 0;
  const animations = new Map();
  const rows = () => [...categoryNav.children];
  const cards = grid => [...grid.querySelectorAll(':scope > .bookmark-card')];
  const idOf = node => node.dataset.categoryId || node.dataset.id;

  function refresh() {
    const button = hovered?.isConnected ? hovered : sidebar.querySelector('[aria-current="page"]');
    if (!button || drag?.started) { marker.style.opacity = '0'; return; }
    const rect = button.getBoundingClientRect(), parent = sidebar.getBoundingClientRect();
    const label = button.querySelector('span:not(.count)');
    const width = Math.min(rect.width, (label?.getBoundingClientRect().right || rect.right) - rect.left + 16);
    marker.style.opacity = rect.bottom > parent.top && rect.top < parent.bottom ? '1' : '0';
    marker.style.width = `${width}px`;
    marker.style.height = `${rect.height}px`;
    marker.style.transform = `translate3d(${rect.left - parent.left - sidebar.clientLeft}px,${rect.top - parent.top - sidebar.clientTop + sidebar.scrollTop}px,0)`;
    requestAnimationFrame(() => marker.classList.add('is-ready'));
  }
  sidebar.addEventListener('pointerover', event => {
    const button = event.target.closest('.nav-button');
    if (button) { hovered = button; refresh(); }
  });
  sidebar.addEventListener('pointerleave', () => { hovered = null; refresh(); });
  sidebar.addEventListener('focusin', event => {
    if (event.target.matches('.nav-button')) { hovered = event.target; refresh(); }
  });
  sidebar.addEventListener('scroll', refresh, { passive: true });
  categoryNav.addEventListener('scroll', refresh, { passive: true });
  window.addEventListener('resize', () => { if (drag) end(false); refresh(); });

  function layoutNodes() {
    return drag.kind === 'category' ? [...rows(), ...content.children] :
      [...content.querySelectorAll('.bookmark-card,.section-title,.category-dropzone')];
  }
  function rearrange(change) {
    const before = new Map(layoutNodes().map(node => [node, node.getBoundingClientRect()]));
    for (const animation of animations.values()) animation.cancel();
    animations.clear();
    change();
    // Hit testing uses final layout, never the animated rectangles (which cause oscillation).
    drag.slots = new Map((drag.kind === 'category' ? rows() : cards(drag.node.parentElement))
      .map(node => [node, node.getBoundingClientRect()]));
    if (reducedMotion.matches) return;
    for (const [node, old] of before) {
      if (!node.isConnected || node === drag.node) continue;
      const rect = node.getBoundingClientRect(), x = old.left - rect.left, y = old.top - rect.top;
      if (Math.abs(x) + Math.abs(y) < 1) continue;
      const animation = node.animate([{ transform: `translate(${x}px,${y}px)` }, { transform: 'translate(0,0)' }],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      animations.set(node, animation);
    }
  }
  function reorder(list, target) {
    const from = list.indexOf(drag.node), to = list.indexOf(target);
    if (to === from || to < 0) return;
    rearrange(() => {
      target.parentElement.insertBefore(drag.node, to > from ? target.nextSibling : target);
      if (drag.kind === 'category') {
        for (const row of rows()) {
          const section = [...content.children].find(item => item.dataset.category === idOf(row));
          if (section) content.append(section);
        }
        const unfiled = content.querySelector('[data-category="unfiled"]');
        if (unfiled) content.append(unfiled);
      }
    });
  }
  function start() {
    drag.started = true;
    closeMenu();
    document.body.classList.add('sorting', 'is-dragging');
    document.body.setPointerCapture(drag.pointerId);
    const rect = drag.node.getBoundingClientRect();
    drag.left = rect.left; drag.top = rect.top;
    drag.ghost = drag.node.cloneNode(true);
    drag.ghost.classList.add('sort-ghost');
    drag.ghost.setAttribute('aria-hidden', 'true');
    drag.ghost.inert = true;
    Object.assign(drag.ghost.style, { width: `${rect.width}px`, height: `${rect.height}px` });
    document.body.append(drag.ghost);
    drag.node.classList.add('sort-placeholder');
    drag.node.setAttribute('aria-grabbed', 'true');
    rearrange(() => {});
    refresh();
  }
  function tick() {
    frame = 0;
    if (!drag?.started || drag.finishing) return;
    drag.ghost.style.transform = `translate3d(${drag.left + drag.x - drag.startX}px,${drag.top + drag.y - drag.startY}px,0) scale(1.025)`;
    document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target'));
    const hit = document.elementFromPoint(drag.x, drag.y);
    const scrollArea = hit?.closest('.sidebar') || document.scrollingElement;
    const area = scrollArea === document.scrollingElement ? { top: 0, bottom: innerHeight } : scrollArea.getBoundingClientRect();
    const scrollY = drag.y < area.top + 42 ? -12 : drag.y > area.bottom - 42 ? 12 : 0;
    if (scrollY) {
      const previous = scrollArea.scrollTop;
      scrollArea.scrollTop += scrollY;
      const delta = scrollArea.scrollTop - previous;
      if (delta && (drag.kind === 'category' ? scrollArea === sidebar : scrollArea === document.scrollingElement)) {
        for (const rect of drag.slots.values()) rect.y -= delta;
      }
    }
    if (drag.kind === 'category' && hit?.closest('#category-nav') && categoryNav.scrollWidth > categoryNav.clientWidth) {
      const bounds = categoryNav.getBoundingClientRect(), previous = categoryNav.scrollLeft;
      categoryNav.scrollLeft += drag.x < bounds.left + 32 ? -10 : drag.x > bounds.right - 32 ? 10 : 0;
      const delta = categoryNav.scrollLeft - previous;
      if (delta) for (const rect of drag.slots.values()) rect.x -= delta;
    }
    if (drag.kind === 'category') {
      const bounds = sidebar.getBoundingClientRect();
      const horizontal = categoryNav.scrollWidth > categoryNav.clientWidth;
      // The whole sidebar accepts a folder drop, including padding and space below the list.
      drag.valid = drag.x >= bounds.left && drag.x <= bounds.right && drag.y >= bounds.top && drag.y <= bounds.bottom;
      if (drag.valid) {
        const list = rows();
        const target = list.reduce((best, node) => {
          const rect = drag.slots.get(node);
          const distance = horizontal ? Math.abs(drag.x - rect.x - rect.width / 2) : Math.abs(drag.y - rect.y - rect.height / 2);
          return !best || distance < best.distance ? { node, distance } : best;
        }, null);
        if (target) reorder(list, target.node);
      }
    } else {
      const row = hit?.closest('[data-category-id]');
      const unfiled = hit?.closest('[data-view="unfiled"]');
      const section = hit?.closest('.bookmark-section');
      drag.sidebarCategory = row?.dataset.categoryId || (unfiled ? 'unfiled' : null);
      drag.valid = !!drag.sidebarCategory || !!section && section.dataset.category !== 'recent';
      if (drag.sidebarCategory) (row || unfiled).classList.add('drop-target');
      else if (drag.valid) {
        const grid = section.querySelector('.bookmark-grid');
        const list = cards(grid);
        if (drag.node.parentElement !== grid) {
          rearrange(() => {
            const previousGrid = drag.node.parentElement;
            grid.querySelector('.category-dropzone')?.remove();
            const target = list.find(node => {
              const rect = node.getBoundingClientRect();
              return drag.y < rect.bottom && drag.x < rect.right;
            });
            grid.insertBefore(drag.node, target || null);
            if (!cards(previousGrid).length) {
              const empty = document.createElement('div');
              empty.className = 'category-dropzone';
              empty.textContent = '拖动书签到这里';
              previousGrid.append(empty);
            }
          });
        } else {
          const target = list.reduce((best, node) => {
            const rect = drag.slots.get(node);
            const distance = Math.hypot(drag.x - rect.x - rect.width / 2, drag.y - rect.y - rect.height / 2);
            return !best || distance < best.distance ? { node, distance } : best;
          }, null);
          if (target) reorder(list, target.node);
        }
      }
    }
    frame = requestAnimationFrame(tick);
  }
  async function end(accept) {
    if (!drag || drag.finishing) return;
    if (!drag.started) { drag = null; return; }
    if (accept) { cancelAnimationFrame(frame); tick(); }
    const state = drag;
    state.finishing = true;
    cancelAnimationFrame(frame);
    frame = 0;
    blockClickUntil = performance.now() + 500;
    if (document.body.hasPointerCapture(state.pointerId)) document.body.releasePointerCapture(state.pointerId);
    try {
      if (accept && state.valid) {
        const category = state.kind === 'category' ? null : state.sidebarCategory || state.node.closest('[data-category]').dataset.category;
        const beforeId = state.sidebarCategory ? null : state.node.nextElementSibling ? idOf(state.node.nextElementSibling) : null;
        const rect = state.node.getBoundingClientRect();
        const landing = !reducedMotion.matches && !state.sidebarCategory ? state.ghost.animate(
          [{ transform: state.ghost.style.transform }, { transform: `translate3d(${rect.left}px,${rect.top}px,0) scale(1)` }],
          { duration: 160, easing: 'ease-out', fill: 'forwards' }).finished : Promise.resolve();
        await Promise.all([commit({ kind: state.kind, id: idOf(state.node), category, beforeId }), landing]);
      }
    } finally {
      state.ghost.remove();
      state.node.classList.remove('sort-placeholder');
      state.node.removeAttribute('aria-grabbed');
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
      document.querySelectorAll('.drop-target').forEach(node => node.classList.remove('drop-target'));
      document.body.classList.remove('sorting', 'is-dragging');
      drag = null;
      finish();
      refresh();
    }
  }
  document.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || event.target.closest('select,input,textarea,dialog,[role="menu"]')) return;
    const node = event.target.closest('#category-nav > .category-row, #content .bookmark-card');
    if (!node || event.pointerType === 'touch' && node.matches('.bookmark-card') && !event.target.closest('.drag-handle')) return;
    drag = { node, kind: node.matches('.category-row') ? 'category' : 'bookmark', pointerId: event.pointerId,
      startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY };
  });
  document.addEventListener('pointermove', event => {
    if (!drag || drag.finishing || event.pointerId !== drag.pointerId) return;
    if (!drag.node.isConnected) { drag = null; return; }
    drag.x = event.clientX; drag.y = event.clientY;
    if (!drag.started && Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6) start();
    if (drag.started) { event.preventDefault(); if (!frame) frame = requestAnimationFrame(tick); }
  }, { passive: false });
  document.addEventListener('pointerup', event => { if (drag?.pointerId === event.pointerId) end(true); });
  document.addEventListener('pointercancel', event => { if (drag?.pointerId === event.pointerId) end(false); });
  document.body.addEventListener('lostpointercapture', () => end(false));
  window.addEventListener('blur', () => end(false));
  document.addEventListener('click', event => {
    if (performance.now() < blockClickUntil && event.detail) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('dragstart', event => {
    if (event.target.closest('.bookmark-card,.category-row')) event.preventDefault();
  });
  document.addEventListener('keydown', async event => {
    if (event.key === 'Escape' && drag) { event.preventDefault(); end(false); return; }
    if (!event.altKey || drag || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const node = event.target.closest('#category-nav > .category-row, #content .bookmark-card');
    if (!node || event.target.matches('select')) return;
    const kind = node.matches('.category-row') ? 'category' : 'bookmark';
    if (kind === 'bookmark' && node.closest('[data-category="recent"]')) return;
    const list = kind === 'category' ? rows() : cards(node.parentElement);
    const index = list.indexOf(node), next = index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1);
    event.preventDefault();
    if (next < 0 || next >= list.length) return;
    await commit({ kind, id: idOf(node), category: kind === 'bookmark' ? node.closest('[data-category]').dataset.category : null,
      beforeId: next < index ? idOf(list[next]) : list[next + 1] ? idOf(list[next + 1]) : null });
    finish();
    const selector = kind === 'category' ? `[data-category-id="${CSS.escape(idOf(node))}"] button` : `[data-id="${CSS.escape(idOf(node))}"] a`;
    document.querySelector(selector)?.focus();
  });
  return refresh;
}
