import clsx from "clsx";
import { useEffect, useRef } from "react";

import {
  applyDarkModeFilter,
  isColorDark,
  THEME,
  type ColorPaletteCustom,
} from "@excalidraw/common";

import type { Theme } from "@excalidraw/element/types";

import { useAtom } from "../../editor-jotai";
import { t } from "../../i18n";

import HotkeyLabel from "./HotkeyLabel";
import {
  activeColorPickerSectionAtom,
  colorPickerHotkeyBindings,
  getColorNameAndShadeFromColor,
} from "./colorPickerUtils";
import { useColorPickerDnD } from "./topPicksDnD";

import type { TranslationKeys } from "../../i18n";

interface PickerColorListProps {
  theme: Theme;
  palette: ColorPaletteCustom;
  color: string | null;
  onChange: (color: string) => void;
  activeShade: number;
  showHotKey?: boolean;
  /**
   * palette colors to hide. Hidden entries keep their position in the hotkey
   * order (their hotkey goes dead instead of remapping the colors after them).
   */
  excludedColors?: readonly string[];
}

const PickerColorList = ({
  theme,
  palette,
  color,
  onChange,
  activeShade,
  showHotKey = true,
  excludedColors,
}: PickerColorListProps) => {
  const colorObj = getColorNameAndShadeFromColor({
    color,
    palette,
  });
  const [activeColorPickerSection, setActiveColorPickerSection] = useAtom(
    activeColorPickerSectionAtom,
  );
  const dnd = useColorPickerDnD();

  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (btnRef.current && activeColorPickerSection === "baseColors") {
      btnRef.current.focus();
    }
  }, [colorObj?.colorName, activeColorPickerSection]);

  return (
    <div className="color-picker-content--default">
      {Object.entries(palette).map(([key, value], index) => {
        //ymjr
        if (key.startsWith("__group__")) {
          const groupTitle = key.replace("__group__", "");
          return (
            <div
              key={key}
              style={{
                flexBasis: "100%", // Span full row
                gridColumn: "1 / -1", // Grid layout compatibility
                textAlign: "left",
                fontSize: "0.85rem",
                fontWeight: "bold",
                color: "var(--text-primary-color)",
                padding: "10px 0 4px 4px",
                borderBottom: "1px solid var(--default-border-color)",
                marginBottom: "6px",
                marginTop: index === 0 ? "0" : "8px",
              }}
            >
              {groupTitle}
            </div>
          );
        }

        // ymjr: 2. Render spacer placeholder to preserve 5-column grid alignment
        if (key.startsWith("__spacer_")) {
          return (
            <div
              key={key}
              style={{
                width: "1.875rem", // Matches color button width
                height: "1.875rem",
                margin: "0",
                pointerEvents: "none",
              }}
            />
          );
        }
        //ymjr

        const color =
          (Array.isArray(value) ? value[activeShade] : value) || "transparent";

        if (excludedColors?.includes(color)) {
          // invisible placeholder so the remaining colors keep their exact
          // grid positions (and hotkeys) — muscle memory stays intact
          return (
            <div
              key={key}
              className="color-picker__button color-picker__button--large"
              style={{ visibility: "hidden" }}
              aria-hidden="true"
            />
          );
        }

        const keybinding = colorPickerHotkeyBindings[index];
        const displayColor = applyDarkModeFilter(color, theme === THEME.DARK);
        let label = t(
          `colors.${key.replace(/\d+/, "")}` as unknown as TranslationKeys,
          null,
          "",
        );

        if (!label || label.trim() === "" || label.startsWith("colors.")) {
          //ymjr
          label = key;
        }

        return (
          <button
            ref={colorObj?.colorName === key ? btnRef : undefined}
            tabIndex={-1}
            type="button"
            className={clsx(
              "color-picker__button color-picker__button--large",
              {
                "has-outline": !isColorDark(color, 255),
                active: colorObj?.colorName === key,
                "is-transparent": color === "transparent" || !color,
              },
            )}
            onClick={() => {
              onChange(color);
              setActiveColorPickerSection("baseColors");
            }}
            onPointerDown={
              dnd ? (event) => dnd.startSwatchDrag(event, color) : undefined
            }
            title={`${label}${color.startsWith("#") ? ` ${color}` : ""} — ${
              keybinding ?? ""
            }`} //zsviczian https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1798
            aria-label={`${label} — ${keybinding ?? "No shortcut"}`} //zsviczian https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1798
            style={color ? { "--swatch-color": displayColor } : undefined}
            data-testid={`color-${key}`}
            key={key}
          >
            <div className="color-picker__button-outline" />
            {showHotKey && (
              <HotkeyLabel
                color={displayColor}
                keyLabel={keybinding ?? "" /*zsviczian*/}
              />
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PickerColorList;
