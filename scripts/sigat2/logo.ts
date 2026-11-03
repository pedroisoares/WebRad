/**
 * The SIGAT logo: a six-pointed outlined star, blue to green, as on the legacy
 * SIGAT login page. Redrawn as SVG so it scales without a bitmap.
 */
const R = 51; // tip radius
const r = 33; // inner corner radius

function star(): string {
  const points: string[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI / 6) * i;
    const radius = i % 2 === 0 ? R : r;
    points.push(
      `${(70 + radius * Math.cos(angle)).toFixed(2)},${(70 + radius * Math.sin(angle)).toFixed(2)}`,
    );
  }
  return points.join(' ');
}

export const SIGAT_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 6 132 128" role="img" aria-label="SIGAT">
  <defs>
    <linearGradient id="sigat-logo-cor" x1="0.15" y1="0.9" x2="0.95" y2="0.15">
      <stop offset="0" stop-color="#1c1ce6"/>
      <stop offset="0.5" stop-color="#2233ee"/>
      <stop offset="0.72" stop-color="#2a7fd8"/>
      <stop offset="1" stop-color="#4fe03a"/>
    </linearGradient>
  </defs>
  <polygon points="${star()}" fill="none" stroke="#1a1d4a" stroke-opacity="0.7" stroke-width="18" stroke-linejoin="round"/>
  <polygon points="${star()}" fill="none" stroke="url(#sigat-logo-cor)" stroke-width="15" stroke-linejoin="round"/>
</svg>
`;
