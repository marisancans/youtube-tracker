/**
 * Pirate Map — main canvas component.
 *
 * Props:
 * - mode: 'mini' (widget, 300x160, no islands) | 'full' (dashboard, fills viewport)
 * - driftHistory: DriftSnapshot array
 * - currentDrift: current drift value + level
 * - stats: live stat values for islands (full mode only)
 * - onIslandClick: callback for island interactions (full mode only)
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import type { DriftSnapshot } from '../../background/storage';
import { generatePath } from './path-generator';
import { drawSea, drawGrid, drawBorder, drawPath, drawShip, drawCompassRose, drawTreasureX } from './map-renderer';
import { drawIsland, hitTestIsland, ISLAND_CONFIGS, type IslandId } from './island-sprites';
import { startWeatherLoop, stopWeatherLoop, setDriftLevel, resetWeather } from './weather-renderer';
import { setWeatherIntensity } from '../../lib/audio';

interface PirateMapProps {
  mode: 'mini' | 'full';
  driftHistory: DriftSnapshot[];
  currentDrift: number;
  currentLevel: 'low' | 'medium' | 'high' | 'critical';
  streak?: number;
  syncOk?: boolean;
  stats?: {
    videos: number;
    streak: number;
    focusScore: number;
    achievements: number;
    xp: number;
    level: number;
  };
  onIslandClick?: (id: IslandId) => void;
}

export default function PirateMap({
  mode,
  driftHistory,
  currentDrift,
  currentLevel,
  streak = 0,
  syncOk = false,
  stats,
  onIslandClick,
}: PirateMapProps): JSX.Element {
  const mapCanvasRef = useRef<HTMLCanvasElement>(null);
  const weatherCanvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredIsland, setHoveredIsland] = useState<IslandId | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Handle resize
  useEffect(() => {
    const updateSize = () => {
      if (mode === 'mini') {
        setDimensions({ width: 600, height: 320 });
      } else {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [mode]);

  // Render the static map layer
  const renderMap = useCallback(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width: w, height: h } = dimensions;
    if (w === 0 || h === 0) return;

    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background layers
    drawSea(ctx, w, h);
    drawGrid(ctx, w, h);

    // Generate and draw path
    const padding = mode === 'mini' ? 40 : 60;
    const path = generatePath(driftHistory, w, h, padding);
    drawPath(ctx, path);

    // Ship
    if (path.segments.length > 0) {
      const shipSize = mode === 'mini' ? 32 : 28;
      drawShip(ctx, path.shipPosition.x, path.shipPosition.y, path.shipAngle, currentDrift, shipSize);
    }

    // Islands (full mode only)
    if (mode === 'full' && stats) {
      const islandValues: Record<IslandId, string> = {
        lookout: `${stats.videos}`,
        lighthouse: `${stats.streak}d`,
        focus: `${stats.focusScore}%`,
        treasure: `${stats.achievements}`,
        harbor: 'Goal',
        fort: 'Tier',
        fog: 'Friction',
      };

      for (const config of ISLAND_CONFIGS) {
        drawIsland(
          ctx,
          config,
          w,
          h,
          islandValues[config.id],
          hoveredIsland === config.id,
          config.id === 'lighthouse' ? syncOk : undefined,
        );
      }

      // X marks the spot (streak > 3)
      if (streak > 3 && path.segments.length > 0) {
        const ahead = Math.min(path.shipPosition.x + 60, w - padding);
        drawTreasureX(ctx, ahead, path.shipPosition.y - 20);
      }
    }

    // Compass rose - positioned with enough clearance for labels and drift text
    const compassSize = mode === 'mini' ? 40 : 48;
    const compassX = w - (mode === 'mini' ? 70 : 90);
    const compassY = h - (mode === 'mini' ? 90 : 100);
    drawCompassRose(ctx, compassX, compassY, compassSize, currentDrift);

    // Border
    drawBorder(ctx, w, h);
  }, [dimensions, driftHistory, currentDrift, mode, stats, hoveredIsland, syncOk, streak]);

  // Redraw map when data changes
  useEffect(() => {
    renderMap();
  }, [renderMap]);

  // Start/stop weather animation
  useEffect(() => {
    const canvas = weatherCanvasRef.current;
    if (!canvas) return;

    const { width: w, height: h } = dimensions;
    if (w === 0 || h === 0) return;

    canvas.width = w * window.devicePixelRatio;
    canvas.height = h * window.devicePixelRatio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    setDriftLevel(currentLevel, currentDrift);
    setWeatherIntensity(currentLevel);

    // In mini mode, skip heavy effects
    if (mode === 'mini') {
      // Just render sea tint, no full loop
      // Single render call, no animation loop for mini
      return;
    }

    startWeatherLoop(ctx, w, h);

    return () => {
      stopWeatherLoop();
      resetWeather();
    };
  }, [dimensions, currentLevel, currentDrift, mode]);

  // Mouse handlers (full mode only)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'full') return;
    const rect = mapCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestIsland(x, y, dimensions.width, dimensions.height);
    setHoveredIsland(hit);

    if (mapCanvasRef.current) {
      mapCanvasRef.current.style.cursor = hit ? 'pointer' : 'default';
    }
  }, [mode, dimensions]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'full' || !onIslandClick) return;
    const rect = mapCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = hitTestIsland(x, y, dimensions.width, dimensions.height);
    if (hit) onIslandClick(hit);
  }, [mode, dimensions, onIslandClick]);

  const handleMiniClick = useCallback(() => {
    if (mode === 'mini') {
      // Open full map view — use message to background script since
      // chrome.tabs isn't available in content script context
      const mapUrl = chrome.runtime.getURL('src/options/options.html#dashboard');
      if (chrome.tabs?.create) {
        chrome.tabs.create({ url: mapUrl });
      } else {
        // Content script: ask background to open tab
        chrome.runtime.sendMessage({ type: 'OPEN_TAB', data: { url: mapUrl } });
      }
    }
  }, [mode]);

  const style: React.CSSProperties = mode === 'full'
    ? { position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh' }
    : {
        width: '600px',
        height: '320px',
        borderRadius: '20px',
        overflow: 'hidden',
        border: '2px solid rgba(184, 149, 106, 0.4)',
        cursor: 'pointer',
      };

  return (
    <div style={{ ...style, position: 'relative' }} onClick={handleMiniClick}>
      {/* Static map layer */}
      <canvas
        ref={mapCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
      />
      {/* Animated weather layer */}
      <canvas
        ref={weatherCanvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      {/* Mini-map "Open full map" link */}
      {mode === 'mini' && (
        <div style={{
          position: 'absolute',
          bottom: '4px',
          right: '8px',
          fontSize: '8px',
          color: 'rgba(184, 149, 106, 0.6)',
          pointerEvents: 'none',
        }}>
          Open full map
        </div>
      )}
    </div>
  );
}
