import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, requestCode, verifyCode, type Session } from "./api";
import { IconPen } from "./icons";

type Props = { note: string; onSignedIn: (session: Session) => void };

const RESEND_SECONDS = 30;

export default function SignIn({ note, onSignedIn }: Props) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    const typed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
      setError(typed ? "That doesn't look like an email address. Please check it." : "Please type your email address.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await requestCode(typed);
      setPreviewCode(result.previewCode);
      setCode("");
      setStep("code");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function checkCode(value: string) {
    if (busy || value.length !== 6) return;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await verifyCode(email.trim(), value));
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      setBusy(false);
    }
  }

  return (
    <main className="signin">
      <div className="signin__card">
        <p className="brand">
          <IconPen size={17} />
          Writing desk
        </p>

        {step === "email" ? (
          <form onSubmit={(event) => void sendCode(event)} noValidate>
            <h1>Sign in</h1>
            <p className="muted">Type your email address and we&apos;ll send you a 6&#8209;digit code.</p>
            {note ? <p className="notice">{note}</p> : null}
            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void checkCode(code);
            }}
            noValidate
          >
            <h1>Check your email</h1>
            <p className="muted">
              We sent a code to <strong>{email.trim()}</strong>. It can take a minute to arrive, so check the spam folder
              too.
            </p>
            {previewCode ? (
              <p className="notice">
                Email isn&apos;t set up on this computer, so here is the code: <strong>{previewCode}</strong>
              </p>
            ) : null}
            <label className="field">
              <span>6&#8209;digit code</span>
              <input
                className="code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(event) => {
                  const next = event.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(next);
                  if (next.length === 6) void checkCode(next);
                }}
              />
            </label>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn btn--primary btn--block" disabled={busy || code.length !== 6}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <div className="signin__links">
              <button type="button" className="text-btn" disabled={busy || wait > 0} onClick={() => void sendCode()}>
                {wait > 0 ? `Send a new code (${wait})` : "Send a new code"}
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setPreviewCode("");
                  setError("");
                }}
              >
                Use a different email
              </button>
            </div>
          </form>
        )}

        <p className="signin__foot">Only approved email addresses get a code. You&apos;ll stay signed in on this device for two weeks.</p>
      </div>
    </main>
  );
}
