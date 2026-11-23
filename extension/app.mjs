import { CATEGORIES, UNFILED, flattenBookmarks, hostname, safeUrl, categoryOf, getCategories, categoryNameError, bookmarkTitle, bookmarkNameError, orderItems, moveBefore } from './core.mjs';
import { setupMotion } from './motion.mjs';
import { runBookmarkAction, deleteBookmark } from './bookmark-actions.mjs';
import { webSearchUrl } from './search.mjs';
import { adaptFavicon } from './favicon.mjs';

const $ = id => document.getElementById(id);
let bookmarks = [], storage = {}, categories = [...CATEGORIES], view = 'all', editing = false, loaded = false;
let toastTimer, refreshTimer, loadSequence = 0;
let renamingCategoryId = null, categorySaving = false;
let deletingCategoryId = null;
let menuBookmark = null, menuTrigger = null, nativeMenuBookmarkId = null;
let menuCategoryId = null;
let renamingBookmarkId = null, bookmarkSaving = false;
let deletingBookmarkId = null, bookmarkDeleting = false;

const ambientPlane = document.querySelector('.ambient-plane');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const refreshNavigationMotion = setupMotion({ commit: commitOrder, finish: render, closeMenu: closeBookmarkMenu, reducedMotion });
async function commitOrder({ kind, id, category, beforeId }) {
  try {
    return await navigator.locks.request('bookmark-desktop-categories', async () => {
      const latest = await chrome.storage.local.get(null);
      const currentCategories = getCategories(latest);
      Object.assign(storage, latest);
      let items, values;
      if (kind === 'category') {
        items = currentCategories;
        values = {};
      } else {
        if (![...currentCategories, UNFILED].some(item => item.id === category)) throw new Error('分类已被删除');
        const currentBookmarks = flattenBookmarks(await chrome.bookmarks.getTree());
        const bookmark = currentBookmarks.find(item => item.id === id);
        if (!bookmark) throw new Error('书签已被删除');
        items = orderItems(currentBookmarks.filter(item => categoryOf(item, latest, currentCategories) === category), latest[`bookmarkOrder:${category}`]);
        if (!items.some(item => item.id === id)) items.push(bookmark);
        values = categoryOf(bookmark, latest, currentCategories) === category ? {} : { [`category:${id}`]: category };
      }
      if (!items.some(item => item.id === id) || beforeId !== null && !items.some(item => item.id === beforeId)) throw new Error('排序项目已变化，请重试');
      values[kind === 'category' ? 'categoryOrder' : `bookmarkOrder:${category}`] = moveBefore(items, id, beforeId).map(item => item.id);
      const saved = await save(values);
      if (saved) notify('顺序已保存');
      return saved;
    });
  } catch (error) {
    console.error(error);
    showError('顺序未保存，已恢复原位置，请重试。');
    return false;
  }
}
const assistantVideo = $('assistant-motion');
function showStillAssistant() { $('assistant-trigger').classList.add('is-static'); }
assistantVideo.addEventListener('error', showStillAssistant);
function syncAssistantPlayback() {
  if (document.hidden || reducedMotion.matches) assistantVideo.pause();
  else assistantVideo.play().catch(error => { if (error.name !== 'AbortError') showStillAssistant(); });
}
let pointerFrame = 0, pointerX = 0, pointerY = 0;
function resetAmbientPointer() {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = 0;
  ambientPlane.style.setProperty('--mouse-x', '0px');
  ambientPlane.style.setProperty('--mouse-y', '0px');
}
window.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType === 'touch') return;
  pointerX = (event.clientX / innerWidth - .5) * 28;
  pointerY = (event.clientY / innerHeight - .5) * 20;
  if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
    ambientPlane.style.setProperty('--mouse-x', `${pointerX}px`);
    ambientPlane.style.setProperty('--mouse-y', `${pointerY}px`);
    pointerFrame = 0;
  });
}, { passive: true });
document.documentElement.addEventListener('pointerleave', resetAmbientPointer);
reducedMotion.addEventListener('change', () => { resetAmbientPointer(); syncAssistantPlayback(); });
function syncAmbientVisibility() {
  document.body.classList.toggle('is-background-paused', document.hidden);
  if (document.hidden) resetAmbientPointer();
  syncAssistantPlayback();
}
document.addEventListener('visibilitychange', syncAmbientVisibility);
syncAmbientVisibility();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3200);
}

