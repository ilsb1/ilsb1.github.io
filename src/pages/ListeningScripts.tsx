import React from "react";
import { Link } from "react-router-dom";
import { scriptUnitNumbers } from "../data/listeningScripts";

export default function ListeningScripts() {
  return (
    <div className="listenings-page listening-scripts-page">
      <div className="page-header">
        <h2 className="page-title">Listening Scripts</h2>
        <p className="page-subtitle">
          Read each unit script with clear structure and quick access to matching audio.
        </p>
        <p className="page-subtitle">
          Need audio first?{" "}
          <Link to="/listenings" className="listenings-home-link">
            Open Listening Tracks
          </Link>
        </p>
      </div>

      <div className="units-grid" role="list">
        {scriptUnitNumbers.map((unitNum) => (
          <Link
            key={unitNum}
            to={`/scripts/unit/${unitNum}`}
            className="unit-card"
            role="listitem"
            aria-label={`Open script for Unit ${unitNum}`}
          >
            <div className="unit-number">Unit {unitNum}</div>
            <div className="unit-arrow" aria-hidden="true">
              →
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
