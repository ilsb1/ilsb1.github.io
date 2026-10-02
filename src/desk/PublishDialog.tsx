import { excerptFromHtml, formatDate, plainField, readingMinutes, wordCount } from "../../shared/text.js";
import { hasUnpublishedEdits, type DeskPost, type GithubResult } from "../blog/posts";
import Modal from "./Modal";
import { IconArrowRight, IconCheck, IconExternal, IconX } from "./icons";

export type PublishPhase = "review" | "working" | "done";

type Props = {
  open: boolean;
  post: DeskPost | null;
  phase: PublishPhase;
  result: GithubResult | null;
  error: string;
  firstTime: boolean;
  onPublish: () => void;
  onClose: () => void;
  onView: () => void;
  onUnpublish: () => void;
};

function resultText(result: GithubResult | null) {
  if (result === "ok") {
    return "It's saved to the website's files on GitHub. The public blog usually catches up within a minute or two.";
  }
  if (result === "failed") {
    return "It's on the blog in this preview, but it couldn't be sent to GitHub, so the public website hasn't changed yet. Try updating again later.";
  }
  return "It's on the blog in this preview and saved with the project. It will reach the public website once GitHub publishing is connected.";
}

export default function PublishDialog({
  open,
  post,
  phase,
  result,
  error,
  firstTime,
  onPublish,
  onClose,
  onView,
  onUnpublish,
}: Props) {
  if (!post) return <Modal open={false} onClose={onClose}>{null}</Modal>;

  const title = plainField(post.title, 180);
  const words = wordCount(post.html);
  const missingTitle = !title;
  const missingBody = words === 0;
  const ready = !missingTitle && !missingBody;
  const upToDate = Boolean(post.live) && !hasUnpublishedEdits(post);
  const updating = Boolean(post.live);
  const date = post.live?.publishedAt ?? new Date().toISOString();

  return (
    <Modal open={open} onClose={phase === "working" ? () => {} : onClose} labelledBy="publish-title" className="modal--publish" dismissable={phase !== "working"}>
      <button type="button" className="modal__close" aria-label="Close" onClick={onClose} disabled={phase === "working"}>
        <IconX size={18} />
      </button>

      {phase === "done" ? (
        <div className="pub-done">
          <div className="pub-done__badge">
            <IconCheck size={30} />
          </div>
          <h2 id="publish-title" className="modal__title">
            {firstTime ? "Your piece is on the blog" : "The blog is up to date"}
          </h2>
          <p className="modal__text">{resultText(result)}</p>
          <div className="modal__actions modal__actions--center">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Keep writing
            </button>
            <button type="button" className="btn btn--primary" onClick={onView}>
              See it on the blog
              <IconExternal size={16} />
            </button>
          </div>
        </div>
      ) : upToDate ? (
        <div>
          <p className="modal__eyebrow">
            <span className="dot dot--green" /> On the blog
          </p>
          <h2 id="publish-title" className="modal__title">
            This piece is published
          </h2>
          <p className="modal__text">
            The blog already shows the latest version. Any changes you make from now on stay private until you press
            Update.
          </p>
          <PreviewCard post={post} date={date} words={words} />
          <div className="modal__actions">
            <button type="button" className="btn btn--text btn--danger-text" onClick={onUnpublish}>
              Take it off the blog
            </button>
            <button type="button" className="btn btn--primary" onClick={onView}>
              See it on the blog
              <IconExternal size={16} />
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="modal__eyebrow">{updating ? "Update the blog" : "Publish"}</p>
          <h2 id="publish-title" className="modal__title">
            {ready ? (updating ? "Show readers your latest changes?" : "Ready to share this piece?") : "Almost there"}
          </h2>
          {ready ? (
            <p className="modal__text">
              {updating
                ? "The blog will replace the old version with what you see on your page now."
                : "This is how it will appear on the blog. Anyone visiting the website will be able to read it."}
            </p>
          ) : (
            <p className="modal__text">A piece needs two things before it can go on the blog:</p>
          )}

          {ready ? (
            <PreviewCard post={post} date={date} words={words} />
          ) : (
            <ul className="pub-checks">
              <li className={missingTitle ? "" : "is-done"}>
                <span className="pub-checks__mark">{missingTitle ? null : <IconCheck size={14} />}</span>
                A title at the top of the page
              </li>
              <li className={missingBody ? "" : "is-done"}>
                <span className="pub-checks__mark">{missingBody ? null : <IconCheck size={14} />}</span>
                Some writing underneath
              </li>
            </ul>
          )}

          {error ? (
            <p className="pub-error" role="alert">
              {error}
            </p>
          ) : null}

          <div className="modal__actions">
            <span className="modal__aside">{ready && !updating ? "You can take it down again at any time." : ""}</span>
            <div className="modal__actions-main">
              <button type="button" className="btn btn--ghost" onClick={onClose} disabled={phase === "working"}>
                {ready ? "Not yet" : "Back to writing"}
              </button>
              {ready ? (
                <button type="button" className="btn btn--primary" onClick={onPublish} disabled={phase === "working"}>
                  {phase === "working" ? <span className="spinner" aria-hidden="true" /> : null}
                  {phase === "working" ? "Publishing…" : updating ? "Update the blog" : "Publish now"}
                  {phase === "working" ? null : <IconArrowRight size={16} />}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function PreviewCard({ post, date, words }: { post: DeskPost; date: string; words: number }) {
  const subtitle = plainField(post.subtitle, 240);
  return (
    <div className="pub-card" aria-label="How it will look on the blog">
      <p className="pub-card__meta">
        {formatDate(date)} · {readingMinutes(words)} min read
      </p>
      <p className="pub-card__title">{plainField(post.title, 180)}</p>
      {subtitle ? <p className="pub-card__subtitle">{subtitle}</p> : null}
      <p className="pub-card__excerpt">{excerptFromHtml(post.html, 160)}</p>
    </div>
  );
}
