export type Route = { view: "posts" } | { view: "pages" } | { view: "page"; id: string };

export function readRoute(): Route {
  const hash = window.location.hash.slice(1);
  if (hash === "pages") return { view: "pages" };
  if (hash.startsWith("page/")) return { view: "page", id: hash.slice(5) };
  return { view: "posts" };
}

/** Moves between screens with the browser's back button still working. */
export function go(hash: string, { replace = false } = {}) {
  const url = hash ? `#${hash}` : `${window.location.pathname}${window.location.search}`;
  if (replace) window.history.replaceState({ desk: true }, "", url);
  else window.history.pushState({ desk: true }, "", url);
  window.dispatchEvent(new PopStateEvent("popstate", { state: { desk: true } }));
}

export function goBack(fallback: string) {
  if (window.history.state?.desk) window.history.back();
  else go(fallback, { replace: true });
}

export function isPlainClick(event: React.MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
