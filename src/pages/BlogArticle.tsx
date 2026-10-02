import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AUTHOR_NAME, AUTHOR_ROLE, BOOK_TITLE } from "../constants/bookMeta";
import { formatDate, readingMinutes } from "../../shared/text.js";
import { loadPublicArticle, loadPublicList, type PublicArticle, type PublicListing } from "../blog/posts";
import ArticleView, { authorPhoto } from "../components/ArticleView";
import { IconArrowLeft, IconArrowRight, IconCheck, IconLink, IconShare } from "../desk/icons";

export default function BlogArticle() {
  const { slug = "" } = useParams();
  const [article, setArticle] = useState<PublicArticle | null | undefined>(undefined);
  const [others, setOthers] = useState<PublicListing[]>([]);

  useEffect(() => {
    let cancel = false;
    setArticle(undefined);
    window.scrollTo(0, 0);
    loadPublicArticle(slug)
      .then((next) => {
        if (!cancel) setArticle(next);
      })
      .catch(() => {
        if (!cancel) setArticle(null);
      });
    loadPublicList()
      .then((list) => {
        if (!cancel) setOthers(list.filter((post) => post.slug !== slug).slice(0, 2));
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [slug]);

  useEffect(() => {
    const previous = document.title;
    if (article?.title) document.title = article.title;
    return () => {
      document.title = previous;
    };
  }, [article?.title]);

  if (article === undefined) return <ArticleSkeleton />;

  if (!article) {
    return (
      <div className="blog blog--article">
        <div className="blog-missing">
          <p className="blog-eyebrow">Not found</p>
          <h1 className="blog-missing__title">This piece isn&apos;t here</h1>
          <p className="blog-missing__text">It may have been renamed or taken down.</p>
          <Link to="/blog" className="blog-button">
            <IconArrowLeft size={16} />
            See all writing
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="blog blog--article">
      <ReadingProgress />
      <ArticleView
        title={article.title}
        subtitle={article.subtitle}
        html={article.html}
        words={article.words}
        publishedAt={article.publishedAt}
        previewOnly={article.previewOnly}
        back
      >
        <footer className="post__end">
          <div className="post__ornament" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <ShareButton title={article.title} />
          <aside className="author-card" aria-label="About the author">
            <img src={authorPhoto} alt="" className="author-card__photo" width={76} height={76} />
            <div>
              <p className="blog-eyebrow">Written by</p>
              <p className="author-card__name">{AUTHOR_NAME}</p>
              <p className="author-card__bio">
                {AUTHOR_ROLE}. Author of <cite>{BOOK_TITLE}</cite>.
              </p>
              <Link to="/about/author" className="author-card__link">
                More about the author
                <IconArrowRight size={15} />
              </Link>
            </div>
          </aside>
        </footer>
      </ArticleView>

      {others.length > 0 ? (
        <section className="more" aria-labelledby="more-writing">
          <h2 id="more-writing" className="blog-label">
            More writing
          </h2>
          <div className="more__grid">
            {others.map((post) => (
              <Link key={post.slug} to={`/blog/${post.slug}`} className="card">
                <p className="card__meta">
                  {formatDate(post.publishedAt)} · {readingMinutes(post.words)} min read
                </p>
                <h3 className="card__title">{post.title}</h3>
                {post.excerpt ? <p className="card__excerpt">{post.excerpt}</p> : null}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <p className="blog-backline">
        <Link to="/blog" className="blog-button">
          <IconArrowLeft size={16} />
          All writing
        </Link>
      </p>
    </div>
  );
}

function ReadingProgress() {
  const bar = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const body = document.querySelector(".post__body");
      const el = bar.current;
      if (!body || !el) return;
      const rect = body.getBoundingClientRect();
      const total = rect.height - window.innerHeight * 0.6;
      const done = total > 0 ? (window.innerHeight * 0.4 - rect.top) / total : 1;
      el.style.scale = `${Math.min(1, Math.max(0, done))} 1`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="read-progress" aria-hidden="true">
      <span ref={bar} />
    </div>
  );
}

function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const native =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof window !== "undefined" &&
    window.matchMedia("(pointer: coarse)").matches;

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function share() {
    const url = window.location.href;
    if (native) {
      try {
        await navigator.share({ title, url });
      } catch {
        /* dismissed */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <div className="post__share">
      <button type="button" className={`share-btn${copied ? " is-done" : ""}`} onClick={() => void share()}>
        {copied ? <IconCheck size={17} /> : native ? <IconShare size={17} /> : <IconLink size={17} />}
        <span aria-live="polite">{copied ? "Link copied" : native ? "Share this piece" : "Copy link to this piece"}</span>
      </button>
    </div>
  );
}

function ArticleSkeleton() {
  return (
    <div className="blog blog--article" role="status" aria-label="Loading">
      <div className="post post--skeleton">
        <span className="sk" style={{ width: "6rem", height: "0.9rem" }} />
        <span className="sk" style={{ width: "9rem", height: "0.7rem", marginTop: "2.4rem" }} />
        <span className="sk" style={{ width: "92%", height: "2.6rem", marginTop: "1.2rem" }} />
        <span className="sk" style={{ width: "58%", height: "2.6rem", marginTop: "0.6rem" }} />
        <span className="sk" style={{ width: "76%", height: "1.3rem", marginTop: "1.2rem" }} />
        {Array.from({ length: 7 }, (_, index) => (
          <span
            key={index}
            className="sk"
            style={{ width: index % 3 === 2 ? "64%" : "100%", height: "1rem", marginTop: index === 0 ? "3rem" : "0.9rem" }}
          />
        ))}
      </div>
    </div>
  );
}
