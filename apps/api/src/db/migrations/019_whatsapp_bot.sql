-- The assistant on WhatsApp: a staff member (usually the principal) links their own WhatsApp number,
-- then asks questions and approves what the assistant prepares by messaging the school's number.

-- The linked number. It stops working when the user's sessions are revoked (password change, sign out
-- everywhere): whatsapp_sv must still equal session_version.
ALTER TABLE users
  ADD COLUMN whatsapp_phone VARCHAR(20) NULL AFTER email,
  ADD COLUMN whatsapp_sv INT NULL AFTER whatsapp_phone,
  ADD COLUMN whatsapp_linked_at DATETIME NULL AFTER whatsapp_sv,
  ADD UNIQUE KEY uq_users_whatsapp_phone (whatsapp_phone);

-- A one-time code shown in the web app ("LINK 7K3PQ9XA"); sending it from a phone links that phone.
CREATE TABLE IF NOT EXISTS whatsapp_link_codes (
  user_id INT PRIMARY KEY,
  code_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uq_whatsapp_link_code (code_hash),
  CONSTRAINT fk_whatsapp_link_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- What staff sent the bot and what it answered. WhatsApp's message id makes a repeated webhook harmless.
CREATE TABLE IF NOT EXISTS staff_whatsapp_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  direction ENUM('in','out') NOT NULL,
  phone VARCHAR(20) NOT NULL,
  wa_message_id VARCHAR(128) NULL,
  body TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  error VARCHAR(300) NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_staff_whatsapp_wamid (wa_message_id),
  KEY idx_staff_whatsapp_user (user_id, created_at),
  CONSTRAINT fk_staff_whatsapp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Conversations held on WhatsApp also show in the AI Center, marked as such.
ALTER TABLE agent_conversations
  ADD COLUMN channel ENUM('web','whatsapp') NOT NULL DEFAULT 'web' AFTER title;
