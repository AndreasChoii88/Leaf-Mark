// Only an explicit submission navigates; typing never sends a request.
export function webSearchUrl(input) {
  const query = input.trim();
  if (!query || /[\u0000-\u001f\u007f]/.test(query)) return null;
  if (/^https?:\/\//i.test(query)) {
    try { return new URL(query).href; } catch { return null; }
  }
  // A domain followed by a numeric port is an address, not a URL scheme.
  if (/^[a-z][a-z\d+.-]*:/i.test(query) && !/^[^/?#\s]+:\d+(?:[/?#]|$)/.test(query)) return null;
  if (!/\s|@/.test(query)) {
    try {
      const url = new URL(`https://${query}`);
      if (url.hostname.includes('.') || url.hostname === 'localhost' || url.hostname.startsWith('[')) return url.href;
    } catch { /* A non-address is a search term. */ }
  }
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.href;
}
