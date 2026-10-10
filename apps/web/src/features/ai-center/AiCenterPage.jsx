import PageHeader from "../../components/PageHeader.jsx";
import ExamGenerator from "./ExamGenerator.jsx";

export default function AiCenterPage() {
  return (
    <section className="section active">
      <PageHeader title="AI Center" subtitle="AI tools for the school office." />
      <div className="grid-2 ai-center-grid">
        <div className="card span-2">
          <div className="card__title">
            <h4>School Assistant</h4>
            <span className="ai-pill">Being rebuilt</span>
          </div>
          <p className="muted">
            The chat assistant is being rebuilt with role-based access, live progress and WhatsApp, SMS and email
            delivery. It will return here.
          </p>
        </div>
        <ExamGenerator />
      </div>
    </section>
  );
}
