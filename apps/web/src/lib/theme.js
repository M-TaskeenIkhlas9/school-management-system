import { useCallback, useEffect, useState } from "react";

const KEY = "theme";
const current = () => document.documentElement.dataset.theme || "light";

/** Light or dark ("evening register"); remembered per browser, follows the system until chosen. */
export function useTheme() {
  const [theme, setTheme] = useState(current);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#121815" : "#f2f4f1");
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* private mode: still switches for this visit */
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
