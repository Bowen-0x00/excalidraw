import oc from "open-color";
import tinycolor from "tinycolor2";

//ymjr: inline math helpers to avoid circular package dependency
// import { clamp } from "@excalidraw/math";
// import { degreesToRadians } from "@excalidraw/math";
import type { Merge } from "./utility-types";

export { tinycolor };

type Degrees = number & { _brand: "excalimath_degree" };
type Radians = number & { _brand: "excalimath__radian" };

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

function degreesToRadians(degrees: Degrees): Radians {
  return ((degrees * Math.PI) / 180) as Radians;
}

// Browser-only cache to avoid memory leaks on server
const DARK_MODE_COLORS_CACHE: Map<string, string> | null =
  typeof window !== "undefined" ? new Map() : null;

const DARK_MODE_FILTER_INVERT_PERCENT = 93;
const DARK_MODE_FILTER_HUE_ROTATE_DEGREES = 180 as Degrees;

function cssHueRotate(
  red: number,
  green: number,
  blue: number,
  degrees: Degrees,
): { r: number; g: number; b: number } {
  // normalize
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;

  // Convert degrees to radians
  const a = degreesToRadians(degrees);

  const c = Math.cos(a);
  const s = Math.sin(a);

  // rotation matrix
  const matrix = [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
  ];

  // transform
  const newR = r * matrix[0] + g * matrix[1] + b * matrix[2];
  const newG = r * matrix[3] + g * matrix[4] + b * matrix[5];
  const newB = r * matrix[6] + g * matrix[7] + b * matrix[8];

  // clamp the values to [0, 1] range and convert back to [0, 255]
  return {
    r: Math.round(Math.max(0, Math.min(1, newR)) * 255),
    g: Math.round(Math.max(0, Math.min(1, newG)) * 255),
    b: Math.round(Math.max(0, Math.min(1, newB)) * 255),
  };
}

const cssInvert = (
  r: number,
  g: number,
  b: number,
  percent: number,
): { r: number; g: number; b: number } => {
  const p = clamp(percent, 0, 100) / 100;

  // Function to invert a single color component
  const invertComponent = (color: number): number => {
    // Apply the invert formula
    const inverted = color * (1 - p) + (255 - color) * p;
    // Round to the nearest integer and clamp to [0, 255]
    return Math.round(clamp(inverted, 0, 255));
  };

  // Calculate the inverted RGB components
  const invertedR = invertComponent(r);
  const invertedG = invertComponent(g);
  const invertedB = invertComponent(b);

  return { r: invertedR, g: invertedG, b: invertedB };
};

//ymjr
export const rgbToHex = (r: number, g: number, b: number, a?: number) => {
  // (1 << 24) adds 0x1000000 to ensure the hex string is always 7 chars,
  // then slice(1) removes the leading "1" to get exactly 6 hex digits
  // e.g. rgb(0,0,0) -> 0x1000000 -> "1000000" -> "000000"
  const hex6 = `#${((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16)
    .slice(1)}`;
  if (a !== undefined && a < 1) {
    // convert alpha from 0-1 float to 0-255 int, then to 2-digit hex
    // e.g. 0.5 -> 128 -> "80"
    const alphaHex = Math.round(a * 255)
      .toString(16)
      .padStart(2, "0");
    return `${hex6}${alphaHex}`;
  }
  return hex6;
};

export const applyDarkModeFilter = (color: string, enable = true): string => {
  if (!enable) {
    return color;
  }

  const cached = DARK_MODE_COLORS_CACHE?.get(color);
  if (cached) {
    return cached;
  }

  const tc = tinycolor(color);
  const alpha = tc.getAlpha();

  // order of operations matters
  // (corresponds to "filter: invert(invertPercent) hue-rotate(hueDegrees)" in css)
  const rgb = tc.toRgb();
  const inverted = cssInvert(
    rgb.r,
    rgb.g,
    rgb.b,
    DARK_MODE_FILTER_INVERT_PERCENT,
  );
  const rotated = cssHueRotate(
    inverted.r,
    inverted.g,
    inverted.b,
    DARK_MODE_FILTER_HUE_ROTATE_DEGREES,
  );

  const result = rgbToHex(rotated.r, rotated.g, rotated.b, alpha);

  if (DARK_MODE_COLORS_CACHE) {
    DARK_MODE_COLORS_CACHE.set(color, result);
  }

  return result;
};

