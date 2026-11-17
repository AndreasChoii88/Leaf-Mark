import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, flattenBookmarks, hostname, safeUrl, classify, categoryOf, getCategories, categoryNameError, bookmarkTitle, bookmarkNameError, orderItems, moveBefore } from '../extension/core.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { runBookmarkAction, deleteBookmark } from '../extension/bookmark-actions.mjs';
import { webSearchUrl } from '../extension/search.mjs';
import { runInNewContext } from 'node:vm';
import { isWhiteIcon } from '../extension/favicon.mjs';

test('白色透明 Logo 变黑的检测保留彩色、黑白混合、深色及不透明背景图标', () => {
  const pixels = (...values) => new Uint8ClampedArray(values.flat());
  assert.equal(isWhiteIcon(pixels([255,255,255,255],[230,235,240,128],[0,0,0,0])), true);
  assert.equal(isWhiteIcon(pixels([255,255,255,255],[255,0,0,255],[0,0,0,0])), false);
  assert.equal(isWhiteIcon(pixels([255,255,255,255],[0,0,0,255],[0,0,0,0])), false);
  assert.equal(isWhiteIcon(pixels([50,50,50,255],[0,0,0,0])), false);
  assert.equal(isWhiteIcon(pixels([255,255,255,255])), false);
  assert.equal(isWhiteIcon(pixels([0,0,0,0],[255,255,255,0])), false);
});

test('本地排序兼容新项目、删除项目、重复和损坏记录，不修改输入', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(orderItems(items, ['c', 'missing', 'c', 3, 'a']).map(item => item.id), ['c', 'a', 'b']);
  for (const invalid of [null, {}, 'a']) assert.deepEqual(orderItems(items, invalid), items);
  assert.deepEqual(moveBefore(items, 'c', 'a').map(item => item.id), ['c', 'a', 'b']);
  assert.deepEqual(moveBefore(items, 'a', null).map(item => item.id), ['b', 'c', 'a']);
  for (const [id, before] of [['a', 'a'], ['missing', null], ['a', 'missing']]) assert.deepEqual(moveBefore(items, id, before), items);
  assert.deepEqual(items.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(orderItems(items, ['c'])[0], items[2]);
  const saved = { categoryOrder: ['work', 'missing', 'ai', 'work'], 'categoryDeleted:design': true, customCategories: [{ id: 'custom-new', name: '新分类' }] };
  const ids = getCategories(saved).map(item => item.id);
  assert.deepEqual(ids.slice(0, 2), ['work', 'ai']);
  assert.equal(ids.at(-1), 'custom-new');
  assert.ok(!ids.includes('design'));
});

test('网址直达支持域名、路径、端口、中文域名和完整 HTTPS 地址', () => {
  for (const [input, expected] of [
    [' youtube.com ', 'https://youtube.com/'],
    ['github.com/openai?tab=readme#top', 'https://github.com/openai?tab=readme#top'],
    ['example.com:8443/path', 'https://example.com:8443/path'],
    ['localhost:3000', 'https://localhost:3000/'],
    ['https://example.com/a b', 'https://example.com/a%20b'],
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080/'],
    ['[::1]:8080/path', 'https://[::1]:8080/path'],
    ['例子.测试', 'https://xn--fsqu00a.xn--0zwm56d/'],
  ]) assert.equal(webSearchUrl(input), expected);
});

test('搜索词完整编码，空内容和非 HTTP 协议不会触发导航', () => {
  for (const input of ['视频剪辑教程', '小红书', 'a & b + c/#?', 'hello@example.com']) {
    const url = new URL(webSearchUrl(input));
    assert.equal(url.origin + url.pathname, 'https://www.google.com/search');
    assert.equal(url.searchParams.get('q'), input);
    assert.equal([...url.searchParams].length, 1);
  }
  for (const input of ['', '   ', 'javascript:alert(1)', 'data:text/html,hello', 'file:///C:/test', 'chrome://settings', 'ftp://example.com', 'https://', 'https://bad host/', 'a\nb']) assert.equal(webSearchUrl(input), null, input);
});

