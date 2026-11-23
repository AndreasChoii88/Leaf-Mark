chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('newtab.html') }).catch(console.error);
});

const desktopUrl = chrome.runtime.getURL('newtab.html');
function isNewTab(url) {
  return ['chrome://newtab/', 'chrome://newtab', 'chrome://new-tab-page/', 'chrome://new-tab-page'].includes(url);
}

async function redirectNewTab(tab) {
  if (tab.incognito || !isNewTab(tab.pendingUrl || tab.url)) return;
  const { useLeafStart } = await chrome.storage.local.get('useLeafStart');
  if (useLeafStart !== true || !await chrome.permissions.contains({ permissions: ['tabs'] })) return;
  // 再检查一次地址，避免覆盖用户已输入的网址或刚恢复的网页。
  const current = await chrome.tabs.get(tab.id);
  if (isNewTab(current.pendingUrl || current.url)) await chrome.tabs.update(tab.id, { url: desktopUrl });
}

chrome.tabs.onCreated.addListener(tab => redirectNewTab(tab).catch(console.error));
chrome.tabs.onUpdated.addListener((id, change, tab) => {
  if (isNewTab(change.url)) return redirectNewTab({ ...tab, id }).catch(console.error);
});
async function openStartupDesktop() {
  try {
    const { useLeafStart } = await chrome.storage.local.get('useLeafStart');
    if (useLeafStart !== true || !await chrome.permissions.contains({ permissions: ['tabs'] })) return;
    const tabs = await chrome.tabs.query({});
    const blank = tabs.find(tab => !tab.incognito && isNewTab(tab.pendingUrl || tab.url));
    if (blank) await redirectNewTab(blank);
    else if (!tabs.some(tab => (tab.pendingUrl || tab.url) === desktopUrl)) await chrome.tabs.create({ url: desktopUrl });
  } catch (error) { console.error(error); }
}
chrome.runtime.onStartup.addListener(openStartupDesktop);
chrome.permissions.onRemoved.addListener(removed => {
  if (removed.permissions?.includes('tabs')) return chrome.storage.local.set({ useLeafStart: false }).catch(console.error);
});
