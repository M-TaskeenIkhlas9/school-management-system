import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/PageHeader.jsx";
import AgentChat from "../agent/AgentChat.jsx";
import ExamGenerator from "./ExamGenerator.jsx";

export default function AiCenterPage() {
  // ?ask=... pre-fills the chat (e.g. from "Send Reminders" on the Fees page). It is never auto-sent.
  const [params] = useSearchParams();
  return (
    <section className="section active">
      <PageHeader
        title="AI Center"
        subtitle="School Assistant • Ask questions, email parents, and more. Every action waits for your approval."
      />
      <div className="grid-2 ai-center-grid">
        <div className="span-2">
          <AgentChat initialInput={params.get("ask") || ""} />
        </div>
        <ExamGenerator />
      </div>
    </section>
  );
}
