import { useNavigate } from "react-router-dom";
import { useExams } from "../../api/queries.js";
import { formatDate } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";

export default function ExamsPage() {
  const navigate = useNavigate();
  const { data: exams = [] } = useExams();
  return (
    <section className="section active">
      <PageHeader title="Exams & Tests" subtitle="AI-generated and saved exams.">
        <button className="btn primary" onClick={() => navigate("/ai-center")}>
          Create Exam
        </button>
      </PageHeader>
      <div className="card table-card">
        <table>
          <thead>
            <tr>
              <th>Exam</th>
              <th>Class</th>
              <th>Created</th>
              <th>Source</th>
              <th>Questions</th>
            </tr>
          </thead>
          <tbody>
            {exams.length === 0 && (
              <tr>
                <td colSpan="5">Generate an exam in the AI Center to see it here.</td>
              </tr>
            )}
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>{exam.title}</td>
                <td>{exam.class_name}</td>
                <td>{formatDate(exam.created_at)}</td>
                <td>
                  <span className="badge primary">{exam.created_by_ai ? "AI Generated" : "Manual"}</span>
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
