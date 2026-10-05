import React from "react";
import { Link } from "react-router-dom";
import BookEditionShowcase from "../components/BookEditionShowcase";
import { usePage } from "../content/pageContent";
import RichText from "../content/RichText";
import SiteBlocks, { TextLines } from "../content/SiteBlocks";

export default function AboutBook() {
  const page = usePage("about-book");
  const subtitle = page.text("subtitle");
  const bookTitle = page.text("bookTitle");
  const signatureName = page.text("signatureName");
  const signatureRole = page.text("signatureRole");

  return (
    <div className="about-page">
      <div className="page-header">
        <h2 className="page-title">{page.text("title")}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>

      <article className="about-content about-content--book" aria-labelledby="about-book-heading">
        <header className="book-hero" id="about-book-heading">
          <BookEditionShowcase compact />
          {bookTitle ? <h3 className="book-title">{bookTitle}</h3> : null}
        </header>

        <RichText className="about-prose about-text-block about-text-block--flush rich-text" html={page.html("body")} />

        <SiteBlocks blocks={page.blocks} className="page-blocks--in-card" />

        {signatureName || signatureRole ? (
          <aside className="about-signature" aria-label="Author">
            {signatureName ? <p className="about-signature__name">{signatureName}</p> : null}
            {signatureRole ? (
              <p className="about-signature__role">
                <TextLines text={signatureRole} />
              </p>
            ) : null}
          </aside>
        ) : null}

        <footer className="about-footer-nav">
          <Link to="/listenings" className="about-footer-nav__link about-footer-nav__link--secondary">
            ← Listening exercises
          </Link>
          <Link to="/about/author" className="about-footer-nav__link">
            About the author →
          </Link>
        </footer>
      </article>
    </div>
  );
}
