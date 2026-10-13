import { pointsOnBezierCurves, simplify } from "points-on-curve";
import { getStroke, getStrokePoints } from "perfect-freehand";
import { LaserPointer } from "@excalidraw/laser-pointer";

import {
  type GeometricShape,
  getClosedCurveShape,
  getCurveShape,
  getEllipseShape,
  getFreedrawShape,
  getPolygonShape,
} from "@excalidraw/utils/shape";

import {
  pointFrom,
  pointDistance,
  type LocalPoint,
  pointRotateRads,
  polygonFromPoints,
} from "@excalidraw/math";
import {
  ROUGHNESS,
  THEME,
  isTransparent,
  assertNever,
  COLOR_PALETTE,
  LINE_POLYGON_POINT_MERGE_DISTANCE,
  applyDarkModeFilter,
  DEFAULT_STROKE_STREAMLINE,
} from "@excalidraw/common";

import { RoughGenerator } from "roughjs/bin/generator";

import type { GlobalPoint, Polygon } from "@excalidraw/math";

import type { Mutable } from "@excalidraw/common/utility-types";

import type {
  AppState,
  EmbedsValidationStatus,
} from "@excalidraw/excalidraw/types";
import type {
  ElementShape,
  ElementShapes,
  SVGPathString,
} from "@excalidraw/excalidraw/scene/types";

import { elementWithCanvasCache } from "./renderElement";

import {
  canBecomePolygon,
  isElbowArrow,
  isEmbeddableElement,
  isIframeElement,
  isIframeLikeElement,
  isLinearElement,
} from "./typeChecks";
import { getCornerRadius, isPathALoop } from "./utils";
import { headingForPointIsHorizontal } from "./heading";

import { canChangeRoundness } from "./comparisons";
import {
  elementCenterPoint,
  getArrowheadPoints,
  getDiamondPoints,
  getElementAbsoluteCoords,
} from "./bounds";
import { shouldTestInside } from "./collision";

import type {
  ExcalidrawElement,
  ExcalidrawSelectionElement,
  ExcalidrawLinearElement,
  ExcalidrawFreeDrawElement,
  ElementsMap,
  ExcalidrawLineElement,
  Arrowhead,
} from "./types";

import type { Drawable, Options } from "roughjs/bin/core";
import type { Point as RoughPoint } from "roughjs/bin/geometry";

export class ShapeCache {
  private static rg = new RoughGenerator();
  private static cache = new WeakMap<
    ExcalidrawElement,
    { shape: ElementShape; theme: AppState["theme"] }
  >();

  /**
   * Retrieves shape from cache if available. Use this only if shape
   * is optional and you have a fallback in case it's not cached.
   */
  public static get = <T extends ExcalidrawElement>(
    element: T,
    theme: AppState["theme"] | null,
  ) => {
    const cached = ShapeCache.cache.get(element);
    if (cached && (theme === null || cached.theme === theme)) {
      return cached.shape as T["type"] extends keyof ElementShapes
        ? ElementShapes[T["type"]] | undefined
        : ElementShape | undefined;
    }
    return undefined;
  };

  public static delete = (element: ExcalidrawElement) => {
    ShapeCache.cache.delete(element);
    elementWithCanvasCache.delete(element);
  };

  public static destroy = () => {
    ShapeCache.cache = new WeakMap();
    if (elementWithCanvasCache) {
      //zsviczian
      Object.values(elementWithCanvasCache).forEach((value) => {
        elementWithCanvasCache.delete(value);
      });
    }
  };

  /**
   * Generates & caches shape for element if not already cached, otherwise
   * returns cached shape.
   */
  public static generateElementShape = <
    T extends Exclude<ExcalidrawElement, ExcalidrawSelectionElement>,
  >(
    element: T,
    renderConfig: {
      isExporting: boolean;
      canvasBackgroundColor: AppState["viewBackgroundColor"];
      embedsValidationStatus: EmbedsValidationStatus;
      theme: AppState["theme"];
    } | null,
  ) => {
    // when exporting, always regenerated to guarantee the latest shape
    const cachedShape = renderConfig?.isExporting
      ? undefined
      : ShapeCache.get(element, renderConfig ? renderConfig.theme : null);

    // `null` indicates no rc shape applicable for this element type,
    // but it's considered a valid cache value (= do not regenerate)
    if (cachedShape !== undefined) {
      return cachedShape;
    }

    elementWithCanvasCache.delete(element);

    const shape = _generateElementShape(
      element,
      ShapeCache.rg,
      renderConfig || {
        isExporting: false,
        canvasBackgroundColor: COLOR_PALETTE.white,
        embedsValidationStatus: null,
        theme: THEME.LIGHT,
      },
    ) as T["type"] extends keyof ElementShapes
      ? ElementShapes[T["type"]]
      : Drawable | null;

    if (!renderConfig?.isExporting) {
      ShapeCache.cache.set(element, {
        shape,
        theme: renderConfig?.theme || THEME.LIGHT,
      });
    }

    return shape;
  };
}

const getDashArrayDashed = (strokeWidth: number) => [8, 8 + strokeWidth];

const getDashArrayDotted = (strokeWidth: number) => [1.5, 6 + strokeWidth];

function adjustRoughness(element: ExcalidrawElement): number {
  const roughness = element.roughness;

  const maxSize = Math.max(element.width, element.height);
  const minSize = Math.min(element.width, element.height);

  // don't reduce roughness if
  if (
    // both sides relatively big
    (minSize >= 20 && maxSize >= 50) ||
    // is round & both sides above 15px
    (minSize >= 15 &&
      !!element.roundness &&
      canChangeRoundness(element.type)) ||
    // relatively long linear element
    (isLinearElement(element) && maxSize >= 50)
  ) {
    return roughness;
  }

  return Math.min(roughness / (maxSize < 10 ? 3 : 2), 2.5);
}

export const generateRoughOptions = (
  element: ExcalidrawElement,
  continuousPath = false,
  isDarkMode: boolean = false,
): Options => {
  const options: Options = {
    seed: element.seed,
    strokeLineDash:
      element.strokeStyle === "dashed"
        ? getDashArrayDashed(element.strokeWidth)
        : element.strokeStyle === "dotted"
        ? getDashArrayDotted(element.strokeWidth)
        : undefined,
    // for non-solid strokes, disable multiStroke because it tends to make
    // dashes/dots overlay each other
    disableMultiStroke: element.strokeStyle !== "solid",
    // for non-solid strokes, increase the width a bit to make it visually
    // similar to solid strokes, because we're also disabling multiStroke
    strokeWidth:
      element.strokeStyle !== "solid"
        ? element.strokeWidth + 0.5
        : element.strokeWidth,
    // when increasing strokeWidth, we must explicitly set fillWeight and
    // hachureGap because if not specified, roughjs uses strokeWidth to
    // calculate them (and we don't want the fills to be modified)
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    roughness: adjustRoughness(element),
    stroke: applyDarkModeFilter(element.strokeColor, isDarkMode),
    preserveVertices:
      continuousPath || element.roughness < ROUGHNESS.cartoonist,
  };

  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "diamond":
    case "ellipse": {
      options.fillStyle = element.fillStyle;
      options.fill = isTransparent(element.backgroundColor)
        ? undefined
        : applyDarkModeFilter(element.backgroundColor, isDarkMode);
      if (element.type === "ellipse") {
        options.curveFitting = 1;
      }
      //return options; ymjr
      break; //ymjr
    }
    case "line":
    case "freedraw": {
      if (isPathALoop(element.points)) {
        options.fillStyle = element.fillStyle;
        options.fill =
          element.backgroundColor === "transparent"
            ? undefined
            : applyDarkModeFilter(element.backgroundColor, isDarkMode);
      }
      // return options; ymjr
      break; //ymjr
    }
    case "arrow":
      // return options; ymjr
      break; //ymjr
    default: {
      throw new Error(`Unimplemented type ${element.type}`);
    }
  }
  // /*ymjr*/(window as any)?.generateRoughOptionsHook?.(element, options);
  const core = (window as any).EA_Core;
  if (core) {
    const isIntercepted = core.dispatchSync("generateRoughOptions", {
      element,
      options,
    });
  }
  return options; // ymjr
};

