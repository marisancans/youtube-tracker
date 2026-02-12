import * as React from 'react';

/* ------------------------------------------------------------------ */
/*  CompassRose — focus score indicator with animated needle           */
/* ------------------------------------------------------------------ */
interface CompassRoseProps {
  score: number; // 0-100  (0 = South/bad, 100 = North/good)
  size?: number;
  className?: string;
}

export const CompassRose: React.FC<CompassRoseProps> = ({
  score,
  size = 120,
  className,
}) => {
  // Map score 0-100 to rotation: 0 => 180deg (South), 100 => 0deg (North)
  const rotation = 180 - (score / 100) * 180;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ '--needle-rotation': `${rotation}deg` } as React.CSSProperties}
    >
      {/* Outer ring */}
      <circle cx="60" cy="60" r="56" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <circle cx="60" cy="60" r="52" stroke="currentColor" strokeWidth="1" opacity="0.2" />

      {/* Degree marks */}
      {Array.from({ length: 36 }).map((_, i) => {
        const angle = (i * 10 * Math.PI) / 180;
        const isMajor = i % 9 === 0;
        const r1 = isMajor ? 44 : 48;
        const r2 = 52;
        return (
          <line
            key={i}
            x1={60 + r1 * Math.sin(angle)}
            y1={60 - r1 * Math.cos(angle)}
            x2={60 + r2 * Math.sin(angle)}
            y2={60 - r2 * Math.cos(angle)}
            stroke="currentColor"
            strokeWidth={isMajor ? 2 : 0.75}
            opacity={isMajor ? 0.7 : 0.3}
          />
        );
      })}

      {/* Cardinal directions */}
      <text x="60" y="18" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" fontFamily="serif">N</text>
      <text x="60" y="108" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" fontFamily="serif">S</text>
      <text x="105" y="64" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" fontFamily="serif">E</text>
      <text x="15" y="64" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700" fontFamily="serif">W</text>

      {/* Inner decorative ring */}
      <circle cx="60" cy="60" r="36" stroke="currentColor" strokeWidth="0.75" opacity="0.2" />

      {/* Compass rose star points */}
      <polygon
        points="60,28 64,52 60,56 56,52"
        fill="currentColor"
        opacity="0.15"
      />
      <polygon
        points="60,92 64,68 60,64 56,68"
        fill="currentColor"
        opacity="0.15"
      />
      <polygon
        points="28,60 52,56 56,60 52,64"
        fill="currentColor"
        opacity="0.15"
      />
      <polygon
        points="92,60 68,64 64,60 68,56"
        fill="currentColor"
        opacity="0.15"
      />

      {/* Needle group — animated */}
      <g
        style={{
          transformOrigin: '60px 60px',
          animation: 'compass-needle 4s ease-in-out infinite',
        }}
      >
        {/* North half (red) */}
        <polygon points="60,24 56,58 60,62 64,58" fill="#991b1b" opacity="0.9" />
        {/* South half */}
        <polygon points="60,96 64,62 60,58 56,62" fill="currentColor" opacity="0.5" />
      </g>

      {/* Center pin */}
      <circle cx="60" cy="60" r="4" fill="currentColor" opacity="0.6" />
      <circle cx="60" cy="60" r="2" fill="currentColor" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  ShipIcon — drift indicator with rocking animation                  */
/* ------------------------------------------------------------------ */
interface ShipIconProps {
  drift: number; // 0-1
  size?: number;
  className?: string;
}

export const ShipIcon: React.FC<ShipIconProps> = ({
  drift,
  size = 48,
  className,
}) => {
  const rockIntensity = Math.round(drift * 15); // 0-15 degrees

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{
        '--rock-intensity': `${rockIntensity}deg`,
        animation: drift > 0 ? 'ship-rock 3s ease-in-out infinite' : 'none',
      } as React.CSSProperties}
    >
      {/* Hull */}
      <path
        d="M8 34 C8 34 10 40 24 40 C38 40 40 34 40 34 L36 28 H12 L8 34Z"
        fill="currentColor"
        opacity="0.8"
      />
      {/* Deck line */}
      <line x1="12" y1="28" x2="36" y2="28" stroke="currentColor" strokeWidth="1.5" />
      {/* Mast */}
      <line x1="24" y1="8" x2="24" y2="28" stroke="currentColor" strokeWidth="2" />
      {/* Main sail */}
      <path
        d="M24 10 C24 10 36 16 34 26 L24 26 Z"
        fill="currentColor"
        opacity="0.3"
      />
      {/* Jib sail */}
      <path
        d="M24 10 C24 10 14 15 16 26 L24 26 Z"
        fill="currentColor"
        opacity="0.2"
      />
      {/* Flag */}
      <path d="M24 8 L24 6 L30 7 L24 8Z" fill="currentColor" opacity="0.6" />
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  AnchorIcon                                                         */
/* ------------------------------------------------------------------ */
interface AnchorIconProps {
  size?: number;
  className?: string;
}

