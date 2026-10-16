// zsviczian -- ymjr managed table labels share one source-preserving layout.
import { getFontString } from "@excalidraw/common";

import { measureText } from "./textMeasurements";
import { wrapText } from "./textWrapping";

import type { ExcalidrawElement, ExcalidrawTextElement } from "./types";

/** Only versioned table cells opt in; ordinary bound labels keep upstream rules. */
export const getTableCell = (container: ExcalidrawElement | null) => {
  const table = container?.customData?.table;
  return container?.type === "rectangle" &&
    table?.schemaVersion === 2 &&
    table.role === "cell"
    ? table
    : null;
};

/** Derives display text without modifying originalText/rawText or the cell size. */
export const getTableTextLayout = (
  element: ExcalidrawTextElement,
  container: ExcalidrawElement | null,
  source = element.originalText,
) => {
  const cell = getTableCell(container);
  if (!cell || !container) {
    return null;
  }
  const padding = Math.max(0, Number(cell.padding) || 0);
  const maxWidth = Math.max(1, container.width - padding * 2);
  const maxHeight = Math.max(0, container.height - padding * 2);
  const font = getFontString(element);
  let text = wrapText(source, font, maxWidth);
  if (cell.heightMode === "fixed" && cell.overflow === "ellipsis") {
    const lines = text.split("\n");
    const count = Math.floor(
      maxHeight / (element.fontSize * element.lineHeight),
    );
    if (count < 1) {
      text = "";
    } else if (
      lines.length > count ||
      lines.some(
        (line) => measureText(line, font, element.lineHeight).width > maxWidth,
      )
    ) {
      const visible = lines.slice(0, count);
      const segmenter = new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      });
      const ellipsisFits =
        measureText("…", font, element.lineHeight).width <= maxWidth;
      text = visible
        .map((line, index) => {
          if (
            measureText(line, font, element.lineHeight).width <= maxWidth &&
            !(index === visible.length - 1 && lines.length > count)
          ) {
            return line;
          }
          const parts = Array.from(
            segmenter.segment(line),
            (part) => part.segment,
          );
          let low = 0;
          let high = parts.length;
          while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (
              measureText(
                `${parts.slice(0, mid).join("")}…`,
                font,
                element.lineHeight,
              ).width <= maxWidth
            ) {
              low = mid;
            } else {
              high = mid - 1;
            }
          }
          return ellipsisFits ? `${parts.slice(0, low).join("")}…` : "";
        })
        .join("\n");
    }
  }
  const metrics = measureText(text, font, element.lineHeight);
  const width = text ? Math.min(metrics.width, maxWidth) : 0;
  const height = text ? metrics.height : 0;
  const x =
    container.x +
    padding +
    (element.textAlign === "right"
      ? maxWidth - width
      : element.textAlign === "center"
      ? (maxWidth - width) / 2
      : 0);
  const y =
    container.y +
    padding +
    (element.verticalAlign === "bottom"
      ? maxHeight - height
      : element.verticalAlign === "middle"
      ? (maxHeight - height) / 2
      : 0);
  return { text, width, height, x, y, angle: container.angle };
};
