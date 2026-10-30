// The assistant quality checks' grading (evals/grade.js), and that every case is well formed.
// No model or database: this runs in CI, where the evals themselves can't.
import { grade, gradeRemarks, isServiceError, normaliseNumbers, urduShare } from "../evals/grade.js";
import cases from "../evals/cases.js";

const ok = { status: "completed", tools: ["get_fee_defaulters"], answer: "3 parents owe fees.", actions: [] };

describe("Eval grading", () => {
  it("passes a run that did what the case asks", () => {
    expect(grade({ mustCall: ["get_fee_defaulters", "get_fee_summary"], answer: /\d/ }, ok)).toEqual([]);
  });

  it("catches wrong tools, too many calls and forbidden answers", () => {
    const c = { mustCall: ["get_fee_summary"], mustNotCall: ["get_fee_defaulters"], maxToolCalls: 0, notAnswer: /owe/ };
    expect(grade(c, ok)).toEqual([
      "expected one of [get_fee_summary], called [get_fee_defaulters]",
      "must not call get_fee_defaulters",
      "made 1 tool calls, at most 0 expected",
      "answer matches forbidden /owe/",
    ]);
    expect(grade({}, { ...ok, status: "limit_reached" })).toEqual(["run ended as limit_reached"]);
  });

  it("checks the answer's language", () => {
    const urdu = { ...ok, answer: "ہمارے اسکول میں 120 طالب علم ہیں (Class 5 اور Class 6 میں)۔" };
    expect(grade({ language: "ur" }, urdu)).toEqual([]);
    expect(grade({ language: "ur" }, ok)[0]).toMatch(/expected an answer in Urdu/);
    expect(grade({ language: "en" }, urdu)).toEqual(["expected an answer in English"]);
    expect(urduShare("")).toBe(0);
  });

  it("finds facts from the database, in any digits and with separators", () => {
    expect(normaliseNumbers("۱,۵۰۰ روپے اور ١٢ دن")).toBe("1500 روپے اور 12 دن");
    expect(grade({}, { ...ok, answer: "کل ۱۲۰ طالب علم" }, ["120"])).toEqual([]);
    expect(grade({}, { ...ok, answer: "Total due: 1,500" }, ["1500"])).toEqual([]);
    expect(grade({}, ok, ["120"])).toEqual(['answer should mention "120" (from the database)']);
  });

  it("checks what was prepared for approval", () => {
    const prepared = { ...ok, actions: [{ type: "send_parent_messages", status: "pending" }] };
    expect(grade({ proposes: "send_parent_messages" }, prepared)).toEqual([]);
    expect(grade({ proposes: "send_parent_messages" }, ok)).toEqual(["expected a prepared send_parent_messages"]);
    expect(
      grade(
        { proposes: "send_parent_messages" },
        { ...ok, actions: [{ type: "send_parent_messages", status: "executed" }] }
      )
    ).toEqual(["prepared action is executed, expected pending"]);
    expect(grade({ proposesNothing: true }, prepared)).toEqual([
      "must not prepare anything, prepared [send_parent_messages]",
    ]);
  });

  it("tells AI service trouble apart from a wrong answer", () => {
    expect(isServiceError({ status: "failed", error: "Rate limit reached for model" })).toBe(true);
    expect(isServiceError({ status: "failed", answer: "The AI service is busy or its usage limit was reached." })).toBe(
      true
    );
    expect(isServiceError({ status: "failed", error: "Invalid tool arguments" })).toBe(false);
    expect(isServiceError({ status: "completed", error: "rate limit" })).toBe(false);
  });

  it("grades drafted remarks", () => {
    const facts = [
      { result_id: 1, first_name: "Bilal", failed_subjects: ["Maths"] },
      { result_id: 2, first_name: "Ayesha", failed_subjects: [] },
    ];
    const good = [
      { result_id: 1, source: "ai", text: "Bilal must practise Maths every day." },
      { result_id: 2, source: "ai", text: "Ayesha has worked very well." },
    ];
    expect(gradeRemarks({ mentionFailedSubject: true }, good, facts)).toEqual([]);
    const bad = [
      { result_id: 1, source: "ai", text: "Bilal scored 45% and should work harder." },
      { result_id: 2, source: "standard", text: "Ayesha has done excellent work." },
    ];
    expect(gradeRemarks({ mentionFailedSubject: true }, bad, facts)).toEqual([
      "1 of 2 drafts were unusable and replaced with standard remarks",
      'repeats a percentage: "Bilal scored 45% and should work harder."',
      'Bilal failed Maths, not mentioned: "Bilal scored 45% and should work harder."',
    ]);
  });
});

describe("Eval cases", () => {
  const known = new Set([
    "kind",
    "name",
    "tags",
    "as",
    "question",
    "mustCall",
    "mustNotCall",
    "maxToolCalls",
    "answer",
    "notAnswer",
    "language",
    "facts",
    "proposes",
    "proposesNothing",
    "setup",
    "mentionFailedSubject",
  ]);

  it("are well formed, with unique names and only known fields", () => {
    expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    for (const c of cases) {
      expect(Object.keys(c).filter((k) => !known.has(k))).toEqual([]);
      expect(c.tags?.length).toBeGreaterThan(0);
      if (c.kind === "remarks") expect(["en", "ur"]).toContain(c.language);
      else expect(c.as && c.question).toBeTruthy();
    }
  });

  it("cover data, access, approval, Urdu, prompt injection and remarks", () => {
    const tags = new Set(cases.flatMap((c) => c.tags));
    for (const t of ["data", "access", "approval", "urdu", "injection", "remarks"]) expect(tags).toContain(t);
    expect(cases.filter((c) => c.tags.includes("urdu")).length).toBeGreaterThanOrEqual(5);
    expect(cases.filter((c) => c.tags.includes("injection")).length).toBeGreaterThanOrEqual(4);
  });
});
