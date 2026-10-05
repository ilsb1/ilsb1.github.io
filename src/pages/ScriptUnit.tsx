import React from "react";
import { Link, useParams } from "react-router-dom";
import { usePage } from "../content/pageContent";
import SiteBlocks from "../content/SiteBlocks";
import { unitScripts } from "../data/listeningScripts";
import { getDisplayUnitNumber } from "../data/listenings";

export default function ScriptUnit() {
  const { unitId } = useParams();
  const unitNum = Number(unitId);
  const displayUnitNum = getDisplayUnitNumber(unitNum);
  const script = unitScripts[unitNum];
  const page = usePage(`script-${unitNum}`);

  if (!script) {
    return (
      <div className="unit-page">
        <div className="error-state">
          <h2>Script not found</h2>
          <Link to="/listening-scripts" className="btn-primary">
            ← Back to Listening Scripts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="unit-page script-unit-page">
      <Link to="/listening-scripts" className="back-link" aria-label="Back to listening scripts">
        ← Back to Listening Scripts
      </Link>

      <header className="page-header script-page-header">
        <h2 className="page-title">{page.text("title") || `Unit ${displayUnitNum}`}</h2>
        {page.text("subtitle") ? <p className="page-subtitle script-title">{page.text("subtitle")}</p> : null}
      </header>

      <section className="script-track-links" aria-label="Related listening tracks">
        <h3 className="script-track-links__title">Related listening tracks</h3>
        <div className="script-track-links__list">
          <Link to={`/unit/${script.unit}`} className="script-track-link">
            Open Unit {displayUnitNum} Listening Tracks
          </Link>
        </div>
      </section>

      <article className="script-reader" aria-label={`Listening script for unit ${script.unit}`}>
        {script.blocks.map((block, idx) => {
          if (block.type === "heading") {
            return (
              <h3 className="script-block script-block--heading" key={`${block.type}-${idx}`}>
                {block.text}
              </h3>
            );
          }
          if (block.type === "note") {
            return (
              <p className="script-block script-block--note" key={`${block.type}-${idx}`}>
                {block.text}
              </p>
            );
          }
          if (block.type === "dialogue") {
            return (
              <div className="script-dialogue" key={`${block.type}-${idx}`}>
                <span className="script-dialogue__speaker">{block.speaker}</span>
                <p className="script-dialogue__text">{block.text}</p>
              </div>
            );
          }
          return (
            <p className="script-block script-block--paragraph" key={`${block.type}-${idx}`}>
              {block.text}
            </p>
          );
        })}
      </article>

      <SiteBlocks blocks={page.blocks} />
    </div>
  );
}
