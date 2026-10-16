// zsviczian -- ymjr regression coverage for source-preserving fixed-height table labels.
import { describe, expect, it } from "vitest";
import { getFontString } from "@excalidraw/common";

import { Scene } from "../Scene";
import { newElement, newTextElement } from "../newElement";
import { newElementWith } from "../mutateElement";
import { redrawTextBoundingBox } from "../textElement";
import { getTableTextLayout } from "../tableText";
import { measureText } from "../textMeasurements";

import type { ExcalidrawTextElement } from "../types";

function fixture(source: string, heightMode: "auto" | "fixed" = "fixed") {
  const cell = newElement({
    type: "rectangle",
    x: 100,
    y: 200,
    width: 200,
    height: 41,
    customData: {
      table: {
        schemaVersion: 2,
        role: "cell",
        heightMode,
        overflow: heightMode === "fixed" ? "ellipsis" : "wrap",
        padding: 8,
      },
    },
  });
  const label = newTextElement({
    x: 108,
    y: 208,
    text: source,
    originalText: source,
    fontSize: 20,
    lineHeight: 1.25 as ExcalidrawTextElement["lineHeight"],
    textAlign: "left",
    verticalAlign: "top",
    containerId: cell.id,
  });
  const container = newElementWith(cell, {
    boundElements: [{ id: label.id, type: "text" }],
  });
  return {
    container,
    label,
    scene: new Scene([container, label], { skipValidation: true }),
  };
}

describe("managed table text", () => {
  it("ellipsizes by available lines without changing the editable source", () => {
    const source = "first\nsecond\nthird";
    const { container, label, scene } = fixture(source);
    redrawTextBoundingBox(label, container, scene);
    expect(label.text).toBe("first…");
    expect(label.originalText).toBe(source);
    expect(container.height).toBe(41);
    expect(label.y + label.height).toBeLessThanOrEqual(
      container.y + container.height - 8,
    );
  });
  it("restores the full display when fixed height becomes sufficient", () => {
    const source = "first\nsecond\nthird";
    const { container, label, scene } = fixture(source);
    redrawTextBoundingBox(label, container, scene);
    scene.mutateElement(container, { height: 100 });
    redrawTextBoundingBox(label, container, scene);
    expect(label.text).toBe(source);
    expect(label.originalText).toBe(source);
  });
  it("does not split a ZWJ emoji when reserving the ellipsis width", () => {
    const emoji = "👩🏽‍💻";
    const { container, label } = fixture(`${emoji}abcdef\nnext`);
    const width = measureText(
      `${emoji}…`,
      getFontString(label),
      label.lineHeight,
    ).width;
    const constrained = newElementWith(container, { width: width + 16 });
    const layout = getTableTextLayout(label, constrained)!;
    const segments = Array.from(
      new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
        layout.text,
      ),
      (part) => part.segment,
    );
    expect(segments).toEqual([emoji, "…"]);
    expect(label.originalText).toBe(`${emoji}abcdef\nnext`);
  });
  it("keeps an empty display inside a box shorter than one line", () => {
    const { container, label } = fixture("full source");
    const layout = getTableTextLayout(
      label,
      newElementWith(container, { height: 20 }),
    )!;
    expect(layout.text).toBe("");
    expect(layout.height).toBe(0);
    expect(label.originalText).toBe("full source");
  });
  it("leaves managed auto sizing to the table owner, but preserves ordinary bound growth", () => {
    const { container, label, scene } = fixture("one\ntwo\nthree", "auto");
    redrawTextBoundingBox(label, container, scene);
    expect(container.height).toBe(41);
    expect(label.text).toBe("one\ntwo\nthree");
    scene.mutateElement(container, { customData: {} });
    redrawTextBoundingBox(label, container, scene);
    expect(container.height).toBeGreaterThanOrEqual(label.height + 10);
  });
});
