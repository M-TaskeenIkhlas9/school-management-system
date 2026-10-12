import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStudents } from "../api/queries.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { navItems } from "../app/navItems.jsx";
import { fullName } from "../lib/format.js";
import Icon from "../app/Icon.jsx";

const isTyping = (el) => el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Open with Ctrl/⌘ K (or "/"): jump to a page, find a student, or ask the assistant. */
export function useCommandPaletteShortcut(open) {
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "k" || e.key === "K") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        open();
      } else if (e.key === "/" && !isTyping(document.activeElement)) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
}

export default function CommandPalette({ onClose }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { data: students = [] } = useStudents({ enabled: can("students:read") });
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = navItems
      .filter((item) => can(item.permission))
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .map((item) => ({ key: item.path, kind: "Page", label: item.label, icon: item.icon, to: item.path }));
    const people = q
      ? students
          .filter((s) => `${fullName(s)} ${s.roll_number ?? ""}`.toLowerCase().includes(q))
          .slice(0, 6)
          .map((s) => ({
            key: `student-${s.id}`,
            kind: "Student",
            label: fullName(s),
            detail: [s.class_name, s.roll_number].filter(Boolean).join(" · "),
            icon: "student",
            to: `/students?id=${s.id}`,
          }))
      : [];
    const ask =
      q && can("assistant:use")
        ? [
            {
              key: "ask",
              kind: "Assistant",
              label: `Ask the assistant: “${query.trim()}”`,
              icon: "assistant",
              to: `/ai-center?q=${encodeURIComponent(query.trim())}`,
            },
          ]
        : [];
    return [...people, ...pages, ...ask];
  }, [query, students, can]);

  useEffect(() => setIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette__panel" role="dialog" aria-modal="true" aria-label="Search">
        <label className="palette__search">
          <Icon name="search" size={18} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Find a student, open a page, or ask a question…"
            aria-label="Search"
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${results[index].key}` : undefined}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="palette__results" id="palette-results" role="listbox" ref={listRef}>
          {results.map((item, i) => (
            <li
              key={item.key}
              id={`palette-${item.key}`}
              data-index={i}
              role="option"
              aria-selected={i === index}
              className={i === index ? "is-active" : ""}
              onMouseMove={() => setIndex(i)}
              onClick={() => go(item)}
            >
              <span className="palette__icon">
                <Icon name={item.icon} size={16} />
              </span>
              <span className="palette__label">
                {item.label}
                {item.detail && <small>{item.detail}</small>}
              </span>
              <span className="palette__kind">{item.kind}</span>
            </li>
          ))}
          {!results.length && <li className="palette__empty">Nothing matches “{query}”.</li>}
        </ul>
        <p className="palette__hint">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open
        </p>
      </div>
    </div>
  );
}
