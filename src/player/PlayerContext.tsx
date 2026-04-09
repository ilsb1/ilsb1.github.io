import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Track } from "../data/listenings";

export type PlayerTrack = Track & { unit: number };
export type PlayerDockPosition = "bottom" | "left" | "right";

type PersistedPlayerState = {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTime: number;
  volume: number;
  playbackRate: number;
  isExpanded: boolean;
  dockPosition: PlayerDockPosition;
  isDismissed: boolean;
};

export type PlayerContextValue = {
  queue: PlayerTrack[];
  currentIndex: number;
  currentTrack: PlayerTrack | null;
  isPlaying: boolean;
  isExpanded: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  isReady: boolean;
  hasPlayer: boolean;
  isDismissed: boolean;
  dockPosition: PlayerDockPosition;
  playUnitQueue: (unit: number, tracks: Track[], startIndex: number) => void;
  playByIndex: (index: number) => void;
  togglePlayPause: () => void;
  seekTo: (time: number) => void;
  seekBy: (deltaSeconds: number) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  setVolumeLevel: (value: number) => void;
  setPlaybackSpeed: (value: number) => void;
  toggleExpanded: () => void;
  setDockPosition: (position: PlayerDockPosition) => void;
  closePlayer: () => void;
};

const STORAGE_KEY = "ilsbook.stickyPlayer.v1";
const SEEK_STEP_SECONDS = 8;
const SPEED_STEPS = [0.75, 1, 1.25, 1.5];
const MOBILE_BREAKPOINT = 768;

const PlayerContext = createContext<PlayerContextValue | null>(null);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const resolveAudioUrl = (path: string): string => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const cleanPath = path.replace(/^\//, "");
  return `${baseUrl}${cleanPath}`;
};

const canUseKeyboardTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return true;
  const tag = target.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return false;
  if (target.isContentEditable) return false;
  return true;
};

