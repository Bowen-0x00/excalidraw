// ymjr: GIF decoding helper for animated image playback
import { parseGIF, decompressFrames } from "gifuct-js";

function dataURLToArrayBuffer(dataURL: string): ArrayBuffer {
  const base64 = dataURL.split(",")[1] || "";
  const binary = atob(base64);
  const len = binary.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr.buffer;
}

/** ymjr: Decodes a GIF into an array of ImageBitmaps with frame delay in ms */
export async function decodeGifToBitmaps(
  dataURL: string,
  maxWidth?: number,
  maxHeight?: number,
) {
  const ab = dataURLToArrayBuffer(dataURL);
  const gif = parseGIF(ab);
  const frames = decompressFrames(gif, true); // true => return RGBA patch

  const out: Array<{ bitmap: ImageBitmap; delay: number }> = [];
  const off = document.createElement("canvas");
  const ctx = off.getContext("2d")!;

  for (const f of frames) {
    // dims: { width, height, top, left }
    const w = f.dims.width;
    const h = f.dims.height;

    // optionally scale down to reduce memory:
    const scale = Math.min(
      1,
      maxWidth ? maxWidth / w : 1,
      maxHeight ? maxHeight / h : 1,
    );
    const renderW = Math.max(1, Math.floor(w * scale));
    const renderH = Math.max(1, Math.floor(h * scale));

    off.width = renderW;
    off.height = renderH;

    // create ImageData from RGBA patch (note: patch length = w*h*4)
    const imgData = new ImageData(new Uint8ClampedArray(f.patch), w, h);

    // draw into off-canvas with scaling
    // because imgData size may differ from canvas size, draw into temp canvas first
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    tmp.getContext("2d")!.putImageData(imgData, 0, 0);

    // scale tmp -> off
    ctx.clearRect(0, 0, off.width, off.height);
    ctx.drawImage(
      tmp,
      0,
      0,
      tmp.width,
      tmp.height,
      0,
      0,
      off.width,
      off.height,
    );

    const bitmap = await createImageBitmap(off);
    out.push({ bitmap, delay: f.delay }); // f.delay is in hundredths of a second in some libs; check unit if needed
  }

  return out;
}
