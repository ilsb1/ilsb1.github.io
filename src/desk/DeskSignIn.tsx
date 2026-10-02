import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ApiError, deskError, requestCode, verifyCode } from "../blog/posts";
import type { Session } from "../blog/session";
import { IconArrowLeft, IconArrowRight, IconMail } from "./icons";

type Props = {
  note?: string;
  onSignedIn: (session: Session) => void;
};

const RESEND_SECONDS = 30;

export default function DeskSignIn({ note, onSignedIn }: Props) {
  const emailId = useId();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [previewCode, setPreviewCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const sending = useRef(false);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (sending.current) return;
    const typed = email.trim();
    if (!typed) {
      setError("Please type your email address first.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typed)) {
      setError("That doesn't look like an email address. Please check it and try again.");
      return;
    }
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await requestCode(email.trim());
      if (result.alreadySent && !result.previewCode) {
        if (step === "email") setStep("code");
        setWait(RESEND_SECONDS);
        return;
      }
      setPreviewCode(result.previewCode);
      setCode("");
      setStep("code");
      setWait(RESEND_SECONDS);
    } catch (err) {
      setError(deskError(err instanceof ApiError ? err.code : "request_failed"));
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function submitCode(value: string) {
    if (sending.current || value.length !== 6) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      onSignedIn(await verifyCode(email.trim(), value));
    } catch (err) {
      const reason = err instanceof ApiError ? err.code : "request_failed";
      setError(deskError(reason));
      setCode("");
      if (reason === "code_expired" || reason === "too_many_attempts") {
        setPreviewCode("");
        setWait(0);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <aside className="gate__art" aria-hidden="true">
        <div className="gate__glow" />
        <div className="gate__sheet gate__sheet--back" />
        <div className="gate__sheet">
          <p className="gate__sheet-kicker">Draft</p>
          <p className="gate__sheet-title">
            On learning to listen<span className="gate__caret" />
          </p>
          <p className="gate__sheet-sub">A note for the first week of term</p>
          <span className="gate__line" style={{ width: "92%" }} />
          <span className="gate__line" style={{ width: "86%" }} />
          <span className="gate__line" style={{ width: "95%" }} />
          <span className="gate__line" style={{ width: "60%" }} />
          <span className="gate__line gate__line--gap" style={{ width: "90%" }} />
          <span className="gate__line" style={{ width: "82%" }} />
          <span className="gate__line" style={{ width: "40%" }} />
        </div>
        <div className="gate__art-copy">
          <p className="gate__art-eyebrow">The writing desk</p>
          <p className="gate__art-title">A quiet place to write.</p>
          <p className="gate__art-text">Draft, shape and publish essays for the blog. Every word is saved as you go.</p>
        </div>
      </aside>

      <main className="gate__panel">
        <Link to="/" className="gate__back">
          <IconArrowLeft size={16} />
          Back to the website
        </Link>

        <div className="gate__card" key={step}>
          {step === "email" ? (
            <form onSubmit={sendCode} noValidate>
              <div className="gate__icon">
                <IconMail size={22} />
              </div>
              <h1 className="gate__title">Sign in to your desk</h1>
              <p className="gate__lead">
                Enter your email address and we&apos;ll send you a 6&#8209;digit code. There&apos;s no password to remember.
              </p>
              {note ? <p className="gate__note">{note}</p> : null}
              <label className="gate__label" htmlFor={emailId}>
                Email address
              </label>
              <input
                id={emailId}
                className="gate__input"
                type="email"
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                inputMode="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
              {error ? (
                <p className="gate__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
                {busy ? (
                  <span className="spinner" aria-hidden="true" />
                ) : null}
                <span>{busy ? "Sending…" : "Send me a code"}</span>
                {busy ? null : <IconArrowRight size={18} />}
              </button>
              <p className="gate__fine">Only the author&apos;s email addresses can open this desk.</p>
            </form>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitCode(code);
              }}
            >
              <h1 className="gate__title">{previewCode ? "Here's your code" : "Check your email"}</h1>
              <p className="gate__lead">
                {previewCode ? (
                  <>Email isn&apos;t set up on this computer yet, so your code is shown below instead.</>
                ) : (
                  <>
                    If <strong>{email.trim()}</strong> can open this desk, a 6&#8209;digit code is on its way. It works for
                    10 minutes.
                  </>
                )}
              </p>

              {previewCode ? (
                <div className="gate__preview">
                  <span className="gate__preview-digits">
                    {previewCode.slice(0, 3)}
                    <span className="gate__preview-gap" />
                    {previewCode.slice(3)}
                  </span>
                  <button
                    type="button"
                    className="btn btn--soft"
                    disabled={busy}
                    onClick={() => {
                      setCode(previewCode);
                      void submitCode(previewCode);
                    }}
                  >
                    Fill it in for me
                  </button>
                </div>
              ) : null}

              <CodeBoxes
                value={code}
                disabled={busy}
                onChange={(value) => {
                  setCode(value);
                  setError("");
                  if (value.length === 6) void submitCode(value);
                }}
              />

              {error ? (
                <p className="gate__error" role="alert">
                  {error}
                </p>
              ) : null}

              <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy || code.length !== 6}>
                {busy ? <span className="spinner" aria-hidden="true" /> : null}
                <span>{busy ? "Opening your desk…" : "Open my desk"}</span>
              </button>

              <div className="gate__links">
                <button
                  type="button"
                  className="btn btn--text"
                  disabled={busy || wait > 0}
                  onClick={() => void sendCode()}
                >
                  {wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}
                </button>
                <button
                  type="button"
                  className="btn btn--text"
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
              {previewCode ? null : (
                <p className="gate__fine">Can&apos;t find it? Look in your spam or junk folder.</p>
              )}
            </form>
          )}
        </div>
      </main>
    </div>
  );
}

function CodeBoxes({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, 5);

  return (
    <div
      className={`otp${focused ? " is-focused" : ""}${disabled ? " is-disabled" : ""}`}
      onMouseDown={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}
    >
      {Array.from({ length: 6 }, (_, index) => (
        <span
          key={index}
          className={`otp__cell${value[index] ? " is-filled" : ""}${focused && index === active ? " is-active" : ""}${
            index === 2 ? " otp__cell--gap" : ""
          }`}
        >
          {value[index] ?? ""}
        </span>
      ))}
      <input
        ref={inputRef}
        className="otp__input"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="6-digit code"
        autoFocus
        maxLength={6}
        value={value}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </div>
  );
}
