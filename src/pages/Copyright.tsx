import React from "react";
import { Link } from "react-router-dom";
import { usePage } from "../content/pageContent";
import SiteBlocks, { TextLines } from "../content/SiteBlocks";

function Notice({ lang, heading, strong, body }: { lang: string; heading: string; strong: string; body: string }) {
  if (!heading && !strong && !body) return null;
  return (
    <div className="copyright-notice" lang={lang}>
      {heading ? <p className="copyright-notice__heading">{heading}</p> : null}
      {strong ? <p className="copyright-notice__strong">{strong}</p> : null}
      {body ? (
        <p className="copyright-notice__body">
          <TextLines text={body} />
        </p>
      ) : null}
    </div>
  );
}

export default function Copyright() {
  const page = usePage("copyright");
  const subtitle = page.text("subtitle");
  const heroTitle = page.text("heroTitle");
  const heroSubtitle = page.text("heroSubtitle");
  const imprintAuthor = page.text("imprintAuthor");
  const imprintTitle = page.text("imprintTitle");
  const imprintEdition = page.text("imprintEdition");
  const isbn = page.text("isbn");
  const copyrightLine = page.text("copyrightLine");

  return (
    <div className="about-page copyright-page">
      <div className="page-header">
        <h2 className="page-title">{page.text("title")}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>

      <article className="about-content copyright-content" aria-labelledby="copyright-heading">
        <header className="copyright-hero" id="copyright-heading">
          {heroTitle ? <h3 className="copyright-hero__title">{heroTitle}</h3> : null}
          {heroSubtitle ? <p className="copyright-hero__subtitle">{heroSubtitle}</p> : null}
        </header>

        <section className="copyright-notices" aria-label="Copyright notice in English and Azerbaijani">
          <Notice lang="en" heading={page.text("enHeading")} strong={page.text("enStrong")} body={page.text("enBody")} />
          <Notice lang="az" heading={page.text("azHeading")} strong={page.text("azStrong")} body={page.text("azBody")} />
        </section>

        <section className="copyright-imprint" aria-label="Imprint">
          {imprintAuthor ? <p className="copyright-imprint__author">{imprintAuthor}</p> : null}
          {imprintTitle ? <p className="copyright-imprint__title">{imprintTitle}</p> : null}
          {imprintEdition ? <p className="copyright-imprint__edition">{imprintEdition}</p> : null}
          {isbn || copyrightLine ? (
            <dl className="copyright-imprint__meta">
              {isbn ? (
                <div className="copyright-imprint__row">
                  <dt>ISBN</dt>
                  <dd>
                    {/^forthcoming$/i.test(isbn.trim()) ? (
                      <span className="copyright-imprint__pending">{isbn}</span>
                    ) : (
                      isbn
                    )}
                  </dd>
                </div>
              ) : null}
              {copyrightLine ? (
                <div className="copyright-imprint__row">
                  <dt>Copyright</dt>
                  <dd>{copyrightLine}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
        </section>

        <SiteBlocks blocks={page.blocks} className="page-blocks--in-card" />

        <footer className="about-footer-nav">
          <Link to="/about/author" className="about-footer-nav__link about-footer-nav__link--secondary">
            &larr; About the author
          </Link>
          <Link to="/" className="about-footer-nav__link">
            Back to home &rarr;
          </Link>
        </footer>
      </article>
    </div>
  );
}
