import type { MouseEvent } from "react";
import { useNavigate } from "react-router-dom";

type Props = {
  html: string;
  className?: string;
  onInternalLink?: (href: string) => void;
};

/** Shows text that has already been cleaned by the shared sanitizer. */
export function RichHtml({ html, className, onInternalLink }: Props) {
  if (!html) return null;

  function onClick(event: MouseEvent<HTMLDivElement>) {
    if (!onInternalLink || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest?.("a");
    const href = link?.getAttribute("href") || "";
    if (!href.startsWith("/") || href.startsWith("//")) return;
    event.preventDefault();
    onInternalLink(href);
  }

  return <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function RichText(props: Omit<Props, "onInternalLink">) {
  const navigate = useNavigate();
  return <RichHtml {...props} onInternalLink={(href) => navigate(href)} />;
}
