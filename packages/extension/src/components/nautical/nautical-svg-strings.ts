/**
 * Raw SVG string generators for use in Widget.tsx and content scripts (no React).
 * These produce the same designs as NauticalIcons.tsx but as raw HTML strings.
 */

export function compassRoseSvg(score: number, size = 48): string {
  const rotation = -180 + (score / 100) * 180; // -180 (south) to 0 (north)
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" stroke="currentColor" stroke-width="1.5" opacity="0.3"/>
    <circle cx="50" cy="50" r="38" stroke="currentColor" stroke-width="1" opacity="0.2"/>
    ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const r1 = a % 90 === 0 ? 38 : 42;
      const r2 = 46;
      const rad = (a * Math.PI) / 180;
      return `<line x1="${50 + r1 * Math.sin(rad)}" y1="${50 - r1 * Math.cos(rad)}" x2="${50 + r2 * Math.sin(rad)}" y2="${50 - r2 * Math.cos(rad)}" stroke="currentColor" stroke-width="${a % 90 === 0 ? 2 : 1}" opacity="0.4"/>`;
    }).join('')}
    <text x="50" y="12" text-anchor="middle" fill="currentColor" font-size="8" font-weight="700" font-family="serif">N</text>
    <text x="50" y="95" text-anchor="middle" fill="currentColor" font-size="7" opacity="0.5" font-family="serif">S</text>
    <text x="93" y="53" text-anchor="middle" fill="currentColor" font-size="7" opacity="0.5" font-family="serif">E</text>
    <text x="7" y="53" text-anchor="middle" fill="currentColor" font-size="7" opacity="0.5" font-family="serif">W</text>
    <g transform="rotate(${rotation} 50 50)" style="transition: transform 1s ease-out;">
      <polygon points="50,16 46,50 54,50" fill="#dc2626" opacity="0.9"/>
      <polygon points="50,84 46,50 54,50" fill="currentColor" opacity="0.4"/>
    </g>
    <circle cx="50" cy="50" r="4" fill="currentColor" opacity="0.6"/>
    <circle cx="50" cy="50" r="2" fill="#d4a574"/>
  </svg>`;
}

export function shipIconSvg(drift: number, size = 40): string {
  const rockDeg = drift * 15;
  const animDuration = Math.max(1, 4 - drift * 3);
  return `<svg width="${size}" height="${size}" viewBox="0 0 60 50" fill="none" xmlns="http://www.w3.org/2000/svg"
    style="animation: ship-rock ${animDuration}s ease-in-out infinite; --rock-intensity: ${rockDeg}deg; transform-origin: center bottom;">
    <path d="M30 8 L30 32" stroke="currentColor" stroke-width="2"/>
    <path d="M30 10 L45 20 L30 22Z" fill="currentColor" opacity="0.7"/>
    <path d="M30 12 L20 19 L30 21Z" fill="currentColor" opacity="0.5"/>
    <path d="M10 35 Q15 28, 30 28 Q45 28, 50 35 L48 40 Q40 38, 30 38 Q20 38, 12 40Z" fill="currentColor" opacity="0.8"/>
    <path d="M5 42 Q15 38, 30 39 Q45 38, 55 42" stroke="currentColor" stroke-width="1.5" opacity="0.4" fill="none"/>
    <path d="M0 46 Q10 42, 20 44 Q30 46, 40 44 Q50 42, 60 46" stroke="currentColor" stroke-width="1" opacity="0.3" fill="none"/>
  </svg>`;
}

export function anchorSvg(size = 20): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="5" r="3"/>
    <line x1="12" y1="8" x2="12" y2="21"/>
    <path d="M5 12H2a10 10 0 0 0 20 0h-3"/>
    <line x1="8" y1="8" x2="16" y2="8"/>
  </svg>`;
}

