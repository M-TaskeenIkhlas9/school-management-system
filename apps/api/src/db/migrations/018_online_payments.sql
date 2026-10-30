-- Online fee payments: 1Bill (pay the challan from any bank app, JazzCash or Easypaisa using its
-- consumer number) and Raast / bank transfers (the parent writes the challan's payment reference).

-- Payments made online keep the bank's transaction id, so a repeated notice is never counted twice.
-- A payment after the due date can include the late fine, kept apart from the fee itself.
ALTER TABLE fee_payments
  MODIFY method ENUM('cash','bank','online','other','1bill','raast') NOT NULL DEFAULT 'cash',
  ADD COLUMN late_fine DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount,
  ADD COLUMN reference VARCHAR(64) NULL AFTER note;

-- 1LINK's biller prefix (given when the school registers for 1Bill) and the school's Raast ID
-- (its IBAN or Raast alias) to print on challans.
ALTER TABLE school_settings
  ADD COLUMN onebill_prefix VARCHAR(8) NULL AFTER message_language,
  ADD COLUMN raast_id VARCHAR(40) NULL AFTER onebill_prefix;

-- Every payment that arrives online, matched to a fee or waiting for the accountant to match it
-- (a Raast transfer without a usable reference, for example).
CREATE TABLE IF NOT EXISTS incoming_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  channel ENUM('1bill','raast','bank') NOT NULL,
  transaction_id VARCHAR(64) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_on DATE NOT NULL,
  reference VARCHAR(140) NULL,
  payer VARCHAR(150) NULL,
  status ENUM('matched','unmatched','ignored') NOT NULL,
  fee_id INT NULL,
  fee_payment_id INT NULL,
  note VARCHAR(200) NULL,
  resolved_by INT NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_incoming_transaction (channel, transaction_id),
  INDEX idx_incoming_status (status, paid_on),
  FOREIGN KEY (fee_id) REFERENCES fee_ledgers(id) ON DELETE SET NULL,
  FOREIGN KEY (fee_payment_id) REFERENCES fee_payments(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
