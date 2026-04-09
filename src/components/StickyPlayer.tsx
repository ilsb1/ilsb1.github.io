import React, { useEffect, useState } from "react";
import { usePlayer } from "../player/PlayerContext";

const formatTime = (seconds: number): string => {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const speedOptions = [0.75, 1, 1.25, 1.5];
const MOBILE_BREAKPOINT = 768;

export default function StickyPlayer() {
  const {
    queue,
    currentTrack,
    currentIndex,
    hasPlayer,
    isPlaying,
    isExpanded,
    isReady,
    isDismissed,
    dockPosition,
    currentTime,
    duration,
    volume,
    playbackRate,
    togglePlayPause,
    seekTo,
    skipNext,
    skipPrevious,
    setVolumeLevel,
    setPlaybackSpeed,
    playByIndex,
    toggleExpanded,
    setDockPosition,
    closePlayer,
  } = usePlayer();
  const [isPhoneViewport, setIsPhoneViewport] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const syncViewport = () => setIsPhoneViewport(mediaQuery.matches);
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  if (!hasPlayer || !currentTrack || isDismissed) return null;

  const progressMax = duration > 0 ? duration : 0;
  const safeCurrentTime = Math.min(currentTime, progressMax || currentTime);

  return (
    <aside
      className={`sticky-player sticky-player--${dockPosition} ${isPhoneViewport ? "sticky-player--phone" : ""} ${isExpanded ? "sticky-player--expanded" : ""}`}
      aria-label="Global audio player"
    >
      <div className="sticky-player__dock-tools" role="group" aria-label="Player position">
        {!isPhoneViewport ? (
          <>
            <button
              type="button"
              className={`player-btn player-btn--dock ${dockPosition === "bottom" ? "is-active" : ""}`}
              onClick={() => setDockPosition("bottom")}
              aria-label="Dock player at bottom"
            >
              Bottom
            </button>
            <button
              type="button"
              className={`player-btn player-btn--dock ${dockPosition === "left" ? "is-active" : ""}`}
              onClick={() => setDockPosition("left")}
              aria-label="Dock player on left side"
            >
              Left
            </button>
            <button
              type="button"
              className={`player-btn player-btn--dock ${dockPosition === "right" ? "is-active" : ""}`}
              onClick={() => setDockPosition("right")}
              aria-label="Dock player on right side"
            >
              Right
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="player-btn player-btn--close"
          onClick={closePlayer}
          aria-label="Close player window"
          title="Close player"
        >
          ✕
        </button>
      </div>

      <div className="sticky-player__top">
        <button
          type="button"
          className="player-btn player-btn--transport"
          onClick={skipPrevious}
          disabled={currentIndex <= 0}
          aria-label="Previous track"
          title="Previous (P)"
        >
          ⏮
        </button>
        <button
          type="button"
          className="player-btn player-btn--play"
          onClick={() => void togglePlayPause()}
          aria-label={isPlaying ? "Pause playback" : "Start playback"}
          title="Play/Pause (Space)"
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <button
          type="button"
          className="player-btn player-btn--transport"
          onClick={skipNext}
          disabled={currentIndex >= queue.length - 1}
          aria-label="Next track"
          title="Next (N)"
        >
          ⏭
        </button>

        <div className="sticky-player__meta">
          <p className="sticky-player__title">{currentTrack.title}</p>
          {isPhoneViewport ? null : (
            <p className="sticky-player__sub">
              Unit {currentTrack.unit} · {isReady ? "Ready" : "Loading"}
            </p>
          )}
        </div>

        <button
          type="button"
          className="player-btn player-btn--expand"
          onClick={toggleExpanded}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse player panel" : "Expand player panel"}
        >
          {isExpanded ? "Hide Queue" : "Open Queue"}
        </button>
      </div>

      <div className="sticky-player__timeline">
        <span className="sticky-player__time">{formatTime(safeCurrentTime)}</span>
        <input
          type="range"
          className="sticky-player__seek"
          min={0}
          max={progressMax}
          step={0.1}
          value={Math.min(safeCurrentTime, progressMax || safeCurrentTime)}
          onChange={(event) => seekTo(Number(event.target.value))}
          aria-label="Seek playback"
        />
        <span className="sticky-player__time">{formatTime(duration)}</span>
      </div>

      {isExpanded ? (
        <div className="sticky-player__panel">
          <div className="sticky-player__controls">
            <label className="sticky-player__control">
              <span>Speed</span>
              <select
                className="sticky-player__select"
                value={playbackRate}
                onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
                aria-label="Playback speed"
              >
                {speedOptions.map((speed) => (
                  <option key={speed} value={speed}>
                    {speed}x
                  </option>
                ))}
              </select>
            </label>
            <label className="sticky-player__control">
              <span>Volume</span>
              <input
                type="range"
                className="sticky-player__volume"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(event) => setVolumeLevel(Number(event.target.value))}
                aria-label="Volume"
              />
            </label>
          </div>

          <div className="sticky-player__queue-wrap">
            <p className="sticky-player__queue-title">Unit Queue</p>
            <div className="sticky-player__queue" role="list">
              {queue.map((track, index) => (
                <button
                  type="button"
                  role="listitem"
                  key={`${track.file}-${index}`}
                  className={`sticky-player__queue-item ${index === currentIndex ? "is-active" : ""}`}
                  onClick={() => void playByIndex(index)}
                  aria-current={index === currentIndex}
                >
                  <span className="sticky-player__queue-index">{index + 1}</span>
                  <span className="sticky-player__queue-text">{track.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
