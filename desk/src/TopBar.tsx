import { BLOG_URL } from "./api";
import { IconExternal, IconPen, IconUser } from "./icons";
import Menu from "./Menu";
import { go, isPlainClick } from "./nav";

type Props = { active: "posts" | "pages"; email: string; onSignOut: () => void };

export default function TopBar({ active, email, onSignOut }: Props) {
  const tab = (id: "posts" | "pages", hash: string, label: string) => (
    <a
      href={hash ? `#${hash}` : "#"}
      className={`tab${active === id ? " is-active" : ""}`}
      aria-current={active === id ? "page" : undefined}
      onClick={(event) => {
        if (!isPlainClick(event)) return;
        event.preventDefault();
        if (active !== id) go(hash);
      }}
    >
      {label}
    </a>
  );

  return (
    <header className="bar bar--home">
      <span className="brand">
        <IconPen size={17} />
        <span className="brand__name">Writing desk</span>
      </span>
      <nav className="tabs" aria-label="What to edit">
        {tab("posts", "", "Blog posts")}
        {tab("pages", "pages", "Website pages")}
      </nav>
      <div className="bar__end">
        <a className="bar-link bar-link--site" href={BLOG_URL} target="_blank" rel="noopener noreferrer">
          View website
          <IconExternal size={15} />
        </a>
        <Menu
          label="Account"
          trigger={<IconUser size={19} />}
          items={[
            { note: `Signed in as ${email}` },
            { label: "View the website", href: BLOG_URL, icon: <IconExternal size={16} /> },
            { label: "Sign out", onSelect: onSignOut },
          ]}
        />
      </div>
    </header>
  );
}