const _reverseDarkModeInvert = (
  r: number,
  g: number,
  b: number,
): { r: number; g: number; b: number } => {
  const p = DARK_MODE_FILTER_INVERT_PERCENT / 100;
  const denominator = 1 - 2 * p;
  const restore = (color: number) =>
    Math.round(clamp((color - 255 * p) / denominator, 0, 255));

  return {
    r: restore(r),
    g: restore(g),
    b: restore(b),
  };
};

export const removeDarkModeFilter = (color: string): string => {
  const tc = tinycolor(color);
  const alpha = tc.getAlpha();
  const rgb = tc.toRgb();

  // 180deg hue rotation is its own inverse, so undo it before the inversion.
  const rotatedBack = cssHueRotate(
    rgb.r,
    rgb.g,
    rgb.b,
    DARK_MODE_FILTER_HUE_ROTATE_DEGREES,
  );
  const restored = _reverseDarkModeInvert(
    rotatedBack.r,
    rotatedBack.g,
    rotatedBack.b,
  );

  return rgbToHex(restored.r, restored.g, restored.b, alpha);
};

// ---------------------------------------------------------------------------

// Helper to safely get colors from the hook
const getExtraColors = (): { name: string; value: string }[] => {
  const core = (window as any).EA_Core;
  if (core) {
    const context = {
      colors: [] as { name: string; value: string }[],
    };

    core.dispatchSync("excalidrawExtraColors", context);

    return context.colors;
  }
  return [];
};

//ymjr: 1. Color calculation utility: generates color shade scale
const generateShades = (base: string): ColorTuple => {
  // ymjr: If dynamically injected transparent placeholder, return fully transparent shades directly and skip CM instantiation
  if (base === "transparent") {
    return [
      "transparent",
      "transparent",
      "transparent",
      "transparent",
      "transparent",
    ];
  }

  const ea = (window as any).ExcalidrawAutomate;

  // 1. Safety check
  if (!ea?.getCM) {
    console.warn("ExcalidrawAutomate not ready");
    return [base, base, base, base, base];
  }

  // 2. Obtain base lightness
  const baseL = ea.getCM(base).lightness;

  // 3. Compute step
  const step = Math.min(10, (100 - baseL) / 4);

  // 4. Generate shades
  return [
    ea
      .getCM(base)
      .lighterBy(step * 4)
      .stringHEX(),
    ea
      .getCM(base)
      .lighterBy(step * 3)
      .stringHEX(),
    ea
      .getCM(base)
      .lighterBy(step * 2)
      .stringHEX(),
    ea
      .getCM(base)
      .lighterBy(step * 1)
      .stringHEX(),
    base,
  ];
};
//ymjr
// FIXME can't put to utils.ts rn because of circular dependency
const pick = <R extends Record<string, any>, K extends readonly (keyof R)[]>(
  source: R,
  keys: K,
) => {
  return keys.reduce((acc, key: K[number]) => {
    if (key in source) {
      acc[key] = source[key];
    }
    return acc;
  }, {} as Pick<R, K[number]>) as Pick<R, K[number]>;
};

export type ColorPickerColor =
  | Exclude<keyof oc, "indigo" | "lime">
  | "transparent"
  | "bronze"
  | string; //ymjr
export type ColorTuple = readonly [string, string, string, string, string];
export type ColorPalette = {
  //ymjr
  transparent: "transparent";
  black: string;
  white: string;
  // Allow dynamic keys to return ColorTuple or string
  [key: string]: ColorTuple | string;
};

// used general type instead of specific type (ColorPalette) to support custom colors
export type ColorPaletteCustom = { [key: string]: ColorTuple | string };
export type ColorShadesIndexes = [number, number, number, number, number];