function showError(message) {
  $('error-text').textContent = message;
  $('error-banner').hidden = false;
}

async function save(values) {
  try {
    await chrome.storage.local.set(values);
    Object.assign(storage, values);
    $('error-banner').hidden = true;
    return true;
  } catch (error) {
    console.error(error);
    showError('保存失败，调整尚未保存。请重试刚才的操作。');
    return false;
  }
}

async function assignCategory(id, category) {
  if (!bookmarks.some(bookmark => bookmark.id === id)) return;
  try {
    await navigator.locks.request('bookmark-desktop-categories', async () => {
      const latest = await chrome.storage.local.get(null);
      const destination = [...getCategories(latest), UNFILED].find(item => item.id === category);
      Object.assign(storage, latest);
      if (!destination) { render(); notify('此分类已被删除，请选择其他分类。'); return; }
      const items = orderItems(bookmarks.filter(item => item.id !== id && categoryOf(item, latest, getCategories(latest)) === category), latest[`bookmarkOrder:${category}`]);
      const values = { [`category:${id}`]: category };
      if (categoryOf(bookmarks.find(item => item.id === id), latest, getCategories(latest)) !== category) values[`bookmarkOrder:${category}`] = [...items.map(item => item.id), id];
      if (await save(values)) notify(`已移至「${destination.name}」`);
      render();
    });
  } catch (error) {
    console.error(error);
    showError('分类未保存，请重试刚才的操作。');
    render();
  }
}

function navButton(id, name, symbol, count) {
  const button = element('button', 'nav-button');
  button.type = 'button';
  button.dataset.view = id;
  button.setAttribute('aria-current', view === id ? 'page' : 'false');
  button.append(icon(symbol), element('span', '', name));
  if (count !== undefined) button.append(element('span', 'count', count));
  button.addEventListener('click', () => { location.hash = id; });
  return button;
}

function renderNavigation() {
  const counts = new Map();
  bookmarks.forEach(bookmark => {
    const category = categoryOf(bookmark, storage, categories);
    counts.set(category, (counts.get(category) || 0) + 1);
  });
  $('main-nav').replaceChildren(
    navButton('all', '全部书签', 'grid', bookmarks.length),
    navButton('recent', '最近收藏', 'clock'),
    navButton('unfiled', '待分类', 'inbox', counts.get('unfiled') || 0),
  );
  $('category-nav').replaceChildren(...categories.map(category => {
    const row = element('div', 'category-row');
    row.dataset.categoryId = category.id;
    const button = navButton(category.id, category.name, 'folder', counts.get(category.id) || 0);
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', 'category-menu');
    button.title = `${category.name}（拖动排序；Alt + 方向键排序；右键重命名或删除）`;
    row.append(button);
    return row;
  }));
}

