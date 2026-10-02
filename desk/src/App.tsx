import { useCallback, useState } from "react";
import { clearSession, loadSession, saveSession, type Session } from "./api";
import Desk from "./Desk";
import SignIn from "./SignIn";

export default function App() {
  const [session, setSession] = useState<Session | null>(loadSession);
  const [note, setNote] = useState("");

  const signOut = useCallback((message = "") => {
    clearSession();
    setSession(null);
    setNote(message);
  }, []);

  if (!session) {
    return (
      <SignIn
        note={note}
        onSignedIn={(next) => {
          saveSession(next);
          setNote("");
          setSession(next);
        }}
      />
    );
  }
  return <Desk session={session} onSignOut={signOut} />;
}
