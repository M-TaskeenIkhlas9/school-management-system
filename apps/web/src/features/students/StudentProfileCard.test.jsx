import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const profile = vi.hoisted(() => ({ current: null }));
vi.mock("../../api/queries.js", () => ({
  useStudent: () => ({ data: profile.current, isLoading: false }),
}));

import StudentProfileCard from "./StudentProfileCard.jsx";

const guardian = {
  id: 1,
  full_name: "Hassan Ali",
  email: "hassan@example.com",
  phone: "+923001234567",
  is_primary: 1,
  consent_whatsapp: 1,
  consent_sms: 0,
  consent_email: 1,
};

describe("StudentProfileCard", () => {
  it("renders an accountant's view (no results or attendance) without crashing", () => {
    profile.current = { id: 1, first_name: "Ali", last_name: "Hassan", guardians: [guardian] };
    render(<StudentProfileCard studentId={1} classLabel="Class 5" risk={null} feeStatus="pending" showFees />);
    expect(screen.getByText("Ali Hassan")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.queryByText(/Academic History/i)).toBeNull();
    expect(screen.queryByText(/Attendance/i)).toBeNull();
  });

  it("hides fee status when the role cannot see fees", () => {
    profile.current = {
      id: 1,
      first_name: "Ali",
      last_name: "Hassan",
      guardians: [],
      results: [],
      attendance_rate: 90,
    };
    render(<StudentProfileCard studentId={1} classLabel="Class 5" risk={null} feeStatus={null} showFees={false} />);
    expect(screen.queryByText(/no fees/i)).toBeNull();
    expect(screen.getByText(/90% overall/)).toBeInTheDocument();
    expect(screen.getByText("No guardian on file.")).toBeInTheDocument();
  });

  it("lists guardians with contact details and the channels they agreed to", () => {
    profile.current = { id: 1, first_name: "Ali", last_name: "Hassan", guardians: [guardian] };
    render(<StudentProfileCard studentId={1} classLabel="Class 5" risk="High" feeStatus={null} showFees={false} />);
    expect(screen.getByText("Hassan Ali")).toBeInTheDocument();
    expect(screen.getByText("+923001234567 · hassan@example.com")).toBeInTheDocument();
    expect(screen.getByText("Agreed to: WhatsApp, Email")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
  });
});