function bookmarkCard(bookmark) {
  const title = bookmarkTitle(bookmark, storage);
  const card = element('article', 'bookmark-card');
  card.dataset.id = bookmark.id;
  card.draggable = false;
  const link = element('a', 'bookmark-link');
  const url = safeUrl(bookmark.url);
  if (url) link.href = url;
  else {
    link.setAttribute('aria-disabled', 'true');
    link.tabIndex = 0;
  }
  link.title = `${title}\n${bookmark.url}${url ? '' : '\n为安全起见，此类链接不支持直接打开。'}`;
  link.target = storage.openNewTab === false ? '_self' : '_blank';
  link.rel = 'noopener noreferrer';
  link.draggable = false;
  const favicon = element('span', 'favicon-wrap', [...title.trim()][0]?.toUpperCase() || 'B');
  if (url && /^https?:/.test(url)) {
    const img = element('img', 'favicon');
    const faviconUrl = new URL(chrome.runtime.getURL('_favicon/'));
    faviconUrl.searchParams.set('pageUrl', bookmark.url);
    faviconUrl.searchParams.set('size', '32');
    img.alt = '';
    img.loading = 'lazy';
    img.draggable = false;
    img.addEventListener('load', () => adaptFavicon(img));
    img.addEventListener('error', () => { img.remove(); favicon.textContent = [...title.trim()][0]?.toUpperCase() || 'B'; }, { once: true });
    favicon.replaceChildren(img);
    img.src = faviconUrl.href;
  }
  const info = element('span', 'bookmark-info');
  info.append(element('span', 'bookmark-name', title), element('span', 'bookmark-domain', hostname(bookmark.url) || bookmark.url));
  link.append(favicon, info);
  link.addEventListener('click', async event => {
    if (!url) { event.preventDefault(); notify('此类链接不支持直接打开，请在 Chrome 原书签中使用。'); return; }
    if (url.startsWith('chrome:') || url.startsWith('about:')) {
      event.preventDefault();
      try {
        if (storage.openNewTab === false) await chrome.tabs.update({ url });
        else await chrome.tabs.create({ url });
      } catch { notify('Chrome 无法打开此地址，请在地址栏中访问。'); }
    }
  });
  card.append(link);
  const handle = element('span', 'drag-handle');
  handle.title = '拖动调整顺序或移至分类；Alt + 方向键调整顺序';
  handle.setAttribute('aria-hidden', 'true');
  handle.draggable = false;
  handle.append(icon('grip'));
  card.append(handle);
  if (editing || view === 'unfiled') {
    const select = element('select');
    select.setAttribute('aria-label', `调整「${title}」的分类`);
    for (const category of [...categories, UNFILED]) {
      const option = element('option', '', category.name);
      option.value = category.id;
      select.append(option);
    }
    select.value = categoryOf(bookmark, storage, categories);
    select.addEventListener('change', async () => {
      select.disabled = true;
      await assignCategory(bookmark.id, select.value);
    });
    card.append(select);
  }
  return card;
}

function closeBookmarkMenu(restoreFocus = false) {
  $('bookmark-menu').hidden = true;
  $('category-menu').hidden = true;
  menuBookmark = null;
  menuCategoryId = null;
  if (restoreFocus && menuTrigger?.isConnected) menuTrigger.focus();
}

function showBookmarkMenu(event, card) {
  const bookmark = bookmarks.find(item => item.id === card.dataset.id);
  if (!bookmark) return;
  if (event.shiftKey || nativeMenuBookmarkId === bookmark.id) {
    nativeMenuBookmarkId = null;
    closeBookmarkMenu();
    return;
  }
  event.preventDefault();
  closeBookmarkMenu();
  nativeMenuBookmarkId = null;
  menuBookmark = bookmark;
  menuTrigger = card.querySelector('.bookmark-link');
  const menu = $('bookmark-menu');
  const url = safeUrl(bookmark.url);
  for (const button of menu.querySelectorAll('[data-action]')) {
    button.disabled = ['new-tab', 'new-window'].includes(button.dataset.action) ? !url : button.dataset.action === 'save-link' ? !url || !/^https?:/.test(url) : false;
  }
  positionMenu(menu, event, card);
}

function positionMenu(menu, event, anchor) {
  menu.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const x = event.clientX || rect.left + 16;
  const y = event.clientY || rect.top + 16;
  menu.style.left = `${Math.max(8, Math.min(x, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, innerHeight - menu.offsetHeight - 8))}px`;
  menu.querySelector('button:not(:disabled)').focus();
}

function showCategoryMenu(event, row) {
  event.preventDefault();
  closeBookmarkMenu();
  if (categorySaving || !categories.some(category => category.id === row.dataset.categoryId)) return;
  menuCategoryId = row.dataset.categoryId;
  menuTrigger = row.querySelector('.nav-button');
  positionMenu($('category-menu'), event, row);
}