export const MAX_CUSTOM_COLORS_USED_IN_CANVAS = 5;
export const COLORS_PER_ROW = 5;

export const DEFAULT_CHART_COLOR_INDEX = 4;

export const DEFAULT_ELEMENT_STROKE_COLOR_INDEX = 4;
export const DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX = 1;
export const ELEMENTS_PALETTE_SHADE_INDEXES = [0, 2, 4, 6, 8] as const;
export const CANVAS_PALETTE_SHADE_INDEXES = [0, 1, 2, 3, 4] as const;

export const getSpecificColorShades = (
  color: Exclude<
    ColorPickerColor,
    "transparent" | "white" | "black" | "bronze"
  >,
  indexArr: Readonly<ColorShadesIndexes>,
) => {
  // @ts-ignore
  return indexArr.map((index) => oc[color][index]) as any as ColorTuple;
};

export const STATIC_PALETTE = {
  //ymjr
  transparent: "transparent",
  black: "#1e1e1e",
  white: "#ffffff",
  // open-colors
  gray: getSpecificColorShades("gray", ELEMENTS_PALETTE_SHADE_INDEXES),
  red: getSpecificColorShades("red", ELEMENTS_PALETTE_SHADE_INDEXES),
  pink: getSpecificColorShades("pink", ELEMENTS_PALETTE_SHADE_INDEXES),
  grape: getSpecificColorShades("grape", ELEMENTS_PALETTE_SHADE_INDEXES),
  violet: getSpecificColorShades("violet", ELEMENTS_PALETTE_SHADE_INDEXES),
  blue: getSpecificColorShades("blue", ELEMENTS_PALETTE_SHADE_INDEXES),
  cyan: getSpecificColorShades("cyan", ELEMENTS_PALETTE_SHADE_INDEXES),
  teal: getSpecificColorShades("teal", ELEMENTS_PALETTE_SHADE_INDEXES),
  green: getSpecificColorShades("green", ELEMENTS_PALETTE_SHADE_INDEXES),
  yellow: getSpecificColorShades("yellow", ELEMENTS_PALETTE_SHADE_INDEXES),
  orange: getSpecificColorShades("orange", ELEMENTS_PALETTE_SHADE_INDEXES),
  // radix bronze shades 3,5,7,9,11
  bronze: ["#f8f1ee", "#eaddd7", "#d2bab0", "#a18072", "#846358"],
} as const;

//ymjr
export const COLOR_PALETTE = new Proxy(STATIC_PALETTE as ColorPalette, {
  // Intercept property read: COLOR_PALETTE.myColor
  get(target, prop, receiver) {
    // Prioritize static colors
    if (Reflect.has(target, prop)) {
      return Reflect.get(target, prop, receiver);
    }
    if (typeof prop !== "string") {
      return undefined;
    }

    // ymjr: Return __group__ and __spacer__ identifiers as-is so DOM receives feature marker
    if (prop.startsWith("__group__") || prop.startsWith("__spacer__")) {
      return prop;
    }

    const extraColors = getExtraColors();
    const extra = extraColors.find((c) => c.name === prop);
    if (extra && extra.value) {
      if (extra.value === "transparent") {
        return [
          "transparent",
          "transparent",
          "transparent",
          "transparent",
          "transparent",
        ];
      }
      return generateShades(extra.value);
    }

    return undefined;
  },

  ownKeys(target) {
    const staticKeys = Reflect.ownKeys(target);
    const dynamicKeys = getExtraColors().map((c) => c.name);
    return Array.from(new Set([...staticKeys, ...dynamicKeys]));
  },

  getOwnPropertyDescriptor(target, prop) {
    if (prop in target) {
      return Object.getOwnPropertyDescriptor(target, prop);
    }
    return { configurable: true, enumerable: true, writable: false };
  },
});

// =============================================================================
// ymjr: Derived color palettes (dynamic proxy)
// =============================================================================

