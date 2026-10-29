-- Payments against a fee record, one row per payment, so each gets its own receipt
-- (parents in Pakistan often pay a month's fee in instalments, in cash or by bank transfer).
CREATE TABLE IF NOT EXISTS fee_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fee_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paid_on DATE NOT NULL,
  method ENUM('cash','bank','online','other') NOT NULL DEFAULT 'cash',
  note VARCHAR(200) NULL,
  received_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (fee_id) REFERENCES fee_ledgers(id) ON DELETE CASCADE,
  FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_fee_payments_fee (fee_id)
) ENGINE=InnoDB;
