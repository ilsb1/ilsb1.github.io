import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loadSession } from "../blog/session";

/** Not linked from any public page. Sign-in is still limited to the allowed emails. */
export const DESK_PATH = "/quiet-desk-2741";

/** Avoid n, p, m and space: the audio player uses them as shortcuts. */
const SECRET_WORD = "writer";
const PAUSE_MS = 3000;

function isTextField(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/** Typing the secret word anywhere on the site, outside a text box, opens the writing desk. */
export function useSecretWord(enabled: boolean) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return undefined;
    let typed = "";
    let lastAt = 0;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.key.length !== 1 || isTextField(event.target)) {
        typed = "";
        return;
      }
      if (event.timeStamp - lastAt > PAUSE_MS) typed = "";
      lastAt = event.timeStamp;
      typed = (typed + event.key.toLowerCase()).slice(-SECRET_WORD.length);
      if (typed === SECRET_WORD) {
        typed = "";
        navigate(DESK_PATH);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, navigate]);
}

export function writerSignedIn() {
  return loadSession() !== null;
}
