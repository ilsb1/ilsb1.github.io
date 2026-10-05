import React from "react";
import { Link } from "react-router-dom";
import { usePage } from "../content/pageContent";
import RichText from "../content/RichText";
import SiteBlocks from "../content/SiteBlocks";
import { scriptUnitNumbers } from "../data/listeningScripts";
import { displayUnits } from "../data/listenings";

export default function ListeningScripts() {
  const page = usePage("scripts");
  const subtitle = page.text("subtitle");
  return (
    <div className="listenings-page listening-scripts-page">
      <div className="page-header">
        <h2 className="page-title">{page.text("title")}</h2>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        <p className="page-subtitle">
          Need audio first?{" "}
          <Link to="/listenings" className="listenings-home-link">
            Open Listening Tracks
          </Link>
        </p>
      </div>

      <RichText className="page-intro rich-text" html={page.html("intro")} />

      <div className="units-grid" role="list">
        {displayUnits
          .filter(({ internalUnitId }) => scriptUnitNumbers.includes(internalUnitId))
          .map(({ displayUnitNumber, internalUnitId }) => (
          <Link
            key={internalUnitId}
            to={`/scripts/unit/${internalUnitId}`}
            className="unit-card"
            role="listitem"
            aria-label={`Open script for Unit ${displayUnitNumber}`}
          >
            <div className="unit-number">Unit {displayUnitNumber}</div>
            <div className="unit-arrow" aria-hidden="true">
              →
            </div>
          </Link>
        ))}
      </div>

      <SiteBlocks blocks={page.blocks} />
    </div>
  );
}
