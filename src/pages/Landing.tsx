import React from "react";
import BookEditionShowcase from "../components/BookEditionShowcase";
import { usePage } from "../content/pageContent";
import RichText from "../content/RichText";
import SiteBlocks from "../content/SiteBlocks";

export default function Landing() {
  const page = usePage("home");
  return (
    <div className="landing-page">
      <section className="landing-panel" aria-labelledby="landing-heading">
        <div className="landing-layout">
          <BookEditionShowcase />
          <div className="landing-copy">
            <h2 id="landing-heading" className="landing-heading">
              {page.text("heading")}
            </h2>
            <RichText className="landing-prose rich-text" html={page.html("intro")} />
          </div>
        </div>
        <SiteBlocks blocks={page.blocks} />
      </section>
    </div>
  );
}
