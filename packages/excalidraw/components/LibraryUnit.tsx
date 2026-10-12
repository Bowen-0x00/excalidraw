import clsx from "clsx";
import { memo, useRef, useState, useEffect } from "react"; //ymjr
import { updateImageCache } from "@excalidraw/element"; //ymjr

import { useLibraryItemSvg } from "../hooks/useLibraryItemSvg";

import { useEditorInterface, useApp } from "./App"; //ymjr
import { CheckboxItem } from "./CheckboxItem";
import { PlusIcon } from "./icons";

import "./LibraryUnit.scss";

import type { LibraryItem } from "../types";
import type { SvgCache } from "../hooks/useLibraryItemSvg";

export const LibraryUnit = memo(
  ({
    id,
    elements,
    isPending,
    onClick,
    selected,
    onToggle,
    onDrag,
    svgCache,
  }: {
    id: LibraryItem["id"] | /** for pending item */ null;
    elements?: LibraryItem["elements"];
    isPending?: boolean;
    onClick: (id: LibraryItem["id"] | null) => void;
    selected: boolean;
    onToggle: (id: string, event: React.MouseEvent) => void;
    onDrag: (id: string, event: React.DragEvent) => void;
    svgCache: SvgCache;
  }) => {
    const ref = useRef<HTMLDivElement | null>(null);

    const excalidrawApp = useApp(); //ymjr
    const [, setVersion] = useState(0); //ymjr

    //ymjr+++>>>
    const syncContext = { elements, excalidrawApp, isMissingFiles: false };
    if ((window as any).EA_Core) {
      (window as any).EA_Core.dispatchSync(
        "onLibraryUnitCheck",
        syncContext,
        false,
      );
    }

    useEffect(() => {
      if ((window as any).EA_Core && syncContext.isMissingFiles) {
        (window as any).EA_Core.dispatchAsync(
          "onLibraryUnitHydrate",
          {
            id,
            elements,
            excalidrawApp,
            svgCache,
            updateImageCache,
            rerender: () => setVersion((v) => v + 1),
          },
          false,
        );
      }
    }, [id, elements, svgCache, excalidrawApp, syncContext.isMissingFiles]);
    //ymjr<<<+++

    const svg = useLibraryItemSvg(id, elements, svgCache, ref);

    const [isHovered, setIsHovered] = useState(false);
    const isMobile = useEditorInterface().formFactor === "phone";
    const adder = isPending && (
      <div className="library-unit__adder">{PlusIcon}</div>
    );

    const shouldShowSkeleton = !svg || syncContext.isMissingFiles; //ymjr

    return (
      <div
        className={clsx("library-unit", {
          "library-unit__active": elements,
          "library-unit--hover": elements && isHovered,
          "library-unit--selected": selected,
          "library-unit--skeleton": shouldShowSkeleton, //ymjr
        })}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div
          className={clsx("library-unit__dragger", {
            "library-unit__pulse": !!isPending,
          })}
          ref={ref}
          draggable={!!elements}
          onClick={
            !!elements || !!isPending
              ? (event) => {
                  if (id && event.shiftKey) {
                    onToggle(id, event);
                  } else {
                    onClick(id);
                  }
                }
              : undefined
          }
          onDragStart={(event) => {
            if (!id) {
              event.preventDefault();
              return;
            }
            setIsHovered(false);
            onDrag(id, event);
          }}
        />
        {adder}
        {id && elements && (isHovered || isMobile || selected) && (
          <CheckboxItem
            checked={selected}
            onChange={(checked, event) => onToggle(id, event)}
            className="library-unit__checkbox"
          />
        )}
      </div>
    );
  },
);

export const EmptyLibraryUnit = () => (
  <div className="library-unit library-unit--skeleton" />
);
