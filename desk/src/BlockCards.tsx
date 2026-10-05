import { memo, useState, type DragEvent, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { videoEmbed } from "../../shared/content.js";
import { BlockView } from "../../src/content/Blocks";
import { useEditor } from "./editorContext";
import { pickFiles } from "./filePick";
import {
  IconAlert,
  IconAudio,
  IconDown,
  IconFile,
  IconGrip,
  IconLeft,
  IconLink,
  IconPaste,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconRight,
  IconText,
  IconTrash,
  IconUp,
  IconUpload,
  IconVideo,
} from "./icons";
import { BLOCK_LABELS, MAX_PHOTOS, toBlocks, type Block, type BlockType, type EditBlock, type PhotoSize } from "./pageModel";
import RichField from "./RichField";
import type { UploadKind } from "./uploads";
import type { UploadEntry } from "./useUploads";

export function BlockIcon({ type, size = 18 }: { type: BlockType; size?: number }) {
  switch (type) {
    case "text":
      return <IconText size={size} />;
    case "photos":
      return <IconPhoto size={size} />;
    case "video":
      return <IconVideo size={size} />;
    case "audio":
      return <IconAudio size={size} />;
    case "file":
      return <IconFile size={size} />;
    case "link":
      return <IconLink size={size} />;
  }
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + (event.key === "ArrowRight" ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[options.indexOf(next)]?.focus();
  }
  return (
    <div className="seg" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            className={`seg__btn${on ? " is-on" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function hasFiles(event: DragEvent) {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

const CHOOSE_WORDS: Record<UploadKind, { button: string; title: string; hint: string }> = {
  image: { button: "Choose photos", title: "Add photos", hint: "Drop photos here, or choose them from your computer or phone." },
  video: { button: "Choose a video", title: "Upload a video", hint: "MP4, MOV or WebM, up to 300 MB." },
  audio: { button: "Choose a recording", title: "Add a recording", hint: "MP3, M4A or WAV, up to 80 MB." },
  file: { button: "Choose a document", title: "Add a document", hint: "PDF, Word, PowerPoint or Excel, up to 100 MB." },
};

/** Lets files from the computer be dropped on one spot instead of the page as a whole. */
export function useDropTarget(onFiles: (files: File[]) => void, single = false) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      "data-own-drop": "",
      onDragOver: (event: DragEvent) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setOver(true);
      },
      onDragLeave: (event: DragEvent) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (event: DragEvent) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        setOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length) onFiles(single ? files.slice(0, 1) : files);
      },
    },
  };
}

export function FileDrop({ kind, onFiles }: { kind: UploadKind; onFiles: (files: File[]) => void }) {
  const target = useDropTarget(onFiles, kind !== "image");
  const words = CHOOSE_WORDS[kind];
  return (
    <div className={`drop${target.over ? " is-over" : ""}`} {...target.props}>
      <span className="drop__icon" aria-hidden="true">
        <IconUpload size={22} />
      </span>
      <p className="drop__title">{words.title}</p>
      <p className="drop__hint">{words.hint}</p>
      <button
        type="button"
        className="btn btn--ghost btn--small"
        onClick={() => {
          void pickFiles(kind).then((files) => {
            if (files.length) onFiles(files);
          });
        }}
      >
        {words.button}
      </button>
    </div>
  );
}

const PHASE_TEXT = {
  waiting: "Waiting…",
  preparing: "Getting the photo ready…",
  sending: "Uploading",
  finishing: "Saving…",
} as const;

export function UploadStatus({ entry, onRetry, onRemove }: { entry: UploadEntry; onRetry: () => void; onRemove: () => void }) {
  if (entry.phase === "error") {
    return (
      <div className="up up--error" role="alert">
        <p className="up__error">
          <IconAlert size={16} />
          <span>{entry.error}</span>
        </p>
        <div className="up__actions">
          <button type="button" className="btn btn--ghost btn--small" onClick={onRetry}>
            <IconRefresh size={15} />
            Retry
          </button>
          <button type="button" className="text-btn" onClick={onRemove}>
            Remove
          </button>
        </div>
      </div>
    );
  }
  const percent = Math.round(entry.progress * 100);
  const label = entry.phase === "sending" ? `${PHASE_TEXT.sending} ${percent}%` : PHASE_TEXT[entry.phase];
  return (
    <div className="up" role="status">
      <div
        className={`up__bar${entry.phase === "finishing" || entry.phase === "preparing" ? " is-busy" : ""}`}
        role="progressbar"
        aria-label={`Uploading ${entry.name}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span style={{ width: `${Math.max(4, percent)}%` }} />
      </div>
      <p className="up__text">
        <span className="up__name">{entry.name}</span>
        <span>{label}</span>
      </p>
    </div>
  );
}

export type Handle = {
  ref: Ref<HTMLButtonElement>;
  props: Record<string, unknown>;
};

type CardProps = {
  block: EditBlock;
  index: number;
  count: number;
  handle: Handle;
  onMove: (id: string, step: number) => void;
  onRemove: (id: string) => void;
};

function cardState(block: EditBlock, entries: Record<string, UploadEntry>) {
  const uploading =
    block.type === "photos"
      ? block.items.filter((item) => item.upload && entries[item.upload]?.phase !== "error").length
      : "upload" in block && block.upload && entries[block.upload]?.phase !== "error"
        ? 1
        : 0;
  if (uploading) return { tone: "busy", text: block.type === "photos" && uploading > 1 ? `Uploading ${uploading}…` : "Uploading…" };
  if (!toBlocks([block]).length) return { tone: "todo", text: "Not on the page yet" };
  return null;
}

export function BlockCard({ block, index, count, handle, onMove, onRemove }: CardProps) {
  const { uploads } = useEditor();
  const label = BLOCK_LABELS[block.type];
  const state = cardState(block, uploads.entries);
  return (
    <article className={`card card--${block.type}`} data-block-id={block.id} data-photos-drop={block.type === "photos" ? block.id : undefined}>
      <header className="card__head">
        <button
          ref={handle.ref}
          type="button"
          className="card__grip"
          aria-label={`Drag to move ${label.toLowerCase()}`}
          title="Drag to move"
          {...handle.props}
        >
          <IconGrip size={18} />
        </button>
        <span className="card__type">
          <BlockIcon type={block.type} size={17} />
          {label}
        </span>
        {state ? <span className={`card__state card__state--${state.tone}`}>{state.text}</span> : null}
        <div className="card__tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Move up"
            title="Move up"
            disabled={index === 0}
            onClick={() => onMove(block.id, -1)}
          >
            <IconUp size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Move down"
            title="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(block.id, 1)}
          >
            <IconDown size={18} />
          </button>
          <button
            type="button"
            className="icon-btn icon-btn--danger"
            aria-label={`Remove ${label.toLowerCase()}`}
            title="Remove"
            onClick={() => onRemove(block.id)}
          >
            <IconTrash size={18} />
          </button>
        </div>
      </header>
      <div className="card__body">
        <BlockBody block={block} />
      </div>
    </article>
  );
}

const BlockBody = memo(function BlockBody({ block }: { block: EditBlock }) {
  switch (block.type) {
    case "text":
      return <TextBody block={block} />;
    case "photos":
      return <PhotosBody block={block} />;
    case "video":
      return <VideoBody block={block} />;
    case "audio":
      return <AudioBody block={block} />;
    case "file":
      return <FileBody block={block} />;
    case "link":
      return <LinkBody block={block} />;
  }
});

type Of<T extends EditBlock["type"]> = Extract<EditBlock, { type: T }>;

function TextBody({ block }: { block: Of<"text"> }) {
  const { update } = useEditor();
  return (
    <RichField
      label="Text"
      initialHtml={block.html}
      placeholder="Write here…"
      onChange={(html) => update(block.id, (current) => ({ ...current, html }) as EditBlock)}
    />
  );
}

const SIZE_OPTIONS: { value: PhotoSize; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

function PhotosBody({ block }: { block: Of<"photos"> }) {
  const { update, uploads, display, addPhotos, removePhoto } = useEditor();
  const { items } = block;

  if (!items.length) return <FileDrop kind="image" onFiles={(files) => addPhotos(block.id, files)} />;

  const move = (key: string, step: number) =>
    update(block.id, (current) => {
      if (current.type !== "photos") return current;
      const list = [...current.items];
      const from = list.findIndex((item) => item.key === key);
      const to = from + step;
      if (from < 0 || to < 0 || to >= list.length) return current;
      [list[from], list[to]] = [list[to], list[from]];
      return { ...current, items: list };
    });

  const caption = (key: string, text: string) =>
    update(block.id, (current) =>
      current.type === "photos"
        ? { ...current, items: current.items.map((item) => (item.key === key ? { ...item, caption: text } : item)) }
        : current,
    );

  return (
    <div className="photos-edit">
      <ul className={`ph-grid${items.length === 1 ? " ph-grid--single" : ""}`}>
        {items.map((item, index) => {
          const entry = item.upload ? uploads.entries[item.upload] : undefined;
          const src = item.src ? display(item.src) : entry?.preview || "";
          return (
            <li key={item.key} className="ph-item">
              <div className={`ph-thumb${entry ? " is-uploading" : ""}`}>
                {src ? <img src={src} alt="" loading="lazy" onError={(event) => (event.currentTarget.style.visibility = "hidden")} /> : null}
                {entry ? (
                  <div className="ph-overlay">
                    <UploadStatus
                      entry={entry}
                      onRetry={() => uploads.retry(entry.id)}
                      onRemove={() => {
                        uploads.cancel(entry.id);
                        removePhoto(block.id, item.key);
                      }}
                    />
                  </div>
                ) : null}
                <div className="ph-tools">
                  {items.length > 1 ? (
                    <>
                      <button
                        type="button"
                        className="ph-tool"
                        aria-label={`Move photo ${index + 1} earlier`}
                        title="Move earlier"
                        disabled={index === 0}
                        onClick={() => move(item.key, -1)}
                      >
                        <IconLeft size={16} />
                      </button>
                      <button
                        type="button"
                        className="ph-tool"
                        aria-label={`Move photo ${index + 1} later`}
                        title="Move later"
                        disabled={index === items.length - 1}
                        onClick={() => move(item.key, 1)}
                      >
                        <IconRight size={16} />
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="ph-tool ph-tool--danger"
                    aria-label={`Remove photo ${index + 1}`}
                    title="Remove photo"
                    onClick={() => {
                      if (entry) uploads.cancel(entry.id);
                      removePhoto(block.id, item.key);
                    }}
                  >
                    <IconTrash size={16} />
                  </button>
                </div>
              </div>
              <input
                className="ph-caption"
                value={item.caption}
                maxLength={300}
                placeholder="Caption (optional)"
                aria-label={`Caption for photo ${index + 1}`}
                onChange={(event) => caption(item.key, event.target.value)}
              />
            </li>
          );
        })}
        {items.length < MAX_PHOTOS ? (
          <li className="ph-item ph-item--add">
            <button
              type="button"
              className="ph-add"
              onClick={() => {
                void pickFiles("image").then((files) => {
                  if (files.length) addPhotos(block.id, files);
                });
              }}
            >
              <IconPlus size={22} />
              <span>Add photos</span>
            </button>
          </li>
        ) : null}
      </ul>
      <div className="card__row">
        <span className="card__row-label">Size on the page</span>
        <Segmented
          label="Size on the page"
          value={block.size}
          options={SIZE_OPTIONS}
          onChange={(size) => update(block.id, (current) => ({ ...current, size }) as EditBlock)}
        />
      </div>
      {items.length > 1 ? <p className="hint">Photos are shown side by side in this order. Readers can tap one to see it bigger.</p> : null}
    </div>
  );
}

function SingleUpload({
  block,
  kind,
  children,
}: {
  block: Of<"video"> | Of<"audio"> | Of<"file">;
  kind: UploadKind;
  children: ReactNode;
}) {
  const { uploads, setFile, update } = useEditor();
  const entry = block.upload ? uploads.entries[block.upload] : undefined;
  if (entry) {
    return (
      <UploadStatus
        entry={entry}
        onRetry={() => uploads.retry(entry.id)}
        onRemove={() => {
          uploads.cancel(entry.id);
          update(block.id, (current) => ({ ...current, upload: undefined }) as EditBlock);
        }}
      />
    );
  }
  if (!block.src) return <FileDrop kind={kind} onFiles={(files) => files[0] && setFile(block.id, files[0])} />;
  return (
    <>
      {children}
      <button
        type="button"
        className="text-btn card__replace"
        onClick={() => {
          void pickFiles(kind).then((files) => {
            if (files[0]) setFile(block.id, files[0]);
          });
        }}
      >
        <IconUpload size={15} />
        Replace file
      </button>
    </>
  );
}

function preview(block: Block, display: (src: string) => string): Block {
  return "src" in block ? ({ ...block, src: display(block.src) } as Block) : block;
}

function canPaste() {
  return typeof navigator !== "undefined" && typeof navigator.clipboard?.readText === "function";
}

function VideoBody({ block }: { block: Of<"video"> }) {
  const { update, display, notify } = useEditor();
  const url = block.url.trim();
  const embed = url ? videoEmbed(url) : null;
  const set = (changes: Partial<Of<"video">>) => update(block.id, (current) => ({ ...current, ...changes }) as EditBlock);

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text) set({ url: text });
      else notify("There's nothing to paste. Copy the video's link first.");
    } catch {
      notify("Pasting wasn't allowed. Tap the box and paste there instead.");
    }
  }

  return (
    <div className="video-edit">
      <Segmented
        label="Where the video comes from"
        value={block.source}
        options={[
          { value: "link", label: "Link (YouTube, Vimeo…)" },
          { value: "file", label: "Upload a file" },
        ]}
        onChange={(source) => set({ source })}
      />
      {block.source === "link" ? (
        <>
          <label className="field field--tight">
            <span>Video link</span>
            <span className="url-row">
              <input
                type="url"
                inputMode="url"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                value={block.url}
                placeholder="Paste a YouTube, Vimeo or Google Drive link"
                onChange={(event) => set({ url: event.target.value })}
              />
              {canPaste() ? (
                <button type="button" className="btn btn--ghost btn--small" onClick={() => void paste()}>
                  <IconPaste size={16} />
                  Paste
                </button>
              ) : null}
            </span>
          </label>
          {embed ? (
            <div className="pb-video__frame card__media">
              <iframe
                src={embed.embedUrl}
                title={block.caption || "Video"}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          ) : url ? (
            <p className="note note--warn">
              <IconAlert size={16} />
              <span>
                This isn&apos;t a YouTube, Vimeo or Google Drive link, so readers will see a button that opens it instead of a
                player.
              </span>
            </p>
          ) : (
            <p className="hint">On YouTube, press Share, then Copy, and paste the link here.</p>
          )}
          {embed?.provider === "drive" ? (
            <p className="hint">In Google Drive, make sure the video is shared with “Anyone with the link”.</p>
          ) : null}
        </>
      ) : (
        <SingleUpload block={block} kind="video">
          <video className="card__media card__video" controls preload="metadata" playsInline src={display(block.src)} />
        </SingleUpload>
      )}
      <input
        className="input"
        value={block.caption}
        maxLength={300}
        placeholder="Caption under the video (optional)"
        aria-label="Caption under the video"
        onChange={(event) => set({ caption: event.target.value })}
      />
    </div>
  );
}

function AudioBody({ block }: { block: Of<"audio"> }) {
  const { update, display } = useEditor();
  return (
    <div className="audio-edit">
      <label className="field field--tight">
        <span>Title above the player</span>
        <input
          value={block.title}
          maxLength={200}
          placeholder="e.g. Extra listening practice"
          onChange={(event) => update(block.id, (current) => ({ ...current, title: event.target.value }) as EditBlock)}
        />
      </label>
      <SingleUpload block={block} kind="audio">
        <BlockView block={preview(toPreview(block), display)} mediaBase="" />
      </SingleUpload>
    </div>
  );
}

function FileBody({ block }: { block: Of<"file"> }) {
  const { update, display } = useEditor();
  return (
    <div className="file-edit">
      <SingleUpload block={block} kind="file">
        <div className="card__preview">
          <BlockView block={preview(toPreview(block), display)} mediaBase="" />
        </div>
      </SingleUpload>
      {block.src || block.upload ? (
        <label className="field field--tight">
          <span>Title shown on the website</span>
          <input
            value={block.title}
            maxLength={200}
            placeholder={block.name || "Document"}
            onChange={(event) => update(block.id, (current) => ({ ...current, title: event.target.value }) as EditBlock)}
          />
        </label>
      ) : null}
    </div>
  );
}

function LinkBody({ block }: { block: Of<"link"> }) {
  const { update } = useEditor();
  const set = (changes: Partial<Of<"link">>) => update(block.id, (current) => ({ ...current, ...changes }) as EditBlock);
  const ready = toBlocks([block])[0];
  return (
    <div className="link-edit">
      <label className="field field--tight">
        <span>Web address</span>
        <input
          type="url"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={block.url}
          placeholder="e.g. britishcouncil.org"
          onChange={(event) => set({ url: event.target.value })}
        />
      </label>
      <label className="field field--tight">
        <span>Title</span>
        <input value={block.title} maxLength={200} placeholder="What readers will click" onChange={(event) => set({ title: event.target.value })} />
      </label>
      <label className="field field--tight">
        <span>Short note (optional)</span>
        <input value={block.note} maxLength={300} placeholder="A line about what's there" onChange={(event) => set({ note: event.target.value })} />
      </label>
      {ready ? (
        <div className="card__preview">
          <p className="card__preview-label">How it will look</p>
          <BlockView block={ready} mediaBase="" />
        </div>
      ) : block.url.trim() ? (
        <p className="note note--warn">
          <IconAlert size={16} />
          <span>That doesn&apos;t look like a web address yet.</span>
        </p>
      ) : null}
    </div>
  );
}

function toPreview(block: Of<"audio"> | Of<"file">): Block {
  return block.type === "audio"
    ? { id: block.id, type: "audio", src: block.src, title: block.title }
    : { id: block.id, type: "file", src: block.src, title: block.title, name: block.name, size: block.size, ext: block.ext };
}

export function blockSummary(block: EditBlock) {
  switch (block.type) {
    case "photos":
      return block.items.length === 1 ? "1 photo" : `${block.items.length} photos`;
    case "file":
      return block.title || block.name;
    case "audio":
      return block.title;
    case "video":
      return block.caption;
    case "link":
      return block.title || block.url;
    default:
      return "";
  }
}
