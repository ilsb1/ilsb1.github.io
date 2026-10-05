import { createContext, useContext } from "react";
import type { EditBlock } from "./pageModel";
import type { Uploads } from "./useUploads";

export type EditorApi = {
  mediaBase: string;
  uploads: Uploads;
  /** Where to show a file from: the copy on this device while it's fresh, otherwise the stored one. */
  display: (src: string) => string;
  update: (id: string, change: (block: EditBlock) => EditBlock) => void;
  addPhotos: (blockId: string, files: File[]) => void;
  removePhoto: (blockId: string, key: string) => void;
  setFile: (blockId: string, file: File) => void;
  notify: (text: string) => void;
};

export const EditorContext = createContext<EditorApi | null>(null);

export function useEditor() {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditor outside the page editor");
  return api;
}
