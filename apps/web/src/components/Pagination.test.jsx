import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Pagination from "./Pagination.jsx";

describe("Pagination", () => {
  it("shows position and disables Prev on the first page", () => {
    const onPageChange = vi.fn();
    render(<Pagination data={{ page: 1, totalPages: 3, total: 55 }} onPageChange={onPageChange} />);
    expect(screen.getByText(/Page 1 of 3 · 55 records/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prev/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders nothing for an empty list", () => {
    const { container } = render(<Pagination data={{ page: 1, totalPages: 1, total: 0 }} onPageChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
