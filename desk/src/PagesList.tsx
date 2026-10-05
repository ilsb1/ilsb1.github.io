import { useEffect, useState, type ReactNode } from "react";
import { formatDate } from "../../shared/text.js";
import { SIGNED_OUT, errorMessage, isSignedOut, listPages, type PageStatus, type PageSummary, type Session } from "./api";
import { IconRight } from "./icons";
import { go, isPlainClick } from "./nav";
import { PAGES, PAGE_GROUPS, type PageDef } from "./pageModel";

type Props = {
  session: Session;
  onSignOut: (note?: string) => void;
  topBar: ReactNode;
};

let remembered: Map<string, PageSummary> | null = null;

export const loadEditor = () => import("./PageEditor");

const NOTES: Record<string, string> = {
  home: "Welcome text and the list of links",
  "about-book": "Introduction to the book and the signature",
  "about-author": "Photo, links and biography",
  copyright: "Rights notice and book details",
  recordings: "The list of units with their recordings",
  scripts: "The list of units with their scripts",
};

const STATUS_TEXT: Record<PageStatus, string> = {
  original: "Original",
  changed: "Changes not published",
  published: "Published",
};

export default function PagesList({ session, onSignOut, topBar }: Props) {
  const [summaries, setSummaries] = useState<Map<string, PageSummary> | null>(remembered);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    void loadEditor();
  }, []);

  useEffect(() => {
    let cancelled = false;
    listPages(session.token).then(
      ({ pages }) => {
        if (cancelled) return;
        remembered = new Map(pages.map((page) => [page.id, page]));
        setSummaries(remembered);
      },
      (failure) => {
        if (cancelled) return;
        if (isSignedOut(failure)) onSignOut(SIGNED_OUT);
        else setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [session.token, attempt, onSignOut]);

  const open = (page: PageDef) => (event: React.MouseEvent) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    go(`page/${page.id}`);
  };

  const statusOf = (page: PageDef): PageStatus => summaries?.get(page.id)?.status ?? "original";
  const changedCount = PAGES.filter((page) => statusOf(page) === "changed").length;

  return (
    <div className="screen">
      {topBar}
      <main className="list pages">
        <div className="list__head">
          <h1>Website pages</h1>
        </div>
        <p className="lede">
          Change the words on any page, and add photos, videos, recordings, documents and links. Nothing changes on the website until you
          press Publish.
        </p>

        {error && !summaries ? (
          <div className="list__note">
            <p className="error">{error}</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {changedCount ? (
          <p className="pages__notice" role="status">
            {changedCount === 1 ? "1 page has changes" : `${changedCount} pages have changes`} that aren&apos;t on the website yet.
          </p>
        ) : null}

        {PAGE_GROUPS.map((group) => {
          const pages = PAGES.filter((page) => page.group === group.id);
          const tiles = group.id === "units" || group.id === "scripts";
          return (
            <section key={group.id} className="pages__group" aria-labelledby={`group-${group.id}`}>
              <h2 id={`group-${group.id}`} className="pages__title">
                {group.label}
              </h2>
              {tiles ? (
                <ul className="tiles">
                  {pages.map((page) => {
                    const status = statusOf(page);
                    return (
                      <li key={page.id}>
                        <a
                          className={`ptile ptile--${status}${summaries ? "" : " is-loading"}`}
                          href={`#page/${page.id}`}
                          onClick={open(page)}
                          onPointerEnter={() => void loadEditor()}
                          aria-label={`${page.label}${status === "original" ? "" : ` – ${STATUS_TEXT[status]}`}`}
                        >
                          <span className="ptile__label">{group.id === "scripts" ? page.label.replace(/ script$/, "") : page.label}</span>
                          {status !== "original" ? <span className={`dot dot--${status}`} aria-hidden="true" /> : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <ul className="rows">
                  {pages.map((page) => {
                    const summary = summaries?.get(page.id);
                    const status = statusOf(page);
                    return (
                      <li key={page.id}>
                        <a
                          className="row row--page"
                          href={`#page/${page.id}`}
                          onClick={open(page)}
                          onPointerEnter={() => void loadEditor()}
                        >
                          <span className="row__title">{page.label}</span>
                          <span className="row__meta">
                            {status === "original" ? (
                              <span className="row__path">{NOTES[page.id] ?? page.path}</span>
                            ) : (
                              <>
                                <span className={`tag${status === "changed" ? " tag--changed" : " tag--live"}`}>{STATUS_TEXT[status]}</span>
                                {summary?.updatedAt ? <span>Edited {formatDate(summary.updatedAt)}</span> : null}
                              </>
                            )}
                          </span>
                          <IconRight className="row__chev" size={18} />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}

        {PAGES.some((page) => statusOf(page) !== "original") ? (
          <p className="pages__legend" aria-hidden="true">
            <span>
              <span className="dot dot--changed" /> Changes not published
            </span>
            <span>
              <span className="dot dot--published" /> Published edits
            </span>
          </p>
        ) : null}
      </main>
    </div>
  );
}
