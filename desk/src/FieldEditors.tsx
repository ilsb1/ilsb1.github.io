import { Fragment, useLayoutEffect, useRef } from "react";
import { useEditor } from "./editorContext";
import { UploadStatus, useDropTarget } from "./BlockCards";
import { pickFiles } from "./filePick";
import { IconUpload } from "./icons";
import { fieldProblem, originalValue, type FieldDef, type FieldValue, type FieldValues, type ImageValue, type PageDef } from "./pageModel";
import RichField from "./RichField";

type Props = {
  page: PageDef;
  values: FieldValues;
  changed: Record<string, unknown>;
  versions: Record<string, number>;
  imageUploads: Record<string, string>;
  onChange: (key: string, value: FieldValue) => void;
  onUseOriginal: (key: string) => void;
  onImage: (key: string, file: File) => void;
  onCancelImage: (key: string) => void;
};

export default function PageTextCard(props: Props) {
  const { page, values, changed, versions, onUseOriginal } = props;
  return (
    <div className="fields">
      {page.fields.map((field) => {
        const value = values[field.key];
        const problem = fieldProblem(field, value);
        const edited = Object.prototype.hasOwnProperty.call(changed, field.key);
        const id = `field-${field.key}`;
        return (
          <Fragment key={field.key}>
            {field.section ? <h3 className="fields__section">{field.section}</h3> : null}
            <div className={`fld${edited ? " is-edited" : ""}`}>
              <div className="fld__head">
                {field.type === "rich" || field.type === "image" || field.type === "lines" ? (
                  <span className="fld__label" id={`${id}-label`}>
                    {field.label}
                  </span>
                ) : (
                  <label className="fld__label" htmlFor={id}>
                    {field.label}
                  </label>
                )}
                {edited ? <span className="fld__edited">Edited</span> : null}
                {edited || problem ? (
                  <button type="button" className="text-btn fld__reset" onClick={() => onUseOriginal(field.key)}>
                    Use original
                  </button>
                ) : null}
              </div>
              {field.help ? <p className="fld__help">{field.help}</p> : null}
              <FieldControl {...props} field={field} id={id} value={value} version={versions[field.key] ?? 0} />
              {problem ? <p className="fld__problem">{problem}</p> : null}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function fit(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight + 2}px`;
}

function Multiline({ id, value, max, placeholder, onChange }: { id: string; value: string; max?: number; placeholder: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => fit(ref.current), [value]);
  useLayoutEffect(() => {
    const onResize = () => fit(ref.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <textarea
      ref={ref}
      id={id}
      className="input input--area"
      rows={2}
      value={value}
      maxLength={max}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function FieldControl({
  page,
  field,
  id,
  value,
  version,
  imageUploads,
  onChange,
  onImage,
  onCancelImage,
}: Props & { field: FieldDef; id: string; value: FieldValue; version: number }) {
  const original = originalValue(page, field.key);
  const set = (next: FieldValue) => onChange(field.key, next);
  switch (field.type) {
    case "text":
    case "url": {
      const isUrl = field.type === "url";
      return (
        <input
          id={id}
          className="input"
          type={isUrl ? "url" : "text"}
          inputMode={isUrl ? "url" : undefined}
          autoCapitalize={isUrl ? "off" : undefined}
          autoCorrect={isUrl ? "off" : undefined}
          spellCheck={isUrl ? false : undefined}
          value={typeof value === "string" ? value : ""}
          maxLength={field.max}
          placeholder={typeof original === "string" && original ? original : isUrl ? "https://…" : ""}
          onChange={(event) => set(event.target.value)}
        />
      );
    }
    case "multiline":
      return (
        <Multiline
          id={id}
          value={typeof value === "string" ? value : ""}
          max={field.max}
          placeholder={typeof original === "string" ? original : ""}
          onChange={set}
        />
      );
    case "rich":
      return (
        <RichField
          key={version}
          id={id}
          label={field.label}
          initialHtml={typeof value === "string" ? value : ""}
          placeholder="Nothing here yet. Type to add text."
          onChange={set}
        />
      );
    case "lines": {
      const lines = Array.isArray(value) ? value : [];
      const base = Array.isArray(original) ? original : [];
      return (
        <ol className="lines" aria-labelledby={`${id}-label`}>
          {base.map((fallback, index) => (
            <li key={index} className="lines__row">
              <label className="lines__num" htmlFor={`${id}-${index}`}>
                {index + 1}
              </label>
              <input
                id={`${id}-${index}`}
                className="input"
                value={lines[index] ?? ""}
                maxLength={field.max}
                placeholder={fallback}
                onChange={(event) => {
                  const next = base.map((line, at) => (at === index ? event.target.value : (lines[at] ?? line)));
                  set(next);
                }}
              />
            </li>
          ))}
        </ol>
      );
    }
    case "image":
      return (
        <ImageControl
          value={value as ImageValue}
          isOriginal={(value as ImageValue)?.src === (original as ImageValue)?.src}
          uploadId={imageUploads[field.key]}
          onFile={(file) => onImage(field.key, file)}
          onCancel={() => onCancelImage(field.key)}
          labelledBy={`${id}-label`}
        />
      );
  }
}

function ImageControl({
  value,
  isOriginal,
  uploadId,
  onFile,
  onCancel,
  labelledBy,
}: {
  value: ImageValue;
  isOriginal: boolean;
  uploadId?: string;
  onFile: (file: File) => void;
  onCancel: () => void;
  labelledBy: string;
}) {
  const { uploads, display } = useEditor();
  const target = useDropTarget((files) => files[0] && onFile(files[0]), true);
  const entry = uploadId ? uploads.entries[uploadId] : undefined;
  const src = entry?.preview || (value?.src ? display(value.src) : "");
  return (
    <div className={`img-field${target.over ? " is-over" : ""}`} role="group" aria-labelledby={labelledBy} {...target.props}>
      <div className="img-field__thumb">{src ? <img src={src} alt="" /> : null}</div>
      <div className="img-field__side">
        {entry ? (
          <UploadStatus entry={entry} onRetry={() => uploads.retry(entry.id)} onRemove={onCancel} />
        ) : (
          <>
            <p className="hint">
              {isOriginal ? "The current photo." : "Your new photo."} Drop a photo here or choose one to replace it.
            </p>
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => {
                void pickFiles("image", false).then((files) => {
                  if (files[0]) onFile(files[0]);
                });
              }}
            >
              <IconUpload size={15} />
              Replace photo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