$('category-nav').addEventListener('contextmenu', event => {
  const row = event.target.closest('[data-category-id]');
  if (row) showCategoryMenu(event, row);
});
$('category-nav').addEventListener('keydown', event => {
  if (event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) {
    const row = event.target.closest('[data-category-id]');
    if (row) { event.preventDefault(); showCategoryMenu({ clientX: 0, clientY: 0, preventDefault() {} }, row); }
  }
});
$('category-menu').addEventListener('click', event => {
  const button = event.target.closest('[data-category-action]');
  if (!button || !menuCategoryId) return;
  const id = menuCategoryId;
  closeBookmarkMenu(true);
  if (button.dataset.categoryAction === 'rename') openCategoryForm(id);
  else if (button.dataset.categoryAction === 'delete') openDeleteCategory(id);
});

$('content').addEventListener('contextmenu', event => {
  const card = event.target.closest('.bookmark-card');
  if (card && !event.target.closest('select')) showBookmarkMenu(event, card);
});
$('content').addEventListener('keydown', event => {
  if ((event.key === 'ContextMenu' || event.key === 'F10' && event.shiftKey) && !event.target.matches('select')) {
    const card = event.target.closest('.bookmark-card');
    if (card) { event.preventDefault(); showBookmarkMenu({ clientX: 0, clientY: 0, preventDefault() {} }, card); }
  }
});
$('bookmark-menu').addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || !menuBookmark) return;
  const bookmark = menuBookmark;
  closeBookmarkMenu(true);
  if (button.dataset.action === 'rename') { openBookmarkRename(bookmark); return; }
  if (button.dataset.action === 'delete') { openBookmarkDelete(bookmark); return; }
  if (button.dataset.action === 'inspect') {
    nativeMenuBookmarkId = bookmark.id;
    notify('请再次右键点击此书签，在浏览器菜单中选择「检查」。');
    return;
  }
  try {
    const message = await runBookmarkAction(button.dataset.action, bookmark.url);
    if (message) notify(message);
  } catch (error) {
    console.error(error);
    notify(error.message || '操作失败，请重试。');
  }
});
function handleMenuKeydown(event) {
  const items = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
  const index = items.indexOf(document.activeElement);
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  } else if (event.key === 'Escape') { event.preventDefault(); closeBookmarkMenu(true); }
  else if (event.key === 'Tab') closeBookmarkMenu(true);
}
$('bookmark-menu').addEventListener('keydown', handleMenuKeydown);
$('category-menu').addEventListener('keydown', handleMenuKeydown);
document.addEventListener('pointerdown', event => { if (!event.target.closest('.bookmark-menu')) closeBookmarkMenu(); });
document.addEventListener('contextmenu', event => { if (!event.target.closest('.bookmark-card, [data-category-id]')) closeBookmarkMenu(); });
window.addEventListener('resize', () => closeBookmarkMenu());
document.addEventListener('scroll', event => { if (!event.target.closest?.('.bookmark-menu')) closeBookmarkMenu(); }, true);

function emptyState(title, message) {
  const empty = element('div', 'empty-state');
  empty.append(icon('bookmark'), element('h2', '', title), element('p', '', message));
  return empty;
}

