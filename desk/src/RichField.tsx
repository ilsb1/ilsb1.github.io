import { Toolbar, useRichText } from "./useRichText";

type Props = {
  id?: string;
  label: string;
  initialHtml: string;
  placeholder?: string;
  onChange: (html: string) => void;
};

/** A text box with simple formatting, styled like the text on the website. */
export default function RichField({ id, label, initialHtml, placeholder = "Start typing…", onChange }: Props) {
  const rich = useRichText({ initialHtml, onChange });
  return (
    <div className={`rich-field${rich.focused ? " is-focused" : ""}`}>
      <Toolbar rich={rich} className="toolbar--compact" />
      <div
        {...rich.editableProps}
        id={id}
        className={`rf-body rich-text${rich.empty ? " is-empty" : ""}`}
        aria-label={label}
        data-placeholder={placeholder}
      />
      {rich.linkDialog}
    </div>
  );
}
