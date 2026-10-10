-- Remove the first-generation agent (replaced by the new agent harness, built from scratch).
DROP TABLE IF EXISTS email_outbox;
DROP TABLE IF EXISTS agent_actions;
DROP TABLE IF EXISTS agent_messages;
DROP TABLE IF EXISTS agent_conversations;
