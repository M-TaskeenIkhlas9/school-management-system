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
          <h4>Exam Generator</h4>
          <span className="ai-pill">Saves directly</span>
        </div>
        <form className="ai-form" onSubmit={submit}>
          <div className="form-row">
            <select required {...field("classroom_id")}>
              <option value="">Select class</option>
              {classrooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <input type="text" placeholder="Subject (e.g., Mathematics)" required {...field("subject")} />
            <input type="number" min="1" max="30" placeholder="Questions" {...field("num_questions")} />
          </div>
          <textarea rows="6" placeholder="Topics or instructions, e.g. Chapter 3-5: fractions and decimals" required {...field("prompt")} />
          <div className="ai-actions">
            <button type="submit" className="btn primary" disabled={generate.isPending}>
              {generate.isPending ? "Generating…" : "Generate & Save Test"}
            </button>
          </div>
        </form>
      </div>
      <div className="card ai-preview span-2">
        <div className="card__title">
          <h4>Last Generated</h4>
        </div>
        <div className="preview">
          {preview ? (
            <>
              <p>
                <strong>{preview.title}</strong> · {preview.total_marks} marks
              </p>
              {preview.questions?.map((q, index) => (
                <p key={q.id || index}>
                  {index + 1}. {q.question} <span className="muted">({q.marks} marks)</span>
                </p>
              ))}
            </>
          ) : (
            <p className="muted">Generate a test to preview its questions here.</p>
          )}
        </div>
      </div>
    </>
  );
}
