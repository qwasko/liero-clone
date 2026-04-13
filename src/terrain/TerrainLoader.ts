import { TerrainMap } from './TerrainMap';
import { LEVEL_PRESETS } from '../game/LevelPreset';

// ── Color contract: PNG palette → cell values ────────────────────────
// These are the ONLY place in TS where the map-PNG palette is defined.
const COLOR_AIR:  [number, number, number] = [0, 0, 0];        // #000000
const COLOR_DIRT: [number, number, number] = [139, 69, 19];    // #8B4513 SaddleBrown
const COLOR_ROCK: [number, number, number] = [128, 128, 128];  // #808080

function matchColor(r: number, g: number, b: number): number | null {
  if (r === COLOR_AIR[0]  && g === COLOR_AIR[1]  && b === COLOR_AIR[2])  return 0;
  if (r === COLOR_DIRT[0] && g === COLOR_DIRT[1] && b === COLOR_DIRT[2]) return 1;
  if (r === COLOR_ROCK[0] && g === COLOR_ROCK[1] && b === COLOR_ROCK[2]) return 2;
  return null;
}

/**
 * Load a terrain map from a PNG image URL.
 *
 * The image must use exactly 3 colors (air/dirt/rock) and its dimensions
 * must match one of the existing LEVEL_PRESETS.
 *
 * Throws on any failure: network, format, unknown colors, wrong size.
 */
export async function loadTerrainFromPng(url: string): Promise<TerrainMap> {
  // 1. Fetch
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`TerrainLoader: failed to fetch PNG from ${url}: ${err}`);
  }
  if (!response.ok) {
    throw new Error(`TerrainLoader: failed to fetch PNG from ${url}: HTTP ${response.status}`);
  }

  // 2. Decode to ImageBitmap
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const { width, height } = bitmap;

  // 3. Validate dimensions against presets
  const preset = LEVEL_PRESETS.find(p => p.width === width && p.height === height);
  if (!preset) {
    throw new Error(
      `TerrainLoader: image size ${width}×${height} does not match any level preset`,
    );
  }

  // 4. Read pixel data via offscreen canvas
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const rgba = imageData.data;

  // 5. Map pixels → TerrainMap
  const map = new TerrainMap(width, height);
  const data = map.getData();

  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const r = rgba[off];
    const g = rgba[off + 1];
    const b = rgba[off + 2];

    const cell = matchColor(r, g, b);
    if (cell === null) {
      const px = i % width;
      const py = Math.floor(i / width);
      throw new Error(
        `TerrainLoader: unknown color rgb(${r},${g},${b}) at pixel (${px}, ${py})`,
      );
    }
    data[i] = cell;
  }

  return map;
}