const modifyIframeLikeForRoughOptions = (
  element: ExcalidrawElement,
  isExporting: boolean,
  embedsValidationStatus: EmbedsValidationStatus | null,
) => {
  if (
    isIframeLikeElement(element) &&
    (isExporting ||
      (isEmbeddableElement(element) &&
        embedsValidationStatus?.get(element.id) !== true)) &&
    isTransparent(element.backgroundColor) &&
    isTransparent(element.strokeColor)
  ) {
    return {
      ...element,
      roughness: 0,
      backgroundColor: "#d3d3d3",
      fillStyle: "solid",
    } as const;
  } else if (isIframeElement(element)) {
    return {
      ...element,
      strokeColor: isTransparent(element.strokeColor)
        ? "#000000"
        : element.strokeColor,
      backgroundColor: isTransparent(element.backgroundColor)
        ? "#f4f4f6"
        : element.backgroundColor,
    };
  }
  return element;
};

const generateArrowheadCardinalityOne = (
  generator: RoughGenerator,
  arrowheadPoints: number[] | null,
  lineOptions: Options,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [, , x3, y3, x4, y4] = arrowheadPoints;

  return [generator.line(x3, y3, x4, y4, lineOptions)];
};

const generateArrowheadLinesToTip = (
  generator: RoughGenerator,
  arrowheadPoints: number[] | null,
  lineOptions: Options,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [x2, y2, x3, y3, x4, y4] = arrowheadPoints;

  return [
    generator.line(x3, y3, x2, y2, lineOptions),
    generator.line(x4, y4, x2, y2, lineOptions),
  ];
};

const getArrowheadLineOptions = (
  element: ExcalidrawLinearElement,
  options: Options,
) => {
  const lineOptions = { ...options };

  if (element.strokeStyle === "dotted") {
    // for dotted arrows caps, reduce gap to make it more legible
    const dash = getDashArrayDotted(element.strokeWidth - 1);
    lineOptions.strokeLineDash = [dash[0], dash[1] - 1];
  } else {
    // for solid/dashed, keep solid arrow cap
    delete lineOptions.strokeLineDash;
  }
  lineOptions.roughness = Math.min(1, lineOptions.roughness || 0);

  return lineOptions;
};

const generateArrowheadOutlineCircle = (
  generator: RoughGenerator,
  options: Options,
  strokeColor: string,
  arrowheadPoints: number[] | null,
  fill: string,
  diameterScale = 1,
) => {
  if (arrowheadPoints === null) {
    return [];
  }

  const [x, y, diameter] = arrowheadPoints;
  const circleOptions = {
    ...options,
    fill,
    fillStyle: "solid" as const,
    stroke: strokeColor,
    roughness: Math.min(0.5, options.roughness || 0),
  };

  delete circleOptions.strokeLineDash;

  return [generator.circle(x, y, diameter * diameterScale, circleOptions)];
};

const getArrowheadShapes = (
  element: ExcalidrawLinearElement,
  shape: Drawable[],
  position: "start" | "end",
  arrowhead: Arrowhead,
  generator: RoughGenerator,
  options: Options,
  canvasBackgroundColor: string,
  isDarkMode: boolean,
) => {
  if (arrowhead === null) {
    return [];
  }

  if (element?.customData?.arrowHeadLineWidth) {
    //ymjr
    options.strokeWidth = element.customData.arrowHeadLineWidth;
  }

  const strokeColor = applyDarkModeFilter(element.strokeColor, isDarkMode);
  const backgroundFillColor = applyDarkModeFilter(
    canvasBackgroundColor,
    isDarkMode,
  );
  const cardinalityOneOrManyOffset = -0.25;
  const cardinalityZeroCircleScale = 0.8;
  const arrowheadPoints = getArrowheadPoints(
    element,
    shape,
    position,
    arrowhead,
  ); //ymjr
  switch (arrowhead) {
    case "circle":
    case "circle_outline": {
      return generateArrowheadOutlineCircle(
        generator,
        options,
        strokeColor,
        getArrowheadPoints(element, shape, position, arrowhead),
        arrowhead === "circle_outline" ? backgroundFillColor : strokeColor,
      );
    }
    case "triangle":
    case "triangle_outline": {
      const arrowheadPoints = getArrowheadPoints(
        element,
        shape,
        position,
        arrowhead,
      );

      if (arrowheadPoints === null) {
        return [];
      }

      const [x, y, x2, y2, x3, y3] = arrowheadPoints;
      const triangleOptions = {
        ...options,
        fill:
          arrowhead === "triangle_outline" ? backgroundFillColor : strokeColor,
        fillStyle: "solid" as const,
        roughness: Math.min(1, options.roughness || 0),
      };

      // always use solid stroke for arrowhead
      delete triangleOptions.strokeLineDash;

      return [
        generator.polygon(
          [
            [x, y],
            [x2, y2],
            [x3, y3],
            [x, y],
          ],
          triangleOptions,
        ),
      ];
    }
    case "diamond":
    case "diamond_outline": {
      const arrowheadPoints = getArrowheadPoints(
        element,
        shape,
        position,
        arrowhead,
      );

      if (arrowheadPoints === null) {
        return [];
      }

      const [x, y, x2, y2, x3, y3, x4, y4] = arrowheadPoints;
      const diamondOptions = {
        ...options,
        fill:
          arrowhead === "diamond_outline" ? backgroundFillColor : strokeColor,
        fillStyle: "solid" as const,
        roughness: Math.min(1, options.roughness || 0),
      };

      // always use solid stroke for arrowhead
      delete diamondOptions.strokeLineDash;

      return [
        generator.polygon(
          [
            [x, y],
            [x2, y2],
            [x3, y3],
            [x4, y4],
            [x, y],
          ],
          diamondOptions,
        ),
      ];
    }
    case "cardinality_one":
      return generateArrowheadCardinalityOne(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
    case "cardinality_many":
      return generateArrowheadLinesToTip(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
    case "cardinality_one_or_many": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadLinesToTip(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_many"),
          lineOptions,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(
            element,
            shape,
            position,
            "cardinality_one",
            cardinalityOneOrManyOffset,
          ),
          lineOptions,
        ),
      ];
    }
    case "cardinality_exactly_one": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one", -0.5),
          lineOptions,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one"),
          lineOptions,
        ),
      ];
    }
    case "cardinality_zero_or_one": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadOutlineCircle(
          generator,
          options,
          strokeColor,
          getArrowheadPoints(element, shape, position, "circle_outline", 1.5),
          backgroundFillColor,
          cardinalityZeroCircleScale,
        ),
        ...generateArrowheadCardinalityOne(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_one", -0.5),
          lineOptions,
        ),
      ];
    }
    case "cardinality_zero_or_many": {
      const lineOptions = getArrowheadLineOptions(element, options);

      return [
        ...generateArrowheadLinesToTip(
          generator,
          getArrowheadPoints(element, shape, position, "cardinality_many"),
          lineOptions,
        ),
        ...generateArrowheadOutlineCircle(
          generator,
          options,
          strokeColor,
          getArrowheadPoints(element, shape, position, "circle_outline", 1.5),
          backgroundFillColor,
          cardinalityZeroCircleScale,
        ),
      ];
    }
    case "chevron":
    case "chevron_outline": {
      //ymjr
      if (arrowheadPoints === null) return [];
      // Reuse standard arrow point logic: x2/y2 tip, x3/y3 left wing, x4/y4 right wing
      const [x2, y2, x3, y3, x4, y4] = arrowheadPoints;

      // Force solid line for arrowhead outline
      delete options.strokeLineDash;

      // Compute midpoint of left and right wings
      const midX = (x3 + x4) / 2;
      const midY = (y3 + y4) / 2;

      // Compute internal indent point (offset toward tip).
      // 0.4 indent factor: higher is flatter, lower is sharper tail.
      const indentFactor = 0.4;
      const innerX = midX + (x2 - midX) * indentFactor;
      const innerY = midY + (y2 - midY) * indentFactor;

      return [
        generator.polygon(
          [
            [x3, y3], // Left wing endpoint
            [x2, y2], // Arrow tip
            [x4, y4], // Right wing endpoint
            [innerX, innerY], // Tail indent point
            [x3, y3], // Close polygon
          ],
          {
            ...options,
            fill:
              arrowhead === "chevron_outline"
                ? canvasBackgroundColor
                : strokeColor,
            fillStyle: "solid",
            roughness: Math.min(1, options.roughness || 0),
          },
        ),
      ];
    }

    case "block_arrow":
    case "block_arrow_outline": {
      if (arrowheadPoints === null) return [];
      // x2, y2 arrow tip; x3, y3 and x4, y4 left and right wings
      const [x2, y2, x3, y3, x4, y4] = arrowheadPoints;

      // Force solid line for arrowhead outline
      delete options.strokeLineDash;

      return [
        generator.polygon(
          [
            [x2, y2], // Tip
            [x3, y3], // Left wing
            [x4, y4], // Right wing
            [x2, y2], // Close back to tip, forming flat-base triangle
          ],
          {
            ...options,
            fill:
              arrowhead === "block_arrow_outline"
                ? canvasBackgroundColor
                : strokeColor,
            fillStyle: "solid",
            // Slightly lower roughness for sharper block arrow edges
            roughness: Math.min(0.5, options.roughness || 0),
          },
        ),
      ];
    }
    case "bar":
    case "arrow":
    default: {
      //ymjr
      const shapes = generateArrowheadLinesToTip(
        generator,
        getArrowheadPoints(element, shape, position, arrowhead),
        getArrowheadLineOptions(element, options),
      );
      return shapes;
    }
  }
};

