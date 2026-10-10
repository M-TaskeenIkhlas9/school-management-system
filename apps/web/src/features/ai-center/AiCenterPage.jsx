import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import ExamGenerator from "./ExamGenerator.jsx";
import AssistantChat from "../assistant/AssistantChat.jsx";

export default function AiCenterPage() {
  const { can } = useAuth();
  return (
    <section className="section active">
      <PageHeader title="AI Center" subtitle="Ask questions about your school; answers come from your data." />
      <div className="grid-2 ai-center-grid">
        <div className="span-2">
          <AssistantChat />
        </div>
        {can("exams:write") && <ExamGenerator />}
      </div>
    </section>
  );
}
