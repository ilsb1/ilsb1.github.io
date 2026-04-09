import React from "react";
import { Link } from "react-router-dom";
import { unitNumbers } from "../data/listenings";

export default function Listenings() {
  return (
    <div className="listenings-page">
      <div className="page-header">
        <h2 className="page-title">Listening Exercises</h2>
        <p className="page-subtitle">
          <Link to="/" className="listenings-home-link">
            Welcome page
          </Link>
          <span className="page-subtitle__sep" aria-hidden="true">
            {" "}
            ·{" "}
          </span>
          Select a unit to begin
        </p>
        <div className="listenings-download-wrap">
          <a
            href="/listenings/listening-tracks-all.zip"
            className="listenings-download-btn"
            download="ilsbook-listening-tracks-all.zip"
          >
            Download all listening tracks (.zip)
          </a>
          <p className="listenings-download-note">
            For offline use: one ZIP file with all Unit 1-10 listening tracks.
          </p>
        </div>
      </div>

      <div className="units-grid" role="list">
        {unitNumbers.map((unitNum) => (
          <Link
            key={unitNum}
            to={`/unit/${unitNum}`}
            className="unit-card"
            role="listitem"
            aria-label={`Unit ${unitNum}`}
          >
            <div className="unit-number">Unit {unitNum}</div>
            <div className="unit-arrow" aria-hidden="true">→</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

