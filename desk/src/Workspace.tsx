import { lazy, Suspense, useEffect, useState } from "react";
import type { Session } from "./api";
import Desk from "./Desk";
import { readRoute, type Route } from "./nav";
import PagesList, { loadEditor } from "./PagesList";
import TopBar from "./TopBar";

const PageEditor = lazy(loadEditor);

type Props = { session: Session; onSignOut: (note?: string) => void };

function screenOf(route: Route) {
  return route.view === "page" ? `page/${route.id}` : route.view;
}

export default function Workspace({ session, onSignOut }: Props) {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onPop = () =>
      setRoute((current) => {
        const next = readRoute();
        return screenOf(next) === screenOf(current) ? current : next;
      });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  if (route.view === "page") {
    return (
      <Suspense
        fallback={
          <div className="screen">
            <p className="list__note" role="status">
              Opening…
            </p>
          </div>
        }
      >
        <PageEditor key={route.id} id={route.id} session={session} onSignOut={onSignOut} />
      </Suspense>
    );
  }

  const topBar = <TopBar active={route.view} email={session.email} onSignOut={() => onSignOut()} />;
  if (route.view === "pages") return <PagesList session={session} onSignOut={onSignOut} topBar={topBar} />;
  return <Desk session={session} onSignOut={onSignOut} topBar={topBar} />;
}
