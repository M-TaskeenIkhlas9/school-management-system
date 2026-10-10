-- M2: approval-gated actions, background jobs, message deliveries and templates.

-- Something the assistant prepared that must be approved before it happens.
CREATE TABLE IF NOT EXISTS agent_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NULL,
  run_id INT NULL,
  requested_by INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  status ENUM('pending','approved','rejected','executing','executed','failed','expired') NOT NULL DEFAULT 'pending',
  approve_permission VARCHAR(50) NOT NULL,
  summary VARCHAR(500) NOT NULL,
  payload JSON NOT NULL,
  preview JSON,
  edited TINYINT(1) NOT NULL DEFAULT 0,
  decided_by INT NULL,
  decided_at DATETIME NULL,
  expires_at DATETIME NOT NULL,
  result JSON,
  error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_actions_status (status, created_at),
  INDEX idx_actions_run (run_id),
  INDEX idx_actions_requester (requested_by)
) ENGINE=InnoDB;

-- Background work (MySQL-backed queue; workers claim rows with FOR UPDATE SKIP LOCKED).
CREATE TABLE IF NOT EXISTS jobs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('queued','running','done','failed') NOT NULL DEFAULT 'queued',
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  run_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locked_at DATETIME NULL,
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_jobs_due (status, run_at)
) ENGINE=InnoDB;

-- One row per recipient per channel: the outbox and its delivery status.
CREATE TABLE IF NOT EXISTS message_deliveries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  action_id INT NOT NULL,
  guardian_id INT NULL,
  channel ENUM('email','sms','whatsapp') NOT NULL,
  to_address VARCHAR(255) NOT NULL,
  to_name VARCHAR(200),
  subject VARCHAR(300),
  body TEXT NOT NULL,
  student_names VARCHAR(500),
  status ENUM('queued','sending','sent','delivered','read','failed','simulated') NOT NULL DEFAULT 'queued',
  provider VARCHAR(50),
  provider_message_id VARCHAR(255),
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  send_after DATETIME NULL,
  sent_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_delivery_once (action_id, guardian_id, channel),
  FOREIGN KEY (action_id) REFERENCES agent_actions(id) ON DELETE CASCADE,
  FOREIGN KEY (guardian_id) REFERENCES guardians(id) ON DELETE SET NULL,
  INDEX idx_deliveries_status (status),
  INDEX idx_deliveries_provider_id (provider_message_id)
) ENGINE=InnoDB;

-- Reusable message texts with {{variables}}.
CREATE TABLE IF NOT EXISTS message_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_key VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  subject VARCHAR(300) NOT NULL,
  body TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO message_templates (template_key, name, subject, body) VALUES
('fee_reminder', 'Fee reminder', 'Fee reminder for {{student_names}}',
 'Dear {{guardian_name}},\n\nThis is a reminder that {{student_names}} has an outstanding fee balance of {{amount_owed}} (oldest due date: {{oldest_due_date}}). Please clear it at your earliest convenience. If you have already paid, please ignore this message.\n\nRegards,\n{{school_name}}'),
('absence_alert', 'Absence alert', '{{student_names}} was absent',
 'Dear {{guardian_name}},\n\n{{student_names}} was marked absent ({{absence_detail}}). Please let the school know the reason.\n\nRegards,\n{{school_name}}'),
('announcement', 'General announcement', 'Message from {{school_name}}',
 'Dear {{guardian_name}},\n\n{{message}}\n\nRegards,\n{{school_name}}')
ON DUPLICATE KEY UPDATE template_key = template_key;
