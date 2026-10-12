-- M3: WhatsApp and SMS. Short SMS texts and WhatsApp template names per template,
-- per-delivery template/cost details, fallbacks, and a log of provider events.

ALTER TABLE message_templates
  ADD COLUMN sms_body VARCHAR(480) NULL AFTER body,
  ADD COLUMN whatsapp_template VARCHAR(100) NULL AFTER sms_body,
  ADD COLUMN whatsapp_params VARCHAR(300) NULL AFTER whatsapp_template;

UPDATE message_templates SET
  sms_body = '{{school_name}}: {{student_names}} has {{amount_owed}} in unpaid fees (due {{oldest_due_date}}). Please pay soon. Ignore if already paid.',
  whatsapp_template = 'fee_reminder',
  whatsapp_params = 'guardian_name,student_names,amount_owed,oldest_due_date'
WHERE template_key = 'fee_reminder';

UPDATE message_templates SET
  sms_body = '{{school_name}}: {{student_names}} was absent ({{absence_detail}}). Please tell the school the reason.',
  whatsapp_template = 'absence_alert',
  whatsapp_params = 'guardian_name,student_names,absence_detail'
WHERE template_key = 'absence_alert';

UPDATE message_templates SET
  sms_body = '{{school_name}}: {{message}}'
WHERE template_key = 'announcement';

ALTER TABLE message_deliveries
  ADD COLUMN template_name VARCHAR(100) NULL AFTER body,
  ADD COLUMN template_params JSON NULL AFTER template_name,
  ADD COLUMN segments INT NULL AFTER template_params,
  ADD COLUMN est_cost DECIMAL(10,4) NULL AFTER segments,
  ADD COLUMN fallback_from BIGINT NULL AFTER est_cost,
  ADD COLUMN status_updated_at DATETIME NULL AFTER sent_at,
  ADD INDEX idx_deliveries_guardian (guardian_id);

-- Raw delivery receipts and replies from providers (for support and auditing).
CREATE TABLE IF NOT EXISTS message_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  kind ENUM('status','inbound') NOT NULL,
  provider_message_id VARCHAR(255) NULL,
  delivery_id BIGINT NULL,
  status VARCHAR(30) NULL,
  from_address VARCHAR(255) NULL,
  payload JSON NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_delivery (delivery_id),
  INDEX idx_events_provider_id (provider_message_id)
) ENGINE=InnoDB;
