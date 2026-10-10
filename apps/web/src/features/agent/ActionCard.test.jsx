import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ActionCard from "./ActionCard.jsx";

const emailAction = (overrides = {}) => ({
  id: 7,
  type: "send_guardian_emails",
  status: "pending",
  summary: "Email 1 guardians of students with overdue fees",
  preview: {
    delivery_mode: "simulated",
    emails: [
      {
        to: "parent@example.com",
        to_name: "Parent One",
        student_name: "Ali Hassan",
        subject: "Fee reminder",
        body: "Dear Parent",
      },
    ],
    skipped: [{ student_name: "Zainab Iqbal", reason: "no guardian email on file" }],
  },
  ...overrides,
});

describe("ActionCard", () => {
  it("shows the exact email, skipped students and the simulated-delivery warning", () => {
    render(<ActionCard action={emailAction()} busy={false} onDecide={() => {}} />);
    expect(screen.getByText("Waiting for approval")).toBeInTheDocument();
    expect(screen.getByText(/Subject: Fee reminder/)).toBeInTheDocument();
    expect(screen.getByText(/Zainab Iqbal — no guardian email on file/)).toBeInTheDocument();
    expect(screen.getByText(/not deliver/)).toBeInTheDocument();
  });

  it("calls onDecide with approve / reject for a pending action", () => {
    const onDecide = vi.fn();
    render(<ActionCard action={emailAction()} busy={false} onDecide={onDecide} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(onDecide).toHaveBeenNthCalledWith(1, 7, "approve");
    expect(onDecide).toHaveBeenNthCalledWith(2, 7, "reject");
  });

  it("has no decision buttons once the action is done", () => {
    render(
      <ActionCard
        action={emailAction({ status: "executed", result: { sent: 0, simulated: 1, failed: 0 } })}
        busy={false}
        onDecide={() => {}}
      />
    );
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
});
