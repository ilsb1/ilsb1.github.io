import React from "react";
import { Link, useParams } from "react-router-dom";
import { units } from "../data/listenings";
import { usePlayer } from "../player/PlayerContext";

const getAssetUrl = (path: string): string => {
  // Vite's BASE_URL already includes trailing slash (e.g., "/")
  const baseUrl = (import.meta as any).env?.BASE_URL || "/";
  // Remove leading slash from path if present, then combine with base
  const cleanPath = path.replace(/^\//, "");
  return `${baseUrl}${cleanPath}`;
};

export default function Unit() {
  const { unitId } = useParams();
  const unitNum = Number(unitId);
  const tracks = units[unitNum];
  const { playUnitQueue } = usePlayer();

  if (!tracks) {
    return (
      <div className="unit-page">
        <div className="error-state">
          <h2>Unit not found</h2>
          <Link to="/listenings" className="btn-primary">← Back to Listenings</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="unit-page">
      <Link to="/listenings" className="back-link" aria-label="Back to listenings">
        ← Back to Listenings
      </Link>
      
      <div className="page-header">
        <h2 className="page-title">Unit {unitNum}</h2>
      </div>

      <div className="tracks-list" role="list">
        {tracks.map((t, index) => (
          <div key={t.file} className="track-item" role="listitem">
            <h3 className="track-title">{t.title}</h3>

            <div className="track-actions">
              <button
                type="button"
                className="btn-primary track-play-btn"
                onClick={() => void playUnitQueue(unitNum, tracks, index)}
                aria-label={`Play ${t.title} in sticky player`}
              >
                Play in sticky player
              </button>
              <p className="track-actions__hint">
                Keep listening while you browse other pages.
              </p>
            </div>

            <a
              href={getAssetUrl(t.file)}
              download
              className="download-link"
              aria-label={`Download ${t.title}`}
            >
              Download MP3
            </a>

            <Link
              to={`/scripts/unit/${unitNum}`}
              className="track-script-link"
              aria-label={`Read the listening script for Unit ${unitNum}`}
            >
              Read the full listening script for Unit {unitNum}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
