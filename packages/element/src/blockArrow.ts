import type { ExcalidrawArrowElement } from "./types";

/**
 * Calculates the closed polygon points for a block arrow (or outline block arrow),
 * preserving Catmull-Rom spline curves and custom shaft width / arrowhead scale.
 * Returned points are in element-local coordinates (relative to element.x, element.y).
 */
//ymjr
export const getBlockArrowPolygon = (
  element: ExcalidrawArrowElement,
): [number, number][] => {
  const points = element.points;
  if (!points || points.length === 0) {
    return [];
  }

  // 1. Check if curve mode (Roundness) is enabled
  let workingPoints: [number, number][] = points.map((p) => [p[0], p[1]]);
  if (element.roundness && points.length > 2) {
    workingPoints = [[points[0][0], points[0][1]]];
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
  if (validPoints.length < 2) {
    validPoints.push([validPoints[0][0] + 10, validPoints[0][1] + 10]);
  }

  // 3. Read custom width & compute proportions
  const customWidth =
    element.customData?.blockArrowWidth ||
    element.customData?.arrowHeadLineWidth;
  const shaftThickness = customWidth
    ? Number(customWidth)
    : Math.max(16, element.strokeWidth * 6);
  const arrowHeadScale = element.customData?.arrowHeadSize ?? 1;
  const headWidth = shaftThickness * 2.5 * arrowHeadScale;

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

      if (!addedStart && nextDist >= startHeadLen) {
        const ratio = (startHeadLen - currentDist) / len;
        shaftPoints.push([p1[0] + dx * ratio, p1[1] + dy * ratio]);
        addedStart = true;
      }
      if (
        addedStart &&
        nextDist > startHeadLen &&
        nextDist < totalLen - endHeadLen
      ) {
        shaftPoints.push(p2);
      }
      if (addedStart && nextDist >= totalLen - endHeadLen) {
        const ratio = (totalLen - endHeadLen - currentDist) / len;
        shaftPoints.push([p1[0] + dx * ratio, p1[1] + dy * ratio]);
        break;
      }
      currentDist = nextDist;
    }
  }
  if (shaftPoints.length < 2) {
    shaftPoints.push(validPoints[0], validPoints[validPoints.length - 1]);
  }

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
    arrowPoints.push([
      base[0] - (normal[0] * headWidth) / 2,
      base[1] - (normal[1] * headWidth) / 2,
    ]);
  }

  // --- Left shaft ---
  for (let i = 0; i <= sn; i++) {
    arrowPoints.push(leftShaft[i]);
  }

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
  for (let i = sn; i >= 0; i--) {
    arrowPoints.push(rightShaft[i]);
  }

  // --- Close start arrowhead right wing ---
  if (isStartBlock) {
    const tip = validPoints[0];
    const base = shaftPoints[0];
    const len =
      Math.sqrt((tip[0] - base[0]) ** 2 + (tip[1] - base[1]) ** 2) || 1;
    const normal = [-(tip[1] - base[1]) / len, (tip[0] - base[0]) / len];
    arrowPoints.push([
      base[0] + (normal[0] * headWidth) / 2,
      base[1] + (normal[1] * headWidth) / 2,
    ]);
  }
  arrowPoints.push(arrowPoints[0]);

  return arrowPoints;
};
