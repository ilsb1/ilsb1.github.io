import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  labelledBy?: string;
  className?: string;
  dismissable?: boolean;
  children: ReactNode;
};

export default function Modal({ open, onClose, labelledBy, className = "", dismissable = true, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissable) onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current && dismissable) onClose();
      }}
    >
      {open ? <div className="modal__inner">{children}</div> : null}
    </dialog>
  );
}
