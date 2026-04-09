import React from "react";
import { Link } from "react-router-dom";
import { BOOK_TITLE } from "../constants/bookMeta";
import coverImage from "../assets/cover.JPG";

export default function Landing() {
  return (
    <div className="landing-page">
      <section className="landing-panel" aria-labelledby="landing-heading">
        <div className="landing-layout">
          <div className="landing-cover-wrap">
            <img
              src={coverImage}
              alt={`Cover: ${BOOK_TITLE}`}
              className="landing-cover"
              width={640}
              height={960}
              decoding="async"
            />
          </div>
          <div className="landing-copy">
            <h2 id="landing-heading" className="landing-heading">
              {BOOK_TITLE}
            </h2>
            <div className="landing-prose">
              <p>
                A CEFR B1 coursebook for undergraduates: reading/listening and speaking/writing are
                developed in parallel across units, with structured work in critical thinking and
                academic writing, and recurrent attention to vocabulary in use, idioms in use, and
                proverbs in use. 
              </p>
              <p>
                Access audio via the{" "}
                <Link to="/listenings" className="landing-inline-link">
                  listening exercises
                </Link>{" "}
                (Units 1–10; URLs match the printed QR codes). The{" "}
                <Link to="/about/book" className="landing-inline-link">
                  About the book
                </Link>{" "}
                section outlines the textbook in full;{" "}
                <Link to="/about/author" className="landing-inline-link">
                  About the author
                </Link>{" "}
                provides biographical and scholarly context.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