function render() {
  if (!loaded || document.body.classList.contains('sorting')) return;
  closeBookmarkMenu();
  categories = getCategories(storage);
  if (!['all', 'recent', 'unfiled', ...categories.map(category => category.id)].includes(view)) view = 'all';
  // 保留搜索输入框和整理按钮，不在输入或切换模式时重建焦点所在的控件。
  const focusedView = document.activeElement?.dataset.view;
  const focusedBookmark = document.activeElement?.closest('.bookmark-card')?.dataset.id;
  const focusedControl = document.activeElement?.matches('select') ? 'select' : 'a';
  function restoreBookmarkFocus() {
    if (focusedBookmark) (document.querySelector(`[data-id="${CSS.escape(focusedBookmark)}"] ${focusedControl}`) || $('organize')).focus();
  }
  renderNavigation();
  requestAnimationFrame(refreshNavigationMotion);
  if (focusedView) document.querySelector(`[data-view="${focusedView}"]`)?.focus();
  const current = [...categories, UNFILED].find(category => category.id === view);
  $('organize').disabled = false;
  $('organize').setAttribute('aria-pressed', String(editing));
  $('organize').querySelector('span').textContent = editing ? 'Done' : 'Organize';
  $('open-new-tab').checked = storage.openNewTab !== false;
  $('use-leaf-start').checked = storage.useLeafStart === true;
  $('hint').textContent = editing || view === 'unfiled' ? 'Use the menu or drag a bookmark to a folder to organize.' : 'Search the web or visit a website · Opens in a new Chrome tab';
  let visible = bookmarks.filter(bookmark => !current || categoryOf(bookmark, storage, categories) === current.id);
  if (view === 'recent') visible = visible.toSorted((a, b) => b.dateAdded - a.dateAdded);
  $('result-count').textContent = `${visible.length} bookmarks`;
  $('content').setAttribute('aria-busy', 'false');
  const showEmptyCategories = view === 'all' && categories.length > 0 || current && current.id !== 'unfiled';
  if (!visible.length && !showEmptyCategories) {
    $('content').replaceChildren(emptyState(
      bookmarks.length ? '这个分类还没有书签' : '给喜欢的网站，留一个位置',
      bookmarks.length ? '点击 Organize 修改书签分类，或拖动书签到左侧分类。' : '在 Chrome 中收藏网站后，它们会自动出现在这里。试试按 Ctrl+D（Mac 为 ⌘D）收藏一个网站。',
    ));
    restoreBookmarkFocus();
    return;
  }
  const groups = view === 'recent' ? [{ id: 'recent', name: '按收藏时间', items: visible }] :
    (current ? [current] : [...categories, UNFILED]).map(category => ({ ...category, items: orderItems(visible.filter(bookmark => categoryOf(bookmark, storage, categories) === category.id), storage[`bookmarkOrder:${category.id}`]) })).filter(group => group.items.length || showEmptyCategories && group.id !== 'unfiled');
  const fragment = document.createDocumentFragment();
  for (const group of groups) {
    const section = element('section', 'bookmark-section');
    section.dataset.category = group.id;
    const heading = element('h2', 'section-title');
    heading.append(icon(view === 'recent' ? 'clock' : 'folder'), document.createTextNode(group.name), element('span', 'count', group.items.length));
    const grid = element('div', 'bookmark-grid');
    grid.append(...group.items.map(bookmarkCard));
    if (!group.items.length) grid.append(element('div', 'category-dropzone', '拖动书签到这里'));
    section.append(heading, grid);
    fragment.append(section);
  }
  $('content').replaceChildren(fragment);
  restoreBookmarkFocus();
}

async function load() {
  const sequence = ++loadSequence;
  try {
    const [tree, saved] = await Promise.all([chrome.bookmarks.getTree(), chrome.storage.local.get(null)]);
    if (sequence !== loadSequence) return;
    bookmarks = flattenBookmarks(tree);
    storage = saved;
    loaded = true;
    $('error-banner').hidden = true;
    render();
  } catch (error) {
    if (sequence !== loadSequence) return;
    console.error(error);
    showError('无法读取书签。请确认插件已启用，然后点击重试。');
    $('content').setAttribute('aria-busy', 'false');
    if (!loaded) $('content').replaceChildren(emptyState('暂时无法展开你的收藏', '请检查插件权限，或在扩展程序页面重新加载Leaf Mark。'));
  }
}