// In order for COMMON_ELEMENT_SHADES to reflect extraColors in real time,
// instead of a static pick, proxy COLOR_PALETTE dynamically.
// Constructs a dynamic object containing common colors + dynamic extraColors.
const COMMON_KEYS = [
  "cyan",
  "blue",
  "violet",
  "grape",
  "pink",
  "green",
  "teal",
  "yellow",
  "orange",
  "red",
];

// ymjr: Create a Proxy dynamically retrieving common colors + extra colors
const getDynamicCommonShades = () => {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        return COLOR_PALETTE[prop as keyof typeof COLOR_PALETTE];
      },
      ownKeys() {
        const extraKeys = getExtraColors().map((c) => c.name);
        return [...COMMON_KEYS, ...extraKeys];
      },
      getOwnPropertyDescriptor(_, prop) {
        return { configurable: true, enumerable: true, writable: false };
      },
    },
  );
};

const COMMON_ELEMENT_SHADES = getDynamicCommonShades();
//ymjr

// -----------------------------------------------------------------------------
// quick picks defaults
// -----------------------------------------------------------------------------

/** number of slots in the color-picker top-picks strip — the strip layout is
 * sized for exactly this many swatches, and pick customization (replace /
 * reorder) preserves it */
export const COLOR_TOP_PICKS_SLOTS = 5;

// ORDER matters for positioning in quick picker
export const DEFAULT_ELEMENT_STROKE_PICKS = [
  COLOR_PALETTE.black,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_STROKE_COLOR_INDEX],
] as ColorTuple;

// ORDER matters for positioning in quick picker
export const DEFAULT_ELEMENT_BACKGROUND_PICKS = [
  COLOR_PALETTE.transparent,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
] as ColorTuple;

// ORDER matters for positioning in quick picker.
// Same as element background picks, with `transparent` (a no-op fill for the
// bucket tool) swapped for white.
export const BUCKET_FILL_BACKGROUND_PICKS = [
  COLOR_PALETTE.white,
  COLOR_PALETTE.red[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.green[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.blue[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
  COLOR_PALETTE.yellow[DEFAULT_ELEMENT_BACKGROUND_COLOR_INDEX],
] as ColorTuple;

// sticky notes are their own color domain (own defaults, own picks)
export const DEFAULT_STICKY_NOTE_BG = "#ffdf6b";

export const STICKY_NOTE_STROKE_PICKS: ColorTuple =
  DEFAULT_ELEMENT_STROKE_PICKS;

// ORDER matters for positioning in quick picker. Classic note colors; the
// first one is `DEFAULT_STICKY_NOTE_BG`. Never transparent.
export const STICKY_NOTE_BACKGROUND_PICKS = [
  DEFAULT_STICKY_NOTE_BG,
  COLOR_PALETTE.pink[1],
  COLOR_PALETTE.green[1],
  COLOR_PALETTE.blue[1],
  COLOR_PALETTE.orange[1],
] as ColorTuple;

// ORDER matters for positioning in quick picker
export const DEFAULT_CANVAS_BACKGROUND_PICKS = [
  COLOR_PALETTE.white,
  // radix slate2
  "#f8f9fa",
  // radix blue2
  "#f5faff",
  // radix yellow2
  "#fffce8",
  // radix bronze2
  "#fdf8f6",
] as ColorTuple;

// -----------------------------------------------------------------------------
// palette defaults
// -----------------------------------------------------------------------------
//ymjr
const createDynamicPalette = (base: Record<string, any>) => {
  return new Proxy(base, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      // If not in base, look in COMMON_ELEMENT_SHADES (dynamic list)
      return (COMMON_ELEMENT_SHADES as any)[prop];
    },
    ownKeys(target) {
      // Order here determines display order in color picker panel
      return [
        ...Reflect.ownKeys(target),
        ...Reflect.ownKeys(COMMON_ELEMENT_SHADES),
      ];
    },
    getOwnPropertyDescriptor(target, prop) {
      return { configurable: true, enumerable: true, writable: false };
    },
  });
};

export const DEFAULT_ELEMENT_STROKE_COLOR_PALETTE = createDynamicPalette({
  // 1st row
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,
}) as any;

// ORDER matters for positioning in pallete (5x3 grid)s
export const DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE = createDynamicPalette({
  transparent: COLOR_PALETTE.transparent,
  white: COLOR_PALETTE.white,
  gray: COLOR_PALETTE.gray,
  black: COLOR_PALETTE.black,
  bronze: COLOR_PALETTE.bronze,
}) as any;

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

// !!!MUST BE WITHOUT GRAY, TRANSPARENT AND BLACK!!!
export const getAllColorsSpecificShade = (index: 0 | 1 | 2 | 3 | 4) => [
  // 2nd row
  COLOR_PALETTE.cyan[index],
  COLOR_PALETTE.blue[index],
  COLOR_PALETTE.violet[index],
  COLOR_PALETTE.grape[index],
  COLOR_PALETTE.pink[index],

  // 3rd row
  COLOR_PALETTE.green[index],
  COLOR_PALETTE.teal[index],
  COLOR_PALETTE.yellow[index],
  COLOR_PALETTE.orange[index],
  COLOR_PALETTE.red[index],
];

// -----------------------------------------------------------------------------
// other helpers (From Upstream/Conflicting file - Needed for Utils)
// -----------------------------------------------------------------------------

/**
 * @returns the color with its alpha replaced by `alpha` (as #RRGGBBAA), or the
 *  input unchanged if it's not a valid color
 */
export const setColorAlpha = (color: string, alpha: number): string => {
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return color;
  }
  const { r, g, b } = tc.toRgb();
  return rgbToHex(r, g, b, alpha);
};

