import { forwardRef, useImperativeHandle, type ReactNode } from "react";
import { Toolbar, useRichText } from "./useRichText";

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  header: ReactNode;
  footer: ReactNode;
};

export type EditorHandle = { focus: () => void };

const Editor = forwardRef<EditorHandle, Props>(function Editor({ initialHtml, onChange, header, footer }, ref) {
  const rich = useRichText({ initialHtml, onChange });
  useImperativeHandle(ref, () => ({ focus: rich.focus }));

  return (
    <div className="editor">
      <div className="toolbar-wrap">
        <Toolbar rich={rich} sizes />
      </div>

      <div className="page">
        {header}
        <div
          {...rich.editableProps}
          className={`prose page__body${rich.empty ? " is-empty" : ""}`}
          aria-label="Your post"
          data-placeholder="Start writing here…"
        />
        {footer}
      </div>

      {rich.linkDialog}
    </div>
  );
});

export default Editor;
