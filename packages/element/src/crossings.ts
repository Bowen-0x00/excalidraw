import {
  pointFrom,
  pointDistance,
  type LocalPoint,
  type GlobalPoint,
  pointRotateRads,
  type Radians,
} from "@excalidraw/math";
import { getElementAbsoluteCoords } from "./bounds";
import { isArrowElement, isLinearElement } from "./typeChecks";
import type {
  ExcalidrawElement,
  ExcalidrawLinearElement,
  ElementsMap,
  NonDeletedSceneElementsMap,
} from "./types";
import { ShapeCache } from "./shape";

export type LineCrossingMode = "none" | "arc" | "gap" | "dot";

export type CrossingType = "cross" | "t-junction";

export interface CrossingPoint {
  localPoint: [number, number];
  globalPoint: [number, number];
  segmentIndex: number;
  t: number; // 0..1 along the segment
  otherElementId: string;
  crossingType: CrossingType;
  isOver: boolean;
}

const ENDPOINT_THRESHOLD = 8; // px - distance from endpoint to treat as T-junction
const JUMP_RADIUS = 8; // px - radius of the jump arc or gap half-width
const MIN_CROSSING_DISTANCE = 4; // px - ignore crossings too close to segment corners

/**
 * Robust 2D segment-segment intersection test.
 * Returns intersection point and parameters t (along segA) and u (along segB).
 */
export const findSegmentIntersection = (
  a0: [number, number],
  a1: [number, number],
  b0: [number, number],
  b1: [number, number],
): { point: [number, number]; t: number; u: number } | null => {
  const rx = a1[0] - a0[0];
  const ry = a1[1] - a0[1];
  const sx = b1[0] - b0[0];
  const sy = b1[1] - b0[1];

  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) {
    return null; // Parallel or collinear
  }

  const dx = b0[0] - a0[0];
  const dy = b0[1] - a0[1];

  const t = (dx * sy - dy * sx) / denom;
  const u = (dx * ry - dy * rx) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      point: [a0[0] + t * rx, a0[1] + t * ry],
      t,
      u,
    };
  }

  return null;
};

/**
 * Returns absolute segment coordinates for a linear element's segment.
 */
export const getAbsoluteSegment = (
  element: ExcalidrawLinearElement,
  p0: readonly [number, number],
  p1: readonly [number, number],
): [[number, number], [number, number]] => {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  const center = pointFrom<GlobalPoint>(cx, cy);

  const g0 = pointRotateRads(
    pointFrom<GlobalPoint>(element.x + p0[0], element.y + p0[1]),
    center,
    element.angle,
  );
  const g1 = pointRotateRads(
    pointFrom<GlobalPoint>(element.x + p1[0], element.y + p1[1]),
    center,
    element.angle,
  );

  return [
    [g0[0], g0[1]],
    [g1[0], g1[1]],
  ];
};

/**
 * Determines whether line A should jump OVER line B (or line B should yield gap).
 * Priority cascade:
 * 1. customData.lineJumpPriority: number
 * 2. Direction: vertical line jumps over horizontal line (Visio standard)
 * 3. Z-Index (elementsMap iteration order or fallback to element ID compare)
 */
export const shouldJumpOver = (
  lineA: ExcalidrawLinearElement,
  segA: [[number, number], [number, number]],
  lineB: ExcalidrawLinearElement,
  segB: [[number, number], [number, number]],
): boolean => {
  const prioA = lineA.customData?.lineJumpPriority;
  const prioB = lineB.customData?.lineJumpPriority;
  if (typeof prioA === "number" && typeof prioB === "number" && prioA !== prioB) {
    return prioA > prioB;
  }

  const dxA = Math.abs(segA[1][0] - segA[0][0]);
  const dyA = Math.abs(segA[1][1] - segA[0][1]);
  const dxB = Math.abs(segB[1][0] - segB[0][0]);
  const dyB = Math.abs(segB[1][1] - segB[0][1]);

  const isVerticalA = dxA < 2 && dyA > 2;
  const isHorizontalA = dyA < 2 && dxA > 2;
  const isVerticalB = dxB < 2 && dyB > 2;
  const isHorizontalB = dyB < 2 && dxB > 2;

  // Vertical jumps over horizontal
  if (isVerticalA && isHorizontalB) {
    return true;
  }
  if (isHorizontalA && isVerticalB) {
    return false;
  }

  // Fallback: compare element IDs for deterministic rendering
  return lineA.id > lineB.id;
};