function readHash() {
  view = location.hash.slice(1) || 'all';
  render();
}
window.addEventListener('hashchange', readHash);
$('web-search').addEventListener('submit', async event => {
  event.preventDefault();
  if ($('search-submit').disabled || !$('search').value.trim()) return;
  const url = webSearchUrl($('search').value);
  if (!url) { notify('请输入有效的 http 或 https 网址，或搜索关键词。'); $('search').focus(); return; }
  $('search-submit').disabled = true;
  try { await chrome.tabs.create({ url }); }
  catch (error) { console.error(error); notify('无法打开网站，请重试。'); }
  finally { $('search-submit').disabled = false; }
});
$('search').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.isComposing) event.preventDefault();
});
$('retry').addEventListener('click', load);
$('organize').addEventListener('click', () => { editing = !editing; render(); });
document.addEventListener('keydown', event => {
  const typing = event.target.matches('input, textarea, select') || event.target.isContentEditable;
  if (event.key === '/' && !typing && !$('settings-dialog').open && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault(); $('search').focus();
  }
  if (event.key === 'Escape' && event.target === $('search')) { $('search').value = ''; }
});
$('search').addEventListener('focus', () => { $('search-key').hidden = true; });
$('search').addEventListener('blur', () => { $('search-key').hidden = false; });
$('settings').addEventListener('click', () => $('settings-dialog').showModal());
$('settings-dialog').addEventListener('click', event => { if (event.target === $('settings-dialog') && (event.offsetX < 0 || event.offsetX > event.target.clientWidth || event.offsetY < 0 || event.offsetY > event.target.clientHeight)) $('settings-dialog').close(); });
$('open-new-tab').addEventListener('change', async event => {
  const checkbox = event.target;
  const value = checkbox.checked;
  checkbox.disabled = true;
  if (!await save({ openNewTab: value })) checkbox.checked = storage.openNewTab !== false;
  checkbox.disabled = false;
  render();
});
$('use-leaf-start').addEventListener('change', async event => {
  const checkbox = event.target;
  const enabled = checkbox.checked;
  checkbox.disabled = true;
  $('start-setting-error').hidden = true;
  try {
    if (enabled && !await chrome.permissions.request({ permissions: ['tabs'] })) throw new Error('Chrome 未授予权限，设置未开启。');
    if (!await save({ useLeafStart: enabled })) {
      if (enabled) await chrome.permissions.remove({ permissions: ['tabs'] });
      throw new Error('设置未保存，请重试。');
    }
    if (!enabled) await chrome.permissions.remove({ permissions: ['tabs'] });
  } catch (error) {
    $('start-setting-error').textContent = error.message || '无法更新设置，请重试。';
    $('start-setting-error').hidden = false;
  } finally {
    checkbox.checked = storage.useLeafStart === true;
    checkbox.disabled = false;
  }
});

function openBookmarkRename(bookmark) {
  renamingBookmarkId = bookmark.id;
  $('bookmark-name').value = bookmarkTitle(bookmark, storage);
  $('bookmark-name-error').textContent = '';
  $('rename-bookmark-dialog').showModal();
  $('bookmark-name').focus();
  $('bookmark-name').select();
}
$('cancel-bookmark-rename').addEventListener('click', () => { if (!bookmarkSaving) $('rename-bookmark-dialog').close(); });
$('rename-bookmark-dialog').addEventListener('cancel', event => { if (bookmarkSaving) event.preventDefault(); });
$('rename-bookmark-dialog').addEventListener('close', () => {
  document.querySelector(`[data-id="${CSS.escape(renamingBookmarkId || '')}"] .bookmark-link`)?.focus();
  renamingBookmarkId = null;
});
$('rename-bookmark-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (bookmarkSaving || !renamingBookmarkId) return;
  const name = $('bookmark-name').value.trim();
  const error = bookmarkNameError(name);
  if (error) { $('bookmark-name-error').textContent = error; return; }
  bookmarkSaving = true;
  for (const id of ['bookmark-name', 'cancel-bookmark-rename', 'save-bookmark-rename']) $(id).disabled = true;
  try {
    const existing = await chrome.bookmarks.get(renamingBookmarkId);
    if (!existing[0]?.url) throw new Error('此书签已不存在。');
    if (await save({ [`bookmarkName:${renamingBookmarkId}`]: name })) {
      render();
      $('rename-bookmark-dialog').close();
      notify('书签显示名称已更新。');
    } else $('bookmark-name-error').textContent = '名称未保存，请重试。';
  } catch {
    $('bookmark-name-error').textContent = '名称未保存，请确认书签仍存在后重试。';
  } finally {
    bookmarkSaving = false;
    for (const id of ['bookmark-name', 'cancel-bookmark-rename', 'save-bookmark-rename']) $(id).disabled = false;
  }
});

