import { UPLOAD_KINDS } from "../../shared/content.js";
import type { UploadKind } from "./uploads";

const dotted = (kind: UploadKind) => (UPLOAD_KINDS[kind].extensions as string[]).map((ext) => `.${ext}`).join(",");

export const ACCEPT: Record<UploadKind, string> = {
  image: `image/*,${dotted("image")},.heic,.heif`,
  video: `video/*,${dotted("video")}`,
  audio: `audio/*,${dotted("audio")}`,
  file: dotted("file"),
};

/** Opens the system file chooser. Must be called straight from a click or tap. */
export function pickFiles(kind: UploadKind, multiple = kind === "image"): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT[kind];
    input.multiple = multiple;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });
}
