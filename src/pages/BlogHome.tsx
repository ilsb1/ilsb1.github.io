import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AUTHOR_NAME, BOOK_TITLE } from "../constants/bookMeta";
import { formatDate, readingMinutes } from "../../shared/text.js";
import { loadPublicList, type PublicListing } from "../blog/posts";
import { authorPhoto } from "../components/ArticleView";
import { IconArrowRight, IconPen } from "../components/icons";

export default function BlogHome() {
  const [posts, setPosts] = useState<PublicListing[] | null>(null);

  useEffect(() => {
    const previous = document.title;
    document.title = "Blog";
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    loadPublicList()
      .then((list) => {
        if (!cancel) setPosts(list);
      })
      .catch(() => {
        if (!cancel) setPosts([]);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const [latest, ...rest] = posts ?? [];

  return (
    <div className="blog blog--home">
      <header className="bh-hero">
        <img className="bh-hero__portrait" src={authorPhoto} alt="" width={84} height={84} />
        <p className="blog-eyebrow">From the author</p>
        <h1 className="bh-hero__title">Blog</h1>
        <p className="bh-hero__deck">
          Essays and notes by {AUTHOR_NAME}, author of <cite>{BOOK_TITLE}</cite>.
        </p>
      </header>

      {posts === null ? <HomeSkeleton /> : null}

      {posts && posts.length === 0 ? (
        <div className="bh-empty">
          <span className="bh-empty__mark" aria-hidden="true">
            <IconPen size={22} />
          </span>
          <p className="bh-empty__title">The first piece is on its way</p>
          <p className="bh-empty__text">Nothing has been published here yet. Please check back soon.</p>
        </div>
      ) : null}

      {latest ? (
        <Link to={`/blog/${latest.slug}`} className="bh-feature">
          <p className="bh-feature__tag">
            <span className="bh-feature__spark" aria-hidden="true" />
            Latest
          </p>
          <h2 className="bh-feature__title">{latest.title}</h2>
          {latest.subtitle ? <p className="bh-feature__subtitle">{latest.subtitle}</p> : null}
          {latest.excerpt ? <p className="bh-feature__excerpt">{latest.excerpt}</p> : null}
          <div className="bh-feature__foot">
            <span>
              <time dateTime={latest.publishedAt}>{formatDate(latest.publishedAt)}</time>
              <span aria-hidden="true"> · </span>
              {readingMinutes(latest.words)} min read
            </span>
            <span className="bh-feature__more">
              Read
              <IconArrowRight size={16} />
            </span>
          </div>
        </Link>
      ) : null}

      {rest.length > 0 ? (
        <section className="bh-list" aria-labelledby="more-writing">
          <h2 id="more-writing" className="blog-label">
            More writing
          </h2>
          <ul className="bh-rows">
            {rest.map((post) => (
              <li key={post.slug}>
                <Link to={`/blog/${post.slug}`} className="bh-row">
                  <time className="bh-row__date" dateTime={post.publishedAt}>
                    {formatDate(post.publishedAt)}
                  </time>
                  <div className="bh-row__main">
                    <h3 className="bh-row__title">{post.title}</h3>
                    {post.subtitle ? <p className="bh-row__subtitle">{post.subtitle}</p> : null}
                    {post.excerpt ? <p className="bh-row__excerpt">{post.excerpt}</p> : null}
                    <p className="bh-row__read">{readingMinutes(post.words)} min read</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="bh-skeleton" role="status" aria-label="Loading">
      <div className="bh-feature bh-feature--skeleton">
        <span className="sk" style={{ width: "4.5rem", height: "0.7rem" }} />
        <span className="sk" style={{ width: "88%", height: "2.2rem", marginTop: "1.1rem" }} />
        <span className="sk" style={{ width: "62%", height: "2.2rem", marginTop: "0.6rem" }} />
        <span className="sk" style={{ width: "100%", height: "0.9rem", marginTop: "1.6rem" }} />
        <span className="sk" style={{ width: "96%", height: "0.9rem", marginTop: "0.7rem" }} />
        <span className="sk" style={{ width: "70%", height: "0.9rem", marginTop: "0.7rem" }} />
      </div>
    </div>
  );
}
