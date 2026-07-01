import React, { useMemo } from 'react';
import { Role } from '../types/game';

interface AvatarProps {
  seed: number;
  size?: number;
  isAlive?: boolean;
  role?: Role;
  className?: string;
}

const roleColors: Record<Role, string> = {
  werewolf: '#dc2626',
  villager: '#78716c',
  seer: '#8b5cf6',
  witch: '#06b6d4',
  hunter: '#f97316',
  guard: '#22c55e',
};

// Simple deterministic hash from seed
function hash(seed: number, index: number): number {
  let h = seed * 2654435761 + index * 374761393;
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

// Generate avatar colors from seed
function getAvatarColors(seed: number) {
  const hues = [
    '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#22C55E',
    '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF',
    '#EC4899', '#F43F5E', '#14B8A6', '#0EA5E9', '#A855F7',
    '#E11D48', '#7C3AED', '#0891B2', '#65A30D', '#D97706',
  ];
  const bgIndex = (hash(seed, 0) * hues.length) / 4294967296 | 0;
  const fgIndex = (hash(seed, 1) * hues.length) / 4294967296 | 0;
  return { bg: hues[bgIndex], fg: hues[fgIndex === bgIndex ? (bgIndex + 7) % hues.length : fgIndex] };
}

// Generate a simple SVG avatar data URI locally
function generateAvatarSVG(seed: number, size: number): string {
  const colors = getAvatarColors(seed);
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s / 2;

  // Determine face style from seed
  const eyeStyle = hash(seed, 2) % 3;   // 0: round, 1: dot, 2: oval
  const mouthStyle = hash(seed, 3) % 3;  // 0: smile, 1: neutral, 2: open
  const hasHair = hash(seed, 4) % 2 === 0;
  const hairStyle = hash(seed, 5) % 3;

  const eyeY = cy - s * 0.08;
  const eyeSpacing = s * 0.2;
  const eyeSize = s * 0.06;

  let eyes = '';
  if (eyeStyle === 0) {
    eyes = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeSize}" fill="${colors.fg}"/><circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeSize}" fill="${colors.fg}"/>`;
  } else if (eyeStyle === 1) {
    eyes = `<circle cx="${cx - eyeSpacing}" cy="${eyeY}" r="${eyeSize * 0.7}" fill="${colors.fg}"/><circle cx="${cx + eyeSpacing}" cy="${eyeY}" r="${eyeSize * 0.7}" fill="${colors.fg}"/>`;
  } else {
    eyes = `<ellipse cx="${cx - eyeSpacing}" cy="${eyeY}" rx="${eyeSize * 1.4}" ry="${eyeSize * 0.8}" fill="${colors.fg}"/><ellipse cx="${cx + eyeSpacing}" cy="${eyeY}" rx="${eyeSize * 1.4}" ry="${eyeSize * 0.8}" fill="${colors.fg}"/>`;
  }

  const mouthY = cy + s * 0.15;
  let mouth = '';
  if (mouthStyle === 0) {
    mouth = `<path d="M${cx - s * 0.1},${mouthY} Q${cx},${mouthY + s * 0.08} ${cx + s * 0.1},${mouthY}" stroke="${colors.fg}" stroke-width="${s * 0.04}" fill="none" stroke-linecap="round"/>`;
  } else if (mouthStyle === 1) {
    mouth = `<line x1="${cx - s * 0.08}" y1="${mouthY}" x2="${cx + s * 0.08}" y2="${mouthY}" stroke="${colors.fg}" stroke-width="${s * 0.04}" stroke-linecap="round"/>`;
  } else {
    mouth = `<ellipse cx="${cx}" cy="${mouthY}" rx="${s * 0.06}" ry="${s * 0.07}" fill="${colors.fg}"/>`;
  }

  let hair = '';
  if (hasHair) {
    if (hairStyle === 0) {
      hair = `<path d="M${cx - r},${cy - s * 0.05} Q${cx - r},${cy - r * 0.8} ${cx},${cy - r * 0.85} Q${cx + r},${cy - r * 0.8} ${cx + r},${cy - s * 0.05}" fill="${colors.fg}"/>`;
    } else if (hairStyle === 1) {
      hair = `<ellipse cx="${cx}" cy="${cy - r * 0.5}" rx="${r * 0.85}" ry="${r * 0.5}" fill="${colors.fg}"/>`;
    } else {
      hair = `<path d="M${cx - r},${cy - s * 0.1} Q${cx - r * 0.5},${cy - r * 0.95} ${cx},${cy - r * 0.3} Q${cx + r * 0.5},${cy - r * 0.95} ${cx + r},${cy - s * 0.1}" fill="${colors.fg}"/>`;
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}" width="${s}" height="${s}">
    <rect width="${s}" height="${s}" rx="${r}" fill="${colors.bg}"/>
    ${hair}
    ${eyes}
    ${mouth}
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const Avatar: React.FC<AvatarProps> = ({ seed, size = 48, isAlive = true, role, className = '' }) => {
  const innerSize = size - 8;
  const avatarSrc = useMemo(() => generateAvatarSVG(seed, innerSize), [seed, innerSize]);

  return (
    <div
      className={`relative rounded-full flex items-center justify-center flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${role ? roleColors[role] : '#44403c'}33, ${role ? roleColors[role] : '#44403c'}66)`,
        border: `2px solid ${role ? roleColors[role] : '#44403c'}`,
        opacity: isAlive ? 1 : 0.4,
        filter: isAlive ? 'none' : 'grayscale(1)',
      }}
    >
      <img
        src={avatarSrc}
        alt="avatar"
        width={innerSize}
        height={innerSize}
        style={{ borderRadius: '50%' }}
      />
      {!isAlive && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-blood-500 text-lg font-bold">✕</span>
        </div>
      )}
    </div>
  );
};

export default Avatar;
