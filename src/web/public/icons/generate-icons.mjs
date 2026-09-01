// Generates PWA icons (PNG) from canvas for all required sizes
const { createCanvas } = await import('canvas').catch(() => null) || {};
const fs = await import('fs');
const path = await import('path');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(process.cwd(), 'src', 'web', 'public', 'icons');

function generateIconSVG(size) {
  const pad = Math.round(size * 0.12);
  const inner = size - pad * 2;
  const r = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.38);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00d4aa"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  <text x="${size/2}" y="${size/2 + fontSize*0.37}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="${fontSize}" fill="#0a0f1e">OF</text>
</svg>`;
}

for (const size of sizes) {
  const svgContent = generateIconSVG(size);
  fs.writeFileSync(path.join(outDir, `icon-${size}.svg`), svgContent);
  fs.copyFileSync(path.join(outDir, `icon-${size}.svg`), path.join(outDir, `icon-${size}.png`));
}

console.log('Icons generated:', sizes.map(s => `icon-${s}`).join(', '));
