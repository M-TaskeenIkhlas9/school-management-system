-- Agent harness: guardian contact email, persistent chat, approval-gated actions,
-- and an outbox recording every email the system sends (or simulates).

ALTER TABLE students ADD COLUMN guardian_email VARCHAR(255) NULL AFTER guardian_phone;

-- ============================================================
-- AGENT CONVERSATIONS (one chat thread)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conv_user (user_id, updated_at)
) ENGINE=InnoDB;

-- ============================================================
-- AGENT MESSAGES (user + assistant turns)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content TEXT NOT NULL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
  INDEX idx_msg_conv (conversation_id, id)
) ENGINE=InnoDB;

-- ============================================================
-- AGENT ACTIONS (side effects the agent proposes; principal approves)
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  status ENUM('pending','executing','executed','rejected','failed','expired') NOT NULL DEFAULT 'pending',
  summary VARCHAR(500) NOT NULL,
  payload JSON NOT NULL,
  preview JSON,
  result JSON,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  decided_at DATETIME,
  executed_at DATETIME,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_action_conv (conversation_id),
  INDEX idx_action_status (status)
) ENGINE=InnoDB;

-- ============================================================
-- EMAIL OUTBOX (audit trail of every email)
-- ============================================================
CREATE TABLE IF NOT EXISTS email_outbox (
  id INT AUTO_INCREMENT PRIMARY KEY,
  action_id INT,
  student_id INT,
  to_email VARCHAR(255) NOT NULL,
  to_name VARCHAR(200),
  subject VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  status ENUM('sent','simulated','failed') NOT NULL,
  error TEXT,
  provider_message_id VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (action_id) REFERENCES agent_actions(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  INDEX idx_outbox_action (action_id),
  INDEX idx_outbox_student (student_id)
) ENGINE=InnoDB;
