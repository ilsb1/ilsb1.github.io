export type Session = {
  token: string;
  email: string;
  expiresAt: number;
};

const KEY = "ils.writing.session.v1";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Session>;
    if (!data.token || !data.email || typeof data.expiresAt !== "number") return null;
    if (data.expiresAt <= Date.now()) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { token: data.token, email: data.email, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
