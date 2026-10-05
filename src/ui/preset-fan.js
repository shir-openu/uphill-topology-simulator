// Reuse the real preset cards: their existing delegated action remains authoritative.
const presetFanInstallations = new WeakMap();

export function installPresetFan(doc = document) {
  const gallery = doc.getElementById('preset-gallery');
  if (!gallery) return { open() {}, close() {}, capture: () => ({ open: false }), restore() {} };
  if (presetFanInstallations.has(gallery)) return presetFanInstallations.get(gallery);
  const cards = [...gallery.querySelectorAll('[data-playground]')];
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.id = 'preset-fan-toggle'; toggle.className = 'preset-fan-toggle';
  toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'preset-fan-list');
  const stack = doc.createElement('span'); stack.className = 'preset-fan-stack'; stack.setAttribute('aria-hidden', 'true');
  for (const card of cards.slice(0, 3)) {
    const preview = doc.createElement('span'); preview.className = 'preset-fan-preview';
    const picture = card.querySelector('svg')?.cloneNode(true);
    if (picture) { picture.removeAttribute('id'); picture.querySelectorAll('[id]').forEach(item => item.removeAttribute('id')); preview.append(picture); }
    stack.append(preview);
  }
  const words = doc.createElement('span'); words.className = 'preset-fan-words';
  const title = doc.createElement('strong'); title.textContent = 'Picture presets';
  const hint = doc.createElement('span'); hint.textContent = `${cards.length} graphs to explore`;
  words.append(title, hint);
  const arrow = doc.createElement('span'); arrow.className = 'preset-fan-arrow'; arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true');
  toggle.append(stack, words, arrow);
  const list = doc.createElement('div'); list.id = 'preset-fan-list'; list.className = 'preset-fan-list'; list.setAttribute('role', 'group'); list.setAttribute('aria-label', 'Choose a picture preset'); list.hidden = true;
  cards.forEach((card, index) => { card.style.setProperty('--fan-index', String(index)); list.append(card); });
  gallery.classList.add('preset-fan'); gallery.dataset.fanOpen = 'false'; gallery.append(toggle, list);
  let isOpen = false, pinned = false, closeTimer = 0, positionFrame = 0, suppressFocusOpen = false;
  let interaction = 'keyboard';
  const actualFan = target => Boolean(target && (toggle.contains(target) || list.contains(target)));
  const helpOwner = target => {
    const help = target?.closest?.('[data-control-help-trigger],#control-help-popover');
    const token = help?.dataset.helpFor;
    return token ? doc.querySelector(`[data-help-token="${CSS.escape(token)}"]`) : null;
  };
  const containsFan = target => actualFan(target) || actualFan(helpOwner(target));

  function activeTourBar() {
    const tour = doc.getElementById('live-tour');
    return tour?.dataset.active === 'true' && !tour.hidden ? tour.querySelector('.live-tour-bar') : null;
  }

  function tourBarInUse() {
    const bar = activeTourBar();
    return Boolean(bar && (bar.contains(doc.activeElement) || bar.matches(':hover')));
  }

  function position() {
    if (!isOpen) return;
    const rect = toggle.getBoundingClientRect(), win = doc.defaultView, margin = 12, gap = 9;
    if (!rect.width || !rect.height || gallery.closest('[inert]')) { close(); return; }
    const narrow = win.innerWidth <= 700;
    const width = Math.min(narrow ? Math.max(rect.width, 310) : 1120, win.innerWidth - margin * 2);
    list.style.width = `${width}px`;
    list.style.left = `${Math.max(margin, Math.min(rect.left, win.innerWidth - width - margin))}px`;
    const below = win.innerHeight - rect.bottom - gap - margin, above = rect.top - gap - margin;
    const upwards = below < Math.min(list.scrollHeight, 220) && above > below;
    const room = Math.max(90, upwards ? above : below);
    list.style.maxHeight = `${Math.min(550, room)}px`;
    list.style.top = `${upwards ? Math.max(margin, rect.top - gap - Math.min(list.scrollHeight, room, 550)) : Math.max(margin, rect.bottom + gap)}px`;
    list.dataset.placement = upwards ? 'above' : 'below';
  }

  function open({ pin = false } = {}) {
    clearTimeout(closeTimer);
    if (!toggle.getClientRects().length || gallery.closest('[inert]')) return false;
    if (pin) pinned = true;
    isOpen = true; list.hidden = false; gallery.dataset.fanOpen = 'true'; toggle.setAttribute('aria-expanded', 'true'); position(); return isOpen;
  }

  function close({ focus = false } = {}) {
    clearTimeout(closeTimer); isOpen = false; pinned = false; list.hidden = true; gallery.dataset.fanOpen = 'false'; toggle.setAttribute('aria-expanded', 'false');
    if (focus) { suppressFocusOpen = true; toggle.focus({ preventScroll: true }); suppressFocusOpen = false; }
  }

  function scheduleClose(event) {
    // A mouse click focuses the toggle and can pin it open. Neither should
    // prevent hover-off dismissal; touch and keyboard retain deliberate focus.
    if (event.pointerType === 'touch' || interaction !== 'mouse') return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      const hoverHelp = doc.querySelector('[data-control-help-trigger]:hover,#control-help-popover:hover');
      if (interaction === 'mouse' && !toggle.matches(':hover') && !list.matches(':hover') && !containsFan(hoverHelp) && !tourBarInUse()) close();
    }, 220);
  }

  const helpInUse = target => Boolean(target?.closest?.('[data-control-help-trigger], #control-help-popover'));

  // Hover/focus can reveal the stack before the first click. That click pins it;
  // it must not immediately hide the choices that the person came to open.
  toggle.addEventListener('click', () => { pinned ? close() : open({ pin: true }); });
  const enterFan = event => {
    if (event.pointerType !== 'touch') { interaction = 'mouse'; open(); }
  };
  toggle.addEventListener('pointerenter', enterFan);
  toggle.addEventListener('pointerleave', scheduleClose);
  // The fixed popup can be separated from its toggle by a small gap. Entering
  // its visible choices cancels the same grace timer as re-entering the toggle.
  list.addEventListener('pointerenter', enterFan);
  list.addEventListener('pointerleave', scheduleClose);
  doc.addEventListener('pointerout', event => {
    if (event.target.closest?.('[data-control-help-trigger],#control-help-popover') && containsFan(event.target)) scheduleClose(event);
  });
  gallery.addEventListener('pointerdown', event => {
    if (!containsFan(event.target)) return;
    interaction = event.pointerType === 'touch' ? 'touch' : 'mouse';
    clearTimeout(closeTimer);
  });
  doc.addEventListener('keydown', event => {
    if (event.key === 'Tab' || gallery.contains(event.target)) {
      interaction = 'keyboard'; clearTimeout(closeTimer);
    }
  }, true);
  gallery.addEventListener('focusin', () => { clearTimeout(closeTimer); if (!suppressFocusOpen) open(); });
  gallery.addEventListener('focusout', () => { setTimeout(() => { if (!gallery.contains(doc.activeElement) && !tourBarInUse() && !helpInUse(doc.activeElement)) close(); }, 0); });
  gallery.addEventListener('click', event => { if (event.target.closest('[data-playground]')) close({ focus: event.isTrusted }); });
  gallery.addEventListener('keydown', event => {
    if (event.key === 'Escape' && isOpen) { event.preventDefault(); event.stopPropagation(); close({ focus: true }); }
    else if (event.target === toggle && event.key === 'ArrowDown') {
      event.preventDefault(); open(); cards[0]?.focus({ preventScroll: true });
    } else if (event.target.closest('[data-playground]') && ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const current = cards.indexOf(event.target.closest('[data-playground]'));
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1
        : (current + (['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1) + cards.length) % cards.length;
      cards[next]?.focus({ preventScroll: true });
      const card = cards[next];
      if (card && card.offsetTop < list.scrollTop) list.scrollTop = card.offsetTop;
      else if (card && card.offsetTop + card.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = card.offsetTop + card.offsetHeight - list.clientHeight;
    }
  });
  doc.addEventListener('pointerdown', event => { if (isOpen && !containsFan(event.target) && !activeTourBar()?.contains(event.target) && !helpInUse(event.target)) close(); }, true);
  const schedulePosition = () => {
    if (!isOpen || positionFrame) return;
    positionFrame = doc.defaultView.requestAnimationFrame(() => { positionFrame = 0; position(); });
  };
  doc.addEventListener('scroll', schedulePosition, true); doc.defaultView.addEventListener('resize', schedulePosition);
  const api = { open, close, capture: () => ({ open: isOpen, pinned, scrollTop: list.scrollTop }),
    restore(snapshot) { close(); if (snapshot?.open && open({ pin: Boolean(snapshot.pinned) })) list.scrollTop = Number(snapshot.scrollTop) || 0; } };
  presetFanInstallations.set(gallery, api); return api;
}
