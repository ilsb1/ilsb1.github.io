import { Fragment } from "react";
import { useNavigate } from "react-router-dom";
import PageBlocks from "./Blocks";
import type { Block } from "./types";

export default function SiteBlocks({ blocks, className }: { blocks: Block[]; className?: string }) {
  const navigate = useNavigate();
  return <PageBlocks blocks={blocks} className={className} onInternalLink={(href) => navigate(href)} />;
}

/** Plain text where each line the author typed stays on its own line. */
export function TextLines({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, index) => (
        <Fragment key={index}>
          {index > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </>
  );
}
