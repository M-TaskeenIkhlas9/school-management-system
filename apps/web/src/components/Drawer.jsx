import { useEffect, useRef } from "react";
import Icon from "../app/Icon.jsx";

/** A sheet that slides in from the right over the page. Closes on Esc, the × or a click outside. */
export default function Drawer({ title, onClose, children }) {
  const closeRef = useRef(null);

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="drawer" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer__panel" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="drawer__close" onClick={onClose} ref={closeRef} aria-label="Close">
          <Icon name="close" size={18} />
        </button>
        {children}
      </aside>
    </div>
  );
}