export const AnchorIcon: React.FC<AnchorIconProps> = ({
  size = 24,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="8" x2="12" y2="21" />
    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  WaveDecoration — horizontal wave pattern for dividers              */
/* ------------------------------------------------------------------ */
interface WaveDecorationProps {
  className?: string;
  width?: number;
}

export const WaveDecoration: React.FC<WaveDecorationProps> = ({
  className,
  width = 200,
}) => (
  <svg
    width={width}
    height="12"
    viewBox={`0 0 ${width} 12`}
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    preserveAspectRatio="none"
  >
    <path
      d={`M0 6 ${Array.from({ length: Math.ceil(width / 20) })
        .map((_, i) => `Q${i * 20 + 5} 1, ${i * 20 + 10} 6 Q${i * 20 + 15} 11, ${i * 20 + 20} 6`)
        .join(' ')}`}
      stroke="currentColor"
      strokeWidth="1.5"
      opacity="0.4"
    />
    <path
      d={`M0 8 ${Array.from({ length: Math.ceil(width / 20) })
        .map((_, i) => `Q${i * 20 + 5} 3, ${i * 20 + 10} 8 Q${i * 20 + 15} 13, ${i * 20 + 20} 8`)
        .join(' ')}`}
      stroke="currentColor"
      strokeWidth="1"
      opacity="0.2"
    />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  ShipsWheel                                                         */
/* ------------------------------------------------------------------ */
interface ShipsWheelProps {
  size?: number;
  className?: string;
}

export const ShipsWheel: React.FC<ShipsWheelProps> = ({
  size = 24,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Outer ring */}
    <circle cx="12" cy="12" r="10" />
    {/* Inner ring */}
    <circle cx="12" cy="12" r="4" />
    {/* Spokes (8 handles) */}
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => {
      const rad = (angle * Math.PI) / 180;
      return (
        <g key={angle}>
          <line
            x1={12 + 4 * Math.cos(rad)}
            y1={12 + 4 * Math.sin(rad)}
            x2={12 + 10 * Math.cos(rad)}
            y2={12 + 10 * Math.sin(rad)}
          />
          {/* Handle knob */}
          <circle
            cx={12 + 11 * Math.cos(rad)}
            cy={12 + 11 * Math.sin(rad)}
            r="1"
            fill="currentColor"
          />
        </g>
      );
    })}
    {/* Center */}
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Lighthouse — with optional rotating beacon                         */
/* ------------------------------------------------------------------ */
interface LighthouseProps {
  size?: number;
  beacon?: boolean;
  className?: string;
}

export const Lighthouse: React.FC<LighthouseProps> = ({
  size = 32,
  beacon = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Base/rocks */}
    <path d="M8 28 L24 28 C24 28 22 26 20 26 L12 26 C10 26 8 28 8 28Z" fill="currentColor" opacity="0.3" />
    {/* Tower body */}
    <path d="M12 26 L13 14 L19 14 L20 26 Z" fill="currentColor" opacity="0.5" />
    {/* Stripes */}
    <rect x="13.3" y="17" width="5.4" height="3" fill="currentColor" opacity="0.2" />
    <rect x="13.6" y="22" width="4.8" height="2" fill="currentColor" opacity="0.2" />
    {/* Lamp room */}
    <rect x="13.5" y="11" width="5" height="3" rx="0.5" fill="currentColor" opacity="0.7" />
    {/* Roof */}
    <path d="M13 11 L16 6 L19 11 Z" fill="currentColor" opacity="0.6" />
    {/* Beacon light */}
    {beacon && (
      <g opacity="0.4" style={{ animation: 'fog-drift 8s ease-in-out infinite' }}>
        <path d="M19 12 L30 8 L30 16 Z" fill="currentColor" opacity="0.3" />
        <path d="M13 12 L2 8 L2 16 Z" fill="currentColor" opacity="0.15" />
      </g>
    )}
    {/* Top light */}
    <circle cx="16" cy="12" r="1" fill="currentColor" opacity="0.8" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  Spyglass — telescope                                               */
/* ------------------------------------------------------------------ */
interface SpyglassProps {
  size?: number;
  className?: string;
}

export const Spyglass: React.FC<SpyglassProps> = ({
  size = 24,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Large lens end */}
    <ellipse cx="5.5" cy="18.5" rx="3.5" ry="2.5" transform="rotate(-45 5.5 18.5)" />
    {/* Main tube */}
    <rect x="7" y="7" width="12" height="3" rx="1" transform="rotate(-45 13 8.5)" fill="currentColor" opacity="0.2" stroke="currentColor" />
    {/* Eyepiece */}
    <rect x="17" y="3" width="4" height="2.5" rx="0.5" transform="rotate(-45 19 4.25)" />
    {/* Tube sections */}
    <line x1="8.5" y1="15.5" x2="17" y2="7" />
    <line x1="7" y1="17" x2="15.5" y2="8.5" />
    {/* Focus ring */}
    <line x1="11" y1="14" x2="10" y2="13" strokeWidth="2.5" opacity="0.5" />
  </svg>
);

/* ------------------------------------------------------------------ */
/*  RopeKnot — decorative separator                                    */
/* ------------------------------------------------------------------ */
interface RopeKnotProps {
  className?: string;
}

export const RopeKnot: React.FC<RopeKnotProps> = ({ className }) => (
  <svg
    width="60"
    height="20"
    viewBox="0 0 60 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Left rope */}
    <path
      d="M0 10 C5 10, 10 5, 15 5 C20 5, 22 10, 25 10"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.5"
      fill="none"
    />
    {/* Knot center */}
    <path
      d="M25 10 C27 6, 30 4, 30 10 C30 16, 33 14, 35 10"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.6"
      fill="none"
    />
    <path
      d="M25 10 C27 14, 30 16, 30 10 C30 4, 33 6, 35 10"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.4"
      fill="none"
    />
    {/* Right rope */}
    <path
      d="M35 10 C38 10, 40 15, 45 15 C50 15, 55 10, 60 10"
      stroke="currentColor"
      strokeWidth="2"
      opacity="0.5"
      fill="none"
    />
  </svg>
);
