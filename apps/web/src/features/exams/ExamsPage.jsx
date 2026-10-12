import { useNavigate } from "react-router-dom";
import { useExams } from "../../api/queries.js";
import { displayDate } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";

export default function ExamsPage() {
  const navigate = useNavigate();
  const { data: exams = [] } = useExams();
  return (
    <section className="section">
      <PageHeader title="Exams" subtitle="Tests written with the exam generator or entered by hand.">
        <button type="button" className="btn primary" onClick={() => navigate("/ai-center")}>
          Write an exam
        </button>
      </PageHeader>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Exam</th>
              <th>Class</th>
              <th>Created</th>
              <th>Written</th>
              <th>Questions</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">
                  No exams yet. Use Write an exam to draft one with the exam generator.
                </td>
              </tr>
            )}
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>{exam.title}</td>
                <td>{exam.class_name}</td>
                <td>{displayDate(exam.created_at)}</td>
                <td>
                  <span className="badge neutral">{exam.created_by_ai ? "Generated" : "By hand"}</span>
                </td>
                <td>{exam.question_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
