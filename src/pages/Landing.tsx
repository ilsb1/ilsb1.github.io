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
                <strong>1. Audio:</strong> Open{" "}
                <Link to="/listenings" className="landing-inline-link">
                  Listening recordings
                </Link>{" "}
                to access tracks.
                <br />
                <strong>2. Scripts:</strong> Read{" "}
                <Link to="/listening-scripts" className="landing-inline-link">
                  Listening scripts
                </Link>{" "}
                with unit-by-unit transcripts.
                <br />
                <strong>3. Overview:</strong> Visit{" "}
                <Link to="/about/book" className="landing-inline-link">
                  About the book
                </Link>{" "}
                for more information.
                <br />
                <strong>4. Author:</strong> Read{" "}
                <Link to="/about/author" className="landing-inline-link">
                  About the author
                </Link>{" "}
                for biographical context.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
