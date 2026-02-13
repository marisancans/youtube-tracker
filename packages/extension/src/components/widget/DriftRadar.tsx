import type { DriftAxes } from '@yt-detox/shared';

interface DriftRadarProps {
  axes: DriftAxes;
  size: number;
  showLabels?: boolean;
  className?: string;
}

const GRID_COLOR = 'rgba(212, 165, 116, 0.15)';
const AXIS_COLOR = 'rgba(212, 165, 116, 0.15)';
const LABEL_COLOR = '#4a3728';
const CENTER = 50;
const MAX_RADIUS = 40;
const GRID_LEVELS = [0.25, 0.5, 0.75, 1.0];

function getFillColor(maxVal: number): string {
  if (maxVal < 0.3) return 'rgba(13, 148, 136, 0.3)';
  if (maxVal < 0.6) return 'rgba(212, 165, 116, 0.3)';
  if (maxVal < 0.8) return 'rgba(245, 158, 11, 0.3)';
  return 'rgba(153, 27, 27, 0.3)';
}

function getStrokeColor(maxVal: number): string {
  if (maxVal < 0.3) return 'rgba(13, 148, 136, 0.8)';
  if (maxVal < 0.6) return 'rgba(212, 165, 116, 0.8)';
  if (maxVal < 0.8) return 'rgba(245, 158, 11, 0.8)';
  return 'rgba(153, 27, 27, 0.8)';
}

export default function DriftRadar({
  axes,
  size,
  showLabels = false,
  className,
}: DriftRadarProps): JSX.Element {
  const contentQuality = axes.contentQuality.value;
  const behaviorPattern = axes.behaviorPattern.value;
  const circadian = axes.circadian;
  const timePressure = axes.timePressure.value;

  // Data points on each axis (top, right, bottom, left)
  const top = { x: CENTER, y: CENTER - contentQuality * MAX_RADIUS };
  const right = { x: CENTER + behaviorPattern * MAX_RADIUS, y: CENTER };
  const bottom = { x: CENTER, y: CENTER + circadian * MAX_RADIUS };
  const left = { x: CENTER - timePressure * MAX_RADIUS, y: CENTER };

  const maxVal = Math.max(contentQuality, behaviorPattern, circadian, timePressure);
  const fillColor = getFillColor(maxVal);
  const strokeColor = getStrokeColor(maxVal);

  const polygonPoints = `${top.x},${top.y} ${right.x},${right.y} ${bottom.x},${bottom.y} ${left.x},${left.y}`;

  const isMinimal = size < 30;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={{ display: 'block' }}
    >
      {/* Background grid diamonds — hidden at tiny sizes */}
      {!isMinimal &&
        GRID_LEVELS.map((level) => {
          const r = MAX_RADIUS * level;
          return (
            <polygon
              key={level}
              points={`${CENTER},${CENTER - r} ${CENTER + r},${CENTER} ${CENTER},${CENTER + r} ${CENTER - r},${CENTER}`}
              fill="none"
              stroke={GRID_COLOR}
              strokeWidth={0.5}
            />
          );
        })}

      {/* Axis lines — hidden at tiny sizes */}
      {!isMinimal && (
        <>
          <line
            x1={CENTER}
            y1={CENTER - MAX_RADIUS}
            x2={CENTER}
            y2={CENTER + MAX_RADIUS}
            stroke={AXIS_COLOR}
            strokeWidth={0.3}
          />
          <line
            x1={CENTER - MAX_RADIUS}
            y1={CENTER}
            x2={CENTER + MAX_RADIUS}
            y2={CENTER}
            stroke={AXIS_COLOR}
            strokeWidth={0.3}
          />
        </>
      )}

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinejoin="round"
        style={{ transition: 'all 0.5s ease' }}
      />

      {/* Data points — hidden at tiny sizes */}
      {!isMinimal && (
        <>
          <circle cx={top.x} cy={top.y} r={2} fill={strokeColor} style={{ transition: 'all 0.5s ease' }} />
          <circle cx={right.x} cy={right.y} r={2} fill={strokeColor} style={{ transition: 'all 0.5s ease' }} />
          <circle cx={bottom.x} cy={bottom.y} r={2} fill={strokeColor} style={{ transition: 'all 0.5s ease' }} />
          <circle cx={left.x} cy={left.y} r={2} fill={strokeColor} style={{ transition: 'all 0.5s ease' }} />
        </>
      )}

      {/* Labels — only when showLabels is true */}
      {showLabels && (
        <>
          <text
            x={CENTER}
            y={CENTER - MAX_RADIUS - 4}
            textAnchor="middle"
            fontSize={8}
            fill={LABEL_COLOR}
            fontFamily="sans-serif"
          >
            Content Quality
          </text>
          <text
            x={CENTER + MAX_RADIUS + 4}
            y={CENTER + 3}
            textAnchor="start"
            fontSize={8}
            fill={LABEL_COLOR}
            fontFamily="sans-serif"
          >
            Behavior
          </text>
          <text
            x={CENTER}
            y={CENTER + MAX_RADIUS + 11}
            textAnchor="middle"
            fontSize={8}
            fill={LABEL_COLOR}
            fontFamily="sans-serif"
          >
            Circadian
          </text>
          <text
            x={CENTER - MAX_RADIUS - 4}
            y={CENTER + 3}
            textAnchor="end"
            fontSize={8}
            fill={LABEL_COLOR}
            fontFamily="sans-serif"
          >
            Time
          </text>
        </>
      )}
    </svg>
  );
}
