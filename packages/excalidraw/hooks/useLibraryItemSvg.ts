import { exportToSvg } from "@excalidraw/utils/export";
import { useEffect, useState } from "react";

import { COLOR_PALETTE } from "@excalidraw/common";

import type { ExcalidrawImageElement } from "@excalidraw/element/types"; //ymjr
import type { DataURL } from "@excalidraw/excalidraw/types"; //ymjr

import { atom, useAtom } from "../editor-jotai";

import { useApp } from "../components/App"; //ymjr

import type { LibraryItem, BinaryFiles } from "../types"; //ymjr

export type SvgCache = Map<LibraryItem["id"], SVGSVGElement>;

export const libraryItemSvgsCache = atom<SvgCache>(new Map());

const exportLibraryItemToSvg = async (
  elements: LibraryItem["elements"],
  files: BinaryFiles | null = null, // ymjr
) => {
  return await exportToSvg({
    elements,
    appState: {
      exportBackground: false,
      viewBackgroundColor: COLOR_PALETTE.white,
    },
    files, // Pass files to exportToSvg
    renderEmbeddables: false,
    skipInliningFonts: true,
  });
};

export const useLibraryItemSvg = (
  id: LibraryItem["id"] | null,
  elements: LibraryItem["elements"] | undefined,
  svgCache: SvgCache,
  ref: React.RefObject<HTMLDivElement | null>,
): SVGSVGElement | undefined => {
  const [svg, setSvg] = useState<SVGSVGElement>();
  const app = useApp();

  useEffect(() => {
    if (elements) {
      const generateSvg = async () => {
        // 1. Initialize files map
        const files: BinaryFiles = {};
        // 2. Filter image elements
        const imageElements = elements.filter(
          (el) => el.type === "image" && el.fileId,
        );

        // 3. Recover image binary data from app.imageCache if present
        if (imageElements.length > 0) {
          await Promise.all(
            imageElements.map(async (element) => {
              const fileId = (element as ExcalidrawImageElement).fileId;
              if (!fileId) {
                return;
              }

              // Retrieve cache entry from imageCache
              const cachedItem = app.imageCache.get(fileId);
              if (cachedItem) {
                // image may be HTMLImageElement or Promise<HTMLImageElement>; await real element
                const imageElement = await cachedItem.image;
                // Construct BinaryFileData object
                files[fileId] = {
                  id: fileId,
                  // imageElement.src is already a DataURL
                  dataURL: imageElement.src as DataURL,
                  mimeType: cachedItem.mimeType,
                  created: Date.now(), // Required placeholder field
                  lastRetrieved: Date.now(),
                };
              }
            }),
          );
        }

        // 4. Generate SVG passing constructed files
        const exportedSvg = await exportLibraryItemToSvg(elements, files);
        // Strip font styles
        exportedSvg.querySelector(".style-fonts")?.remove();

        return exportedSvg;
      };

      if (id) {
        // Try to load cached svg
        const cachedSvg = svgCache.get(id);

        if (cachedSvg) {
          setSvg(cachedSvg);
        } else {
          // When there is no svg in cache export it and save to cache
          (async () => {
            const exportedSvg = await generateSvg();
            if (exportedSvg) {
              svgCache.set(id, exportedSvg);
              setSvg(exportedSvg);
            }
          })();
        }
      } else {
        // When we have no id (usualy selected items from canvas) just export the svg
        (async () => {
          const exportedSvg = await exportLibraryItemToSvg(elements);
          setSvg(exportedSvg);
        })();
      }
    }
  }, [id, elements, svgCache, setSvg]);

  useEffect(() => {
    const node = ref.current;

    if (!node) {
      return;
    }

    if (svg) {
      node.innerHTML = svg.outerHTML;
    }

    return () => {
      node.innerHTML = "";
    };
  }, [svg, ref]);

  return svg;
};

export const useLibraryCache = () => {
  const [svgCache] = useAtom(libraryItemSvgsCache);

  const clearLibraryCache = () => svgCache.clear();

  const deleteItemsFromLibraryCache = (items: LibraryItem["id"][]) => {
    items.forEach((item) => svgCache.delete(item));
  };

  return {
    clearLibraryCache,
    deleteItemsFromLibraryCache,
    svgCache,
  };
};
