export type PhotoSize = "small" | "medium" | "large";

export type PhotoItem = { src: string; width: number; height: number; caption: string };

export type Block =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "photos"; size: PhotoSize; items: PhotoItem[] }
  | { id: string; type: "video"; source: "link"; url: string; caption: string }
  | { id: string; type: "video"; source: "file"; src: string; caption: string }
  | { id: string; type: "audio"; src: string; title: string }
  | { id: string; type: "file"; src: string; title: string; name: string; size: number; ext: string }
  | { id: string; type: "link"; url: string; title: string; note: string };

export type BlockType = Block["type"];
