import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Markdown from "./Markdown.jsx";

describe("Markdown", () => {
  it("renders bold text, lists and tables", () => {
    const text = "**Summary**\n- one\n- two\n\n| Name | Owed |\n|---|---|\n| Ali | 300 |";
    const { container } = render(<Markdown text={text} />);
    expect(screen.getByText("Summary").tagName).toBe("STRONG");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByText("Ali")).toBeInTheDocument();
  });

  it("never turns text from the database into HTML", () => {
    const hostile = 'Student <img src=x onerror="alert(1)"> <script>alert(2)</script>';
    const { container } = render(<Markdown text={hostile} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });
});