test('读取所有层级书签、重复网址和未命名书签，保留原文件夹', () => {
  const tree = [{ id: '0', children: [{ id: '1', title: '收藏', children: [
    { id: '2', title: '', url: 'https://example.com', dateAdded: 10 },
    { id: '3', title: '深层', children: [{ id: '4', title: '另一个', url: 'https://example.com' }] },
  ] }] }];
  const before = JSON.stringify(tree);
  const items = flattenBookmarks(tree);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'example.com');
  assert.equal(items[1].folders, '收藏 / 深层');
  assert.equal(JSON.stringify(tree), before);
  assert.deepEqual(flattenBookmarks([]), []);
});

test('按域名识别与未知网站回退，不让伪造域名匹配', () => {
  assert.equal(classify({ url: 'https://chatgpt.com/a', title: '收藏' }), 'ai');
  assert.equal(classify({ url: 'https://www.github.com/a', title: '收藏' }), 'work');
  assert.equal(classify({ url: 'https://chatgpt.com.evil.test', title: '收藏' }), 'unfiled');
  assert.equal(classify({ url: 'https://notchatgpt.com', title: '收藏' }), 'unfiled');
  assert.equal(classify({ url: 'https://unknown.test', title: '设计素材库' }), 'design');
  assert.equal(classify({ url: 'invalid', title: '收藏' }), 'unfiled');
});

test('手动分类优先，支持待分类与自定义分类，无效分类回退', () => {
  const bookmark = { id: 'a', title: 'ChatGPT', url: 'https://chatgpt.com' };
  assert.equal(categoryOf(bookmark, { 'category:a': 'work' }, CATEGORIES), 'work');
  assert.equal(categoryOf(bookmark, { 'category:a': 'unfiled' }, CATEGORIES), 'unfiled');
  assert.equal(categoryOf(bookmark, { 'category:a': 'removed' }, CATEGORIES), 'ai');
  assert.equal(categoryOf(bookmark, { 'category:a': 'custom-abc' }, [...CATEGORIES, { id: 'custom-abc', name: '项目' }]), 'custom-abc');
});

test('不执行书签脚本或 data 地址，允许正常网站和浏览器页面', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:test', 'bad url', 'chrome-extension://id/page']) assert.equal(safeUrl(url), null);
  for (const url of ['https://example.com', 'http://localhost:3000', 'chrome://bookmarks', 'file:///C:/a.html', 'about:blank']) assert.ok(safeUrl(url));
  assert.equal(hostname('not a url'), '');
});

test('验证存储分类结构，丢弃无效记录与重复 id', () => {
  assert.equal(getCategories({ customCategories: 'bad' }).length, 6);
  assert.equal(getCategories({ customCategories: [null, { id: 'ai', name: '伪造' }, { id: 'custom-a', name: '项目' }, { id: 'custom-a', name: '重复' }, { id: 'custom-b', name: '' }] }).length, 7);
});

test('默认和自定义分类改名保留 ID 与书签归属，兼容旧分类数据', () => {
  const stored = { customCategories: [{ id: 'custom-a', name: '旧名' }], 'categoryName:ai': '智能助手', 'categoryName:custom-a': '个人项目', 'category:42': 'custom-a' };
  const before = JSON.stringify(stored);
  const categories = getCategories(stored);
  assert.equal(categories.find(item => item.id === 'ai').name, '智能助手');
  assert.equal(categories.find(item => item.id === 'custom-a').name, '个人项目');
  assert.equal(categoryOf({ id: '42', url: 'https://chatgpt.com', title: 'ChatGPT' }, stored, categories), 'custom-a');
  assert.equal(classify({ url: 'https://chatgpt.com', title: 'ChatGPT' }), 'ai');
  assert.equal(JSON.stringify(stored), before);
  assert.equal(getCategories({ customCategories: stored.customCategories })[6].name, '旧名');
});

