import { sanitizeHtml } from "../../shared/sanitize.js";

type Props = {
  html: string;
  className?: string;
};

export default function BlogEssay({ html, className = "" }: Props) {
  const safe = sanitizeHtml(html);
  if (!safe) return null;
  return <div className={`prose${className ? ` ${className}` : ""}`} dangerouslySetInnerHTML={{ __html: safe }} />;
}
