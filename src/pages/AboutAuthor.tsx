import React from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../content/Blocks";
import { usePage } from "../content/pageContent";
import RichText from "../content/RichText";
import SiteBlocks from "../content/SiteBlocks";

function ScholarIcon() {
  return (
    <svg className="scholar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z"
        fill="currentColor"
      />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg className="scholar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M4 3.5A1.5 1.5 0 0 1 5.5 2h13A1.5 1.5 0 0 1 20 3.5v17a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-17zm3.05 6.55h2.35V18H7.05v-7.95zM8.22 6.1a1.36 1.36 0 1 0 0 2.72 1.36 1.36 0 0 0 0-2.72zM11 10.05h2.26v1.09h.03c.32-.6 1.1-1.24 2.26-1.24 2.41 0 2.85 1.58 2.85 3.64V18h-2.35v-3.78c0-.9-.02-2.05-1.24-2.05-1.25 0-1.44.98-1.44 1.99V18H11v-7.95z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AboutAuthor() {
  const page = usePage("about-author");
  const subtitle = page.text("subtitle");
  const name = page.text("name");
  const affiliation = page.text("affiliation");
  const photo = page.image("photo");
  const scholarUrl = page.text("scholarUrl");
  const linkedinUrl = page.text("linkedinUrl");

  return (
    <div className="about-page">
      <div className="page-header">
        <h2 className="page-title">{page.text("title")}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>

      <article className="about-content author-profile" aria-labelledby="about-author-heading">
        <header className="author-masthead" id="about-author-heading">
          {name ? <p className="author-masthead__name">{name}</p> : null}
          {affiliation ? <p className="author-masthead__affiliation">{affiliation}</p> : null}
          {photo ? (
            <div className="author-masthead__media">
              <div className="author-masthead__photo-wrap">
                <img
                  src={mediaUrl(photo.src)}
                  width={photo.width || undefined}
                  height={photo.height || undefined}
                  alt={name}
                  className="author-masthead__photo"
                />
              </div>
            </div>
          ) : null}
          {scholarUrl || linkedinUrl ? (
            <div className="author-masthead__actions">
              {scholarUrl ? (
                <a
                  href={scholarUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="scholar-link scholar-link--masthead social-link social-link--scholar"
                  aria-label="View author's Google Scholar profile"
                >
                  <ScholarIcon />
                  <span>Google Scholar</span>
                </a>
              ) : null}
              {linkedinUrl ? (
                <a
                  href={linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="scholar-link scholar-link--masthead social-link social-link--linkedin"
                  aria-label="View author's LinkedIn profile"
                >
                  <LinkedInIcon />
                  <span>LinkedIn</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </header>

        <RichText className="author-bio author-bio--rich rich-text" html={page.html("bio")} />

        <SiteBlocks blocks={page.blocks} className="page-blocks--in-card" />

        <footer className="about-footer-nav">
          <Link to="/about/book" className="about-footer-nav__link about-footer-nav__link--secondary">
            ← About the book
          </Link>
          <Link to="/copyright" className="about-footer-nav__link">
            Copyright &amp; credits →
          </Link>
        </footer>
      </article>
    </div>
  );
}