test('改名验证空白、长度、重名和保留名称，原名可直接保存', () => {
  const categories = getCategories({ 'categoryName:ai': 'AI 助手' });
  for (const value of ['', '   ', '字'.repeat(21), null]) assert.ok(categoryNameError(value, categories));
  for (const value of ['ai 助手', ' AI 助手 ', '全部书签', '最近收藏', '待分类']) assert.ok(categoryNameError(value, categories));
  assert.equal(categoryNameError('AI 助手', categories, 'ai'), '');
  assert.equal(categoryNameError(' 项目收藏 ', categories, 'ai'), '');
  assert.equal(categoryNameError('字'.repeat(20), categories), '');
  for (const value of [null, 12, '', ' ', '字'.repeat(21)]) assert.equal(getCategories({ 'categoryName:ai': value })[0].name, 'AI 工具');
});

test('删除默认分类后自动及手动成员都转入待分类，其他分类保持不变', () => {
  const stored = { 'categoryDeleted:ai': true, 'category:a': 'ai', 'category:b': 'work' };
  const categories = getCategories(stored);
  assert.equal(categories.some(item => item.id === 'ai'), false);
  const bookmark = { id: 'a', title: '任意网站', url: 'https://unknown.test' };
  assert.equal(categoryOf(bookmark, stored, categories), 'unfiled');
  assert.equal(categoryOf({ ...bookmark, id: 'new', url: 'https://chatgpt.com' }, stored, categories), 'unfiled');
  assert.equal(categoryOf({ ...bookmark, id: 'b', url: 'https://chatgpt.com' }, stored, categories), 'work');
  assert.equal(categoryNameError('AI 工具', categories), '', '删除后可使用同名新建分类');
  assert.equal(getCategories({ 'categoryDeleted:ai': 'true' }).length, 6, '只接受明确布尔删除标记');
});

test('删除自定义分类保留书签数据，不会回落到其他自动分类', () => {
  const stored = { customCategories: [{ id: 'custom-a', name: '项目' }], 'categoryDeleted:custom-a': true, 'category:42': 'custom-a' };
  const bookmark = { id: '42', title: 'GitHub', url: 'https://github.com' };
  const before = JSON.stringify({ stored, bookmark });
  const categories = getCategories(stored);
  assert.equal(categories.length, 6);
  assert.equal(categoryOf(bookmark, stored, categories), 'unfiled');
  assert.equal(JSON.stringify({ stored, bookmark }), before);
  assert.equal(getCategories(JSON.parse(JSON.stringify(stored))).some(item => item.id === 'custom-a'), false);
});

test('插件配置使用 MV3、最小权限且资源完整', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url)));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['bookmarks', 'storage', 'favicon']);
  assert.deepEqual(manifest.optional_permissions, ['downloads', 'tabs']);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.chrome_url_overrides, undefined, '不能接管新标签页');
  assert.equal(manifest.chrome_settings_overrides, undefined, '不能改变浏览器设置');
  for (const path of ['newtab.html', manifest.background.service_worker, 'bookmark-actions.mjs', 'motion.mjs', 'favicon.mjs', 'search.mjs', 'assets/fonts/Manrope.ttf', 'assets/fonts/OFL.txt', 'assets/brand.png', 'assets/wordmark.png', 'assets/toolbar.png', ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]) assert.ok(existsSync(new URL(`../extension/${path}`, import.meta.url)), path);
  assert.equal(existsSync(new URL('../extension/assets/background.jpg', import.meta.url)), false, '旧动漫壁纸已移除');
  for (const [size, path] of Object.entries(manifest.icons)) {
    const png = readFileSync(new URL(`../extension/${path}`, import.meta.url));
    assert.equal(png.readUInt32BE(16), Number(size));
    assert.equal(png.readUInt32BE(20), Number(size));
  }
});

