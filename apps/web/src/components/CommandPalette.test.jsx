import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("../api/queries.js", () => ({
  useStudents: () => ({
    data: [
      { id: 7, first_name: "Ali", last_name: "Hassan", class_name: "Class 5", roll_number: "R-501" },
      { id: 8, first_name: "Sara", last_name: "Khan", class_name: "Class 6" },
    ],
  }),
}));
const perms = vi.hoisted(() => ({ current: new Set() }));
vi.mock("../auth/AuthContext.jsx", () => ({ useAuth: () => ({ can: (p) => perms.current.has(p) }) }));

import CommandPalette from "./CommandPalette.jsx";

function Where() {
  const loc = useLocation();
  return <output data-testid="where">{loc.pathname + loc.search}</output>;
}

const renderPalette = (onClose = () => {}) =>
  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <CommandPalette onClose={onClose} />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe("CommandPalette", () => {
  it("lists only the pages this role may open", () => {
    perms.current = new Set(["fees:read", "students:read"]);
    renderPalette();
    expect(screen.getByRole("option", { name: /Fees/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Users & access/ })).toBeNull();
  });

  it("finds a student and opens their profile with Enter", () => {
    perms.current = new Set(["students:read", "assistant:use"]);
    const onClose = vi.fn();
    renderPalette(onClose);
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "hass" } });
    expect(screen.getByRole("option", { name: /Ali Hassan/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: /Ask the assistant: “hass”/ })).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByTestId("where")).toHaveTextContent("/students?id=7");
    expect(onClose).toHaveBeenCalled();
  });

  it("moves with the arrow keys and closes on Escape", () => {
    perms.current = new Set(["students:read", "assistant:use"]);
    const onClose = vi.fn();
    renderPalette(onClose);
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "ali" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("option", { name: /Ask the assistant/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
