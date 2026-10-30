/**
 * "Anillo de auge": an arc from 12 o'clock, clockwise, as long as the heat index (brand red → orange).
 * Used as the avatar of feed posts and on explore tiles. Returns an SVG string for SVGView.
 */
export function ringSvg(heat: number, dark: boolean, size = 52): string {
  const half = size / 2;
  const r = half - 1;
  const c = 2 * Math.PI * r;
  const track = dark ? '#1c1c1c' : '#f2f2f2';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3b30"/><stop offset="1" stop-color="#ff9500"/></linearGradient></defs>` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${track}" stroke-width="1.5"/>` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="url(#g)" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="${(c * heat) / 100} ${c}" transform="rotate(-90 ${half} ${half})"/></svg>`
  );
}