function openBookmarkDelete(bookmark) {
  deletingBookmarkId = bookmark.id;
  $('delete-bookmark-name').textContent = bookmarkTitle(bookmark, storage);
  $('delete-bookmark-url').textContent = bookmark.url;
  $('delete-bookmark-error').textContent = '';
  $('delete-bookmark-dialog').showModal();
}
$('cancel-bookmark-delete').addEventListener('click', () => { if (!bookmarkDeleting) $('delete-bookmark-dialog').close(); });
$('delete-bookmark-dialog').addEventListener('cancel', event => { if (bookmarkDeleting) event.preventDefault(); });
$('delete-bookmark-dialog').addEventListener('close', () => {
  const link = document.querySelector(`[data-id="${CSS.escape(deletingBookmarkId || '')}"] .bookmark-link`);
  (link || $('search')).focus();
  deletingBookmarkId = null;
});
$('confirm-bookmark-delete').addEventListener('click', async () => {
  if (bookmarkDeleting || !deletingBookmarkId) return;
  bookmarkDeleting = true;
  $('confirm-bookmark-delete').disabled = true;
  $('cancel-bookmark-delete').disabled = true;
  $('delete-bookmark-error').textContent = '';
  try {
    const message = await deleteBookmark(deletingBookmarkId);
    await load();
    $('delete-bookmark-dialog').close();
    notify(message);
  } catch (error) {
    console.error(error);
    $('delete-bookmark-error').textContent = '书签未删除，请确认书签仍存在后重试。';
  } finally {
    bookmarkDeleting = false;
    $('confirm-bookmark-delete').disabled = false;
    $('cancel-bookmark-delete').disabled = false;
  }
});

function openCategoryForm(id = null) {
  if (categorySaving) return;
  renamingCategoryId = id;
  $('category-form-title').textContent = id ? '重命名分类' : '新建分类';
  $('category-name').value = categories.find(category => category.id === id)?.name || '';
  $('category-error').textContent = '';
  $('category-form').hidden = false;
  $('category-name').focus();
  $('category-name').select();
}

function closeCategoryForm() {
  $('category-form').hidden = true;
  $('category-error').textContent = '';
  const trigger = renamingCategoryId ? document.querySelector(`[data-view="${CSS.escape(renamingCategoryId)}"]`) : $('add-category');
  renamingCategoryId = null;
  trigger?.focus();
}

function openDeleteCategory(id) {
  if (categorySaving) return;
  const category = categories.find(item => item.id === id);
  if (!category) return;
  deletingCategoryId = id;
  const count = bookmarks.filter(bookmark => categoryOf(bookmark, storage, categories) === id).length;
  $('delete-description').textContent = `删除「${category.name}」后，其中的 ${count} 个书签将移至「待分类」。收藏的网址和 Chrome 原始书签都会保留。`;
  $('delete-error').textContent = '';
  $('delete-category-dialog').showModal();
}

