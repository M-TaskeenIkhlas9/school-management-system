import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "../../components/Toast.jsx";
import ActionCard from "./ActionCard.jsx";
import { actionsApi } from "./api.js";

const pending = {
  id: 7,
  run_id: 3,
  type: "send_parent_messages",
  status: "pending",
  summary: "Message 2 parents of students with unpaid fees (2 email)",
  requested_by_name: "Principal",
  can_approve: true,
  can_edit: true,
  preview: {
    subject_template: "Fee reminder",
    body_template: "Dear {{guardian_name}}",
    channel_modes: { email: "simulated" },
    recipients: [
      {
        guardian_id: 1,
        name: "Mr Khan",
        channel: "email",
        to: "k@x.com",
        student_names: "Omar",
        subject: "Fee reminder",
        body: "Dear Mr Khan, Omar owes Rs 300.",
      },
      {
        guardian_id: 2,
        name: "Mrs Ali",
        channel: "email",
        to: "a@x.com",
        student_names: "Sara",
        subject: "Fee reminder",
        body: "Dear Mrs Ali, Sara owes Rs 500.",
      },
    ],
    skipped: [{ student: "Bilal Z", reason: "no contact details" }],
  },
};

const renderCard = (action) =>
  render(
    <ToastProvider>
      <ActionCard action={action} />
    </ToastProvider>
  );

describe("ActionCard", () => {
  it("shows each parent's exact message, who is skipped, and test-mode channels", () => {
    renderCard(pending);
    expect(screen.getByText(/Omar owes Rs 300/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mrs Ali"));
    expect(screen.getByText(/Sara owes Rs 500/)).toBeInTheDocument();
    expect(screen.getByText(/Bilal Z — no contact details/)).toBeInTheDocument();
    expect(screen.getByText(/email is in test mode/)).toBeInTheDocument();
  });

  it("approves and shows the new status", async () => {
    const spy = vi
      .spyOn(actionsApi, "approve")
      .mockResolvedValue({ ...pending, status: "executing", can_approve: false, result: { queued: 2 } });
    renderCard(pending);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(screen.getByText("Sending…")).toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith(7);
    expect(screen.getByText(/2 queued/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });

  it("only offers approval to someone allowed to approve", () => {
    renderCard({ ...pending, can_approve: false, can_edit: false });
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.getByText(/Waiting for someone with permission/)).toBeInTheDocument();
  });
});
