import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useClassrooms } from "../../api/queries.js";

const emptyForm = { classroom_id: "", subject: "", num_questions: 5, prompt: "" };

/** Direct exam generation (the assistant can also do this via chat with an approval step). */
export default function ExamGenerator() {
  const { data: classrooms = [] } = useClassrooms();
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);

  const generate = useApiMutation((values) => api.post("/exams/generate", values), {
    invalidate: [keys.exams],
    success: (exam) => `Saved "${exam.title}" with ${exam.questions?.length ?? 0} questions`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    generate.mutate(form, { onSuccess: (exam) => setPreview(exam) });
  };

  return (
    <>
      <div className="card ai-panel span-2">
        <div className="card__title">
          <h2>Exam generator</h2>
          <span>Drafts a test and saves it under Exams</span>
        </div>
        <form className="ai-form" onSubmit={submit}>
          <div className="form-row">
            <label>
              Class
              <select required {...field("classroom_id")}>
                <option value="">Choose a class…</option>
                {classrooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Subject
              <input type="text" placeholder="Mathematics" required {...field("subject")} />
            </label>
            <label>
              Questions
              <input type="number" min="1" max="30" {...field("num_questions")} />
            </label>
          </div>
          <label className="field-label">
            What it should cover
            <textarea rows="5" placeholder="Chapters 3–5: fractions and decimals" required {...field("prompt")} />
          </label>
          <div className="ai-actions">
            <button type="submit" className="btn primary" disabled={generate.isPending}>
              {generate.isPending ? "Writing the exam…" : "Write and save exam"}
            </button>
          </div>
        </form>
      </div>
      {preview && (
        <div className="card ai-preview span-2">
          <div className="card__title">
            <h2>{preview.title}</h2>
            <span>{preview.total_marks} marks</span>
          </div>
          <ol className="exam-questions">
            {preview.questions?.map((q, index) => (
              <li key={q.id || index}>
                {q.question} <span className="muted">({q.marks} marks)</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
