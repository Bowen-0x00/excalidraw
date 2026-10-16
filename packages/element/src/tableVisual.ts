// zsviczian -- ymjr semantic-table borders and native soft shadow, shared by Canvas/SVG.
import { applyDarkModeFilter, SVG_NS } from "@excalidraw/common";

import type { Drawable } from "roughjs/bin/core";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { RoughSVG } from "roughjs/bin/svg";
import type { ExcalidrawElement, StrokeStyle } from "./types";

type Edge = { width: number; style: StrokeStyle };
type Borders = Record<"top" | "right" | "bottom" | "left", Edge>;

/** No new element type: only explicitly styled managed rectangles opt in. */
export function getTableBorders(element: ExcalidrawElement): Borders | null {
  const table = element.customData?.table;
  return element.type === "rectangle" &&
    table?.schemaVersion === 2 &&
    table.role === "cell" &&
    table.borders
    ? (table.borders as Borders)
    : null;
}

/** Soft shadow is local to the table paper; it never depends on an optional script engine. */
export function hasTableShadow(element: ExcalidrawElement): boolean {
  const table = element.customData?.table;
  return (
    element.type === "rectangle" &&
    table?.schemaVersion === 2 &&
    table.role === "root" &&
    table.appearance?.shadow === true
  );
}

/** Ordered segments let Canvas and SVG share exact thickness/dash/edge ownership. */
function edgeSegments(
  element: ExcalidrawElement,
  borders: Borders,
): readonly [Edge, number, number, number, number][] {
  return [
    [borders.top, 0, 0, element.width, 0],
    [borders.right, element.width, 0, element.width, element.height],
    [borders.bottom, 0, element.height, element.width, element.height],
    [borders.left, 0, 0, 0, element.height],
  ];
}

/** Rough.js still draws native fill patterns; full rectangle outlines are replaced by owned edges. */
export function drawManagedTableRectangle(
  element: ExcalidrawElement,
  shape: Drawable,
  rc: RoughCanvas,
  context: CanvasRenderingContext2D,
  dark: boolean,
): boolean {
  const borders = getTableBorders(element);
  const shadow = hasTableShadow(element);
  if (!borders && !shadow) {
    return false;
  }
  context.save();
  if (shadow) {
    const matrix = context.getTransform();
    const scale = Math.hypot(matrix.a, matrix.b);
    context.shadowColor = "rgba(0,0,0,0.22)";
    context.shadowBlur = 6 * scale;
    context.shadowOffsetX = 3 * scale;
    context.shadowOffsetY = 4 * scale;
  }
  rc.draw(
    borders
      ? { ...shape, sets: shape.sets.filter((set) => set.type !== "path") }
      : shape,
  );
  context.restore();
  if (borders) {
    context.save();
    context.strokeStyle = applyDarkModeFilter(element.strokeColor, dark);
    context.lineCap = "butt";
    for (const [edge, x1, y1, x2, y2] of edgeSegments(element, borders)) {
      if (edge.width <= 0) {
        continue;
      }
      context.lineWidth = edge.width;
      context.setLineDash(
        edge.style === "dashed"
          ? [8, 8 + edge.width]
          : edge.style === "dotted"
          ? [1.5, 6 + edge.width]
          : [],
      );
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
    context.restore();
  }
  return true;
}

/** Vector edges and feDropShadow mirror the native Canvas result without rasterizing a table. */
export function renderManagedTableSvg(
  element: ExcalidrawElement,
  shape: Drawable,
  rsvg: RoughSVG,
  svgRoot: SVGElement,
  dark: boolean,
): SVGGElement | null {
  const borders = getTableBorders(element);
  const shadow = hasTableShadow(element);
  if (!borders && !shadow) {
    return null;
  }
  const doc = svgRoot.ownerDocument;
  const group = doc.createElementNS(SVG_NS, "g");
  const fill = rsvg.draw(
    borders
      ? { ...shape, sets: shape.sets.filter((set) => set.type !== "path") }
      : shape,
  );
  group.appendChild(fill);
  if (shadow) {
    const filter = doc.createElementNS(SVG_NS, "filter");
    const id = `table-shadow-${element.id}`;
    filter.setAttribute("id", id);
    filter.setAttribute("filterUnits", "userSpaceOnUse");
    filter.setAttribute("x", "-24");
    filter.setAttribute("y", "-24");
    filter.setAttribute("width", String(element.width + 48));
    filter.setAttribute("height", String(element.height + 48));
    const effect = doc.createElementNS(SVG_NS, "feDropShadow");
    effect.setAttribute("dx", "3");
    effect.setAttribute("dy", "4");
    effect.setAttribute("stdDeviation", "3");
    effect.setAttribute("flood-color", "#000000");
    effect.setAttribute("flood-opacity", "0.22");
    filter.appendChild(effect);
    svgRoot.appendChild(filter);
    fill.setAttribute("filter", `url(#${id})`);
  }
  if (borders) {
    for (const [edge, x1, y1, x2, y2] of edgeSegments(element, borders)) {
      if (edge.width <= 0) {
        continue;
      }
      const line = doc.createElementNS(SVG_NS, "path");
      line.setAttribute("d", `M ${x1} ${y1} L ${x2} ${y2}`);
      line.setAttribute(
        "stroke",
        applyDarkModeFilter(element.strokeColor, dark),
      );
      line.setAttribute("stroke-width", String(edge.width));
      line.setAttribute("stroke-linecap", "butt");
      line.setAttribute("fill", "none");
      if (edge.style !== "solid") {
        line.setAttribute(
          "stroke-dasharray",
          edge.style === "dashed"
            ? `8 ${8 + edge.width}`
            : `1.5 ${6 + edge.width}`,
        );
      }
      line.setAttribute("data-table-border", "true");
      group.appendChild(line);
    }
  }
  return group;
}
