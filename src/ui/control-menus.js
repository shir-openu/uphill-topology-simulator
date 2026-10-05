// The original selects remain the source of truth for the application and exports.
// These lists make the same choices visible to people and to the live introduction.
const controlMenuInstallations = new WeakMap();
const CONTROL_MENU_IDS = ['preset', 'mode', 'stat', 'layout-choice', 'colour-mode', 'qview'];

export function installControlMenus(doc = document) {
  if (controlMenuInstallations.has(doc)) return controlMenuInstallations.get(doc);
  const states = new Map();
  let opened = null, positionFrame = 0, typed = '', typedAt = 0;

  function activeTourControl(target) {
    if (target?.closest?.('[data-control-help-trigger], #control-help-popover')) return true;
    const tour = doc.getElementById('live-tour');
    return tour?.dataset.active === 'true' && !tour.hidden && Boolean(target?.closest?.('#live-tour .live-tour-bar'));
  }

  function allOptions(state) { return [...state.list.querySelectorAll('[data-menu-value]')]; }

  function enabledOptions(state) {
    return allOptions(state).filter(option => !option.disabled);
  }

  function activate(state, value, reveal = true) {
    let option = allOptions(state).find(item => item.dataset.menuValue === String(value) && !item.disabled);
    option ||= enabledOptions(state)[0];
    state.activeValue = option?.dataset.menuValue ?? null;
    for (const item of allOptions(state)) item.classList.toggle('is-active', item === option);
    if (option && opened === state) state.button.setAttribute('aria-activedescendant', option.id);
    else state.button.removeAttribute('aria-activedescendant');
    if (option && reveal && opened === state) {
      const top = option.offsetTop, bottom = top + option.offsetHeight;
      if (top < state.list.scrollTop) state.list.scrollTop = top;
      else if (bottom > state.list.scrollTop + state.list.clientHeight) state.list.scrollTop = bottom - state.list.clientHeight;
    }
  }

  function position(state) {
    if (opened !== state) return;
    const rect = state.button.getBoundingClientRect(), win = doc.defaultView;
    if (!rect.width || !rect.height || state.wrapper.closest('[inert]')) { closeAll(); return; }
    const margin = 10, gap = 7, width = Math.min(Math.max(rect.width, 250), win.innerWidth - margin * 2);
    const availableBelow = win.innerHeight - rect.bottom - gap - margin;
    const availableAbove = rect.top - gap - margin;
    const above = availableBelow < Math.min(state.list.scrollHeight, 260) && availableAbove > availableBelow;
    const room = Math.max(80, above ? availableAbove : availableBelow);
    state.list.style.width = `${width}px`;
    state.list.style.maxHeight = `${Math.min(480, room)}px`;
    state.list.style.left = `${Math.max(margin, Math.min(rect.left, win.innerWidth - width - margin))}px`;
    state.list.style.top = `${above ? Math.max(margin, rect.top - gap - Math.min(state.list.scrollHeight, room, 480)) : Math.max(margin, rect.bottom + gap)}px`;
    state.list.dataset.placement = above ? 'above' : 'below';
  }

  function schedulePosition() {
    if (!opened || positionFrame) return;
    positionFrame = doc.defaultView.requestAnimationFrame(() => { positionFrame = 0; if (opened) position(opened); });
  }

  function closeAll({ focus = false } = {}) {
    const previous = opened;
    if (!previous) return;
    opened = null;
    previous.list.hidden = true;
    previous.wrapper.dataset.menuOpen = 'false';
    previous.button.setAttribute('aria-expanded', 'false');
    previous.button.removeAttribute('aria-activedescendant');
    if (focus && previous.button.isConnected && !previous.button.disabled) previous.button.focus({ preventScroll: true });
  }

  function syncState(state) {
    const { select, button, list } = state;
    const options = [...select.options];
    const signature = JSON.stringify(options.map(item => [item.value, item.textContent, item.disabled, item.hidden,
      item.closest('optgroup')?.label || '', item.closest('optgroup')?.disabled || false, item.closest('optgroup')?.hidden || false]));
    if (signature !== state.signature) {
      state.signature = signature;
      list.replaceChildren();
      const groups = new Map();
      options.forEach((item, index) => {
        const sourceGroup = item.closest('optgroup');
        if (item.hidden || sourceGroup?.hidden) return;
        let parent = list;
        if (sourceGroup) {
          if (!groups.has(sourceGroup)) {
            const group = doc.createElement('div'); group.className = 'control-menu-group';
            group.setAttribute('role', 'group'); group.setAttribute('aria-label', sourceGroup.label);
            const heading = doc.createElement('div'); heading.className = 'control-menu-group-label'; heading.setAttribute('aria-hidden', 'true'); heading.textContent = sourceGroup.label;
            group.append(heading); list.append(group); groups.set(sourceGroup, group);
          }
          parent = groups.get(sourceGroup);
        }
        const option = doc.createElement('button');
        option.type = 'button'; option.className = 'control-menu-option'; option.id = `${select.id}-menu-option-${index}`;
        option.setAttribute('role', 'option'); option.tabIndex = -1;
        option.dataset.menuId = select.id; option.dataset.menuValue = item.value;
        option.disabled = item.disabled || item.parentElement?.disabled === true;
        const mark = doc.createElement('span'); mark.className = 'control-menu-check'; mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true');
        const label = doc.createElement('span'); label.className = 'control-menu-option-label'; label.textContent = item.textContent;
        option.append(mark, label); parent.append(option);
      });
    }
    const selected = options[select.selectedIndex];
    state.label.textContent = selected?.textContent || 'Choose an option';
    button.disabled = select.disabled;
    button.setAttribute('aria-label', `${select.getAttribute('aria-label') || select.id}: ${selected?.textContent || 'Choose an option'}`);
    for (const option of allOptions(state)) option.setAttribute('aria-selected', String(option.dataset.menuValue === select.value));
    if (opened === state) {
      if (button.disabled) closeAll();
      else { activate(state, state.activeValue ?? select.value, false); position(state); }
    }
  }

  function sync() { for (const state of states.values()) syncState(state); }

  function open(id, { focus = false } = {}) {
    const state = states.get(id);
    if (!state) return false;
    syncState(state);
    if (state.select.disabled || !state.button.getClientRects().length || state.wrapper.closest('[inert]')) return false;
    const fresh = opened !== state;
    if (fresh) closeAll();
    opened = state;
    state.list.hidden = false;
    state.wrapper.dataset.menuOpen = 'true';
    state.button.setAttribute('aria-expanded', 'true');
    position(state);
    if (fresh) state.list.scrollTop = 0;
    activate(state, state.select.value);
    if (focus) state.button.focus({ preventScroll: true });
    return opened === state;
  }

  function choose(state, value, focus = false) {
    const selected = [...state.select.options].find(option => option.value === value && !option.disabled && !option.parentElement?.disabled && !option.hidden && !option.closest('optgroup')?.hidden);
    if (!selected) return;
    const changed = state.select.value !== selected.value;
    state.select.value = selected.value;
    closeAll({ focus });
    syncState(state);
    if (changed) state.select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function onKey(state, event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key, options = enabledOptions(state);
    if (key === 'Tab') { closeAll(); return; }
    if (key === 'Escape' && opened === state) {
      event.preventDefault(); event.stopPropagation(); closeAll({ focus: true }); return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
      event.preventDefault(); event.stopPropagation();
      if (opened !== state) { open(state.select.id, { focus: true }); if (!['Home', 'End'].includes(key)) return; }
      if (key === 'Enter' || key === ' ') { if (state.activeValue !== null) choose(state, state.activeValue, true); return; }
      const current = options.findIndex(item => item.dataset.menuValue === state.activeValue);
      const index = key === 'Home' ? 0 : key === 'End' ? options.length - 1
        : Math.max(0, Math.min(options.length - 1, current + (key === 'ArrowDown' ? 1 : -1)));
      if (options[index]) activate(state, options[index].dataset.menuValue);
      return;
    }
    if (key.length === 1 && key.trim()) {
      event.preventDefault();
      if (opened !== state) open(state.select.id, { focus: true });
      const now = Date.now(); typed = now - typedAt < 700 ? typed + key.toLocaleLowerCase() : key.toLocaleLowerCase(); typedAt = now;
      const match = options.find(option => option.querySelector('.control-menu-option-label').textContent.trim().toLocaleLowerCase().startsWith(typed));
      if (match) activate(state, match.dataset.menuValue);
    }
  }

  for (const id of CONTROL_MENU_IDS) {
    const select = doc.getElementById(id);
    if (!select) continue;
    const wrapper = doc.createElement('span'); wrapper.className = 'control-menu'; wrapper.dataset.menuOpen = 'false';
    select.before(wrapper); wrapper.append(select);
    select.classList.add('control-menu-native'); select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'control-menu-button'; button.id = `${id}-menu-button`;
    button.setAttribute('role', 'combobox'); button.setAttribute('aria-haspopup', 'listbox'); button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', `${id}-menu-list`);
    const label = doc.createElement('span'); label.className = 'control-menu-label';
    const arrow = doc.createElement('span'); arrow.className = 'control-menu-arrow'; arrow.textContent = '⌄'; arrow.setAttribute('aria-hidden', 'true');
    button.append(label, arrow);
    const list = doc.createElement('div'); list.className = 'control-menu-list'; list.id = `${id}-menu-list`; list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', select.getAttribute('aria-label') || id); list.hidden = true;
    wrapper.append(button, list);
    const state = { select, wrapper, button, label, list, signature: null, activeValue: null }; states.set(id, state);
    const fieldLabel = select.closest('label');
    fieldLabel?.addEventListener('click', event => {
      if (!wrapper.contains(event.target) && !event.target.closest('a,button,input,select,textarea')) {
        event.preventDefault(); button.focus({ preventScroll: true });
      }
    });
    select.addEventListener('focus', () => button.focus({ preventScroll: true }));
    button.addEventListener('click', () => opened === state ? closeAll() : open(id, { focus: true }));
    button.addEventListener('keydown', event => onKey(state, event));
    list.addEventListener('keydown', event => onKey(state, event));
    list.addEventListener('click', event => {
      const option = event.target.closest('[data-menu-value]');
      if (option && list.contains(option) && !option.disabled) choose(state, option.dataset.menuValue, event.isTrusted);
    });
    list.addEventListener('pointermove', event => {
      const option = event.target.closest('[data-menu-value]');
      if (option && !option.disabled) activate(state, option.dataset.menuValue, false);
    });
    select.addEventListener('change', () => syncState(state));
  }

  doc.addEventListener('pointerdown', event => { if (opened && !opened.wrapper.contains(event.target) && !activeTourControl(event.target)) closeAll(); }, true);
  doc.addEventListener('focusin', event => { if (opened && !opened.wrapper.contains(event.target) && !activeTourControl(event.target)) closeAll(); });
  doc.addEventListener('scroll', schedulePosition, true);
  doc.defaultView.addEventListener('resize', schedulePosition);
  const api = {
    open, closeAll, sync,
    button: id => states.get(id)?.button || null,
    option: (id, value) => states.has(id) ? allOptions(states.get(id)).find(item => item.dataset.menuValue === String(value)) || null : null,
    capture: () => ({ openId: opened?.select.id || null, activeValue: opened?.activeValue ?? null, scrollTop: opened?.list.scrollTop || 0 }),
    restore(snapshot) {
      closeAll(); sync();
      if (snapshot?.openId && open(snapshot.openId)) {
        const state = states.get(snapshot.openId);
        activate(state, snapshot.activeValue ?? state.select.value, false);
        state.list.scrollTop = Number(snapshot.scrollTop) || 0;
      }
    },
  };
  sync(); controlMenuInstallations.set(doc, api); return api;
}
