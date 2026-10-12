import { LIBRARY_DISABLED_TYPES, randomId } from "@excalidraw/common";
import { deepCopyElement } from "@excalidraw/element";

import { CaptureUpdateAction } from "@excalidraw/element";

import { t } from "../i18n";

import { register } from "./register";

export const actionAddToLibrary = register({
  name: "addToLibrary",
  trackEvent: { category: "element" },
  perform: async (elements, appState, _, app) => {
    //ymjr
    const selectedElements = app.scene.getSelectedElements({
      selectedElementIds: appState.selectedElementIds,
      includeBoundTextElement: true,
      includeElementsInFrames: true,
    });

    for (const type of LIBRARY_DISABLED_TYPES) {
      if (selectedElements.some((element) => element.type === type)) {
        return {
          captureUpdate: CaptureUpdateAction.EVENTUALLY,
          appState: {
            ...appState,
            errorMessage: t(`errors.libraryElementTypeError.${type}`),
          },
        };
      }
    }

    //ymjr+++>>>
    try {
      const items = await app.library.getLatestLibrary();
      const newElements = selectedElements.map(deepCopyElement);
      let itemName = "";

      const core = (window as any).EA_Core;
      if (core) {
        const context = { newElements, app, items, name: itemName };
        const isIntercepted = await core.dispatchAsync(
          "onBeforeAddToLibrary",
          context,
          true,
        );
        if (isIntercepted) return false;
        itemName = context.name || "";
      }

      await app.library.setLibrary([
        {
          id: randomId(),
          status: "unpublished",
          elements: newElements,
          created: Date.now(),
          name: itemName, //ymjr
        },
        ...items,
      ]);

      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: {
          ...appState,
          toast: { message: t("toast.addedToLibrary") },
        },
      };
    } catch (error: any) {
      return {
        captureUpdate: CaptureUpdateAction.EVENTUALLY,
        appState: {
          ...appState,
          errorMessage: error.message,
        },
      };
    }
    //ymjr<<<+++
  },
  label: "labels.addToLibrary",
});