export function lighthouseSvg(size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 30" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 28 L10 10 L14 10 L16 28Z" fill="currentColor" opacity="0.7"/>
    <rect x="9" y="6" width="6" height="4" rx="1" fill="currentColor" opacity="0.9"/>
    <circle cx="12" cy="4" r="2.5" fill="#d4a574" opacity="0.8"/>
    <line x1="12" y1="1" x2="12" y2="0" stroke="#d4a574" stroke-width="1" opacity="0.6"/>
    <line x1="15" y1="3" x2="17" y2="2" stroke="#d4a574" stroke-width="1" opacity="0.4"/>
    <line x1="15" y1="5" x2="17" y2="6" stroke="#d4a574" stroke-width="1" opacity="0.4"/>
    <line x1="9" y1="3" x2="7" y2="2" stroke="#d4a574" stroke-width="1" opacity="0.4"/>
    <line x1="9" y1="5" x2="7" y2="6" stroke="#d4a574" stroke-width="1" opacity="0.4"/>
    <line x1="9" y1="15" x2="15" y2="15" stroke="currentColor" stroke-width="0.5" opacity="0.4"/>
    <line x1="8.5" y1="20" x2="15.5" y2="20" stroke="currentColor" stroke-width="0.5" opacity="0.4"/>
    <line x1="6" y1="28" x2="18" y2="28" stroke="currentColor" stroke-width="2"/>
  </svg>`;
}

export function waveSvg(width = 200): string {
  return `<svg width="${width}" height="12" viewBox="0 0 200 12" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <path d="M0 6 Q25 0, 50 6 Q75 12, 100 6 Q125 0, 150 6 Q175 12, 200 6" stroke="currentColor" stroke-width="1.5" fill="none" opacity="0.3"/>
    <path d="M0 8 Q25 3, 50 8 Q75 13, 100 8 Q125 3, 150 8 Q175 13, 200 8" stroke="currentColor" stroke-width="1" fill="none" opacity="0.15"/>
  </svg>`;
}

export function shipsWheelSvg(size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="12" cy="12" r="9"/>
    <circle cx="12" cy="12" r="3"/>
    ${[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
      const rad = (a * Math.PI) / 180;
      return `<line x1="${12 + 3 * Math.cos(rad)}" y1="${12 + 3 * Math.sin(rad)}" x2="${12 + 9 * Math.cos(rad)}" y2="${12 + 9 * Math.sin(rad)}"/>`;
    }).join('')}
    ${[0, 90, 180, 270].map(a => {
      const rad = (a * Math.PI) / 180;
      return `<circle cx="${12 + 10.5 * Math.cos(rad)}" cy="${12 + 10.5 * Math.sin(rad)}" r="1.5" fill="currentColor"/>`;
    }).join('')}
  </svg>`;
}

export function ropeBorderSvg(): string {
  return `<svg width="100%" height="4" viewBox="0 0 400 4" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 2 Q5 0, 10 2 Q15 4, 20 2 Q25 0, 30 2 Q35 4, 40 2 Q45 0, 50 2 Q55 4, 60 2 Q65 0, 70 2 Q75 4, 80 2 Q85 0, 90 2 Q95 4, 100 2 Q105 0, 110 2 Q115 4, 120 2 Q125 0, 130 2 Q135 4, 140 2 Q145 0, 150 2 Q155 4, 160 2 Q165 0, 170 2 Q175 4, 180 2 Q185 0, 190 2 Q195 4, 200 2 Q205 0, 210 2 Q215 4, 220 2 Q225 0, 230 2 Q235 4, 240 2 Q245 0, 250 2 Q255 4, 260 2 Q265 0, 270 2 Q275 4, 280 2 Q285 0, 290 2 Q295 4, 300 2 Q305 0, 310 2 Q315 4, 320 2 Q325 0, 330 2 Q335 4, 340 2 Q345 0, 350 2 Q355 4, 360 2 Q365 0, 370 2 Q375 4, 380 2 Q385 0, 390 2 Q395 4, 400 2" stroke="#d4a574" stroke-width="1.5" fill="none" opacity="0.5"/>
    <path d="M0 2 Q5 4, 10 2 Q15 0, 20 2 Q25 4, 30 2 Q35 0, 40 2 Q45 4, 50 2 Q55 0, 60 2 Q65 4, 70 2 Q75 0, 80 2 Q85 4, 90 2 Q95 0, 100 2 Q105 4, 110 2 Q115 0, 120 2 Q125 4, 130 2 Q135 0, 140 2 Q145 4, 150 2 Q155 0, 160 2 Q165 4, 170 2 Q175 0, 180 2 Q185 4, 190 2 Q195 0, 200 2 Q205 4, 210 2 Q215 0, 220 2 Q225 4, 230 2 Q235 0, 240 2 Q245 4, 250 2 Q255 0, 260 2 Q265 4, 270 2 Q275 0, 280 2 Q285 4, 290 2 Q295 0, 300 2 Q305 4, 310 2 Q315 0, 320 2 Q325 4, 330 2 Q335 0, 340 2 Q345 4, 350 2 Q355 0, 360 2 Q365 4, 370 2 Q375 0, 380 2 Q385 4, 390 2 Q395 0, 400 2" stroke="#b8956a" stroke-width="1" fill="none" opacity="0.3"/>
  </svg>`;
}
