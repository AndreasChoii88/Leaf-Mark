export const CATEGORIES = [
  { id: 'ai', name: 'AI 工具' },
  { id: 'design', name: '设计灵感' },
  { id: 'work', name: '工作效率' },
  { id: 'learn', name: '学习资料' },
  { id: 'social', name: '社交媒体' },
  { id: 'media', name: '影音娱乐' },
];
export const UNFILED = { id: 'unfiled', name: '待分类' };

const DOMAINS = {
  ai: ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'perplexity.ai', 'deepseek.com', 'doubao.com', 'kimi.com', 'kimi.moonshot.cn', 'tongyi.aliyun.com', 'qianwen.com', 'huggingface.co', 'midjourney.com', 'jimeng.jianying.com', 'poe.com'],
  design: ['figma.com', 'canva.com', 'pinterest.com', 'behance.net', 'dribbble.com', 'unsplash.com', 'pexels.com', 'zcool.com.cn', 'iconfont.cn'],
  work: ['notion.so', 'notion.com', 'feishu.cn', 'larksuite.com', 'github.com', 'gitlab.com', 'drive.google.com', 'docs.google.com', 'mail.google.com', 'outlook.com', 'outlook.live.com', 'outlook.office.com', 'trello.com', 'yuque.com', 'docs.qq.com', 'shimo.im', 'slack.com'],
  learn: ['wikipedia.org', 'zhihu.com', 'coursera.org', 'edx.org', 'udemy.com', 'developer.mozilla.org', 'developer.chrome.com', 'stackoverflow.com', 'arxiv.org', 'scholar.google.com', 'icourse163.org'],
  social: ['xiaohongshu.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'weibo.com', 'reddit.com', 'discord.com'],
  media: ['youtube.com', 'youtu.be', 'bilibili.com', 'tiktok.com', 'douyin.com', 'netflix.com', 'spotify.com', 'music.163.com', 'music.qq.com', 'v.qq.com', 'iqiyi.com'],
};
const WORDS = [
  ['ai', /人工智能|大模型|AI工具|AI 工具|机器学习|生成式/i],
  ['design', /设计|灵感|配色|素材|字体|插画/],
  ['work', /办公|协作|邮箱|项目管理|效率|文档/],
  ['learn', /教程|课程|学习|文献|论文|教学/],
  ['social', /社交|社区|微博/],
  ['media', /视频|音乐|电影|影视|娱乐/],
];

export function hostname(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return ''; }
}

export function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return ['https:', 'http:', 'ftp:', 'file:', 'chrome:', 'about:'].includes(parsed.protocol) ? parsed.href : null;
  } catch { return null; }
}

export function flattenBookmarks(tree) {
  const result = [];
  function walk(nodes, folders) {
    for (const node of nodes) {
      if (typeof node.url === 'string') {
        result.push({ id: node.id, title: node.title || hostname(node.url) || node.url, url: node.url, dateAdded: node.dateAdded || 0, folders: folders.join(' / ') });
      } else if (node.children) {
        walk(node.children, node.title ? [...folders, node.title] : folders);
      }
    }
  }
  walk(tree, []);
  return result;
}

export function classify(bookmark) {
  const host = hostname(bookmark.url);
  for (const [category, domains] of Object.entries(DOMAINS)) {
    if (domains.some(domain => host === domain || host.endsWith(`.${domain}`))) return category;
  }
  // shortcut: 只使用本地域名和标题规则，网站覆盖不足时扩充规则或引入用户确认的分类服务。
  return WORDS.find(([, pattern]) => pattern.test(bookmark.title))?.[0] || 'unfiled';
}

export function categoryOf(bookmark, storage, categories) {
  const saved = storage[`category:${bookmark.id}`];
  if ([...categories, UNFILED].some(category => category.id === saved)) return saved;
  if (typeof saved === 'string' && storage[`categoryDeleted:${saved}`] === true) return 'unfiled';
  const automatic = classify(bookmark);
  return categories.some(category => category.id === automatic) ? automatic : 'unfiled';
}

export function getCategories(storage) {
  const extra = Array.isArray(storage.customCategories) ? storage.customCategories : [];
  const valid = extra.filter(item => item && typeof item.id === 'string' && /^custom-[\w-]+$/.test(item.id) && typeof item.name === 'string' && item.name.trim() && item.name.length <= 20);
  const seen = new Set();
  const categories = [...CATEGORIES, ...valid].filter(item => storage[`categoryDeleted:${item.id}`] !== true && !seen.has(item.id) && seen.add(item.id)).map(item => {
    const name = storage[`categoryName:${item.id}`];
    return { ...item, name: typeof name === 'string' && name.trim() && name.trim().length <= 20 ? name.trim() : item.name };
  });
  return orderItems(categories, storage.categoryOrder);
}

export function orderItems(items, savedOrder) {
  const remaining = new Map(items.map(item => [item.id, item]));
  const ordered = [];
  for (const id of Array.isArray(savedOrder) ? savedOrder : []) {
    if (typeof id === 'string' && remaining.has(id)) { ordered.push(remaining.get(id)); remaining.delete(id); }
  }
  return [...ordered, ...remaining.values()];
}

export function moveBefore(items, id, beforeId) {
  if (!items.some(item => item.id === id) || beforeId === id || beforeId !== null && !items.some(item => item.id === beforeId)) return [...items];
  const rest = items.filter(item => item.id !== id);
  const index = beforeId === null ? rest.length : rest.findIndex(item => item.id === beforeId);
  rest.splice(index, 0, items.find(item => item.id === id));
  return rest;
}

export function categoryNameError(name, categories, exceptId = null) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 20) return '请输入 1–20 个字符的分类名称。';
  const normalized = name.trim().toLocaleLowerCase();
  if (['全部书签', '最近收藏', UNFILED.name].includes(normalized) || categories.some(category => category.id !== exceptId && category.name.toLocaleLowerCase() === normalized)) return '已有同名分类，请换个名称。';
  return '';
}

export function bookmarkNameError(name) {
  return typeof name !== 'string' || !name.trim() || name.trim().length > 200 ? '请输入 1–200 个字符的书签名称。' : '';
}

export function bookmarkTitle(bookmark, storage) {
  const name = storage[`bookmarkName:${bookmark.id}`];
  return bookmarkNameError(name) ? bookmark.title : name.trim();
}