function backgroundHarness(enabled = false, granted = false, initialTabs = []) {
  const opened = [];
  const updated = [];
  const handlers = {};
  const storage = { useLeafStart: enabled };
  const tabs = new Map(initialTabs.map(tab => [tab.id, tab]));
  runInNewContext(readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8'), {
    chrome: {
      action: { onClicked: { addListener: callback => { handlers.click = callback; } } },
      runtime: { getURL: path => `chrome-extension://test/${path}`, onStartup: { addListener: callback => { handlers.startup = callback; } } },
      storage: { local: { get: async () => storage, set: async values => { Object.assign(storage, values); } } },
      permissions: { contains: async () => granted, onRemoved: { addListener: callback => { handlers.removed = callback; } } },
      tabs: {
        create: async options => { opened.push(options.url); },
        get: async id => tabs.get(id),
        update: async (id, options) => { updated.push([id, options.url]); },
        query: async () => [...tabs.values()],
        onCreated: { addListener: callback => { handlers.created = callback; } },
        onUpdated: { addListener: callback => { handlers.updated = callback; } },
      },
    },
    console,
  });
  return { opened, updated, handlers, storage, tabs };
}

test('默认关闭启动页和新标签页跳转，工具栏入口正常', async () => {
  const { opened, updated, handlers } = backgroundHarness();
  await handlers.startup();
  await handlers.created({ id: 1, url: 'chrome://newtab/' });
  assert.equal(opened.length, 0);
  assert.equal(updated.length, 0);
  handlers.click();
  assert.deepEqual(opened, ['chrome-extension://test/newtab.html']);
});

test('显式开启且授权后仅跳转新标签页，保留网址、隐身页和用户正在输入的地址', async () => {
  const h = backgroundHarness(true, true, [{ id: 1, url: 'chrome://newtab/' }, { id: 2, url: 'https://example.com' }]);
  await h.handlers.created({ id: 1, url: 'chrome://newtab/' });
  await h.handlers.created({ id: 2, url: 'https://example.com' });
  await h.handlers.created({ id: 1, url: 'chrome://newtab/', incognito: true });
  h.tabs.set(1, { id: 1, url: 'https://user-typed.example' });
  await h.handlers.created({ id: 1, url: 'chrome://newtab/' });
  assert.deepEqual(h.updated, [[1, 'chrome-extension://test/newtab.html']]);
  const denied = backgroundHarness(true, false, [{ id: 1, url: 'chrome://newtab/' }]);
  await denied.handlers.created({ id: 1, url: 'chrome://newtab/' });
  await denied.handlers.startup();
  assert.equal(denied.updated.length + denied.opened.length, 0);
});

test('启动时复用空白页或打开一次桌面，不覆盖恢复的网页；撤销授权关闭功能', async () => {
  const h = backgroundHarness(true, true, [{ id: 1, url: 'chrome://newtab/' }]);
  await h.handlers.startup();
  assert.deepEqual(h.updated, [[1, 'chrome-extension://test/newtab.html']]);
  h.tabs.set(1, { id: 1, url: 'https://restored.example' });
  await h.handlers.startup();
  assert.deepEqual(h.opened, ['chrome-extension://test/newtab.html']);
  h.tabs.set(2, { id: 2, url: 'chrome-extension://test/newtab.html' });
  await h.handlers.startup();
  assert.equal(h.opened.length, 1);
  h.tabs.set(2, { id: 2, pendingUrl: 'chrome-extension://test/newtab.html' });
  await h.handlers.startup();
  assert.equal(h.opened.length, 1, '正在加载的桌面也不能重复打开');
  await h.handlers.removed({ permissions: ['tabs'] });
  assert.equal(h.storage.useLeafStart, false);
  await h.handlers.startup();
  assert.equal(h.opened.length, 1);
});

test('书签显示名验证与持久化回退，不修改原书签或自动分类', () => {
  const bookmark = { id: '42', title: '办公文档工具', url: 'https://unknown.example', dateAdded: 12 };
  const before = JSON.stringify(bookmark);
  assert.equal(bookmarkNameError('   '), '请输入 1–200 个字符的书签名称。');
  assert.ok(bookmarkNameError('a'.repeat(201)));
  assert.equal(bookmarkNameError(' Google Flow '), '');
  assert.equal(bookmarkTitle(bookmark, {}), bookmark.title);
  assert.equal(bookmarkTitle(bookmark, { 'bookmarkName:42': 123 }), bookmark.title);
  assert.equal(bookmarkTitle(bookmark, { 'bookmarkName:42': 'a'.repeat(201) }), bookmark.title);
  const storage = { 'bookmarkName:42': ' AI Tools ' };
  assert.equal(bookmarkTitle(bookmark, JSON.parse(JSON.stringify(storage))), 'AI Tools');
  assert.equal(categoryOf(bookmark, storage, CATEGORIES), 'work');
  assert.equal(bookmarkTitle(bookmark, { 'bookmarkName:42': '<img onerror=alert(1)>' }), '<img onerror=alert(1)>');
  assert.equal(JSON.stringify(bookmark), before);
});

