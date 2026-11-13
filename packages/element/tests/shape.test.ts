import { API } from "@excalidraw/excalidraw/tests/helpers/api";
import { pointFrom } from "@excalidraw/math";

import type { LocalPoint } from "@excalidraw/math";

import {
  ELBOW_ARROW_CORNER_RADIUS,
  generateElbowArrowShape,
  ShapeCache,
} from "../src/shape";
import { newElementWith } from "../src/mutateElement";

import type { Drawable, Op } from "roughjs/bin/core";

describe("arrowhead shapes", () => {
  it.each(["triangle", "diamond_outline", "circle"] as const)(
    "fills %s arrowheads along their outline",
    (arrowhead) => {
      const arrow = API.createElement({
        type: "arrow",
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
        endArrowhead: arrowhead,
        roughness: 2,
      });
      const [, head] = ShapeCache.generateElementShape(arrow, null);
      const [fill, outline] = head.sets;
      const getCurves = (ops: Op[]) =>
        ops.filter((op) => op.op === "bcurveTo").map((op) => op.data);

      expect(fill.type).toBe("fillPath");
      expect(outline.type).toBe("path");
      // the fill only joins up the outline's curves
      expect(getCurves(fill.ops)).toEqual(getCurves(outline.ops));
    },
  );

  it("builds a single continuous tip-joined arrowhead path when strokeLineJoin is set", () => {
    const arrow = newElementWith(
      API.createElement({
        type: "arrow",
        points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
        endArrowhead: "arrow",
        roughness: 0,
      }),
      { customData: { strokeLineJoin: "miter", strokeLineCap: "butt" } },
    );
    const shapes = ShapeCache.generateElementShape(arrow, null);
    // 1 shaft + 1 joined V-arrowhead (instead of 2 disconnected lines)
    expect(shapes).toHaveLength(2);
    const headPath = shapes[1].sets.find((s) => s.type === "path")!;
    expect(headPath.ops.map((op) => op.op)).toEqual([
      "move",
      "lineTo",
      "lineTo",
    ]);
  });

  it.each(["triangle", "chevron"] as const)(
    "marks closed %s arrowhead path for stroke closing when strokeLineJoin is set",
    (arrowhead) => {
      const arrow = newElementWith(
        API.createElement({
          type: "arrow",
          points: [pointFrom<LocalPoint>(0, 0), pointFrom<LocalPoint>(100, 0)],
          endArrowhead: arrowhead,
          roughness: 0,
        }),
        { customData: { strokeLineJoin: "miter", strokeLineCap: "butt" } },
      );
      const [, head] = ShapeCache.generateElementShape(arrow, null) as Array<
        Drawable & { closeStrokePath?: boolean }
      >;
      expect(head.closeStrokePath).toBe(true);
      const outline = head.sets.find((s) => s.type === "path")!;
      expect(outline.ops.filter((op) => op.op === "move")).toHaveLength(1);
    },
  );
});

describe("elbow arrow shapes", () => {
  const getCorners = (points: [number, number][]) =>
    generateElbowArrowShape(
      points.map(([x, y]) => pointFrom<LocalPoint>(x, y)),
      ELBOW_ARROW_CORNER_RADIUS,
    ).match(/Q/g)?.length ?? 0;

  it("draws a jog too short to see straight", () => {
    // a fixed segment lined up with the first one, while dragging
    expect(
      getCorners([
        [0, 0],
        [44, 0],
        [44, -1e-12],
        [195, -1e-12],
        [195, 34],
      ]),
    ).toBe(1);
  });

  it("keeps the corners of short segments in a row", () => {
    expect(
      getCorners([
        [0, 0],
        [100, 0],
        [100, 0.5],
        [100.5, 0.5],
        [100.5, 100],
      ]),
    ).toBe(3);
  });

  it("keeps a short U-turn", () => {
    expect(
      getCorners([
        [0, 0],
        [100, 0],
        [100, 0.5],
        [0, 0.5],
        [0, 50],
      ]),
    ).toBe(3);
  });
});
