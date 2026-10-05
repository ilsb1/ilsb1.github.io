import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuItem =
  | { label: string; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean }
  | { label: string; href: string; icon?: ReactNode }
  | { note: string };

type Props = { label: string; trigger: ReactNode; items: MenuItem[]; className?: string };

export default function Menu({ label, trigger, items, className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const first = rootRef.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])");
    first?.focus();
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const entries = [...(rootRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? [])];
      const index = entries.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "ArrowDown" ? index + 1 : index - 1;
      entries[(next + entries.length) % entries.length]?.focus();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`menu ${className}`.trim()} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="menu__trigger"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {trigger}
      </button>
      {open ? (
        <div className="menu__list" role="menu" id={menuId} aria-label={label}>
          {items.map((item, index) => {
            if ("note" in item) {
              return (
                <p key={index} className="menu__note">
                  {item.note}
                </p>
              );
            }
            if ("href" in item) {
              return (
                <a
                  key={index}
                  role="menuitem"
                  className="menu__item"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </a>
              );
            }
            return (
              <button
                key={index}
                type="button"
                role="menuitem"
                className={`menu__item${item.danger ? " menu__item--danger" : ""}`}
                aria-disabled={item.disabled || undefined}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
