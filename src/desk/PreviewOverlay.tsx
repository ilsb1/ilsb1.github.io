import { useState } from "react";
import { wordCount } from "../../shared/text.js";
import ArticleView from "../components/ArticleView";
import type { DeskPost } from "../blog/posts";
import Modal from "./Modal";
import { IconArrowLeft, IconMonitor, IconPhone } from "./icons";

type Props = {
  open: boolean;
  post: DeskPost | null;
  onClose: () => void;
};

export default function PreviewOverlay({ open, post, onClose }: Props) {
  const [device, setDevice] = useState<"computer" | "phone">("computer");

  return (
    <Modal open={open} onClose={onClose} labelledBy="preview-title" className="modal--preview">
      <div className="pv">
        <header className="pv__bar">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            <IconArrowLeft size={16} />
            Back to writing
          </button>
          <p id="preview-title" className="pv__title">
            Preview <span>— how readers will see it</span>
          </p>
          <div className="seg" role="radiogroup" aria-label="Screen size">
            <button
              type="button"
              role="radio"
              aria-checked={device === "computer"}
              className={`seg__btn${device === "computer" ? " is-on" : ""}`}
              onClick={() => setDevice("computer")}
            >
              <IconMonitor size={16} />
              Computer
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={device === "phone"}
              className={`seg__btn${device === "phone" ? " is-on" : ""}`}
              onClick={() => setDevice("phone")}
            >
              <IconPhone size={16} />
              Phone
            </button>
          </div>
        </header>
        <div className={`pv__stage pv__stage--${device}`}>
          <div className="pv__frame">
            <div className="pv__screen">
              {post ? (
                <div className="blog blog--preview">
                  <ArticleView
                    title={post.title}
                    subtitle={post.subtitle}
                    html={post.html}
                    words={wordCount(post.html)}
                    publishedAt={post.live?.publishedAt ?? new Date().toISOString()}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
