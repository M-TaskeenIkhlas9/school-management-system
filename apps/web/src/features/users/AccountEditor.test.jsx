import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const calls = vi.hoisted(() => []);
vi.mock("../../api/queries.js", () => ({
  // Run the mutation function directly and record what was sent.
  useApiMutation: (fn) => ({
    isPending: false,
    mutate: async (vars, opts) => {
      calls.push(vars);
      await fn(vars);
      opts?.onSuccess?.();
    },
  }),
}));
vi.mock("./api.js", () => ({
  usersKey: ["users"],
  usersApi: { update: vi.fn(async () => ({})), signOut: vi.fn(async () => ({})) },
}));

import AccountEditor from "./AccountEditor.jsx";

const teachers = [
  { id: 1, first_name: "Tara", last_name: "T" },
  { id: 2, first_name: "Omar", last_name: "O" },
];
const classrooms = [
  { id: 10, name: "Class 5" },
  { id: 11, name: "Class 6" },
];
const teacherAccount = {
  id: 7,
  username: "Tara",
  email: "tara@school.pk",
  role: "teacher",
  teacher_id: 1,
  class_ids: [10],
  is_active: 1,
};
const props = {
  assignable: ["admin", "accountant", "teacher"],
  teachers,
  linkedTeacherIds: new Set([1, 2]),
  classrooms,
  onClose: () => {},
};

beforeEach(() => {
  calls.length = 0;
});

describe("AccountEditor", () => {
  it("saves a teacher's classes and offers only teachers without an account", () => {
    render(<AccountEditor account={teacherAccount} isSelf={false} {...props} />);
    expect(screen.queryByRole("option", { name: "Omar O" })).toBeNull(); // already has an account
    fireEvent.click(screen.getByLabelText("Class 6"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(calls[0]).toEqual({ username: "Tara", teacher_id: 1, classroom_ids: [10, 11] });
  });

  it("resets a password and shows it once", async () => {
    render(<AccountEditor account={teacherAccount} isSelf={false} {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    const shown = await screen.findByText(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(calls[0]).toEqual({ password: shown.textContent });
    expect(screen.getByText("tara@school.pk")).toBeInTheDocument();
  });

  it("won't let you change your own role or deactivate yourself", () => {
    render(<AccountEditor account={{ ...teacherAccount, role: "admin" }} isSelf {...props} />);
    expect(screen.getByRole("combobox", { name: /Role/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("doesn't let an admin edit a principal", () => {
    render(<AccountEditor account={{ ...teacherAccount, role: "principal" }} isSelf={false} {...props} />);
    expect(screen.getByText(/Only a principal can change/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });
});
