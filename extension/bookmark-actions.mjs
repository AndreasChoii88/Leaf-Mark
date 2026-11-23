import { safeUrl } from './core.mjs';

export async function deleteBookmark(id) {
  if (typeof id !== 'string' || !id.trim()) throw new Error('无法识别此书签。');
  const [bookmark] = await chrome.bookmarks.get(id);
  if (!bookmark || typeof bookmark.url !== 'string') throw new Error('只能删除网站书签，不能删除文件夹。');
  await chrome.bookmarks.remove(id);
  try {
    await chrome.storage.local.remove([`category:${id}`, `bookmarkName:${id}`]);
  } catch (error) {
    console.error(error);
    return '书签已删除，但本地记录未能清理。';
  }
  return '书签已删除。';
}

export async function runBookmarkAction(action, rawUrl) {
  if (action === 'copy') {
    await navigator.clipboard.writeText(rawUrl);
    return '链接地址已复制';
  }
  const url = safeUrl(rawUrl);
  if (!url) throw new Error('此类链接不支持直接打开或保存。');
  switch (action) {
    case 'new-tab':
      await chrome.tabs.create({ url, active: false });
      return '';
    case 'new-window':
      await chrome.windows.create({ url });
      return '';
    case 'save-link': {
      if (!/^https?:/.test(url)) throw new Error('仅支持将 HTTP 或 HTTPS 链接另存为。');
      const permission = { permissions: ['downloads'] };
      if (!await chrome.permissions.request(permission)) throw new Error('未授予下载权限，未保存链接。');
      await chrome.downloads.download({ url, saveAs: true });
      return '';
    }
    default:
      throw new Error('无法执行此菜单操作。');
  }
}
