// zsviczian -- ymjr regressions for real table vector output, not full-rectangle outlines.
import { describe, expect, it } from "vitest";
import rough from "roughjs/bin/rough";
import { SVG_NS } from "@excalidraw/common";

import { newElement } from "../newElement";
import { ShapeCache } from "../shape";
import { renderManagedTableSvg } from "../tableVisual";

function cell(fillStyle: "solid" | "hachure" = "solid") {
  return newElement({
    type: "rectangle",
    x: 0,
    y: 0,
    width: 200,
    height: 60,
    strokeColor: "#223344",
    backgroundColor: "#dbeafe",
    fillStyle,
    roughness: 0,
    strokeWidth: 1,
    customData: {
      table: {
        schemaVersion: 2,
        role: "cell",
        borders: {
          top: { width: 2, style: "solid" },
          right: { width: 0, style: "solid" },
          bottom: { width: 0, style: "solid" },
          left: { width: 0, style: "solid" },
        },
      },
    },
  });
}

describe("managed table vector rendering", () => {
  it("keeps the filled cell but replaces its complete outline with only the owned top rule", () => {
    const element = cell();
    const svg = document.createElementNS(SVG_NS, "svg");
    const shape = ShapeCache.generateElementShape(element, null);
    const node = renderManagedTableSvg(
      element,
      shape,
      rough.svg(svg),
      svg,
      false,
    )!;
    expect(node.querySelector("[data-table-border]")?.getAttribute("d")).toBe(
      "M 0 0 L 200 0",
    );
    const outline = Array.from(node.querySelectorAll("path")).filter(
      (path) => path.getAttribute("stroke") === "#223344",
    );
    expect(outline).toHaveLength(1);
    expect(node.querySelector('path[fill="#dbeafe"]')).not.toBeNull();
  });
  it("preserves the native hachure fill instead of replacing it with a flat or raster image", () => {
    const element = cell("hachure");
    const svg = document.createElementNS(SVG_NS, "svg");
    const shape = ShapeCache.generateElementShape(element, null);
    const node = renderManagedTableSvg(
      element,
      shape,
      rough.svg(svg),
      svg,
      false,
    )!;
    expect(node.querySelector("image")).toBeNull();
    expect(
      node.querySelectorAll('path[stroke="#dbeafe"]').length,
    ).toBeGreaterThan(0);
    expect(node.querySelectorAll("[data-table-border]")).toHaveLength(1);
  });
  it("attaches one real SVG shadow filter to table paper without duplicating scene elements", () => {
    const element = newElement({
      type: "rectangle",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      backgroundColor: "#202b3b",
      strokeColor: "transparent",
      fillStyle: "solid",
      roughness: 0,
      customData: {
        table: { schemaVersion: 2, role: "root", appearance: { shadow: true } },
      },
    });
    const svg = document.createElementNS(SVG_NS, "svg");
    const shape = ShapeCache.generateElementShape(element, null);
    const node = renderManagedTableSvg(
      element,
      shape,
      rough.svg(svg),
      svg,
      false,
    )!;
    expect(svg.querySelectorAll("filter feDropShadow")).toHaveLength(1);
    expect(node.querySelector("[filter]")?.getAttribute("filter")).toBe(
      `url(#table-shadow-${element.id})`,
    );
    expect(node.querySelectorAll("[data-table-border]")).toHaveLength(0);
  });
});
