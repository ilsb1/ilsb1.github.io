import React from "react";
import { Link } from "react-router-dom";
import { BOOK_TITLE } from "../constants/bookMeta";

export default function AboutAuthor() {
  return (
    <div className="about-page">
      <div className="page-header">
        <h2 className="page-title">About the Author</h2>
        <p className="page-subtitle">Author of {BOOK_TITLE}</p>
      </div>

      <article className="about-content about-content--author" aria-labelledby="about-author-heading">
        <header className="author-hero author-hero--credentials" id="about-author-heading">
          <p className="author-hero__name">Dr. Sevinj Aghahuseyn Hasanova</p>
          <div className="author-credentials">
            <p>Associate Professor of the</p>
            <p>Chair of English Lexicology</p>
            <p>Azerbaijan University of Languages</p>
          </div>
        </header>

        <div className="author-actions">
          <a
            href="https://scholar.google.com/citations?user=OIcH4IgAAAAJ&hl=ru"
            target="_blank"
            rel="noopener noreferrer"
            className="scholar-link"
            aria-label="View author's Google Scholar profile"
          >
            <svg className="scholar-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M5.242 13.769L0 9.5 12 0l12 9.5-5.242 4.269C17.548 11.249 14.978 9.5 12 9.5c-2.977 0-5.548 1.748-6.758 4.269zM12 10a7 7 0 1 0 0 14 7 7 0 0 0 0-14z" fill="#4285F4"/>
            </svg>
            <span>Google Scholar</span>
          </a>
        </div>

        <footer className="about-footer-nav">
          <Link to="/listenings" className="about-footer-nav__link about-footer-nav__link--secondary">
            ← Listening exercises
          </Link>
          <Link to="/about/book" className="about-footer-nav__link">
            About the book →
          </Link>
        </footer>
      </article>
    </div>
  );
}