/** The simplified centerline the freedraw fill is drawn along. */
const getFreedrawFillCurvePoints = (element: ExcalidrawFreeDrawElement) =>
  simplify(element.points as Mutable<LocalPoint[]>, 0.75) as [number, number][];

const freedrawFillPolygonCache = new WeakMap<
  ExcalidrawFreeDrawElement,
  { version: number; polygon: Polygon<LocalPoint> }
>();

/**
 * Returns the flattened fill contour of a freedraw loop in local, unrotated
 * coordinates, following the rendered fill rather than the stroke outline.
 */
export const getFreedrawFillPolygon = (element: ExcalidrawFreeDrawElement) => {
  const cached = freedrawFillPolygonCache.get(element);
  if (cached?.version === element.version) {
    return cached.polygon;
  }

  // Same curve as the rendered fill, without roughness jitter. RoughJS also
  // handles inputs simplified to two points.
  const ops = new RoughGenerator().curve(getFreedrawFillCurvePoints(element), {
    roughness: 0,
    disableMultiStroke: true,
  }).sets[0].ops;
  const bezierPoints: LocalPoint[] = [];
  // A single curve pass consists of a move followed by cubic control points.
  for (const { data } of ops) {
    for (let i = 0; i < data.length; i += 2) {
      bezierPoints.push(pointFrom<LocalPoint>(data[i], data[i + 1]));
    }
  }

  // Omit the optional distance argument to avoid simplifying the boundary again.
  const polygon = polygonFromPoints(
    pointsOnBezierCurves(bezierPoints, 0.5) as LocalPoint[],
  );
  freedrawFillPolygonCache.set(element, { version: element.version, polygon });

  return polygon;
};

export const generateLinearCollisionShape = (
  element: ExcalidrawLinearElement | ExcalidrawFreeDrawElement,
  elementsMap: ElementsMap,
): {
  op: string;
  data: number[];
}[] => {
  const generator = new RoughGenerator();
  const options: Options = {
    seed: element.seed,
    disableMultiStroke: true,
    disableMultiStrokeFill: true,
    roughness: 0,
    preserveVertices: true,
  };
  const center = elementCenterPoint(element, elementsMap);

  switch (element.type) {
    case "line":
    case "arrow": {
      // points array can be empty in the beginning, so it is important to add
      // initial position to it
      const points = element.points.length
        ? element.points
        : [pointFrom<LocalPoint>(0, 0)];

      if (isElbowArrow(element)) {
        return generator.path(generateElbowArrowShape(points, 16), options)
          .sets[0].ops;
      } else if (!element.roundness) {
        return points.map((point, idx) => {
          const p = pointRotateRads(
            pointFrom<GlobalPoint>(element.x + point[0], element.y + point[1]),
            center,
            element.angle,
          );

          return {
            op: idx === 0 ? "move" : "lineTo",
            data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
          };
        });
      }

      return generator
        .curve(points as unknown as RoughPoint[], options)
        .sets[0].ops.slice(0, element.points.length)
        .map((op, i) => {
          if (i === 0) {
            const p = pointRotateRads<GlobalPoint>(
              pointFrom<GlobalPoint>(
                element.x + op.data[0],
                element.y + op.data[1],
              ),
              center,
              element.angle,
            );

            return {
              op: "move",
              data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
            };
          }

          return {
            op: "bcurveTo",
            data: [
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[0],
                  element.y + op.data[1],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[2],
                  element.y + op.data[3],
                ),
                center,
                element.angle,
              ),
              pointRotateRads(
                pointFrom<GlobalPoint>(
                  element.x + op.data[4],
                  element.y + op.data[5],
                ),
                center,
                element.angle,
              ),
            ]
              .map((p) =>
                pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
              )
              .flat(),
          };
        });
    }
    case "freedraw": {
      const outlinePoints = getFreedrawOutlinePoints(element);

      if (outlinePoints.length < 2) {
        return [];
      }

      const collisionOutline =
        element.strokeOptions?.variability === "constant"
          ? (simplify(
              outlinePoints as Mutable<LocalPoint[]>,
              CONSTANT_WIDTH_FREEDRAW.COLLISION_SIMPLIFY_TOLERANCE,
            ) as [number, number][])
          : outlinePoints;

      if (collisionOutline.length < 2) {
        return [];
      }

      // Close the outline polygon so its boundary never has a gap at the seam.
      const [firstX, firstY] = collisionOutline[0];
      const [lastX, lastY] = collisionOutline[collisionOutline.length - 1];
      const closedOutline =
        firstX === lastX && firstY === lastY
          ? collisionOutline
          : [...collisionOutline, collisionOutline[0]];

      return closedOutline.map((point, idx) => {
        const p = pointRotateRads<GlobalPoint>(
          pointFrom<GlobalPoint>(element.x + point[0], element.y + point[1]),
          center,
          element.angle,
        );

        return {
          op: idx === 0 ? "move" : "lineTo",
          data: pointFrom<LocalPoint>(p[0] - element.x, p[1] - element.y),
        };
      });
    }
  }
};