const readPersistedState = (): PersistedPlayerState | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedPlayerState>;
    if (!Array.isArray(parsed.queue) || typeof parsed.currentIndex !== "number") return null;
    return {
      queue: parsed.queue,
      currentIndex: parsed.currentIndex,
      currentTime: typeof parsed.currentTime === "number" ? parsed.currentTime : 0,
      volume: typeof parsed.volume === "number" ? parsed.volume : 1,
      playbackRate: typeof parsed.playbackRate === "number" ? parsed.playbackRate : 1,
      isExpanded: Boolean(parsed.isExpanded),
      dockPosition:
        parsed.dockPosition === "left" || parsed.dockPosition === "right" ? parsed.dockPosition : "bottom",
      isDismissed: Boolean(parsed.isDismissed),
    };
  } catch {
    return null;
  }
};

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const persistedRef = useRef<PersistedPlayerState | null>(readPersistedState());

  const [queue, setQueue] = useState<PlayerTrack[]>(persistedRef.current?.queue ?? []);
  const [currentIndex, setCurrentIndex] = useState<number>(persistedRef.current?.currentIndex ?? -1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(persistedRef.current?.currentTime ?? 0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(persistedRef.current?.volume ?? 1);
  const [playbackRate, setPlaybackRate] = useState<number>(persistedRef.current?.playbackRate ?? 1);
  const [isExpanded, setIsExpanded] = useState<boolean>(persistedRef.current?.isExpanded ?? false);
  const [dockPosition, setDockPositionState] = useState<PlayerDockPosition>(
    persistedRef.current?.dockPosition ?? "bottom"
  );
  const [isDismissed, setIsDismissed] = useState<boolean>(persistedRef.current?.isDismissed ?? false);
  const [isReady, setIsReady] = useState(false);
  const [isPhoneViewport, setIsPhoneViewport] = useState(false);

  const currentTrack = queue[currentIndex] ?? null;
  const hasPlayer = Boolean(currentTrack);

  const playByIndex = useCallback(
    async (index: number) => {
      const nextTrack = queue[index];
      const audio = audioRef.current;
      if (!nextTrack || !audio) return;
      setCurrentIndex(index);
      setIsDismissed(false);
      setIsReady(false);
      setDuration(0);
      audio.src = resolveAudioUrl(nextTrack.file);
      audio.currentTime = 0;
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    },
    [queue]
  );

  const playUnitQueue = useCallback(
    async (unit: number, tracks: Track[], startIndex: number) => {
      const nextQueue = tracks.map((t) => ({ ...t, unit }));
      const clampedIndex = clamp(startIndex, 0, Math.max(0, nextQueue.length - 1));
      setQueue(nextQueue);
      setCurrentIndex(clampedIndex);
      setIsDismissed(false);
      setCurrentTime(0);
      setIsReady(false);
      setDuration(0);
      const audio = audioRef.current;
      const track = nextQueue[clampedIndex];
      if (!audio || !track) return;
      audio.src = resolveAudioUrl(track.file);
      audio.currentTime = 0;
      audio.playbackRate = playbackRate;
      audio.volume = volume;
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
    },
    [playbackRate, volume]
  );

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        setIsPlaying(false);
      }
      return;
    }
    audio.pause();
  }, []);

  const seekTo = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = clamp(time, 0, Number.isFinite(audio.duration) ? audio.duration : time);
  }, []);

  const seekBy = useCallback(
    (deltaSeconds: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      seekTo(audio.currentTime + deltaSeconds);
    },
    [seekTo]
  );

  const skipNext = useCallback(() => {
    if (currentIndex >= queue.length - 1) return;
    void playByIndex(currentIndex + 1);
  }, [currentIndex, playByIndex, queue.length]);

  const skipPrevious = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > 5) {
      audio.currentTime = 0;
      return;
    }
    if (currentIndex <= 0) {
      audio.currentTime = 0;
      return;
    }
    void playByIndex(currentIndex - 1);
  }, [currentIndex, playByIndex]);

  const setVolumeLevel = useCallback((value: number) => {
    const nextVolume = clamp(value, 0, 1);
    setVolume(nextVolume);
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = nextVolume;
  }, []);

  const setPlaybackSpeed = useCallback((value: number) => {
    const nextSpeed = clamp(value, 0.5, 2);
    setPlaybackRate(nextSpeed);
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = nextSpeed;
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const setDockPosition = useCallback(
    (position: PlayerDockPosition) => {
      if (isPhoneViewport) {
        setDockPositionState("bottom");
        return;
      }
      setDockPositionState(position);
    },
    [isPhoneViewport]
  );

  const closePlayer = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    setIsDismissed(true);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    audio.preload = "metadata";
    audio.volume = volume;
    audio.playbackRate = playbackRate;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime || 0);
    const onLoadedMetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
      setIsReady(true);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      if (currentIndex < queue.length - 1) {
        void playByIndex(currentIndex + 1);
      } else {
        setIsPlaying(false);
      }
    };
    const onError = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
  }, [currentIndex, playByIndex, playbackRate, queue.length, volume]);

  useEffect(() => {
    if (!currentTrack || !audioRef.current) return;
    const audio = audioRef.current;
    const resolvedSrc = resolveAudioUrl(currentTrack.file);
    if (audio.src.includes(currentTrack.file) || audio.src === resolvedSrc) return;
    setIsReady(false);
    setDuration(0);
    audio.src = resolvedSrc;
    const restored = persistedRef.current?.currentTime ?? 0;
    if (restored > 0) {
      audio.currentTime = restored;
    }
    setCurrentTime(restored);
    persistedRef.current = null;
  }, [currentTrack]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!hasPlayer || isDismissed || !canUseKeyboardTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === " " || key === "spacebar") {
        event.preventDefault();
        void togglePlayPause();
        return;
      }
      if (key === "arrowleft") {
        event.preventDefault();
        seekBy(-SEEK_STEP_SECONDS);
        return;
      }
      if (key === "arrowright") {
        event.preventDefault();
        seekBy(SEEK_STEP_SECONDS);
        return;
      }
      if (key === "arrowup") {
        event.preventDefault();
        setVolumeLevel(volume + 0.05);
        return;
      }
      if (key === "arrowdown") {
        event.preventDefault();
        setVolumeLevel(volume - 0.05);
        return;
      }
      if (key === "n") {
        event.preventDefault();
        skipNext();
        return;
      }
      if (key === "p") {
        event.preventDefault();
        skipPrevious();
        return;
      }
      if (key === "m") {
        event.preventDefault();
        setVolumeLevel(volume > 0 ? 0 : 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasPlayer, isDismissed, seekBy, setVolumeLevel, skipNext, skipPrevious, togglePlayPause, volume]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const syncViewport = () => {
      const isPhone = mediaQuery.matches;
      setIsPhoneViewport(isPhone);
      if (isPhone) setDockPositionState("bottom");
    };
    syncViewport();
    mediaQuery.addEventListener("change", syncViewport);
    return () => mediaQuery.removeEventListener("change", syncViewport);
  }, []);

  useEffect(() => {
    if (!hasPlayer || isDismissed) {
      document.body.classList.remove("player-visible");
      document.body.classList.remove("player-dock-left");
      document.body.classList.remove("player-dock-right");
      return;
    }
    document.body.classList.add("player-visible");
    document.body.classList.toggle("player-dock-left", dockPosition === "left");
    document.body.classList.toggle("player-dock-right", dockPosition === "right");
    return () => {
      document.body.classList.remove("player-visible");
      document.body.classList.remove("player-dock-left");
      document.body.classList.remove("player-dock-right");
    };
  }, [dockPosition, hasPlayer, isDismissed]);

  useEffect(() => {
    if (!hasPlayer) return;
    const stateToSave: PersistedPlayerState = {
      queue,
      currentIndex,
      currentTime,
      volume,
      playbackRate,
      isExpanded,
      dockPosition,
      isDismissed,
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }, [currentIndex, currentTime, dockPosition, hasPlayer, isDismissed, isExpanded, playbackRate, queue, volume]);

  const value = useMemo<PlayerContextValue>(
    () => ({
      queue,
      currentIndex,
      currentTrack,
      isPlaying,
      isExpanded,
      currentTime,
      duration,
      volume,
      playbackRate,
      isReady,
      hasPlayer,
      isDismissed,
      dockPosition,
      playUnitQueue,
      playByIndex,
      togglePlayPause,
      seekTo,
      seekBy,
      skipNext,
      skipPrevious,
      setVolumeLevel,
      setPlaybackSpeed,
      toggleExpanded,
      setDockPosition,
      closePlayer,
    }),
    [
      currentIndex,
      currentTime,
      currentTrack,
      duration,
      hasPlayer,
      isDismissed,
      dockPosition,
      isExpanded,
      isPlaying,
      isReady,
      playByIndex,
      playUnitQueue,
      playbackRate,
      queue,
      seekBy,
      seekTo,
      setPlaybackSpeed,
      setVolumeLevel,
      skipNext,
      skipPrevious,
      closePlayer,
      setDockPosition,
      toggleExpanded,
      togglePlayPause,
      volume,
    ]
  );

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} className="sr-only-audio-engine" />
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used inside PlayerProvider");
  }
  return context;
}

export const playerSpeedSteps = SPEED_STEPS;
