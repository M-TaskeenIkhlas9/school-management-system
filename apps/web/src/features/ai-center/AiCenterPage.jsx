import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import ExamGenerator from "./ExamGenerator.jsx";
import AssistantChat from "../assistant/AssistantChat.jsx";

export default function AiCenterPage() {
  const { can } = useAuth();
  return (
    <section className="section">
      <PageHeader
        icon="sparkle"
        tone="blue"
        title="AI assistant"
        subtitle="Ask about the school in plain words. Messages and payments it prepares wait for someone to approve them."
      />
      <div className="grid-2 ai-center-grid">
        <div className="span-2">
          <AssistantChat />
        </div>
        {can("exams:write") && <ExamGenerator />}
      </div>
    </section>
  );
}