/**
 * Generates the roughjs shape for given element.
 *
 * Low-level. Use `ShapeCache.generateElementShape` instead.
 *
 * @private
 */
const _generateElementShape = (
  element: Exclude<ExcalidrawElement, ExcalidrawSelectionElement>,
  generator: RoughGenerator,
  {
    isExporting,
    canvasBackgroundColor,
    embedsValidationStatus,
    theme,
  }: {
    isExporting: boolean;
    canvasBackgroundColor: string;
    embedsValidationStatus: EmbedsValidationStatus | null;
    theme?: AppState["theme"];
  },
): ElementShape => {
  const isDarkMode = theme === THEME.DARK;
  if ((window as any)?._generateElementShapeHook) {
    const shape = (window as any)?._generateElementShapeHook(
      element,
      generator,
      isExporting,
      generateRoughOptions,
    );
    if (shape) return shape;
  }
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable": {
      let shape: ElementShapes[typeof element.type];
      // this is for rendering the stroke/bg of the embeddable, especially
      // when the src url is not set

      if (element.roundness) {
        const w = element.width;
        const h = element.height;
        const r = getCornerRadius(Math.min(w, h), element);
        const options = generateRoughOptions(
          modifyIframeLikeForRoughOptions(
            element,
            isExporting,
            embedsValidationStatus,
          ),
          true,
          isDarkMode,
        );
        // @ts-ignore
        if (element.roundness.value && element.roundness?.roundType === "arc") {
          //ymjr
          shape = generator.path(
            `
          M ${r} 0
          H ${w - r}
          A ${r} ${r} 0 0 1 ${w} ${r}
          V ${h - r}
          A ${r} ${r} 0 0 1 ${w - r} ${h}
          H ${r}
          A ${r} ${r} 0 0 1 0 ${h - r}
          V ${r}
          A ${r} ${r} 0 0 1 ${r} 0
          Z
          `
              .replace(/\s+/g, " ")
              .trim(),
            options,
          );
        } else {
          shape = generator.path(
            `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${
              h - r
            } Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${
              h - r
            } L 0 ${r} Q 0 0, ${r} 0`,
            options,
          );
        }
      } else {
        shape = generator.rectangle(
          0,
          0,
          element.width,
          element.height,
          generateRoughOptions(
            modifyIframeLikeForRoughOptions(
              element,
              isExporting,
              embedsValidationStatus,
            ),
            false,
            isDarkMode,
          ),
        );
      }
      return shape;
    }
    case "diamond": {
      let shape: ElementShapes[typeof element.type];

      const [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY] =
        getDiamondPoints(element);
      if (element.roundness) {
        const verticalRadius = getCornerRadius(Math.abs(topX - leftX), element);

        const horizontalRadius = getCornerRadius(
          Math.abs(rightY - topY),
          element,
        );

        shape = generator.path(
          `M ${topX + verticalRadius} ${topY + horizontalRadius} L ${
            rightX - verticalRadius
          } ${rightY - horizontalRadius}
            C ${rightX} ${rightY}, ${rightX} ${rightY}, ${
            rightX - verticalRadius
          } ${rightY + horizontalRadius}
            L ${bottomX + verticalRadius} ${bottomY - horizontalRadius}
            C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${
            bottomX - verticalRadius
          } ${bottomY - horizontalRadius}
            L ${leftX + verticalRadius} ${leftY + horizontalRadius}
            C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + verticalRadius} ${
            leftY - horizontalRadius
          }
            L ${topX - verticalRadius} ${topY + horizontalRadius}
            C ${topX} ${topY}, ${topX} ${topY}, ${topX + verticalRadius} ${
            topY + horizontalRadius
          }`,
          generateRoughOptions(element, true, isDarkMode),
        );
      } else {
        shape = generator.polygon(
          [
            [topX, topY],
            [rightX, rightY],
            [bottomX, bottomY],
            [leftX, leftY],
          ],
          generateRoughOptions(element, false, isDarkMode),
        );
      }
      return shape;
    }
    case "ellipse": {
      const shape: ElementShapes[typeof element.type] = generator.ellipse(
        element.width / 2,
        element.height / 2,
        element.width,
        element.height,
        generateRoughOptions(element, false, isDarkMode),
      );
      return shape;
    }
    case "line":
    case "arrow": {
      let shape: ElementShapes[typeof element.type];
      const options = generateRoughOptions(element, false, isDarkMode);

      // points array can be empty in the beginning, so it is important to add
      // initial position to it
      const points = element.points.length
        ? element.points
        : [pointFrom<LocalPoint>(0, 0)];
      if (element.type === "arrow" && element.customData?.curveArrow) {
        const p0 = points[0];
        const p3 = points[points.length - 1]; // Endpoint

        // ymjr: Calculate dx/dy relative to p0 (in case p0 is not at 0,0)
        const dx = p3[0] - p0[0];
        const dy = p3[1] - p0[1];
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 1. Determine direction
        const defaultStartDir: [number, number] =
          Math.abs(dx) > Math.abs(dy)
            ? [dx > 0 ? 1 : -1, 0]
            : [0, dy > 0 ? 1 : -1];
        const defaultEndDir: [number, number] =
          Math.abs(dx) > Math.abs(dy)
            ? [dx > 0 ? -1 : 1, 0]
            : [0, dy > 0 ? -1 : 1];

        const startDir = getBindingDirection(
          element.startBinding?.fixedPoint,
          defaultStartDir,
        );
        const endDir = getBindingDirection(
          element.endBinding?.fixedPoint,
          defaultEndDir,
        );

        // 2. Compute control point length (prevents S-curve over-expansion)
        // Obtain single-axis distance for start and end along respective emission directions
        const startDist = startDir[0] !== 0 ? Math.abs(dx) : Math.abs(dy);
        const endDist = endDir[0] !== 0 ? Math.abs(dx) : Math.abs(dy);

        // Use 0.5x axial distance as control point length.
        // Control points meet at midpoint between nodes for smooth S-curve
        const lenStart = Math.max(Math.min(startDist * 0.5, 300), 30);
        const lenEnd = Math.max(Math.min(endDist * 0.5, 300), 30);

        const p1 = [
          p0[0] + startDir[0] * lenStart,
          p0[1] + startDir[1] * lenStart,
        ];
        const p2 = [p3[0] + endDir[0] * lenEnd, p3[1] + endDir[1] * lenEnd];

        // --- ymjr: Tangent angle calculation ---
        // Precompute tangent angles at start and end points
        const startAngle = Math.atan2(p0[1] - p1[1], p0[0] - p1[0]);
        const endAngle = Math.atan2(p3[1] - p2[1], p3[0] - p2[0]);

        const arrowLen = 20; // Arrowhead length
        const arrowWidth = 10; // Arrowhead width
        const inset = 16; // Line inset: ends cleanly inside 20px arrowhead

        // Calculate actual start and end of inset line
        let lineStartX = p0[0];
        let lineStartY = p0[1];
        let lineEndX = p3[0];
        let lineEndY = p3[1];

        if (element.startArrowhead) {
          lineStartX = p0[0] - inset * Math.cos(startAngle);
          lineStartY = p0[1] - inset * Math.sin(startAngle);
        }
        if (element.endArrowhead) {
          lineEndX = p3[0] - inset * Math.cos(endAngle);
          lineEndY = p3[1] - inset * Math.sin(endAngle);
        }

        // 3. Generate inset SVG Path (line ends cleanly on arrowhead centerline)
        const pathData = `M ${lineStartX} ${lineStartY} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${lineEndX} ${lineEndY}`;

        // 4. Create main path shape
        shape = [generator.path(pathData, generateRoughOptions(element, true))];

        // 5. Manual arrowhead rendering (arrowhead tip remains at original p0/p3)
        if (element.endArrowhead) {
          const backX = p3[0] - arrowLen * Math.cos(endAngle);
          const backY = p3[1] - arrowLen * Math.sin(endAngle);
          const perp = endAngle + Math.PI / 2;
          const wX = arrowWidth * Math.cos(perp);
          const wY = arrowWidth * Math.sin(perp);

          const arrowPoints = [
            [p3[0], p3[1]], // Tip
            [backX - wX, backY - wY], // Left wing
            [backX + wX, backY + wY], // Right wing
            [p3[0], p3[1]], // Close
          ];
          shape.push(
            generator.polygon(arrowPoints as unknown as RoughPoint[], {
              ...options,
              fill: element.strokeColor,
              fillStyle: "solid",
              stroke: "none",
            }),
          );
        }

        if (element.startArrowhead) {
          const backX = p0[0] - arrowLen * Math.cos(startAngle);
          const backY = p0[1] - arrowLen * Math.sin(startAngle);
          const perp = startAngle + Math.PI / 2;
          const wX = arrowWidth * Math.cos(perp);
          const wY = arrowWidth * Math.sin(perp);

          const arrowPoints = [
            [p0[0], p0[1]],
            [backX - wX, backY - wY],
            [backX + wX, backY + wY],
            [p0[0], p0[1]],
          ];
          shape.push(
            generator.polygon(arrowPoints as unknown as RoughPoint[], {
              ...options,
              fill: element.strokeColor,
              fillStyle: "solid",
              stroke: "none",
            }),
          );
        }

        (shape as any).svgPathStr = pathData;
        return shape;
      } else if (
        element.type === "arrow" &&
        (element.endArrowhead?.startsWith("block_arrow") ||
          element.startArrowhead?.startsWith("block_arrow"))
      ) {
        // ymjr: Closed multi-point block arrow (preserves curve fidelity & supports custom width)

        // 1. Check if curve mode (Roundness) is enabled
        let workingPoints = points;
        if (element.roundness && points.length > 2) {
          workingPoints = [points[0]];
          for (let i = 0; i < points.length - 1; i++) {
            const p0 = i === 0 ? points[0] : points[i - 1];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = i + 2 < points.length ? points[i + 2] : p2;

            const segments = 15;
            for (let t = 1; t <= segments; t++) {
              const t1 = t / segments;
              const t2 = t1 * t1;
              const t3 = t2 * t1;
              const x =
                0.5 *
                (2 * p1[0] +
                  (-p0[0] + p2[0]) * t1 +
                  (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
                  (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
              const y =
                0.5 *
                (2 * p1[1] +
                  (-p0[1] + p2[1]) * t1 +
                  (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
                  (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
              //@ts-ignore
              workingPoints.push([x, y]);
            }
          }
        }

        // 2. Filter duplicate points and compute total length
        const validPoints: [number, number][] = [workingPoints[0]];
        let totalLen = 0;
        for (let i = 1; i < workingPoints.length; i++) {
          const prev = validPoints[validPoints.length - 1];
          const curr = workingPoints[i];
          const dist = Math.sqrt(
            (curr[0] - prev[0]) ** 2 + (curr[1] - prev[1]) ** 2,
          );
          if (dist > 1) {
            validPoints.push(curr);
            totalLen += dist;
          }
        }
        if (validPoints.length < 2)
          validPoints.push([validPoints[0][0] + 10, validPoints[0][1] + 10]);

        // 3. Read custom width & compute proportions
        // Supports blockArrowWidth or arrowHeadLineWidth in customData
        const customWidth =
          element.customData?.blockArrowWidth ||
          element.customData?.arrowHeadLineWidth;
        const shaftThickness = customWidth
          ? Number(customWidth)
          : Math.max(16, element.strokeWidth * 6);
        const headWidth = shaftThickness * 2.5;

        const isStartBlock = element.startArrowhead?.startsWith("block_arrow");
        const isEndBlock = element.endArrowhead?.startsWith("block_arrow");

        // Cap arrowhead length at 45% of total length to prevent overlap
        const startHeadLen = isStartBlock
          ? Math.min(headWidth * 0.8, totalLen * 0.45)
          : 0;
        const endHeadLen = isEndBlock
          ? Math.min(headWidth * 0.8, totalLen * 0.45)
          : 0;

        // 4. Path trimming: trim arrowhead portions, leaving pure shaft path
        const shaftPoints: [number, number][] = [];
        let currentDist = 0;
        let addedStart = false;

        if (startHeadLen >= totalLen - endHeadLen) {
          // Edge case: extremely short segment degenerates to center point
          const midX =
            (validPoints[0][0] + validPoints[validPoints.length - 1][0]) / 2;
          const midY =
            (validPoints[0][1] + validPoints[validPoints.length - 1][1]) / 2;
          shaftPoints.push([midX, midY], [midX + 0.1, midY + 0.1]);
        } else {
          for (let i = 0; i < validPoints.length - 1; i++) {
            const p1 = validPoints[i];
            const p2 = validPoints[i + 1];
            const dx = p2[0] - p1[0];
            const dy = p2[1] - p1[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            const nextDist = currentDist + len;

            // Find shaft start
            if (!addedStart && nextDist >= startHeadLen) {
              const ratio = (startHeadLen - currentDist) / len;
              shaftPoints.push([p1[0] + dx * ratio, p1[1] + dy * ratio]);
              addedStart = true;
            }
            // Collect intermediate points
            if (
              addedStart &&
              nextDist > startHeadLen &&
              nextDist < totalLen - endHeadLen
            ) {
              shaftPoints.push(p2);
            }
            // Find shaft end
            if (addedStart && nextDist >= totalLen - endHeadLen) {
              const ratio = (totalLen - endHeadLen - currentDist) / len;
              shaftPoints.push([p1[0] + dx * ratio, p1[1] + dy * ratio]);
              break;
            }
            currentDist = nextDist;
          }
        }
        if (shaftPoints.length < 2)
          shaftPoints.push(validPoints[0], validPoints[validPoints.length - 1]);

        // 5. Compute left and right shaft offsets (polyline offsetting)
        const leftShaft: [number, number][] = [];
        const rightShaft: [number, number][] = [];
        const w = shaftThickness / 2;
        const sn = shaftPoints.length - 1;

        const sNormals: [number, number][] = [];
        for (let i = 0; i < sn; i++) {
          const dx = shaftPoints[i + 1][0] - shaftPoints[i][0];
          const dy = shaftPoints[i + 1][1] - shaftPoints[i][1];
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          sNormals.push([-dy / len, dx / len]);
        }

        for (let i = 0; i <= sn; i++) {
          if (i === 0) {
            leftShaft.push([
              shaftPoints[0][0] + sNormals[0][0] * w,
              shaftPoints[0][1] + sNormals[0][1] * w,
            ]);
            rightShaft.push([
              shaftPoints[0][0] - sNormals[0][0] * w,
              shaftPoints[0][1] - sNormals[0][1] * w,
            ]);
          } else if (i === sn) {
            leftShaft.push([
              shaftPoints[sn][0] + sNormals[sn - 1][0] * w,
              shaftPoints[sn][1] + sNormals[sn - 1][1] * w,
            ]);
            rightShaft.push([
              shaftPoints[sn][0] - sNormals[sn - 1][0] * w,
              shaftPoints[sn][1] - sNormals[sn - 1][1] * w,
            ]);
          } else {
            const n1 = sNormals[i - 1];
            const n2 = sNormals[i];
            let mx = n1[0] + n2[0];
            let my = n1[1] + n2[1];
            const mLen = Math.sqrt(mx * mx + my * my);
            if (mLen < 0.1) {
              leftShaft.push([
                shaftPoints[i][0] + n1[0] * w,
                shaftPoints[i][1] + n1[1] * w,
              ]);
              rightShaft.push([
                shaftPoints[i][0] - n1[0] * w,
                shaftPoints[i][1] - n1[1] * w,
              ]);
            } else {
              const miterDist = Math.min(
                w / ((mx * n1[0] + my * n1[1]) / mLen),
                w * 2,
              );
              leftShaft.push([
                shaftPoints[i][0] + (mx / mLen) * miterDist,
                shaftPoints[i][1] + (my / mLen) * miterDist,
              ]);
              rightShaft.push([
                shaftPoints[i][0] - (mx / mLen) * miterDist,
                shaftPoints[i][1] - (my / mLen) * miterDist,
              ]);
            }
          }
        }

        // 6. Assemble final polygon
        const arrowPoints: [number, number][] = [];

        // --- Start arrowhead ---
        if (isStartBlock) {
          const tip = validPoints[0];
          const base = shaftPoints[0];
          const len =
            Math.sqrt((tip[0] - base[0]) ** 2 + (tip[1] - base[1]) ** 2) || 1;
          const normal = [-(tip[1] - base[1]) / len, (tip[0] - base[0]) / len];
          arrowPoints.push(tip);
          // ymjr: Start vector (tip-base) opposes shaft direction; subtract normal to transition to leftShaft
          arrowPoints.push([
            base[0] - (normal[0] * headWidth) / 2,
            base[1] - (normal[1] * headWidth) / 2,
          ]);
        }

        // --- Left shaft ---
        for (let i = 0; i <= sn; i++) arrowPoints.push(leftShaft[i]);

        // --- End arrowhead ---
        if (isEndBlock) {
          const tip = validPoints[validPoints.length - 1];
          const base = shaftPoints[sn];
          const len =
            Math.sqrt((tip[0] - base[0]) ** 2 + (tip[1] - base[1]) ** 2) || 1;
          const normal = [-(tip[1] - base[1]) / len, (tip[0] - base[0]) / len];
          arrowPoints.push([
            base[0] + (normal[0] * headWidth) / 2,
            base[1] + (normal[1] * headWidth) / 2,
          ]);
          arrowPoints.push(tip);
          arrowPoints.push([
            base[0] - (normal[0] * headWidth) / 2,
            base[1] - (normal[1] * headWidth) / 2,
          ]);
        }

        // --- Right shaft (reverse order) ---
        for (let i = sn; i >= 0; i--) arrowPoints.push(rightShaft[i]);

        // --- Close start arrowhead right wing ---
        if (isStartBlock) {
          const tip = validPoints[0];
          const base = shaftPoints[0];
          const len =
            Math.sqrt((tip[0] - base[0]) ** 2 + (tip[1] - base[1]) ** 2) || 1;
          const normal = [-(tip[1] - base[1]) / len, (tip[0] - base[0]) / len];
          // ymjr: Close back from rightShaft by adding normal vector (+)
          arrowPoints.push([
            base[0] + (normal[0] * headWidth) / 2,
            base[1] + (normal[1] * headWidth) / 2,
          ]);
        }
        arrowPoints.push(arrowPoints[0]);

        // 7. Render
        const isOutline =
          element.endArrowhead === "block_arrow_outline" ||
          element.startArrowhead === "block_arrow_outline";
        shape = [
          generator.polygon(arrowPoints as unknown as RoughPoint[], {
            ...options,
            fill: isOutline ? canvasBackgroundColor : element.strokeColor,
            fillStyle: "solid",
            stroke: element.strokeColor,
            strokeWidth: element.strokeWidth,
            roughness: Math.min(0.5, options.roughness || 0),
          }),
        ];

        return shape;
      } else if (isElbowArrow(element)) {
        // NOTE (mtolmacs): Temporary fix for extremely big arrow shapes
        if (
          !points.every(
            (point) => Math.abs(point[0]) <= 1e6 && Math.abs(point[1]) <= 1e6,
          )
        ) {
          console.error(
            `Elbow arrow with extreme point positions detected. Arrow not rendered.`,
            element.id,
            JSON.stringify(points),
          );
          shape = [];
        } else {
          shape = [
            generator.path(
              generateElbowArrowShape(points, element.roundness?.value ?? 16), //ymjr
              generateRoughOptions(element, true, isDarkMode),
            ),
          ];
        }
      } else if (!element.roundness) {
        // curve is always the first element
        // this simplifies finding the curve for an element
        if (options.fill) {
          shape = [
            generator.polygon(points as unknown as RoughPoint[], options),
          ];
        } else {
          shape = [
            generator.linearPath(points as unknown as RoughPoint[], options),
          ];
        }
      } else {
        shape = [generator.curve(points as unknown as RoughPoint[], options)];
      }
      if (element?.customData?.svgPathShape) {
        const pathStr = element.customData.svgPathShape as string;

        // 1. Generate base shape
        const roughShape = generator.path(
          pathStr,
          generateRoughOptions(
            modifyIframeLikeForRoughOptions(
              element,
              isExporting,
              embedsValidationStatus,
            ),
            Boolean(element.roundness),
          ),
        );

        // ---------------------------------------------------------------
        // ymjr: Fix binding displacement and flip scaling
        // ---------------------------------------------------------------
        const { width, height } = element;
        const viewBox = element.customData?.svgViewBox;

        let scaleX = 1;
        let scaleY = 1;
        let offsetX = 0;
        let offsetY = 0;

        // ymjr: Read flip state
        const flipX = element.customData?.scaleX ?? 1;
        const flipY = element.customData?.scaleY ?? 1;

        if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
          scaleX = width / viewBox.width;
          scaleY = height / viewBox.height;
        } else {
          let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

          roughShape.sets.forEach((set) => {
            set.ops.forEach((op) => {
              for (let i = 0; i < op.data.length; i += 2) {
                const x = op.data[i];
                const y = op.data[i + 1];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
              }
            });
          });

          const initialWidth = maxX - minX;
          const initialHeight = maxY - minY;

          if (initialWidth > 0 && initialHeight > 0) {
            scaleX = width / initialWidth;
            scaleY = height / initialHeight;
            offsetX = 0;
            offsetY = 0;
          }
        }

        // ymjr: Combine flip factor with scale and translation compensation
        const finalScaleX = scaleX * flipX;
        const finalScaleY = scaleY * flipY;
        const translateX = flipX < 0 ? width : 0;
        const translateY = flipY < 0 ? height : 0;

        // ymjr: Apply transform with translateX and translateY
        if (
          finalScaleX !== 1 ||
          finalScaleY !== 1 ||
          offsetX !== 0 ||
          offsetY !== 0 ||
          translateX !== 0 ||
          translateY !== 0
        ) {
          roughShape.sets.forEach((set) => {
            set.ops.forEach((op) => {
              for (let i = 0; i < op.data.length; i += 2) {
                // Transformation: apply final scale and flip compensation
                op.data[i] = (op.data[i] - offsetX) * finalScaleX + translateX;
                op.data[i + 1] =
                  (op.data[i + 1] - offsetY) * finalScaleY + translateY;
              }
            });
          });
        }
        // ---------------------------------------------------------------

        shape = [roughShape];
        (shape as any).svgPathStr = pathStr;
      }

      // add lines only in arrow
      if (element.type === "arrow") {
        const { startArrowhead = null, endArrowhead = "arrow" } = element;

        if (startArrowhead !== null) {
          const shapes = getArrowheadShapes(
            element,
            shape,
            "start",
            startArrowhead,
            generator,
            options,
            canvasBackgroundColor,
            isDarkMode,
          );
          shape.push(...shapes);
        }

        if (endArrowhead !== null) {
          if (endArrowhead === undefined) {
            // Hey, we have an old arrow here!
          }

          const shapes = getArrowheadShapes(
            element,
            shape,
            "end",
            endArrowhead,
            generator,
            options,
            canvasBackgroundColor,
            isDarkMode,
          );
          shape.push(...shapes);
        }
      }
      return shape;
    }
    case "freedraw": {
      // oredered in terms of z-index [background, stroke]
      const shapes: ElementShapes[typeof element.type] = [];

      // (1) background fill (rc shape), optional
      if (isPathALoop(element.points)) {
        // generate rough polygon to fill freedraw shape
        shapes.push(
          generator.curve(getFreedrawFillCurvePoints(element), {
            ...generateRoughOptions(element, false, isDarkMode),
            stroke: "none",
          }),
        );
      }

      // (2) stroke
      shapes.push(getFreeDrawSvgPath(element));

      return shapes;
    }
    // sticky notes are painted directly (canvas + SVG) from
    // `getStickyNoteRenderPoints`, never through roughjs
    case "stickynote":
    case "frame":
    case "magicframe":
    case "text":
    case "image": {
      const shape: ElementShapes[typeof element.type] = null;
      // we return (and cache) `null` to make sure we don't regenerate
      // `element.canvas` on rerenders
      return shape;
    }
    default: {
      assertNever(
        element,
        `generateElementShape(): Unimplemented type ${(element as any)?.type}`,
      );
      return null;
    }
  }
};

const generateElbowArrowShape = (
  points: readonly LocalPoint[],
  radius: number,
) => {
  const subpoints = [] as [number, number][];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const next = points[i + 1];
    const point = points[i];
    const prevIsHorizontal = headingForPointIsHorizontal(point, prev);
    const nextIsHorizontal = headingForPointIsHorizontal(next, point);
    const corner = Math.min(
      radius,
      pointDistance(points[i], next) / 2,
      pointDistance(points[i], prev) / 2,
    );

    if (prevIsHorizontal) {
      if (prev[0] < point[0]) {
        // LEFT
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        // RIGHT
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (prev[1] < point[1]) {
      // UP
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      subpoints.push([points[i][0], points[i][1] + corner]);
    }

    subpoints.push(points[i] as [number, number]);

    if (nextIsHorizontal) {
      if (next[0] < point[0]) {
        // LEFT
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        // RIGHT
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (next[1] < point[1]) {
      // UP
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      // DOWN
      subpoints.push([points[i][0], points[i][1] + corner]);
    }
  }

  const d = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 0; i < subpoints.length; i += 3) {
    d.push(`L ${subpoints[i][0]} ${subpoints[i][1]}`);
    d.push(
      `Q ${subpoints[i + 1][0]} ${subpoints[i + 1][1]}, ${
        subpoints[i + 2][0]
      } ${subpoints[i + 2][1]}`,
    );
  }
  d.push(`L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`);

  return d.join(" ");
};

/**
 * get the pure geometric shape of an excalidraw elementw
 * which is then used for hit detection
 */
export const getElementShape = <Point extends GlobalPoint | LocalPoint>(
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
): GeometricShape<Point> => {
  switch (element.type) {
    case "rectangle":
    case "stickynote":
    case "diamond":
    case "frame":
    case "magicframe":
    case "embeddable":
    case "image":
    case "iframe":
    case "text":
    case "selection":
      return getPolygonShape(element);
    case "arrow":
    case "line": {
      const roughShape = ShapeCache.generateElementShape(element, null)[0];
      const [, , , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);

      return shouldTestInside(element)
        ? getClosedCurveShape<Point>(
            element,
            roughShape,
            pointFrom<Point>(element.x, element.y),
            element.angle,
            pointFrom(cx, cy),
          )
        : getCurveShape<Point>(
            roughShape,
            pointFrom<Point>(element.x, element.y),
            element.angle,
            pointFrom(cx, cy),
          );
    }

    case "ellipse":
      return getEllipseShape(element);

    case "freedraw": {
      const [, , , , cx, cy] = getElementAbsoluteCoords(element, elementsMap);
      return getFreedrawShape(
        element,
        pointFrom(cx, cy),
        shouldTestInside(element),
      );
    }
  }
};

export const toggleLinePolygonState = (
  element: ExcalidrawLineElement,
  nextPolygonState: boolean,
): {
  polygon: ExcalidrawLineElement["polygon"];
  points: ExcalidrawLineElement["points"];
} | null => {
  const updatedPoints = [...element.points];

  if (nextPolygonState) {
    if (!canBecomePolygon(element.points)) {
      return null;
    }

    const firstPoint = updatedPoints[0];
    const lastPoint = updatedPoints[updatedPoints.length - 1];

    const distance = Math.hypot(
      firstPoint[0] - lastPoint[0],
      firstPoint[1] - lastPoint[1],
    );

    if (
      distance > LINE_POLYGON_POINT_MERGE_DISTANCE ||
      updatedPoints.length < 4
    ) {
      updatedPoints.push(pointFrom(firstPoint[0], firstPoint[1]));
    } else {
      updatedPoints[updatedPoints.length - 1] = pointFrom(
        firstPoint[0],
        firstPoint[1],
      );
    }
  }

  // TODO: satisfies ElementUpdate<ExcalidrawLineElement>
  const ret = {
    polygon: nextPolygonState,
    points: updatedPoints,
  };

  return ret;
};

const getBindingDirection = (
  fixedPoint: [number, number] | null | undefined,
  defaultDir: [number, number],
): [number, number] => {
  if (!fixedPoint) return defaultDir;

  const [x, y] = fixedPoint;
  // 4-side direction classification (X-partition)
  // Geometric partition for general binding orientation
  const distL = x;
  const distR = 1 - x;
  const distT = y;
  const distB = 1 - y;
  const min = Math.min(distL, distR, distT, distB);

  if (min === distL) return [-1, 0]; // Left: extend left
  if (min === distR) return [1, 0]; // Right: extend right
  if (min === distT) return [0, -1]; // Top: extend up
  if (min === distB) return [0, 1]; // Bottom: extend down
  return defaultDir;
};

// -----------------------------------------------------------------------------
//                         freedraw shape helper
// -----------------------------------------------------------------------------

// NOTE not cached (-> for SVG export)
const getFreeDrawSvgPath = (element: ExcalidrawFreeDrawElement) => {
  return getSvgPathFromStroke(
    getFreedrawOutlinePoints(element),
  ) as SVGPathString;
};

/**
 * Freedraw stroke geometry tuning constants.
 *
 * These factors are not derived analytically — they were tuned empirically by
 * visually comparing rendered strokes until they matched the desired feel.
 * Treat them as magic numbers backed by visual verification.
 */
const VARIABLE_WIDTH_FREEDRAW = {
  /** Stroke size relative to `strokeWidth` for pressure-sensitive strokes. */
  SIZE_FACTOR: 4.25,
  THINNING: 0.6,
  SMOOTHING: 0.5,
} as const;

const CONSTANT_WIDTH_FREEDRAW = {
  /** Stroke size relative to `strokeWidth` for uniform (laser) strokes. */
  SIZE_FACTOR: 1.4,
  /**
   * Max deviation (px) when dropping vertices of the dense laser outline for
   * collision. Perfect-freehand outlines are already thinned by `smoothing`.
   */
  COLLISION_SIMPLIFY_TOLERANCE: 0.2,
} as const;

const getFreedrawStreamline = (element: ExcalidrawFreeDrawElement) =>
  element.strokeOptions?.streamline ?? DEFAULT_STROKE_STREAMLINE;

/**
 * Pressure-sensitive (variable width) freedraw outline, rendered with
 * perfect-freehand. This is the original Excalidraw freedraw look.
 */
const getVariableWidthFreedrawOutline = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  // If input points are empty (should they ever be?) return a dot
  const inputPoints = element.simulatePressure
    ? element.points
    : element.points.length
    ? element.points.map(
        ([x, y], i) => [x, y, element.pressures[i]] as [number, number, number],
      )
    : [[0, 0, 0.5]];

  return getStroke(inputPoints as number[][], {
    simulatePressure: element.simulatePressure,
    size: element.strokeWidth * VARIABLE_WIDTH_FREEDRAW.SIZE_FACTOR,
    thinning: VARIABLE_WIDTH_FREEDRAW.THINNING,
    smoothing: VARIABLE_WIDTH_FREEDRAW.SMOOTHING,
    streamline: getFreedrawStreamline(element),
    easing: (t) => Math.sin((t * Math.PI) / 2), // https://easings.net/#easeOutSine
    last: true,
  }) as [number, number][];
};

const createLaserPointer = (element: ExcalidrawFreeDrawElement) =>
  new LaserPointer({
    size: element.strokeWidth * CONSTANT_WIDTH_FREEDRAW.SIZE_FACTOR,
    streamline: getFreedrawStreamline(element),
    simplify: 0,
    sizeMapping: (details) => Math.max(0.1, details.pressure),
  });

/**
 * Uniform (constant width) freedraw outline, rendered with the laser-pointer
 * geometry. Pressure is pinned to 1 so the stroke keeps a constant width.
 */
const getConstantWidthFreedrawOutline = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  const laserPointer = createLaserPointer(element);
  element.points.map(([x, y]) => laserPointer.addPoint([x, y, 1]));

  return laserPointer
    .getStrokeOutline()
    .map(([x, y]) => [x, y] as [number, number]);
};

export const getFreedrawOutlinePoints = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] => {
  // Unknown/absent variability falls back to the original variable rendering.
  return element.strokeOptions?.variability === "constant"
    ? getConstantWidthFreedrawOutline(element)
    : getVariableWidthFreedrawOutline(element);
};

/**
 * Upper bound on how far a freedraw stroke's ink reaches past its centerline
 * points. Both stroke generators scale the stroke size by at most 1 (easing
 * or pressure), so the size itself bounds the radius, except for
 * perfect-freehand's short strokes: under 3px long, the start cap is drawn
 * around the first point from an outline point of the last one (reaching
 * sqrt(size² + 3²)), and a single point gets a synthetic neighbor 1px away.
 */
export const getFreedrawMaxStrokeRadius = (
  element: ExcalidrawFreeDrawElement,
) =>
  element.strokeOptions?.variability === "constant"
    ? element.strokeWidth * CONSTANT_WIDTH_FREEDRAW.SIZE_FACTOR
    : element.strokeWidth * VARIABLE_WIDTH_FREEDRAW.SIZE_FACTOR + 3;

/**
 * The streamline-smoothed centerline the freedraw stroke is rendered
 * around, in element-local coordinates. Boundary-sensitive consumers (e.g.
 * bucket fill) should use this instead of `element.points`: raw input
 * points can sit 20px+ apart and the rendered stroke is smoothed between
 * them, so raw chords visibly deviate from what's on screen.
 *
 * Constant-width ("laser geometry") strokes technically smooth via
 * `LaserPointer` instead; the perfect-freehand centerline with the same
 * `streamline` is a close approximation the stroke width hides.
 */
export const getFreedrawStrokeCenterPoints = (
  element: ExcalidrawFreeDrawElement,
): [number, number][] =>
  getStrokePoints(element.points as unknown as number[][], {
    size: element.strokeWidth * VARIABLE_WIDTH_FREEDRAW.SIZE_FACTOR,
    streamline: getFreedrawStreamline(element),
    last: true,
  }).map((strokePoint) => strokePoint.point as [number, number]);

const med = (A: number[], B: number[]) => {
  return [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
};

// Trim SVG path data so number are each two decimal points. This
// improves SVG exports, and prevents rendering errors on points
// with long decimals.
const TO_FIXED_PRECISION = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g;

const getSvgPathFromStroke = (points: number[][]): string => {
  if (!points.length) {
    return "";
  }

  const max = points.length - 1;

  return points
    .reduce(
      (acc, point, i, arr) => {
        if (i === max) {
          acc.push(point, med(point, arr[0]), "L", arr[0], "Z");
        } else {
          acc.push(point, med(point, arr[i + 1]));
        }
        return acc;
      },
      ["M", points[0], "Q"],
    )
    .join(" ")
    .replace(TO_FIXED_PRECISION, "$1");
};

// -----------------------------------------------------------------------------
