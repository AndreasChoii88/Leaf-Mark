export function isWhiteIcon(pixels) {
  let visible = false, transparent = false;
  for (let i = 0; i < pixels.length; i += 4) {
    const [r, g, b, alpha] = pixels.subarray(i, i + 4);
    if (alpha < 24) { transparent = true; continue; }
    visible = true;
    if (Math.min(r, g, b) < 200 || Math.max(r, g, b) - Math.min(r, g, b) > 24) return false;
  }
  return visible && transparent;
}

export function adaptFavicon(image) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 32, 32);
    image.classList.toggle('is-white-icon', isWhiteIcon(context.getImageData(0, 0, 32, 32).data));
  } catch {
    // Keep the original icon if Chrome prevents reading its pixels.
    image.classList.remove('is-white-icon');
  }
}
