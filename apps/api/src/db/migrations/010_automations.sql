-- M5: automations. A rule prepares a message to parents on a schedule; each run either waits
-- for approval (default) or, if the rule is trusted, is approved and sent straight away.
CREATE TABLE IF NOT EXISTS automations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  kind ENUM('fee_reminder','absence_today','absence_streak') NOT NULL,
  schedule JSON NOT NULL,           -- { frequency: daily|school_days|weekly, time: "HH:MM", weekday?: 0-6 }
  options JSON NULL,                -- { channel?: whatsapp|sms|email, days?: n }
  mode ENUM('approve','auto') NOT NULL DEFAULT 'approve',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NOT NULL,
  last_run_at DATETIME NULL,
  next_run_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_automations_due (is_active, next_run_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS automation_runs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  automation_id INT NOT NULL,
  trigger_type ENUM('schedule','manual') NOT NULL,
  status ENUM('waiting','sent','skipped','failed') NOT NULL,
  action_id INT NULL,
  recipients INT NOT NULL DEFAULT 0,
  note VARCHAR(500) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  FOREIGN KEY (action_id) REFERENCES agent_actions(id) ON DELETE SET NULL,
  INDEX idx_automation_runs (automation_id, id)
) ENGINE=InnoDB;
