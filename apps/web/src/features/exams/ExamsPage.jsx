import { useNavigate } from "react-router-dom";
import { useExams } from "../../api/queries.js";
import { displayDate } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import CountUp from "../../components/CountUp.jsx";
import Icon from "../../app/Icon.jsx";

export default function ExamsPage() {
  const navigate = useNavigate();
  const { data: exams = [] } = useExams();
  return (
    <section className="section">
      <PageHeader
        icon="exams"
        tone="blue"
        title="Exams"
        subtitle="Tests written with the exam generator or entered by hand."
      >
        <button type="button" className="btn primary" onClick={() => navigate("/ai-center")}>
          Write an exam
        </button>
      </PageHeader>
      <StatRow>
        <StatCard tone="blue" icon="exams" label="Exams">
          <CountUp value={exams.length} />
        </StatCard>
        <StatCard tone="violet" icon="sparkle" label="Written with the generator">
          <CountUp value={exams.filter((e) => e.created_by_ai).length} />
        </StatCard>
        <StatCard tone="green" icon="book" label="Questions" note="across all exams">
          <CountUp value={exams.reduce((n, e) => n + (Number(e.question_count) || 0), 0)} />
        </StatCard>
      </StatRow>

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
                <td colSpan="5">
                  <EmptyState
                    icon="exams"
                    title="No exams yet"
                    action={
                      <button type="button" className="btn primary small" onClick={() => navigate("/ai-center")}>
                        Write an exam
                      </button>
                    }
                  >
                    Draft one with the exam generator; it is saved here.
                  </EmptyState>
                </td>
              </tr>
            )}
            {exams.map((exam) => (
              <tr key={exam.id}>
                <td>
                  <div className="student-cell">
                    <span className="tile tile--blue exam-tile">
                      <Icon name="exams" size={18} />
                    </span>
                    <span className="student-name">{exam.title}</span>
                  </div>
                </td>
                <td>
                  <span className="badge neutral">{exam.class_name}</span>
                </td>
                <td>{displayDate(exam.created_at)}</td>
                <td>
                  <span className={`badge ${exam.created_by_ai ? "info" : "neutral"}`}>
                    {exam.created_by_ai ? "Generated" : "By hand"}
                  </span>
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