test('删除仅作用于选中的网站书签，并在删除成功后清理该书签记录', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const removed = [];
  const cleaned = [];
  let fail = false;
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    bookmarks: {
      get: async id => id === 'folder' ? [{ id, title: '文件夹' }] : [{ id, title: '网站', url: 'https://example.com' }],
      remove: async id => { if (fail) throw new Error('remove failed'); removed.push(id); },
    },
    storage: { local: { remove: async keys => cleaned.push(...keys) } },
  } });
  try {
    await assert.rejects(deleteBookmark('folder'), /不能删除文件夹/);
    await assert.rejects(deleteBookmark(''), /无法识别/);
    assert.deepEqual(removed, []);
    assert.equal(await deleteBookmark('42'), '书签已删除。');
    assert.deepEqual(removed, ['42']);
    assert.deepEqual(cleaned, ['category:42', 'bookmarkName:42']);
    fail = true;
    await assert.rejects(deleteBookmark('43'), /remove failed/);
    assert.deepEqual(cleaned, ['category:42', 'bookmarkName:42'], '删除失败不能先清理本地数据');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'chrome', descriptor); else delete globalThis.chrome;
  }
});

test('右键菜单打开、复制和另存为使用正确接口，拒绝危险地址与未授权下载', async () => {
  const oldChrome = Object.getOwnPropertyDescriptor(globalThis, 'chrome');
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const calls = [];
  let granted = false;
  let allowRequest = true;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async text => calls.push(['copy', text]) } } });
  Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
    tabs: { create: async options => calls.push(['tab', options]) },
    windows: { create: async options => calls.push(['window', options]) },
    permissions: { request: async options => { calls.push(['permission', options]); return granted || allowRequest; } },
    downloads: { download: async options => calls.push(['download', options]) },
  } });
  try {
    await runBookmarkAction('new-tab', 'https://example.com');
    await runBookmarkAction('new-window', 'https://example.com');
    await runBookmarkAction('copy', 'javascript:alert(1)');
    await runBookmarkAction('save-link', 'https://example.com');
    assert.deepEqual(calls, [
      ['tab', { url: 'https://example.com/', active: false }],
      ['window', { url: 'https://example.com/' }],
      ['copy', 'javascript:alert(1)'],
      ['permission', { permissions: ['downloads'] }],
      ['download', { url: 'https://example.com/', saveAs: true }],
    ]);
    calls.length = 0;
    allowRequest = false;
    await assert.rejects(runBookmarkAction('save-link', 'https://example.com'), /未授予下载权限/);
    assert.equal(calls.some(([action]) => action === 'download'), false);
    granted = true;
    calls.length = 0;
    await runBookmarkAction('save-link', 'https://example.com');
    assert.deepEqual(calls.map(([action]) => action), ['permission', 'download']);
    for (const action of ['new-tab', 'new-window', 'save-link']) await assert.rejects(runBookmarkAction(action, 'javascript:alert(1)'), /不支持/);
    await assert.rejects(runBookmarkAction('save-link', 'file:///C:/a'), /HTTP/);
    await assert.rejects(runBookmarkAction('unknown', 'https://example.com'), /无法执行/);
    chrome.downloads.download = async () => { throw new Error('download failed'); };
    await assert.rejects(runBookmarkAction('save-link', 'https://example.com'), /download failed/);
    navigator.clipboard.writeText = async () => { throw new Error('clipboard failed'); };
    await assert.rejects(runBookmarkAction('copy', 'https://example.com'), /clipboard failed/);
  } finally {
    if (oldChrome) Object.defineProperty(globalThis, 'chrome', oldChrome); else delete globalThis.chrome;
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator); else delete globalThis.navigator;
  }
});
