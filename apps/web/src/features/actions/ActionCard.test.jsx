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
    channel_modes: { email: "simulated", sms: "live" },
    by_channel: { email: { messages: 2, segments: 0, cost: 0 } },
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
  it("shows a register's absent and late students and what changes", () => {
    renderCard({
      id: 9,
      type: "mark_attendance",
      status: "pending",
      summary: "Attendance for 5A on 2026-10-31: 2 present, 1 absent, 1 late",
      requested_by_name: "Tahira",
      can_approve: true,
      preview: {
        class: "5A",
        day: "2026-10-31",
        present: 2,
        absent: 1,
        late: 1,
        absent_names: ["Sara Khan"],
        late_names: ["Bilal Ahmed"],
        already_marked: 4,
        changes: [{ student: "Ali Raza", from: "absent", to: "present" }],
      },
    });
    expect(screen.getByText(/5A · 31 Oct 2026 · 2 present, 1 absent, 1 late/)).toBeInTheDocument();
    expect(screen.getByText("Sara Khan")).toBeInTheDocument();
    expect(screen.getByText("Bilal Ahmed")).toBeInTheDocument();
    expect(screen.getByText("Ali Raza (absent → present)")).toBeInTheDocument();
    expect(screen.getByText("Attendance")).toBeInTheDocument();
  });

  it("shows each parent's exact message, who is skipped, and test-mode channels", () => {
    renderCard(pending);
    expect(screen.getByText(/Omar owes Rs 300/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Mrs Ali"));
    expect(screen.getByText(/Sara owes Rs 500/)).toBeInTheDocument();
    expect(screen.getByText(/Bilal Z — no contact details/)).toBeInTheDocument();
    expect(screen.getByText("Test mode: email messages are recorded in the Outbox, not sent.")).toBeInTheDocument();
  });

  it("shows the channel mix, cost estimate, WhatsApp template and provider notes", () => {
    renderCard({
      ...pending,
      preview: {
        ...pending.preview,
        channel_modes: { whatsapp: "live", sms: "live" },
        by_channel: { whatsapp: { messages: 1, segments: 0, cost: 0 }, sms: { messages: 1, segments: 2, cost: 4 } },
        estimated_cost: "Rs 4.00",
        notes: ["Some SMS are longer than one message and will be billed as several."],
        recipients: [
          { ...pending.preview.recipients[0], channel: "whatsapp", subject: null, template_name: "fee_reminder" },
          { ...pending.preview.recipients[1], channel: "sms", subject: null, segments: 2 },
        ],
      },
    });
    expect(screen.getByText(/1 WhatsApp · 1 SMS, 2 SMS parts/)).toBeInTheDocument();
    expect(screen.getByText(/estimated cost Rs 4.00/)).toBeInTheDocument();
    expect(screen.getByText(/approved WhatsApp template “fee_reminder”/)).toBeInTheDocument();
    expect(screen.getByText(/billed as several/)).toBeInTheDocument();
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