/**
 * @returns #RRGGBB or #RRGGBBAA based on color containing non-opaque alpha,
 * null if not valid color
 */
export const colorToHex = (color: string): string | null => {
  const tc = tinycolor(color);
  if (!tc.isValid()) {
    return null;
  }
  const { r, g, b, a } = tc.toRgb();
  return rgbToHex(r, g, b, a);
};

export const isTransparent = (color: string) => {
  return tinycolor(color).getAlpha() === 0;
};

/**
 * Whether the color is fully opaque (alpha exactly 1).
 *
 * NOT the negation of `isTransparent`, which is true only at alpha 0 — a
 * partial-alpha color (`#RRGGBBAA`, `rgba(…, 0.5)`) is neither transparent
 * (it renders) nor opaque (what's beneath shows through it).
 */
export const isOpaqueColor = (color: string) => {
  return tinycolor(color).getAlpha() === 1;
};

// -----------------------------------------------------------------------------
// color contract helpers
// -----------------------------------------------------------------------------

export const COLOR_OUTLINE_CONTRAST_THRESHOLD = 240;
const calculateContrast = (r: number, g: number, b: number): number => {
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq;
};

// YIQ algo, inspiration from https://stackoverflow.com/a/11868398
export const isColorDark = (color: string, threshold = 160): boolean => {
  // no color ("") -> assume it default to black
  if (!color) {
    return true;
  }

  if (isTransparent(color)) {
    return false;
  }

  const tc = tinycolor(color);
  if (!tc.isValid()) {
    // invalid color -> assume it defaults to black
    return true;
  }

  const { r, g, b } = tc.toRgb();
  return calculateContrast(r, g, b) < threshold;
};

// -----------------------------------------------------------------------------
// normalization
// -----------------------------------------------------------------------------

/**
 * tries to keep the input color as-is if it's valid, making minimal adjustments
 * (trimming whitespace or adding `#` to hex colors)
 */
export const normalizeInputColor = (color: string): string | null => {
  color = color.trim();
  if (isTransparent(color)) {
    return color;
  }

  const tc = tinycolor(color);
  if (tc.isValid()) {
    // testing for `#` first fixes a bug on Electron (more specfically, an
    // Obsidian popout window), where a hex color without `#` is considered valid
    if (["hex", "hex8"].includes(tc.getFormat()) && !color.startsWith("#")) {
      return `#${color}`;
    }
    return color;
  }

  return null;
};
