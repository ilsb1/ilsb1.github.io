import { useCallback, useEffect, useRef, useState } from "react";
import { IconClose } from "./icons";

type Toast = {
  id: number;
  text: string;
  tone: "info" | "error" | "success";
  action?: { label: string; run: () => void };
};

type ShowOptions = { tone?: Toast["tone"]; action?: Toast["action"]; duration?: number };

/** Short messages at the bottom of the screen, some with an Undo button. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((list) => list.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (text: string, { tone = "info", action, duration }: ShowOptions = {}) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-2), { id, text, tone, action }]);
      const ms = duration ?? (action ? 8000 : tone === "error" ? 9000 : 4500);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), ms),
      );
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const all = timers.current;
    return () => all.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const node = (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`} role={toast.tone === "error" ? "alert" : "status"}>
          <span className="toast__text">{toast.text}</span>
          {toast.action ? (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="toast__close" aria-label="Dismiss" onClick={() => dismiss(toast.id)}>
            <IconClose size={16} />
          </button>
        </div>
      ))}
    </div>
  );

  return { show, dismiss, node };
}
