# Excalidraw Component Customizations Inventory (ymjr)

## 1. Overview & Fork Architecture

This repository is a customized fork of [`@zsviczian/excalidraw`](https://github.com/zsviczian/excalidraw), which in turn is a fork of upstream [`excalidraw/excalidraw`](https://github.com/excalidraw/excalidraw) maintained for Obsidian integration. This fork houses the component modifications required by [`obsidian-excalidraw-plugin-ymjr`](https://github.com/Bowen-0x00/obsidian-excalidraw-plugin-ymjr).

### 1.1 Branch & Commit Baseline
<!-- ymjr -- Exact npm provenance pairs this fork with a published plugin release. -->
- **Upstream Component Base**: `278ed4937dde5fd9e77c83a4e25e5a9b3d8028f7`, npm `@zsviczian/excalidraw@0.18.146` `gitHead`, paired with plugin Release [`2.29.1`](https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.29.1), lightweight tag commit `5429408ad0e58ac3eb918439f463bde741357143`. Plugin tag `package.json` and `package-lock.json` both pin this exact version; older versioned sections below are historical snapshots.
- **Target Custom Branch**: `ymjr`.
- **Attribution & Annotations**:
  - Fork modifications made by `zsviczian` are annotated with `// zsviczian` or `/* zsviczian */`.
  - Additional customizations made for `ymjr` are annotated with `// ymjr` or `/* ymjr */`.
  - Upstream code attribution is strictly preserved.

### 1.2 Build & Packaging Requirements
- **Runtime Environment**: Node.js 22+ with Yarn Classic (`yarn 1.22.22`).
- **Standard Build Command**: `yarn --cwd packages/excalidraw build:obsidian`. The generated bundle is output into `packages/excalidraw/dist/obsidian/`.
- **Public NPM Dependencies Only**:
  - `gifuct-js` (`^2.1.2`): Declared in `packages/excalidraw/package.json` for client-side GIF decoding.
  - `tinycolor2` (`1.6.0`) & `@types/tinycolor2` (`1.4.6`): Declared in root and `packages/common/package.json` for color arithmetic.
  - `open-color` (`1.9.1`): Declared in `packages/common/package.json` for the palette shade matrix.
  - **Rough.js**: Uses standard public npm `roughjs@4.6.4`. **No custom Rough.js fork or private build is required.** Custom rough styling options are configured dynamically via `generateRoughOptions` and host events.
- **Retired Legacy Files**:
  - The obsolete standalone UMD entry and webpack configs (`packages/excalidraw/entry.js`, `webpack.dev.config.cjs`, `webpack.prod.config.cjs`) from older backup patches are deliberately omitted. The active `tsconfig-types.json` remains required for generated declarations; its private Rough.js aliases were removed. The plugin consumes the dedicated, function-evaluable Obsidian artifact built from the ESM source graph, not the generic UMD or application build.

---

### Native table integration — OBS-038, local checkpoint 2026-10-16

<!-- ymjr -->
- `packages/element/src/Scene.ts`: `Scene.onBeforeUpdate` registers a scene-instance synchronous layout pass before render/store observers, with reentrancy protection and deterministic disposal. It does not expose a plugin or active view.
- `packages/element/src/tableText.ts`: `getTableCell/getTableTextLayout` opt in only version-2 table-cell rectangles. Display wrapping/height/ellipsis use the native font metrics, reserve the ellipsis width and truncate at grapheme boundaries; `originalText/rawText` remain untouched.
- `newElement.refreshTextDimensions`, `textElement.redrawTextBoundingBox/handleBindTextResize/getBoundTextMaxWidth/getBoundTextMaxHeight`, and `textWysiwyg.updateWysiwygStyle` share that constraint. The source editor expands independently of fixed display geometry; ordinary bound text remains on the original path.
- `packages/excalidraw/index.tsx` re-exports the existing `resizeMultipleElements/updateBoundElements` algorithms so the host does not reimplement native group/font/point/binding transforms.
- Consumer: paired plugin `TableManager`, `tableLayout`, `TableToolbar` and its `onDuplicate` integration. Persisted metadata and row/column/image/group policy belong to the plugin. No new native element type, host-registry protocol change, network dependency or package version is introduced.
- Baseline component `9327290413d709110cdb1dc7ef3933fdd9b2c005`, upstream `b965b9f72227b9a0be31a6a74e4d477cea2c2a90`; work is isolated on `feat/table-layout-20261016`, original HEAD retained as `backup/table-baseline-20261016`. The source pair is unpublished; lab runtime evidence is separate from package/release readiness.
- Five focused managed-label regressions pass. Full core typecheck retains the existing unrelated test/window.h backlog. Exact-build runtime evidence and platform limits are recorded in the isolated `exports/table-lab` repository.
- Appearance follow-up on `feat/table-appearance-20261016`: `packages/element/src/tableVisual.ts` supplies native Canvas/SVG per-edge borders and one soft table-paper shadow; the existing rectangle drawing branches call it only for explicitly styled version-2 cells/roots. Fill patterns still come from Rough.js; the full rectangle outline is omitted only during managed-table rendering. No extra scene elements, raster flattening or optional script engine is required. Three real-vector regressions cover owned rules, native hachure and SVG shadow.


## 2. Complete Component File Inventory

Every modified or added file in the component repository (69 files total) is categorized below with exact symbols, features, metadata dependencies, and limitations.

### 2.1 Root Configuration Files (4 files)

| File | Purpose / Change | Exact Symbols / Edits | Metadata / Host Dependencies | Attribution |
|---|---|---|---|---|
| `.gitignore` | Exclude private prompts and archives | Added `/prompt`, `*.7z` | None | ymjr |
| `README.md` | Document fork identity and build instructions | Added link to `docs/ymjr-customizations.md` and build notes | None | ymjr |
| `package.json` | Add root color dependencies | Added `tinycolor2: 1.6.0`, `@types/tinycolor2: 1.4.6` | None | ymjr |
| `yarn.lock` | Pin exact package resolutions | Pinned `gifuct-js`, `tinycolor2`, `open-color` | None | ymjr |

---

### 2.2 Core Foundation & Common Utilities (`packages/common`, 5 files)

| File | Purpose / Feature | Exact Symbols / Changes | Metadata / Host Dependencies | Attribution |
|---|---|---|---|---|
| `packages/common/src/colors.ts` | Dynamic proxy color palette, extra colors bridge, and shade generation | `clamp`, `degreesToRadians`, `rgbToHex`, `getExtraColors`, `generateShades`, `ColorPickerColor`, `ColorPalette`, `STATIC_PALETTE`, `COLOR_PALETTE`, `COMMON_KEYS`, `getDynamicCommonShades`, `COMMON_ELEMENT_SHADES`, `createDynamicPalette`, `DEFAULT_ELEMENT_STROKE_COLOR_PALETTE`, `DEFAULT_ELEMENT_BACKGROUND_COLOR_PALETTE` | `window.EA_Core.dispatchSync("excalidrawExtraColors")`, `window.ExcalidrawAutomate.getCM` | ymjr |
| `packages/common/src/commonObsidianUtils.ts` | Host device bridge accessor | `getObsidianDeviceInfo` | `getObsidianCommonHost()?.getDeviceInfo()` | ymjr |
| `packages/common/src/constants.ts` | Extended font types, zoom boundary relaxing, stroke width keys, curve arrow constant | `getGenericFontFamilyFallback`, `getFontFamilyFallbacks`, `MIN_ZOOM = 0.03`, `MAX_ZOOM = 30.0`, `StrokeWidthKey`, `STROKE_WIDTH_KEYS`, `getStrokeWidthByKey`, `LIBRARY_DISABLED_TYPES` (uncommented image), `ARROW_TYPE.curve` | `fontFamily: number \| string`, `arrowType: "curve"` | ymjr / zsviczian |
| `packages/common/src/font-metadata.ts` | Multi-font metadata typing | `FontMetadata.fontName`, `FONT_METADATA: Record<number \| string, FontMetadata>` | `fontName` string identifier | ymjr |
| `packages/common/src/utils.ts` | String font family passthrough | `getFontFamilyString` | String `fontFamily` | ymjr |
| `packages/common/package.json` | Explicit color dependencies for fresh source builds | `open-color: 1.9.1`, existing `tinycolor2` and its typings | No private color package required | ymjr |

---

### 2.3 Element Model, Geometry & Rendering (`packages/element`, 22 files)

| File | Purpose / Feature | Exact Symbols / Changes | Metadata / Host Dependencies | Attribution |
|---|---|---|---|---|
| `packages/element/src/Scene.ts` | Element replacement lifecycle interception | `Scene.replaceAllElements` | `window.EA_Core.dispatchSync("replaceAllElements", { scene, nextElements })` | ymjr |
| `packages/element/src/binding.ts` | Snap point & continuous edge binding engine | `getClosestSnapPoint`, `projectPointToSegment`, `getClosestEdgePoint`, `getSnapCandidates`, `getPointsFromSvgPath`, `updateBoundPoint`, `calculateFixedPointForNonElbowArrowBinding`, `normalizeFixedPoint` | `element.customData.snap`, `element.customData.svgPathShape`, `element.customData.svgViewBox`, `element.customData.scaleX`, `element.customData.scaleY` | ymjr |
| `packages/element/src/bounds.ts` | Arrowhead size lookup & scaling offset | `getArrowheadSize`, `getArrowheadPoints` | `element.customData.arrowHeadLineWidth`, `element.customData.arrowHeadSize` | ymjr |
| `packages/element/src/crossings.ts` | Visio-like line crossings geometry & SVG path generator | `SceneCrossingsManager`, `sceneCrossings`, `findSegmentIntersection`, `shouldJumpOver`, `generateElbowArrowShapeWithCrossings`, `buildLinearPathWithCrossings` | `element.customData.lineCrossings` ("arc", "gap", "dot", "none"), `element.customData.lineJumpPriority` | ymjr |
| `packages/element/src/dragElements.ts` | Selected element dragging interception | `dragSelectedElements` | `window.EA_Core.dispatchSync("dragSelectedElements", { selectedElements, elementsToUpdate, scene })` | ymjr |
| `packages/element/src/duplicate.ts` | Post-element duplication notification | `duplicateElement` | `window.duplicateElementHook(editingGroupId, groupIdMap, element, null, copy)` | ymjr |
| `packages/element/src/gif.ts` | GIF base64 frame decoding into ImageBitmaps | `dataURLToArrayBuffer`, `decodeGifToBitmaps` | `gifuct-js` (`parseGIF`, `decompressFrames`) | ymjr |
| `packages/element/src/image.ts` | Image cache animated GIF frame decoding | `updateImageCache` | `element.customData.gif`, `element.customData.gif.frameCount` | ymjr / zsviczian |
| `packages/element/src/linearElementEditor.ts` | Point drag interception & arrow bounding box adjustment | `LinearElementEditor.handlePointDragging`, `LinearElementEditor.getMinMaxXYFromCurvePathOps` | `window.EA_Core.dispatchSync("handlePointDragging", ...)`, `element.customData.arrowHeadSize` | ymjr |
| `packages/element/src/newElement.ts` | Template text substitution & text indent | `_newElementBase`, `refreshTextDimensions` | `window.templateMap`, `element.customData.template`, `element.customData.indent` | ymjr / zsviczian |
| `packages/element/src/renderElement.ts` | Canvas rendering hooks, GIF frame draw, line styling, arrowhead padding, junction dot rendering, crossing-aware cache | `cappedElementCanvasSize`, `drawElementOnCanvas`, `drawElementFromCanvas`, `renderSelectionElement`, `drawElement`, `generateElementWithCanvas` | `window.EA_Core` hooks, `customData.strokeLineJoin`, `customData.strokeLineCap`, `customData.gif.index`, `customData.lineCrossings` | ymjr |
| `packages/element/src/resizeElements.ts` | Template text resize, single element hook, SVG flip scaling | `resizeSingleTextElement`, `resizeSingleElement`, `resizeMultipleElements` | `window.templateMap`, `window.resizeSingleElementHook`, `element.customData.svgPathShape`, `element.customData.scaleX`, `element.customData.scaleY` | ymjr |
| `packages/element/src/resizeTest.ts` | Forward interactive AppState to transform handles | `resizeTest` | `appState` parameter forwarding | ymjr |
| `packages/element/src/selection.ts` | Custom marquee selection filtering | `getElementsWithinSelection` | `window.EA_Core.dispatchSync("shouldSelectElement", { element, elementsMap, shouldSelect })` | ymjr |
| `packages/element/src/shape.ts` | Bezier arrows, Catmull-Rom block arrows, SVG path shape rendering, arc roundness, line crossings path integration | `generateRoughOptions`, `getArrowheadShapes`, `_generateElementShape`, `getBindingDirection`, `ShapeCache` | `window.EA_Core.dispatchSync("generateRoughOptions")`, `window._generateElementShapeHook`, `element.customData.curveArrow`, `element.customData.blockArrowWidth`, `element.customData.arrowHeadLineWidth`, `element.customData.svgPathShape`, `element.roundness.roundType`, `element.customData.lineCrossings` | ymjr |
| `packages/element/src/mutateElement.ts` | Crossing neighbor cache invalidation on transform | `mutateElement` | `sceneCrossings.invalidateElement(element.id, elementsMap)` | ymjr |
| `packages/element/src/textElement.ts` | Container dimensions & bound text positioning overrides | `redrawTextBoundingBox`, `handleBindTextResize`, `computeBoundTextPosition`, `computeContainerDimensionForBoundText`, `getBoundTextMaxWidth`, `getBoundTextMaxHeight` | `window.EA_Core` hooks (`beforeWrapText`, `afterMeasureTextBoundingBox`, `computeBoundTextPosition`, `computeContainerDimension`, `getBoundTextMaxWidth`, `getBoundTextMaxHeight`) | ymjr |
| `packages/element/src/textWrapping.ts` | Indented text wrapping parameter | `wrapText` | `indent` parameter | ymjr |
| `packages/element/src/transformHandles.ts` | Cardinal resize handle generation | `getTransformHandlesFromCoords`, `getTransformHandles` | Cardinal handles `w`, `n`, `e`, `s` | ymjr |
| `packages/element/src/typeChecks.ts` | Allow line element binding; ignore elements with nobind | `isBindableElement` | `element.type === "line"`, `element.customData.nobind` | ymjr |
| `packages/element/src/types.ts` | Type definitions for arrowheads, roundness, font family, bindable elements | `FontFamilyValues`, `roundType`, `ExcalidrawBindableElement`, `Arrowhead` | `roundType: "bezier" \| "arc"`, arrowheads `chevron`, `chevron_outline`, `block_arrow`, `block_arrow_outline` | ymjr |
| `packages/element/src/utils.ts` | Direct numerical corner radius retrieval | `getCornerRadius` | `element.roundness.value` | ymjr |

---

### 2.4 Excalidraw Application, Actions & UI (`packages/excalidraw`, 39 files)

| File | Purpose / Feature | Exact Symbols / Changes | Metadata / Host Dependencies | Attribution |
|---|---|---|---|---|
| `packages/excalidraw/actions/actionAddToLibrary.ts` | Async library add with custom name hook | `actionAddToLibrary` | `window.EA_Core.dispatchAsync("onBeforeAddToLibrary", context)` | ymjr |
| `packages/excalidraw/actions/actionDeleteSelected.tsx` | Delete lifecycle hooks | `deleteSelectedElements`, `actionDeleteSelected` | `window.EA_Core` (`beforeDeleteSelectedElements`, `afterDeleteSelectedElements`, `deleteSelectedElements`) | ymjr |
| `packages/excalidraw/actions/actionFinalize.tsx` | Linear element finalization cleanup | `actionFinalize` | None | ymjr |
| `packages/excalidraw/actions/actionProperties.tsx` | Stroke slider, arrowhead size, roundness value/type, line cap/join, snap mode, line crossings | `actionChangeStrokeWidth`, `actionChangeFontSize`, `actionChangeFontFamily`, `actionChangeArrowType`, `actionChangeArrowheadSize`, `actionChangeRoundnessValue`, `actionChangeRoundnessType`, `actionChangeStrokeLineCap`, `actionChangeStrokeLineJoin`, `actionChangeSnapProp`, `actionChangeLineCrossings` | `window.ExcalidrawAutomate.plugin.settings`, `customData.snap`, `customData.strokeLineCap`, `customData.strokeLineJoin`, `customData.arrowHeadSize`, `customData.lineCrossings` | ymjr |
| `packages/excalidraw/actions/actionSelectAll.ts` | Select-all element filtering hook | `actionSelectAll` | `window.EA_Core.dispatchSync("shouldSelectElement", context)` | ymjr |
| `packages/excalidraw/actions/types.ts` | Action name union additions | `ActionName` | `changeLineCrossings`, `changeSnapProp`, custom action names added | ymjr |
| `packages/excalidraw/animatedTrail.ts` | Animated stroke trail styling | `AnimatedTrail.update` | `this.options.stroke` | ymjr |
| `packages/excalidraw/appState.ts` | Persisted arrowhead size, snap mode & line crossings state | `getDefaultAppState`, `APP_STATE_STORAGE_CONF` | `currentItemArrowHeadSize`, `currentItemSnap`, `currentItemLineCrossings` | ymjr |
| `packages/excalidraw/components/Actions.tsx` | Mount custom property controls | `SelectedShapeActions`, `CombinedArrowProperties` | Mounts roundness value/type, line cap/join, arrowhead size, snap buttons, line crossings | ymjr |
| `packages/excalidraw/components/App.selectionTool.ts` | Selection filter hook, drag element modification hook, post-transform hook, custom shape/curve arrow deselect guards | `AppSelectionTool.handleSelectionOnPointerDown`, `AppSelectionTool.maybeHandleResize`, `AppSelectionTool.handleSelectionDragOnPointerMove`, `AppSelectionTool.handleSelectionOnPointerUp` | `window.EA_Core` (`shouldSelectElement`, `afterTransformElements`, `modifyElementsToDrag`), `element.customData.svgPathShape`, `element.customData.curveArrow` | ymjr |
| `packages/excalidraw/components/App.text.ts` | WYSIWYG live change hook, editor startup hook, pre-edit interception & alignment overrides | `AppText.handleTextWysiwyg`, `AppText.startTextEditing` | `window.EA_Core` (`onTextWysiwygChange`, `handleTextWysiwyg`, `beforeStartTextEditing`) | ymjr |
| `packages/excalidraw/components/App.tsx` | Imperative API exports, event hooks, hidden element filtering, SVG path cache, line crossings defaults | `App.getExcalidrawAPI`, `App._svgPathCache`, 12 `EA_Core` event dispatches, `App.startTextEditing`/`handleTextWysiwyg`/`pasteFromClipboard` delegates, `handlePointerDown` | `window.EA_Core`, `element.customData.hide`, `element.customData.lineCrossings`, `ExcalidrawImperativeAPI` | ymjr |
| `packages/excalidraw/components/App.viewport.ts` | Viewport translation legacy hook | `AppViewport.translate` | `window.translateCanvas_Hook(state)` | ymjr |
| `packages/excalidraw/components/App.wheel.ts` | Wheel zoom event interception | `AppWheel.zoomBy` | `window.EA_Core.dispatchSync("handleWheelZoom", context)` | ymjr |
| `packages/excalidraw/components/ColorPicker/PickerColorList.tsx` | Group headers, spacer squares, color label fallback | `PickerColorList` | `__group__*`, `__spacer__*` | ymjr |
| `packages/excalidraw/components/FontPicker/FontPicker.tsx` | String font family support & default check | `isDefaultFont`, `FontPicker` | `fontFamily: number \| string` | ymjr |
| `packages/excalidraw/components/FontPicker/FontPickerList.tsx` | Font picker string value selection | `FontPickerList` | `font.value` passed directly | ymjr |
| `packages/excalidraw/components/LibraryMenuItems.tsx` | Dynamic status-based library grouping | `LibraryMenuItems` | `item.status` grouped into sections | ymjr |
| `packages/excalidraw/components/LibraryUnit.tsx` | Lazy image file hydration & skeleton preview | `LibraryUnit` | `window.EA_Core` (`onLibraryUnitCheck`, `onLibraryUnitHydrate`) | ymjr |
| `packages/excalidraw/components/Stack.tsx` | TypeScript typing refinement | `RowStack`, `ColStack` | `forwardRef<HTMLDivElement, StackProps>` | ymjr |
| `packages/excalidraw/components/hyperlink/Hyperlink.tsx` | Guard link suggester attachment | `Hyperlink` | `hasObsidianExcalidrawHost()` | ymjr |
| `packages/excalidraw/components/hyperlink/helpers.ts` | Offset & size parameters for link handle | `getLinkHandleFromCoords` | `customSize`, `offsetX`, `offsetY` | ymjr |
| `packages/excalidraw/components/icons.tsx` | Custom SVG icons for arrows, caps, joins, snap, line crossings | 20 custom icon components (including `lineCrossingNoneIcon`, `lineCrossingArcIcon`, `lineCrossingGapIcon`, `lineCrossingDotIcon`) | None | ymjr |
| `packages/excalidraw/components/shapeActionPredicates.ts` | Action visibility predicates for linear elements and tools | `getShapeActionPredicates` | `predicates.lineCrossings` for `arrow` or `line` tools/elements | ymjr |
| `packages/excalidraw/fonts/Fonts.ts` | String font registry & safe font loading | `Fonts._registered`, `Fonts.fontFacesStylesGenerator`, `Fonts.loadFontsForDocument` | `number \| string` keying, try-catch isolation | ymjr |
| `packages/excalidraw/hooks/useLibraryItemSvg.ts` | Image cache reconstruction for library SVG previews | `useLibraryItemSvg`, `exportLibraryItemToSvg` | `app.imageCache` | ymjr |
| `packages/excalidraw/index.tsx` | Module re-exports for Obsidian integration | `getTextHeight`, `getCSSFontDefinition2`, `isSafari`, `updateElbowArrowPoints` | Re-exported helper functions | ymjr |
| `packages/excalidraw/laserTrails.ts` | Separate laser stroke and fill colors | `LaserTrails`, `getStrokeColor`, `getFillColor` | `window.ExcalidrawAutomate.LASERPOINTER.STROKE_COLOR / FILL_COLOR` | ymjr |
| `packages/excalidraw/locales/en.json` | English translation keys for custom arrows | Translation strings | `arrowhead_chevron`, `arrowhead_block_arrow`, `arrowtype_curve`, etc. | ymjr |
| `packages/excalidraw/locales/zh-CN.json` | Chinese translation keys for custom arrows | Translation strings | Custom arrowhead and arrow type labels | ymjr |
| `packages/excalidraw/obsidianUtils.ts` | CSS font-face generators and font metrics registration | `getFontMetrics`, `registerFontsInCSS`, `getCSSFontDefinition`, `getCSSFontDefinition2` | `FONT_METADATA`, `Fonts.registered` | ymjr |
| `packages/excalidraw/package.json` | GIF library dependency addition | `dependencies` | `"gifuct-js": "^2.1.2"` | ymjr |
| `packages/excalidraw/renderer/interactiveScene.ts` | Line binding highlights, curve arrow handles, selection box hiding, snap crosshairs | `renderBindingHighlightForBindableElement_simple`, `renderBindingHighlightForBindableElement_complex`, `renderLinearPointHandles`, `_renderInteractiveScene`, `renderInteractiveScene`, `renderCustomSnapPoints` | `window.EA_Core` (`shouldHideSelectionBox`, `renderInteractiveScene`), `#ff00ff` snap crosshairs | ymjr |
| `packages/excalidraw/renderer/staticScene.ts` | Detail icon rendering, custom icons hook, canvas error recovery, static scene hook | `strokeGrid`, `renderLinkIcon`, `renderDetailIcon`, `_renderStaticScene`, `renderStaticScene` | `window.EA_Core` (`renderCustomIcons`, `renderStaticScene`), `element.customData.detail`, `element.customData.fixed` | ymjr |
| `packages/excalidraw/renderer/staticSvgScene.ts` | Async SVG export, layer order preservation, SVG render hooks | `renderElementToSvg`, `renderSceneToSvg` | `window.EA_Core` (`renderElementToSvgCheck`, `renderElementToSvg`) | ymjr |
| `packages/excalidraw/scene/Renderer.ts` | Viewport culling pruning hidden and retaining fixed elements | `Renderer.getVisibleElements` | `element.customData.hide`, `element.customData.fixed` | ymjr |
| `packages/excalidraw/scene/export.ts` | Await async SVG render in SVG export | `exportToSvg` | `await renderSceneToSvg(...)` | ymjr |
| `packages/excalidraw/types.ts` | Type definitions for AppState, GifFrame, image cache, Imperative API | `AppState`, `GifFrame`, `AppClassProperties.imageCache`, `ExcalidrawImperativeAPI` | `App`, `ShapeCache`, `elementWithCanvasCache` | ymjr |
| `packages/excalidraw/wysiwyg/textWysiwyg.tsx` | Text indent, emoji suggester blur guard, host-guarded suggester | `textWysiwyg` | `element.customData.indent`, `.emoji-suggester:hover`, `hasObsidianExcalidrawHost()` | ymjr |

---

## 3. Deep-Dive Feature Specifications & Technical Design

### 3.1 Block Arrow Geometry, Curved Paths & Custom Widths
- **Arrowhead Styles**:
  - `chevron` and `chevron_outline`: 25px default arrowhead length with a `0.4` indentation factor creating a recessed chevron barb.
  - `block_arrow` and `block_arrow_outline`: 30px default arrowhead length.
- **Multi-Point Catmull-Rom Spline Interpolation**:
  - In `packages/element/src/shape.ts`, if `element.roundness` is active and `points.length > 2`, intermediate spline points are computed across 15 sub-segments per span (`segments = 15`), generating smooth curved arrow shafts through arbitrary control points.
- **Polyline Shaft Offsetting & Miter Joins**:
  - Shaft thickness is resolved via `element.customData?.blockArrowWidth || element.customData?.arrowHeadLineWidth`, falling back to `Math.max(16, element.strokeWidth * 6)`. Controlled via `actionChangeBlockArrowWidth` slider in `actionProperties.tsx`.
  - Head width scales to `shaftThickness * 2.5 * (element.customData?.arrowHeadSize ?? 1)`.
  - Shaft normal vectors (`sNormals`) are computed for each segment. Vertex miter joins are calculated with a miter clamp (`miterDist = Math.min(w / ((mx * n1[0] + my * n1[1]) / mLen), w * 2)`) to prevent sharp angle blowouts.
- **Closed Polygon Assembly**:
  - Extracted to reusable `getBlockArrowPolygon` in `packages/element/src/blockArrow.ts`.
  - Start arrowhead tip/wings $\rightarrow$ left shaft offset polyline $\rightarrow$ end arrowhead wings/tip $\rightarrow$ right shaft offset polyline (reversed) $\rightarrow$ closing back to start wing.
  - Trims start and end head lengths (capped at 45% of total curve length) so arrowhead bases blend seamlessly into the shaft.
- **Outline vs. Filled & Custom Fill Color**:
  - `block_arrow`: Filled with `element.backgroundColor` when configured (non-transparent), falling back to `element.strokeColor`.
  - `block_arrow_outline`: Filled with `element.backgroundColor` when configured (non-transparent), falling back to `canvasBackgroundColor`.
  - Background color and fill style controls are exposed when block arrows are selected via `canChangeBackgroundColor` and `fill` predicates.
- **Full Polygon Hit Testing (点击命中测试)**:
  - In `packages/element/src/collision.ts`, `shouldTestInside` evaluates to `true` for block arrows, and `isPointInElement` evaluates `polygonIncludesPoint` against `getBlockArrowPolygon(element)`, enabling selection clicks across the entire visual block arrow body rather than just the center line.
- **Custom Arrowhead Scaling (`arrowHeadSize`)**:
  - Controlled via `actionChangeArrowheadSize` in `actionProperties.tsx` (slider with power curve mapping $u \in [0.5, 2.83]$, representing $S = u^2 \in [0.25\times, 8.0\times]$ with live percentage display, 100% snap, and double-click reset). Scales `headWidth` and `headLen` proportionally.
---

### 3.2 Snap Point & Edge Binding System
- **Bindable Element Scope**:
  - `ExcalidrawBindableElement` in `types.ts` and `isBindableElement` in `typeChecks.ts` include `ExcalidrawLineElement`.
  - Elements marked with `element.customData?.nobind: true` are excluded from binding.
- **Snap Candidate Calculation (`getSnapCandidates`)**:
  - **SVG Path Shapes**: Parses SVG path data via `getPointsFromSvgPath`, extracts path vertices, segment midpoints (<50 points), and centroid. Normalizes coordinates against `svgViewBox` or bounding box, respecting `scaleX`/`scaleY` flip states.
  - **Lines / Arrows**: Centroid, segment endpoints, intermediate segment midpoints, and loop closure midpoint.
  - **Ellipses**: Center $(0.5, 0.5)$ plus 16 equidistant circumferential points computed via $\cos / \sin$ at $\frac{2\pi i}{16}$.
  - **Diamonds**: Center $(0.5, 0.5)$, 4 vertices, and 3 intermediate points per edge (at 25%, 50%, 75%).
  - **Rectangles / Generic**: Center $(0.5, 0.5)$ plus 5 points per edge (at 0%, 25%, 50%, 75%, 100%), generating 17 unique candidate snap points.
- **Snap Search Algorithms**:
  - `getClosestSnapPoint`: Searches candidate points in world coordinates using Euclidean distance squared (`pointDistanceSq`).
  - `getClosestEdgePoint`: Rotates cursor to local coordinates, projects onto perimeter segments using `projectPointToSegment` (clamped projection $t \in [0, 1]$), and rotates projected point back to world space.
- **Arrow Endpoint Dragging Integration**:
  - In `binding.ts`, `bindingStrategyForNewSimpleArrowEndpointDragging` and `bindingStrategyForSimpleArrowEndpointDragging_complex` check `targetSnapMode = hit?.customData?.snap || arrow.customData?.snap`.
  - If snap mode is `"points"` or `"edge"`, arrow endpoints snap to closest candidates or perimeter projections.
  - In `updateBoundPoint`, `shouldBypassCollapse = isSnapMode && isSameElement` allows binding both ends of an arrow to the same element without zero-length collapse.
- **Visual Feedback & UI**:
  - `renderCustomSnapPoints` in `interactiveScene.ts`: When an arrow is dragged near a snap target, renders `#ff00ff` (magenta) crosshair indicators (`+`/`x`) at all candidate points.
  - `actionChangeSnapProp` in `actionProperties.tsx`: Property panel button group allowing users to toggle Snap Mode between `"none"` (Off), `"points"` (Points), and `"edge"` (Edge).

---

### 3.3 SVG Custom Shapes, Callouts, Containers & Structural Layout
- **SVG Path Shape (`element.customData.svgPathShape`)**:
  - In `shape.ts`, `_generateElementShape` renders arbitrary SVG paths via `generator.path(pathStr, options)`.
  - Automatically measures path bounds or reads `element.customData?.svgViewBox`.
  - Applies aspect ratio scaling (`scaleX = width / viewBox.width`, `scaleY = height / viewBox.height`) and flip inversion (`flipX = customData.scaleX`, `flipY = customData.scaleY`). Compensates with translation (`translateX = flipX < 0 ? width : 0`) so path operations match element dimensions.
  - In `resizeElements.ts`, `resizeMultipleElements` recognizes `isCustomSVG = !!orig.customData?.svgPathShape` and updates `scaleX`/`scaleY` without corrupting internal coordinate ops.
- **Complex Containers (Callouts, Braces, Swimlanes, Collapse)**:
  - Container-aware bound text positioning in `textElement.ts`:
    - `beforeWrapText`: Dispatches `{ textElement, text, indent }` before wrapping.
    - `afterMeasureTextBoundingBox`: Dispatches `{ container, metrics, scene, textElement }`.
    - `computeBoundTextPosition`: Dispatches `{ container, boundTextElement, containerCoords, y, x, headerOffset: 0, stripOffset: 0 }`. Applies `headerOffset` to vertical alignment and `stripOffset` to horizontal alignment, ensuring bound text clears container title bars and swimlane headers.
    - `computeContainerDimension`: Dispatches `{ container, dimension, padding, result }` allowing the host to dynamically drive container auto-sizing.
    - `getBoundTextMaxWidth` & `getBoundTextMaxHeight`: Allow host plugins to restrict bound text bounds inside irregular shapes (braces, speech bubbles).
- **Expand/Collapse Detail Icons**:
  - `renderDetailIcon` in `staticScene.ts`: Elements with `element.customData?.detail` display an expand/collapse toggle icon (`DETAIL_IMGS.show` / `DETAIL_IMGS.hide`). If `element.customData?.fixed` is true, scales inversely to zoom to maintain consistent UI size.
  - `renderCustomIcons`: Dispatches `window.EA_Core.dispatchSync("renderCustomIcons", { element, context, appState, elementsMap })` during static scene rendering.
- **Arc Roundness for Rectangles**:
  - In `shape.ts`, if `element.roundness.roundType === "arc"`, rectangles render true circular SVG arc paths (`A ${r} ${r} 0 0 1 ... Z`) rather than standard quadratic bezier corners.

---

### 3.4 Color System, Palette Proxies & Reality Check
- **Dynamic ES6 Proxy Palettes**:
  - `STATIC_PALETTE`: Contains standard open-color shades.
  - `COLOR_PALETTE`: Wraps `STATIC_PALETTE` in an ES6 `Proxy`. Intercepts property reads to dynamically query extra colors via `window.EA_Core.dispatchSync("excalidrawExtraColors", context)`.
  - `generateShades`: Invokes `window.ExcalidrawAutomate.getCM(base)` to generate 5 stepped shades (`lighterBy(step * 4) ... base`). Handles `"transparent"` explicitly.
  - `COMMON_ELEMENT_SHADES` & `createDynamicPalette`: Dynamically expose host-injected colors across stroke and background palettes.
- **Palette UI Enhancements (`PickerColorList.tsx`)**:
  - `__group__<Title>`: Intercepted and rendered as a full-row category header (`gridColumn: "1 / -1"`).
  - `__spacer__*`: Rendered as an empty placeholder square (`1.875rem` $\times$ `1.875rem`) to maintain the 5-column grid layout when categories have uneven color counts.
  - Missing translation keys fall back directly to the color key name.
- **Reality Check on Gradients and Shadows**:
  - **No Native Element Gradients**: Excalidraw element models do not support gradient fill styles natively. Fill styles remain limited to Rough.js styles (`hachure`, `cross-hatch`, `solid`, `zigzag`). Custom gradient fills require intercepting canvas rendering via host hooks (`drawElementOnCanvas` or `renderElementBefore`).
  - **No Native Drop Shadows**: Elements do not possess drop shadow properties (outside standard sticky note paper shadows). Any custom shadow effects must be applied externally via canvas hooks.

---

### 3.5 Fixed and Hidden Elements
- **Hidden Elements (`element.customData?.hide: true`)**:
  - **Viewport Culling**: Pruned from `visibleElements` in `Renderer.ts` (`isElementInViewport(...) && !element?.customData?.hide`).
  - **Hit Testing**: Excluded from selection and click detection in `App.tsx` (`getElementsAtPosition`).
  - **Embeddables**: Excluded from iframe initialization in `App.tsx`.
- **Fixed Elements (`element.customData?.fixed: true`)**:
  - **Viewport Retention**: In `Renderer.ts`, elements marked with `customData.fixed` are always retained in `visibleElements` regardless of canvas scroll/zoom (unless `opacity === 0 && locked === true`).
  - **Detail Icon Scaling**: In `staticScene.ts`, `renderDetailIcon` applies inverse zoom scaling (`context.scale(1 / zoom, 1 / zoom)`).
  - **Code Reality**: Selection box coordinate transformation for fixed elements was explored in `renderElement.ts` (lines 1060-1080) but remains commented out. Complete viewport coordinate pinning is managed by host plugins via `renderElementBefore` and `drawElementFromCanvas`.

---

### 3.6 Animated GIF Handling
- **Decoding Pipeline (`packages/element/src/gif.ts`)**:
  - Uses `gifuct-js` to decode base64 data URLs into individual `ImageBitmap` frames with delay timings.
- **Image Cache Integration (`packages/element/src/image.ts`)**:
  - In `updateImageCache`, if `elements[index]?.customData?.gif` is truthy and MIME type is `image/gif`, flags `data.isAnimated = true` and decodes frames into `data.frames`.
  - Once resolved, sets `element.customData.gif.frameCount = framesResolved.length`.
- **Canvas Rendering (`packages/element/src/renderElement.ts`)**:
  - In `drawElementOnCanvas`, checks `cacheEntry?.isAnimated && cacheEntry.frames != null`.
  - Renders `cacheEntry.frames[element?.customData?.gif?.index || 0]?.bitmap` onto the canvas via `context.drawImage()`.
- **Playback Architecture**:
  - Frame advancement is driven externally by the Obsidian host plugin or animation timer, which increments `element.customData.gif.index`. The component renders whichever frame is indexed.

---

### 3.7 Laser Pointer Options
- **Configuration Bridge (`packages/excalidraw/laserTrails.ts`)**:
  - Upstream supported `DECAY_TIME`, `DECAY_LENGTH`, and a single `COLOR`.
  - Fork adds separate `STROKE_COLOR` and `FILL_COLOR` options:
    - `getStrokeColor = () => window.ExcalidrawAutomate?.LASERPOINTER?.STROKE_COLOR ?? "red"`
    - `getFillColor = () => window.ExcalidrawAutomate?.LASERPOINTER?.FILL_COLOR ?? "red"`
- **Path Rendering (`packages/excalidraw/animatedTrail.ts`)**:
  - Sets fill attribute if `this.trailAnimation || this.options.stroke` is truthy, enabling outlined laser trails.

---

### 3.8 Multi-Font Engine & Font Picker
- **String Font Identifiers**:
  - `FontFamilyValues` in `types.ts` typed as `number | string`.
  - `Fonts._registered` in `Fonts.ts` is keyed by `number | string`.
  - `FONT_METADATA` in `font-metadata.ts` typed as `Record<number | string, FontMetadata>`.
- **Resilient Font Loading**:
  - In `Fonts.ts`, `loadFontsForDocument` wraps font loading in a `try...catch` block. If a custom webfont fails to load, the error is logged without aborting the entire document font loading generator.
- **Font Picker Behavior (`FontPicker.tsx` & `FontPickerList.tsx`)**:
  - `isDefaultFont` returns `false` if `typeof fontFamily !== "number"`.
  - `FontPickerList` passes string font identifiers directly to `onSelect(font.value)` without forcing numeric conversion.
- **CSS Generation (`obsidianUtils.ts`)**:
  - `getCSSFontDefinition` and `getCSSFontDefinition2` accept `fontFamily: number | string`, mapping numbers to family names or reading custom font URLs directly to produce valid `@font-face` rules.

---

### 3.9 Library Grouping & Lazy Hydration
- **Dynamic Grouping by Status (`LibraryMenuItems.tsx`)**:
  - Replaces rigid personal/excalidraw sections with dynamic mapping of `item.status`. Each distinct status string generates a dedicated section header and grid.
- **Image SVG Previews (`useLibraryItemSvg.ts`)**:
  - Scans library items for image elements (`type === "image"`), reconstructs `BinaryFiles` entries from `app.imageCache`, and forwards them to `exportLibraryItemToSvg`, allowing library previews of images to render correctly.
- **On-Demand Lazy File Hydration (`LibraryUnit.tsx`)**:
  - Synchronous check: `window.EA_Core.dispatchSync("onLibraryUnitCheck", syncContext)`.
  - Asynchronous hydration: If `syncContext.isMissingFiles` is true, triggers `window.EA_Core.dispatchAsync("onLibraryUnitHydrate", { id, elements, excalidrawApp, svgCache, updateImageCache, rerender })` to load missing binary data from vault files.
  - Displays skeleton loader while hydration is in progress.

---

### 3.10 Complete `window.EA_Core` Dispatch Event Directory

The component exposes **49 distinct hook events** through `window.EA_Core` to facilitate deep plugin integration.

| Event Name | Type | Calling File | Calling Function / Context | Interception / Behavior |
|---|---|---|---|---|
| `excalidrawExtraColors` | Sync | `common/src/colors.ts` | `getExtraColors` | Populates `context.colors` with custom plugin color definitions. |
| `replaceAllElements` | Sync | `element/src/Scene.ts` | `Scene.replaceAllElements` | Notifies host when entire scene elements array is replaced. |
| `dragSelectedElements` | Sync | `element/src/dragElements.ts` | `dragSelectedElements` | If returns true, cancels default element drag mutation. |
| `handlePointDragging` | Sync | `element/src/linearElementEditor.ts` | `LinearElementEditor.handlePointDragging` | Allows host to constrain or modify point dragging (fix length, angle snapping). |
| `drawElementOnCanvas` | Sync | `element/src/renderElement.ts` | `drawElementOnCanvas` | If returns true, cancels component canvas drawing for custom rendering. |
| `drawElementOnCanvasTextBefore` | Sync | `element/src/renderElement.ts` | `drawElementOnCanvas` (text) | If returns true, skips default `context.fillText`. |
| `drawElementOnCanvasTextAfter` | Sync | `element/src/renderElement.ts` | `drawElementOnCanvas` (text) | Hook fired immediately after text fillText executes. |
| `drawElementFromCanvas` | Sync | `element/src/renderElement.ts` | `drawElementFromCanvas` | If returns true, intercepts cached canvas blitting. |
| `renderElementBefore` | Sync | `element/src/renderElement.ts` | `drawElement` | If returns true, bypasses default element rendering. |
| `renderElementAfter` | Sync | `element/src/renderElement.ts` | `drawElement` | Fired after element rendering completes. |
| `shouldSelectElement` | Sync | `element/src/selection.ts`, `excalidraw/components/App.selectionTool.ts`, `actions/actionSelectAll.ts` | Selection filtering | Sets `context.shouldSelect` (boolean) to filter element selection. |
| `generateRoughOptions` | Sync | `element/src/shape.ts` | `generateRoughOptions` | Allows host to mutate Rough.js rendering options. |
| `beforeWrapText` | Sync | `element/src/textElement.ts` | `redrawTextBoundingBox`, `handleBindTextResize` | Passes `{ textElement, text, indent }` before text wrapping. |
| `afterMeasureTextBoundingBox` | Sync | `element/src/textElement.ts` | `redrawTextBoundingBox`, `handleBindTextResize` | Dispatches measured text metrics to host engine. |
| `computeBoundTextPosition` | Sync | `element/src/textElement.ts` | `computeBoundTextPosition` | Host can set `x`, `y`, `headerOffset`, `stripOffset` for container text positioning. |
| `computeContainerDimension` | Sync | `element/src/textElement.ts` | `computeContainerDimensionForBoundText` | Host sets `hookCtx.result` to override container auto-sizing. |
| `getBoundTextMaxWidth` | Sync | `element/src/textElement.ts` | `getBoundTextMaxWidth` | Host sets `hookCtx.result` to override bound text max width. |
| `getBoundTextMaxHeight` | Sync | `element/src/textElement.ts` | `getBoundTextMaxHeight` | Host sets `hookCtx.result` to override bound text max height. |
| `onBeforeAddToLibrary` | Async | `excalidraw/actions/actionAddToLibrary.ts` | `actionAddToLibrary` | If returns true, cancels library addition. Can set `context.name`. |
| `beforeDeleteSelectedElements` | Sync | `excalidraw/actions/actionDeleteSelected.tsx` | `deleteSelectedElements` | Fired before deleting selected elements. |
| `afterDeleteSelectedElements` | Sync | `excalidraw/actions/actionDeleteSelected.tsx` | `deleteSelectedElements` | Fired after deleting selected elements with remaining elements context. |
| `deleteSelectedElements` | Sync | `excalidraw/actions/actionDeleteSelected.tsx` | `actionDeleteSelected.perform` | Action-level delete hook. |
| `renderCustomDocument` | Sync | `excalidraw/components/App.tsx` | Embeddable render loop | Renders custom document views (PDF, markdown, etc.) inside embeddable nodes. |
| `addElementsFromPasteOrLibrary` | Async | `excalidraw/components/App.tsx` | `addElementsFromPasteOrLibrary` | Fired before pasting or dropping library elements onto canvas. |
| `updateScene` | Sync | `excalidraw/components/App.tsx` | `App.updateScene` | Fired during scene state updates. |
| `onKeyDown` | Sync | `excalidraw/components/App.tsx` | `App.onKeyDown` | If returns true, intercepts keyboard shortcuts. |
| `onKeyDownArrowKey` | Sync | `excalidraw/components/App.tsx` | `App.onKeyDown` | If returns true, intercepts arrow key element nudging. |
| `onTextWysiwygChange` | Sync | `excalidraw/components/App.text.ts` | `AppText.handleTextWysiwyg` | Intercepts live text updates during WYSIWYG editing. |
| `handleTextWysiwyg` | Sync | `excalidraw/components/App.text.ts` | `AppText.handleTextWysiwyg` | Intercepts WYSIWYG editor initialization. |
| `afterGetElementsAtPosition` | Sync | `excalidraw/components/App.tsx` | `App.getElementsAtPosition` | Host can filter or reorder hit-tested elements. |
| `beforeStartTextEditing` | Sync | `excalidraw/components/App.text.ts` | `AppText.startTextEditing` | If returns true, prevents entering text edit mode. |
| `handleCanvasDoubleClick` | Sync | `excalidraw/components/App.tsx` | `App.handleCanvasDoubleClick` | If returns true, intercepts double click handling. |
| `handleCanvasPointerDown` | Sync | `excalidraw/components/App.tsx` | `App.handleCanvasPointerDown` | If returns true, intercepts canvas pointer down. |
| `handleCanvasPointerMove` | Sync | `excalidraw/components/App.tsx` | `App.handleCanvasPointerMove` | If returns true, intercepts canvas pointer move. |
| `handleCanvasPointerUp` | Sync | `excalidraw/components/App.tsx` | `App.handleCanvasPointerUp` | If returns true, intercepts canvas pointer up. |
| `onPointerUpFromPointerDown` | Sync | `excalidraw/components/App.tsx` | Pointer click handling | Fired on click completion. |
| `handleLinearElementOnPointerDown` | Sync | `excalidraw/components/App.tsx` | Linear element pointer down | Intercepts pointer down on lines/arrows. |
| `modifyElementsToDrag` | Sync | `excalidraw/components/App.selectionTool.ts` | `AppSelectionTool.handleSelectionDragOnPointerMove` | Allows host to dynamically modify list of elements being dragged. |
| `afterCreateGenericElement` | Sync | `excalidraw/components/App.tsx` | Element creation | Dispatched immediately after creating a new generic element. |
| `afterTransformElements` | Sync | `excalidraw/components/App.selectionTool.ts` | `AppSelectionTool.maybeHandleResize` | Dispatched after resizing or rotating elements. |
| `handleWheelZoom` | Sync | `excalidraw/components/App.wheel.ts` | `AppWheel.zoomBy` | Dispatches wheel event, zoom level, and viewport position. |
| `onLibraryUnitCheck` | Sync | `excalidraw/components/LibraryUnit.tsx` | `LibraryUnit` mount | Sets `syncContext.isMissingFiles: true` if library item requires files. |
| `onLibraryUnitHydrate` | Async | `excalidraw/components/LibraryUnit.tsx` | `LibraryUnit` mount | Triggers on-demand binary file loading for library items. |
| `shouldHideSelectionBox` | Sync | `excalidraw/renderer/interactiveScene.ts` | Interactive scene render | Host sets `hookCtx.shouldHide: true` to suppress selection outline. |
| `renderInteractiveScene` | Sync | `excalidraw/renderer/interactiveScene.ts` | `renderInteractiveScene` | Post-render hook exposing interactive canvas 2D context and elements. |
| `renderCustomIcons` | Sync | `excalidraw/renderer/staticScene.ts` | `renderStaticScene` | Dispatched to render custom container or detail icons on canvas. |
| `renderStaticScene` | Sync | `excalidraw/renderer/staticScene.ts` | `renderStaticScene` | Post-render hook exposing static canvas 2D context, rc, and visible elements. |
| `renderElementToSvgCheck` | Sync | `excalidraw/renderer/staticSvgScene.ts` | `renderElementToSvg` | If returns true, host replaces default SVG rendering for that element. |
| `renderElementToSvg` | Async | `excalidraw/renderer/staticSvgScene.ts` | `renderElementToSvg` | Post-render hook notified after element is converted to SVG. |

---

### 3.11 Legacy Window Hooks Directory
The following legacy hooks exist on `window` and remain active or guarded:

| Hook Property | File | Purpose |
|---|---|---|
| `window.duplicateElementHook` | `element/src/duplicate.ts` | Legacy post-duplicate callback. |
| `window.resizeSingleElementHook` | `element/src/resizeElements.ts` | Legacy element resize callback. |
| `window._generateElementShapeHook` | `element/src/shape.ts` | Legacy shape generation override. |
| `window.templateMap` | `element/src/newElement.ts`, `element/src/resizeElements.ts` | Template text replacement lookup map. |
| `window.translateCanvas_Hook` | `excalidraw/components/App.viewport.ts` | Viewport translation notification. |
| `window.ExcalidrawAutomate.plugin.settings` | `excalidraw/actions/actionProperties.tsx` | Reads stroke width slider bounds (`strokeWidthSliderMin/Max/Step`). |
| `window.ExcalidrawAutomate.LASERPOINTER` | `excalidraw/laserTrails.ts` | Reads laser stroke and fill colors. |
| `window.ExcalidrawAutomate.getCM` | `common/src/colors.ts` | Invoked to calculate color shades. |
| `window.h` | `excalidraw/components/App.tsx` | Development/test harness exposing scene and elements. |

---

### 3.12 Scene & SVG Export Modifications
- **Asynchronous SVG Scene Pipeline (`staticSvgScene.ts`)**:
  - `renderSceneToSvg` and `renderElementToSvg` are converted to `async`.
  - Employs sequential `for...of` loops:
    1. Normal elements (non-embeddable) rendered first.
    2. Bound text elements rendered with their containers.
    3. Iframe/embeddable elements rendered last.
  - Guarantees exact SVG layering order while permitting asynchronous element generation.
- **SVG Interception & Notification**:
  - `renderElementToSvgCheck`: Synchronously queried before rendering each element; allows host to generate custom SVG nodes.
  - `renderElementToSvg`: Asynchronously notified after each element node is generated.
- **Export Serializer (`export.ts`)**:
  - `exportToSvg` awaits `renderSceneToSvg` and embeds the complete serialized scene JSON into SVG metadata.

---

### 3.13 Exposed Imperative API Surface
In `packages/excalidraw/components/App.tsx` (`getExcalidrawAPI()`) and `types.ts`, `ExcalidrawImperativeAPI` exposes direct internal engine access:
- `App: InstanceType<typeof App>`: The active Excalidraw App component instance.
- `ShapeCache: ShapeCache`: Direct access to the shape cache for clearing or generating rough shapes (`ShapeCache.delete(element)`).
- `elementWithCanvasCache: typeof elementWithCanvasCache`: Cached canvas bitmap map for accelerated blitting.

---

## 4. Replay & Porting Checklist (Future Upstream Merges)

When rebasing or upgrading `@zsviczian/excalidraw` to a newer upstream release, follow this sequence:

1. **Baseline Preparation**:
   - Create a clean merge branch from the new upstream tag/commit.
   - Verify Node.js 22+ and run `yarn install --frozen-lockfile`.
2. **Dependency Preservation**:
   - Ensure `gifuct-js` is present in `packages/excalidraw/package.json`.
   - Ensure `tinycolor2` and `open-color` (`1.9.1`) are present in `packages/common/package.json`.
   - Verify that `roughjs` remains standard public npm `4.6.4`.
3. **Core Patch Application Order**:
   - **Step 1: Common Packages**: Apply `colors.ts` (Proxy palettes, shade generation), `constants.ts` (zoom boundaries, curve arrow), and `font-metadata.ts`.
   - **Step 2: Element Types & Binding**: Apply `types.ts` (arrowhead types, roundType), `binding.ts` (snap candidates, edge snapping), and `shape.ts` (Catmull-Rom block arrows, bezier curves, SVG paths).
   - **Step 3: Element Rendering & Text**: Apply `renderElement.ts` (canvas hooks, GIF drawing), `textElement.ts` (container layout hooks), and add `packages/element/src/gif.ts`.
   - **Step 4: Application & Actions**: Apply `actionProperties.tsx` (custom controls), `App.tsx` (imperative API, EA_Core events), and `interactiveScene.ts` (snap crosshairs).
   - **Step 5: SVG Export & UI**: Apply `staticSvgScene.ts` (async for...of loop) and `LibraryUnit.tsx` (lazy hydration).
4. **Verification & Conflict Resolution**:
   - Run TypeScript typecheck: `yarn test:typecheck`.
   - Verify AST parity against previous ymjr baseline.
   - Confirm build output with `yarn --cwd packages/excalidraw build:obsidian`.

---

## 5. High-Risk Obsidian, Popout & Mobile Smoke Scenarios

Execute the following verification matrix before certifying builds:

| Scenario / Environment | Verification Steps | Pass Criteria | High-Risk Failure Mode |
|---|---|---|---|
| **Main Obsidian Workspace: Block Arrows & Curves** | 1. Create a 4-point arrow.<br>2. Select "Block" arrowhead.<br>3. Toggle "Roundness" (curve mode).<br>4. Adjust arrowhead size slider. | Smooth Catmull-Rom curve renders with solid/outline block head; no visual pinching or miter spikes. | Nan / infinite coordinate explosion if points collapse; canvas clipping if bounds padding fails. |
| **Main Obsidian Workspace: Snap & Edge Binding** | 1. Create rectangle and custom SVG shape.<br>2. Set target snap mode to "Points", then "Edge".<br>3. Drag arrow endpoint toward shape perimeter. | Magenta `#ff00ff` crosshairs appear at candidate points; arrow snaps cleanly to vertices or edge projection; self-binding does not collapse. | Arrow snapping jumps erratically or fails to detect rotated/flipped shapes. |
| **Main Obsidian Workspace: Dynamic Color Palettes** | 1. Open color picker panel.<br>2. Verify custom plugin color categories and spacer alignment. | Category headers (`__group__`) span full row; spacers align 5-column grid; shades generate cleanly. | Missing translation keys showing raw strings; grid layout collapse. |
| **Main Obsidian Workspace: Animated GIF Playback** | 1. Insert an animated GIF file into drawing.<br>2. Advance frame index via plugin automation. | Canvas updates to target frame bitmap; frame count reflects decoded total; no memory leak. | `gifuct-js` decoding buffer failure; canvas black frame if promise unhandled. |
| **Popout Window: Secondary Window Scope** | 1. Drag Excalidraw leaf into a separate Obsidian popout window.<br>2. Edit text, select elements, trigger wheel zoom. | All `window.EA_Core` hooks resolve against root host; wheel zoom functions; font definitions inject into popout document. | `window` referencing popout instead of parent host; lost EA_Core events; missing styles. |
| **Mobile: Touch Drag & Keyboard WYSIWYG** | 1. Open drawing on iOS / Android mobile client.<br>2. Drag elements and resize using touch.<br>3. Double-tap to enter text editing.<br>4. Trigger emoji suggester. | Cardinal handles responsive to touch; soft keyboard does not prematurely blur text editor; emoji suggester click preserved. | Mobile blur event prematurely submitting text; devicePixelRatio miscalculating canvas coordinates. |
| **Canvas Extreme Zoom & Pan** | 1. Zoom out beyond standard limit down to `0.03`.<br>2. Pan across large canvas with fixed elements present. | Canvas remains responsive down to 3% zoom; fixed elements remain visible in viewport; no rendering freeze. | Viewport culling incorrectly dropping fixed elements; zoom constraints clamping early. |
| **Library Lazy Hydration** | 1. Insert library items containing vault image files.<br>2. Close vault and reopen offline. | Skeleton preview displays until `onLibraryUnitHydrate` resolves; image previews render from cache. | Crash on missing local image files; blank library unit icons. |

---

## 6. Release 2.29.0 (`@zsviczian/excalidraw@0.18.143`) Sync & Line Snapshot

- **Paired Plugin Release**: [`2.29.0`](https://github.com/zsviczian/obsidian-excalidraw-plugin/releases/tag/2.29.0) (tag/commit `4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb`).
- **Upstream Component Target**: `@zsviczian/excalidraw@0.18.143` (commit `b965b9f72227b9a0be31a6a74e4d477cea2c2a90`, verified via plugin `package.json`, `package-lock.json` integrity `sha512-ElZG+PmNM1AL4JVp6sPoLkf9xZ9zbUiTjgWBT8EBtPcRSWx6zQV9BRXD5XSG9k0d+GFpUyypltxkoKhHDDK3IQ==`, and npm registry `gitHead`).
- **Conflict & Structural Adaptation Log**:
  - `packages/common/src/constants.ts` (`L371-372`): Retained `MIN_ZOOM = 0.03` and `MAX_ZOOM = 30.0` alongside upstream's new `DEFAULT_ZOOM`.
  - `packages/element/src/newElement.ts` (`L143-145, L586, L591-596, L609-617, L622`): Integrated upstream `maxWidth` auto-wrap in `refreshTextDimensions` while preserving `customData.template` substitution and `customData.indent` forwarding.
  - `packages/excalidraw/components/App.tsx`, `App.text.ts`, and `App.selectionTool.ts`: Upstream extracted clipboard, text, and selection-tool sub-controllers out of `App.tsx`. Ported `onTextWysiwygChange`, `handleTextWysiwyg`, and `beforeStartTextEditing` hooks into `App.text.ts` (`L315-343, L458-464, L754-785, L839-854, L921-923`), and ported `shouldSelectElement`, `afterTransformElements`, `modifyElementsToDrag`, and `svgPathShape`/`curveArrow` deselect guards into `App.selectionTool.ts` (`L355-369, L391-392, L733-743, L1023-1050, L1468-1469`). Added compatibility delegates on `App` (`L712-721`) and re-imported `getElementAbsoluteCoords` (`L205`) for `hitDetailElement` hit testing.
  - `packages/excalidraw/components/FontPicker/FontPicker.tsx` (`L62-63, L90, L94-96, L115, L236`): Used `isDefaultFont(fontFamily)` in `needsGlyphSample` (`L115`) to support `number | string` `FontFamilyValues`.
  - `packages/excalidraw/components/LibraryUnit.tsx` (`L43-74, L85-86, L93`): Combined `shouldShowSkeleton` (`!svg || syncContext.isMissingFiles`) with upstream's `"library-unit--named": showName`.
  - `packages/excalidraw/package.json` (`L108-109`): Preserved `"gifuct-js": "^2.1.2"` in `dependencies` while keeping `"sass": "1.51.0"` in `devDependencies`.
  - `packages/excalidraw/wysiwyg/textWysiwyg.tsx` (`L81, L421-422, L440-441, L544-546, L847-852, L1151-1157, L1345`): Combined `.emoji-suggester:hover` blur guard with upstream's `editable.focus({ preventScroll: true })` and `editorBox!.appendChild(editable)`.

## 7. Release 2.29.1-1 integration

<!-- ymjr -- Semantic integration of the selected release with the existing custom source. -->
- **Source/mode:** ordinary merge from custom `95ca0df452d8411efa7d57347d8bf5551cf814af` on `sync/release-2.29.1-20261101-230136`, preserving both parents. The common ancestor is exactly `b965b9f72227b9a0be31a6a74e4d477cea2c2a90`; no tag-after development/backport is included. The plugin's `ymjr-component.json` and final release receipt identify the completed custom SHA.
- **Rendering conflicts:** preserve GIF frame selection, `versionNonce` bitmap/shape invalidation, SVG path/layer shapes, line crossings, table edge/shadow rendering and script pre/post hooks. Native `withSavedContext`, owning `RenderEnvironment` canvas/image/path factories, image placeholders and link-icon cache remain the single upstream implementation. Hooks do not bypass its guaranteed context restoration.
- **Text conflicts:** keep table opt-in layout, template substitution and before/after measurement events; native wrapping receives `RenderEnvironment` as argument four. The old argument-four `indent` was unused by the pre-merge wrapper, so removing that inert argument and its obsolete forwarding preserves wrapping behavior. Native arrow labels no longer grow their arrow container. The saved `customData.indent` field and script hooks remain unchanged.
- **Fonts/library:** preserve numeric-to-named registry lookup, custom font descriptors and guarded loading, with the supplied owner font set and upstream local-font no-fetch guard. Image-backed library SVG previews use `exportScene` with recovered binary files. Async SVG hooks still complete sequentially before export.
- **Arrows:** native default sizing gains its short-segment fallback; explicit `customData.arrowHeadSize !== 1` retains the existing unbounded custom size. Chevron/block arrowheads, custom line width, curve/block width, explicit elbow radius/crossings, full-width controls and power-curve slider remain active.
- **Host boundary:** adopt upstream protocol 4 and scoped SVG/Lucide/Mermaid insertion. Keep the custom scene/table APIs, shape cache access, string-font public API, hook directory and all saved metadata. No package is published to npm.
- **Current key locations:** `Scene.onBeforeUpdate` (`packages/element/src/Scene.ts:317`); `getTableTextLayout` (`tableText.ts:20`); `drawManagedTableRectangle/renderManagedTableSvg` (`tableVisual.ts:48/102`); table rendering (`renderElement.ts:555`, `renderer/staticSvgScene.ts:328`); `registerLocalFont` (`packages/excalidraw/obsidianUtils.ts:111`); custom arrow scaling (`bounds.ts:1116`); `actionChangeArrowheadSize` (`packages/excalidraw/actions/actionProperties.tsx:2711`). Element-relative names above are under `packages/element/src/`.
- **Preserved feature groups:** colors/gradients; zoom/font metadata; custom snapping/binding; arrowheads/curves; GIFs; templates and text/layout hooks; custom selections/handles; Library naming/hydration; custom pens/laser; exposed native editing/cache helpers; SVG export hooks and native table appearance. Source review is not proof of all interaction paths; actual build/runtime checks and platform limits must be recorded separately in the release receipt.
- **Executed verification:** dedicated runtime/declarations build passes; 26 table/host tests and all 146 independent Obsidian-owned tests pass. The three font cases now obtain named registry fixtures and parse generated CSS instead of pinning quotes/serialization. A fresh Windows Obsidian 1.14.5 profile exercised cold startup, protocol 4, existing table IDs/source, native text editing/ellipsis, themes/shadow, multicolor SVG layers, block arrows, editable SVG/Lucide insertion, PNG/SVG export, offline custom-font registration, companion MathJax, trusted script persistence, dirty migration in both directions, source-API retirement, popout ownership, plugin reload and Library opening, with no captured renderer errors. Other desktop platforms, physical mobile, full GIF/market/encryption interaction coverage and hosted CodeScanner remain unverified.