/**
 * Scene Crossing Index and Cache.
 * Caches intersections between linear elements to achieve 60FPS.
 */
class SceneCrossingsManager {
  private cache = new WeakMap<
    ElementsMap,
    {
      version: string;
      elementCrossings: Map<string, CrossingPoint[]>;
      dependencyMap: Map<string, Set<string>>;
      junctionDots: Array<{ x: number; y: number; radius: number; color: string }>;
    }
  >();

  private computeForScene(elementsMap: ElementsMap) {
    const linearElements: ExcalidrawLinearElement[] = [];
    const aabbs: Array<[number, number, number, number]> = [];

    for (const el of elementsMap.values()) {
      if (
        (el.type === "line" || el.type === "arrow") &&
        !el.isDeleted &&
        el.points &&
        el.points.length >= 2
      ) {
        const linear = el as ExcalidrawLinearElement;
        linearElements.push(linear);
        const [x1, y1, x2, y2] = getElementAbsoluteCoords(linear, elementsMap);
        aabbs.push([x1, y1, x2, y2]);
      }
    }

    const elementCrossings = new Map<string, CrossingPoint[]>();
    const dependencyMap = new Map<string, Set<string>>();
    const junctionDots: Array<{ x: number; y: number; radius: number; color: string }> = [];

    for (const el of linearElements) {
      elementCrossings.set(el.id, []);
      dependencyMap.set(el.id, new Set());
    }

    // Pairwise comparison with AABB broad-phase pruning
    const n = linearElements.length;
    for (let i = 0; i < n; i++) {
      const lineA = linearElements[i];
      const boxA = aabbs[i];
      const pointsA = lineA.points;

      for (let j = i + 1; j < n; j++) {
        const lineB = linearElements[j];
        const boxB = aabbs[j];

        // AABB test
        if (
          boxA[2] < boxB[0] ||
          boxA[0] > boxB[2] ||
          boxA[3] < boxB[1] ||
          boxA[1] > boxB[3]
        ) {
          continue; // No overlap
        }

        const pointsB = lineB.points;

        // Check each segment pair
        for (let segIdxA = 0; segIdxA < pointsA.length - 1; segIdxA++) {
          const pA0 = pointsA[segIdxA];
          const pA1 = pointsA[segIdxA + 1];
          const segA = getAbsoluteSegment(lineA, pA0, pA1);
          const lenA = Math.hypot(segA[1][0] - segA[0][0], segA[1][1] - segA[0][1]);
          if (lenA < MIN_CROSSING_DISTANCE * 2) continue;

          for (let segIdxB = 0; segIdxB < pointsB.length - 1; segIdxB++) {
            const pB0 = pointsB[segIdxB];
            const pB1 = pointsB[segIdxB + 1];
            const segB = getAbsoluteSegment(lineB, pB0, pB1);
            const lenB = Math.hypot(segB[1][0] - segB[0][0], segB[1][1] - segB[0][1]);
            if (lenB < MIN_CROSSING_DISTANCE * 2) continue;

            const isect = findSegmentIntersection(segA[0], segA[1], segB[0], segB[1]);
            if (!isect) continue;

            const distAStart = isect.t * lenA;
            const distAEnd = (1 - isect.t) * lenA;
            const distBStart = isect.u * lenB;
            const distBEnd = (1 - isect.u) * lenB;

            const isAEndpoint =
              distAStart < ENDPOINT_THRESHOLD || distAEnd < ENDPOINT_THRESHOLD;
            const isBEndpoint =
              distBStart < ENDPOINT_THRESHOLD || distBEnd < ENDPOINT_THRESHOLD;

            // Corner / vertex intersection -> ignore
            if (isAEndpoint && isBEndpoint) {
              continue;
            }

            // T-junction: one endpoint touches inside the other line
            if (isAEndpoint || isBEndpoint) {
              // T-junction dot
              const dotRadius = Math.max(3, Math.min(lineA.strokeWidth, lineB.strokeWidth) * 1.5);
              junctionDots.push({
                x: isect.point[0],
                y: isect.point[1],
                radius: dotRadius,
                color: lineA.strokeColor,
              });

              // Also record crossing for dot mode
              dependencyMap.get(lineA.id)?.add(lineB.id);
              dependencyMap.get(lineB.id)?.add(lineA.id);
              continue;
            }

            // True cross intersection
            // Both are well inside the segments
            if (
              distAStart < MIN_CROSSING_DISTANCE ||
              distAEnd < MIN_CROSSING_DISTANCE ||
              distBStart < MIN_CROSSING_DISTANCE ||
              distBEnd < MIN_CROSSING_DISTANCE
            ) {
              continue;
            }

            const aJumpsOverB = shouldJumpOver(lineA, segA, lineB, segB);

            // Local coordinates for element A
            // Inverse rotate from global to element's local space
            const centerA = pointFrom<GlobalPoint>(
              lineA.x + lineA.width / 2,
              lineA.y + lineA.height / 2,
            );
            const localA = pointRotateRads(
              pointFrom<GlobalPoint>(isect.point[0], isect.point[1]),
              centerA,
              -lineA.angle as Radians,
            );
            // Local coordinates for element B
            const centerB = pointFrom<GlobalPoint>(
              lineB.x + lineB.width / 2,
              lineB.y + lineB.height / 2,
            );
            const localB = pointRotateRads(
              pointFrom<GlobalPoint>(isect.point[0], isect.point[1]),
              centerB,
              -lineB.angle as Radians,
            );
            elementCrossings.get(lineA.id)?.push({
              localPoint: [localA[0] - lineA.x, localA[1] - lineA.y],
              globalPoint: isect.point,
              segmentIndex: segIdxA,
              t: isect.t,
              otherElementId: lineB.id,
              crossingType: "cross",
              isOver: aJumpsOverB,
            });

            elementCrossings.get(lineB.id)?.push({
              localPoint: [localB[0] - lineB.x, localB[1] - lineB.y],
              globalPoint: isect.point,
              segmentIndex: segIdxB,
              t: isect.u,
              otherElementId: lineA.id,
              crossingType: "cross",
              isOver: !aJumpsOverB,
            });

            dependencyMap.get(lineA.id)?.add(lineB.id);
            dependencyMap.get(lineB.id)?.add(lineA.id);
          }
        }
      }
    }

    return {
      version: "",
      elementCrossings,
      dependencyMap,
      junctionDots,
    };
  }

