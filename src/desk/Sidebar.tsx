import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { excerptFromHtml } from "../../shared/text.js";
import { hasUnpublishedEdits, type DeskPost } from "../blog/posts";
import { relativeTime, shortDate } from "./format";
import { IconExternal, IconHome, IconPlus, IconSearch } from "./icons";

type Props = {
  posts: DeskPost[];
  activeId: string | null;
  now: number;
  onSelect: (id: string) => void;
  onNew: () => void;
};

function byRecent(a: DeskPost, b: DeskPost) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export default function Sidebar({ posts, activeId, now, onSelect, onNew }: Props) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();

  const { drafts, published } = useMemo(() => {
    const visible = [...posts]
      .sort(byRecent)
      .filter((post) => {
        if (!needle) return true;
        return `${post.title} ${post.subtitle} ${excerptFromHtml(post.html, 400)}`.toLowerCase().includes(needle);
      });
    return {
      drafts: visible.filter((post) => !post.live),
      published: visible.filter((post) => post.live),
    };
  }, [posts, needle]);

  const nothingFound = needle && drafts.length === 0 && published.length === 0;

  return (
    <aside className="side" aria-label="Your writing">
      <div className="side__head">
        <button type="button" className="side__new" onClick={onNew}>
          <IconPlus size={18} />
          New piece
        </button>
        {posts.length > 5 ? (
          <label className="side__search">
            <IconSearch size={16} />
            <input
              type="search"
              placeholder="Find a piece"
              aria-label="Find a piece"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        ) : null}
      </div>

      <div className="side__scroll">
        {posts.length === 0 ? <p className="side__empty">Your pieces will appear here.</p> : null}
        {nothingFound ? <p className="side__empty">Nothing matches “{query.trim()}”.</p> : null}
        <Group title="Drafts" posts={drafts} activeId={activeId} now={now} onSelect={onSelect} />
        <Group title="On the blog" posts={published} activeId={activeId} now={now} onSelect={onSelect} />
      </div>

      <nav className="side__foot" aria-label="Leave the desk">
        <Link to="/blog" target="_blank" rel="noopener" className="side__link">
          <IconExternal size={16} />
          Open the blog
        </Link>
        <Link to="/" className="side__link">
          <IconHome size={16} />
          Back to the website
        </Link>
      </nav>
    </aside>
  );
}

function Group({
  title,
  posts,
  activeId,
  now,
  onSelect,
}: {
  title: string;
  posts: DeskPost[];
  activeId: string | null;
  now: number;
  onSelect: (id: string) => void;
}) {
  if (posts.length === 0) return null;
  return (
    <section className="side__group">
      <h2 className="side__label">
        {title}
        <span className="side__count">{posts.length}</span>
      </h2>
      <ul className="side__list">
        {posts.map((post) => {
          const excerpt = excerptFromHtml(post.html, 90);
          const pending = hasUnpublishedEdits(post);
          const meta = post.live
            ? pending
              ? "Changes not on the blog yet"
              : `Published ${shortDate(post.live.publishedAt, now)}`
            : `Edited ${relativeTime(post.updatedAt, now)}`;
          return (
            <li key={post.id}>
              <button
                type="button"
                className={`piece${post.id === activeId ? " is-active" : ""}`}
                aria-current={post.id === activeId ? "true" : undefined}
                onClick={() => onSelect(post.id)}
              >
                <span className={`piece__title${post.title.trim() ? "" : " is-untitled"}`}>
                  {post.title.trim() || "Untitled"}
                </span>
                {excerpt ? <span className="piece__excerpt">{excerpt}</span> : null}
                <span className={`piece__meta${pending ? " is-pending" : ""}`}>
                  {post.live ? <span className={`dot ${pending ? "dot--amber" : "dot--green"}`} /> : null}
                  {meta}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