$('delete-category-dialog').addEventListener('cancel', event => { if (categorySaving) event.preventDefault(); });
$('delete-category-dialog').addEventListener('close', () => {
  const id = deletingCategoryId;
  deletingCategoryId = null;
  (document.querySelector(`[data-view="${CSS.escape(id || '')}"]`) || document.querySelector(`[data-view="${CSS.escape(view)}"]`))?.focus();
});
$('confirm-delete-category').addEventListener('click', async () => {
  if (categorySaving || !deletingCategoryId) return;
  const id = deletingCategoryId;
  const wasCurrent = view === id;
  categorySaving = true;
  $('confirm-delete-category').disabled = true;
  $('cancel-delete-category').disabled = true;
  $('delete-error').textContent = '';
  try {
    await navigator.locks.request('bookmark-desktop-categories', async () => {
      const latest = await chrome.storage.local.get(null);
      const category = getCategories(latest).find(item => item.id === id);
      Object.assign(storage, latest);
      if (!category) { $('delete-category-dialog').close(); render(); notify('此分类已被删除。'); return; }
      // 保留分类 ID 的删除标记，使已有归属及后续自动识别都回到待分类，无需逐条改写书签。
      if (await save({ [`categoryDeleted:${id}`]: true })) {
        if (wasCurrent) { view = 'unfiled'; location.hash = 'unfiled'; }
        if (renamingCategoryId === id) closeCategoryForm();
        render();
        $('delete-category-dialog').close();
        notify(`已删除「${category.name}」，其中的书签已移至待分类。`);
      } else $('delete-error').textContent = '删除未保存，分类和书签归属保持不变。请重试。';
    });
  } catch (error) {
    console.error(error);
    $('delete-error').textContent = '无法删除分类，请重试。';
  } finally {
    categorySaving = false;
    $('confirm-delete-category').disabled = false;
    $('cancel-delete-category').disabled = false;
    if ($('delete-category-dialog').open) $('confirm-delete-category').focus();
  }
});

$('add-category').addEventListener('click', () => openCategoryForm());
$('cancel-category').addEventListener('click', () => { if (!categorySaving) closeCategoryForm(); });
$('category-name').addEventListener('keydown', event => {
  if (event.key === 'Escape' && !categorySaving) { event.preventDefault(); closeCategoryForm(); }
});
$('category-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (categorySaving) return;
  const name = $('category-name').value.trim();
  const id = renamingCategoryId;
  const error = categoryNameError(name, categories, id);
  if (error) { $('category-error').textContent = error; return; }
  const submit = $('category-form').querySelector('[type="submit"]');
  categorySaving = true;
  submit.disabled = true;
  $('category-name').disabled = true;
  $('cancel-category').disabled = true;
  try {
    // 多个桌面同时新建或改名时，在同一个锁内检查最新名称，避免覆盖与重名。
    await navigator.locks.request('bookmark-desktop-categories', async () => {
      const latest = await chrome.storage.local.get(null);
      const existing = getCategories(latest);
      if (id && !existing.some(category => category.id === id)) {
        $('category-error').textContent = '此分类已不存在，请取消后重新选择。';
        return;
      }
      const latestError = categoryNameError(name, existing, id);
      if (latestError) { $('category-error').textContent = latestError; return; }
      const values = id ? { [`categoryName:${id}`]: name } : {
        customCategories: [...existing.filter(category => category.id.startsWith('custom-')), { id: `custom-${crypto.randomUUID()}`, name }],
      };
      if (await save(values)) {
        render();
        closeCategoryForm();
        notify(id ? `分类已重命名为「${name}」` : `已新建「${name}」，可将书签移入此分类。`);
      } else $('category-error').textContent = '分类未保存，请重试。';
    });
  } catch (error) {
    console.error(error);
    $('category-error').textContent = '分类未保存，请重试。';
  } finally {
    categorySaving = false;
    submit.disabled = false;
    $('category-name').disabled = false;
    $('cancel-category').disabled = false;
    if (!$('category-form').hidden) $('category-name').focus();
  }
});

if (globalThis.chrome?.bookmarks && globalThis.chrome?.storage) {
  for (const event of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    chrome.bookmarks[event].addListener(() => { clearTimeout(refreshTimer); refreshTimer = setTimeout(load, 120); });
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, value] of Object.entries(changes)) {
      if (value.newValue === undefined) delete storage[key];
      else storage[key] = value.newValue;
    }
    render();
  });
  readHash();
  load();
} else {
  showError('请在 Chrome 扩展程序中加载此插件，再打开新标签页使用。');
  $('retry').hidden = true;
  $('content').setAttribute('aria-busy', 'false');
  $('content').replaceChildren(emptyState('先把Leaf Mark添加到 Chrome', '加载 extension 文件夹后，点击工具栏中的Leaf Mark插件图标使用。'));
}