  public getCrossings(
    element: ExcalidrawLinearElement,
    elementsMap: ElementsMap,
  ): CrossingPoint[] {
    let data = this.cache.get(elementsMap);
    if (!data) {
      data = this.computeForScene(elementsMap);
      this.cache.set(elementsMap, data);
    }
    return data.elementCrossings.get(element.id) || [];
  }

  public getJunctionDots(
    elementsMap: ElementsMap,
  ): Array<{ x: number; y: number; radius: number; color: string }> {
    let data = this.cache.get(elementsMap);
    if (!data) {
      data = this.computeForScene(elementsMap);
      this.cache.set(elementsMap, data);
    }
    return data.junctionDots;
  }

  /**
   * Invalidates caches for element and all its intersecting neighbors.
   */
  public invalidateElement(elementId: string, elementsMap: ElementsMap) {
    const data = this.cache.get(elementsMap);
    if (data) {
      const neighbors = data.dependencyMap.get(elementId);
      if (neighbors) {
        for (const neighborId of neighbors) {
          const neighbor = elementsMap.get(neighborId);
          if (neighbor) {
            ShapeCache.delete(neighbor);
          }
        }
      }
      this.cache.delete(elementsMap);
    }
  }

  public clear() {
    this.cache = new WeakMap();
  }
}

export const sceneCrossings = new SceneCrossingsManager();

/**
 * Builds an SVG path string for an elbow arrow, with both corner rounding
 * and crossings rendered as arcs (jump) or breaks (gap).
 */
