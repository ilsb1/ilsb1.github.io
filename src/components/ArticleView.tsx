import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AUTHOR_NAME, AUTHOR_ROLE } from "../constants/bookMeta";
import { formatDate, readingMinutes } from "../../shared/text.js";
import BlogEssay from "./BlogEssay";

export const authorPhoto = new URL("../assets/author.jpg", import.meta.url).href;

type Props = {
  title: string;
  subtitle?: string;
  html: string;
  words: number;
  publishedAt?: string;
  back?: boolean;
  children?: ReactNode;
};

export default function ArticleView({
  title,
  subtitle = "",
  html,
  words,
  publishedAt,
  back = false,
  children,
}: Props) {
  const date = publishedAt ? formatDate(publishedAt) : "";
  return (
    <article className="post">
      {back ? (
        <Link to="/blog" className="post__back">
          <span aria-hidden="true">←</span> All writing
        </Link>
      ) : null}
      <header className="post__header">
        <p className="post__meta">
          {date ? <time dateTime={publishedAt}>{date}</time> : null}
          {date ? <span aria-hidden="true"> · </span> : null}
          <span>{readingMinutes(words)} min read</span>
        </p>
        <h1 className={`post__title${title.trim() ? "" : " is-untitled"}`}>{title.trim() || "Untitled"}</h1>
        {subtitle.trim() ? <p className="post__subtitle">{subtitle}</p> : null}
        <div className="post__byline">
          <img src={authorPhoto} alt="" className="post__avatar" width={44} height={44} />
          <div>
            <p className="post__author">{AUTHOR_NAME}</p>
            <p className="post__role">{AUTHOR_ROLE}</p>
          </div>
        </div>
      </header>
      <BlogEssay html={html} className="post__body" />
      {children}
    </article>
  );
}
