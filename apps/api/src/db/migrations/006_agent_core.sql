-- New assistant (M1): conversations, messages, runs and every step of every run.

CREATE TABLE IF NOT EXISTS agent_conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(200) NOT NULL DEFAULT 'New conversation',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_agent_conv_user (user_id, updated_at)
) ENGINE=InnoDB;

-- One request from the user = one run (made of model and tool steps).
CREATE TABLE IF NOT EXISTS agent_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  user_id INT NOT NULL,
  status ENUM('running','completed','failed','cancelled','limit_reached') NOT NULL DEFAULT 'running',
  model VARCHAR(150),
  step_count INT NOT NULL DEFAULT 0,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  error TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_agent_runs_conv (conversation_id),
  INDEX idx_agent_runs_user (user_id, started_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS agent_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  role ENUM('user','assistant') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  run_id INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES agent_conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  INDEX idx_agent_msg_conv (conversation_id, id)
) ENGINE=InnoDB;

-- Every model call and tool call in a run (the activity trace).
CREATE TABLE IF NOT EXISTS agent_run_steps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  run_id INT NOT NULL,
  seq INT NOT NULL,
  type ENUM('model','tool') NOT NULL,
  tool_name VARCHAR(100),
  input JSON,
  output JSON,
  status ENUM('ok','error','denied') NOT NULL DEFAULT 'ok',
  error TEXT,
  duration_ms INT,
  input_tokens INT,
  output_tokens INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE,
  INDEX idx_agent_steps_run (run_id, seq)
) ENGINE=InnoDB;