export const generateElbowArrowShapeWithCrossings = (
  points: readonly LocalPoint[],
  radius: number,
  crossings: readonly CrossingPoint[],
  mode: LineCrossingMode,
): string => {
  if (points.length < 2) return "";
  if (mode === "none" || crossings.length === 0) {
    // Fallback directly to normal elbow arrow
    return "";
  }

  // Group crossings by segment index
  const crossingsBySegment = new Map<number, CrossingPoint[]>();
  for (const c of crossings) {
    if (!crossingsBySegment.has(c.segmentIndex)) {
      crossingsBySegment.set(c.segmentIndex, []);
    }
    crossingsBySegment.get(c.segmentIndex)!.push(c);
  }

  // Sort crossings on each segment by parameter t
  for (const list of crossingsBySegment.values()) {
    list.sort((a, b) => a.t - b.t);
  }

  // Calculate corner subpoints (3 points per corner)
  const subpoints: [number, number][] = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const next = points[i + 1];
    const point = points[i];
    const prevIsHorizontal = Math.abs(point[1] - prev[1]) < 0.01;
    const nextIsHorizontal = Math.abs(next[1] - point[1]) < 0.01;
    const corner = Math.min(
      radius,
      pointDistance(points[i], next) / 2,
      pointDistance(points[i], prev) / 2,
    );

    if (prevIsHorizontal) {
      if (prev[0] < point[0]) {
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (prev[1] < point[1]) {
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      subpoints.push([points[i][0], points[i][1] + corner]);
    }

    subpoints.push(points[i] as [number, number]);

    if (nextIsHorizontal) {
      if (next[0] < point[0]) {
        subpoints.push([points[i][0] - corner, points[i][1]]);
      } else {
        subpoints.push([points[i][0] + corner, points[i][1]]);
      }
    } else if (next[1] < point[1]) {
      subpoints.push([points[i][0], points[i][1] - corner]);
    } else {
      subpoints.push([points[i][0], points[i][1] + corner]);
    }
  }

  const d: string[] = [`M ${points[0][0]} ${points[0][1]}`];
  const numCorners = points.length - 2;

  // Render straight segments and corners in sequence
  for (let i = 0; i < points.length - 1; i++) {
    const segStart = i === 0 ? points[0] : subpoints[3 * (i - 1) + 2];
    const segEnd = i === points.length - 2 ? points[points.length - 1] : subpoints[3 * i];

    const segDx = segEnd[0] - segStart[0];
    const segDy = segEnd[1] - segStart[1];
    const segLen = Math.hypot(segDx, segDy);

    const segCrossings = crossingsBySegment.get(i);

    if (segCrossings && segCrossings.length > 0 && segLen >= JUMP_RADIUS * 2) {
      const ux = segDx / segLen;
      const uy = segDy / segLen;

      // Normal vector pointing upwards (-y) or rightwards (+x)
      let nx = -uy;
      let ny = ux;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
        nx = -nx;
        ny = -ny;
      }

      for (let cIdx = 0; cIdx < segCrossings.length; cIdx++) {
        const c = segCrossings[cIdx];
        const cx = c.localPoint[0];
        const cy = c.localPoint[1];

        // Check if crossing lies comfortably within the straight portion
        const distFromStart = (cx - segStart[0]) * ux + (cy - segStart[1]) * uy;
        if (distFromStart < JUMP_RADIUS || distFromStart > segLen - JUMP_RADIUS) {
          continue; // Too close to corner, ignore to prevent distortion
        }

        let jumpR = JUMP_RADIUS;
        if (cIdx > 0) {
          const prevC = segCrossings[cIdx - 1];
          const dist = Math.hypot(cx - prevC.localPoint[0], cy - prevC.localPoint[1]);
          if (dist < jumpR * 2.2) {
            jumpR = Math.max(3, dist / 2.5);
          }
        }

        const inX = cx - jumpR * ux;
        const inY = cy - jumpR * uy;
        const outX = cx + jumpR * ux;
        const outY = cy + jumpR * uy;

        d.push(`L ${inX} ${inY}`);

        if (mode === "arc" && c.isOver) {
          // Smooth bridge arc (cubic bezier fitting semicircle)
          const cp1X = inX + (4 / 3) * jumpR * nx;
          const cp1Y = inY + (4 / 3) * jumpR * ny;
          const cp2X = outX + (4 / 3) * jumpR * nx;
          const cp2Y = outY + (4 / 3) * jumpR * ny;
          d.push(`C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${outX} ${outY}`);
        } else if (mode === "gap" && !c.isOver) {
          // Gap break under
          d.push(`M ${outX} ${outY}`);
        } else {
          d.push(`L ${outX} ${outY}`);
        }
      }
    }

    // Line to segment end
    d.push(`L ${segEnd[0]} ${segEnd[1]}`);

    // If not the last segment, render the corner quadratic curve
    if (i < numCorners) {
      const cp = subpoints[3 * i + 1];
      const endPoint = subpoints[3 * i + 2];
      d.push(`Q ${cp[0]} ${cp[1]}, ${endPoint[0]} ${endPoint[1]}`);
    }
  }

  return d.join(" ");
};

/**
 * Builds an SVG path string for a straight/polyline element with crossings.
 */
export const buildLinearPathWithCrossings = (
  points: readonly LocalPoint[],
  crossings: readonly CrossingPoint[],
  mode: LineCrossingMode,
): string => {
  if (points.length < 2) return "";
  if (mode === "none" || crossings.length === 0) {
    return "";
  }

  const crossingsBySegment = new Map<number, CrossingPoint[]>();
  for (const c of crossings) {
    if (!crossingsBySegment.has(c.segmentIndex)) {
      crossingsBySegment.set(c.segmentIndex, []);
    }
    crossingsBySegment.get(c.segmentIndex)!.push(c);
  }

  for (const list of crossingsBySegment.values()) {
    list.sort((a, b) => a.t - b.t);
  }

  const d: string[] = [`M ${points[0][0]} ${points[0][1]}`];

  for (let i = 0; i < points.length - 1; i++) {
    const pStart = points[i];
    const pEnd = points[i + 1];
    const segDx = pEnd[0] - pStart[0];
    const segDy = pEnd[1] - pStart[1];
    const segLen = Math.hypot(segDx, segDy);

    const segCrossings = crossingsBySegment.get(i);

    if (!segCrossings || segCrossings.length === 0 || segLen < JUMP_RADIUS * 2) {
      d.push(`L ${pEnd[0]} ${pEnd[1]}`);
      continue;
    }

    const ux = segDx / segLen;
    const uy = segDy / segLen;

    let nx = -uy;
    let ny = ux;
    if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
      nx = -nx;
      ny = -ny;
    }

    for (let cIdx = 0; cIdx < segCrossings.length; cIdx++) {
      const c = segCrossings[cIdx];
      const cx = c.localPoint[0];
      const cy = c.localPoint[1];

      let jumpR = JUMP_RADIUS;
      if (cIdx > 0) {
        const prevC = segCrossings[cIdx - 1];
        const dist = Math.hypot(cx - prevC.localPoint[0], cy - prevC.localPoint[1]);
        if (dist < jumpR * 2.2) {
          jumpR = Math.max(3, dist / 2.5);
        }
      }

      const inX = cx - jumpR * ux;
      const inY = cy - jumpR * uy;
      const outX = cx + jumpR * ux;
      const outY = cy + jumpR * uy;

      d.push(`L ${inX} ${inY}`);

      if (mode === "arc" && c.isOver) {
        // Smooth bridge arc (cubic bezier fitting semicircle)
        const cp1X = inX + (4 / 3) * jumpR * nx;
        const cp1Y = inY + (4 / 3) * jumpR * ny;
        const cp2X = outX + (4 / 3) * jumpR * nx;
        const cp2Y = outY + (4 / 3) * jumpR * ny;
        d.push(`C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${outX} ${outY}`);
      } else if (mode === "gap" && !c.isOver) {
        d.push(`M ${outX} ${outY}`);
      } else {
        d.push(`L ${outX} ${outY}`);
      }
    }

    d.push(`L ${pEnd[0]} ${pEnd[1]}`);
  }

  return d.join(" ");
};
