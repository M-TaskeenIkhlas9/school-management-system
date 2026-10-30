-- Family accounts, sibling discounts and concessions.
-- A family is a primary guardian and their children (already linked in student_guardians).

-- What was taken off a bill and why ("Sibling 10% · Scholarship 50%"). amount_due is after discount.
ALTER TABLE fee_ledgers
  ADD COLUMN discount DECIMAL(10,2) NOT NULL DEFAULT 0 AFTER amount_due,
  ADD COLUMN discount_note VARCHAR(200) NULL AFTER discount;

-- Standing concessions for a student, applied every time a month is billed.
CREATE TABLE IF NOT EXISTS fee_concessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  kind ENUM('scholarship','staff_child','need_based','other') NOT NULL DEFAULT 'other',
  type ENUM('percent','amount') NOT NULL DEFAULT 'percent',
  value DECIMAL(10,2) NOT NULL,
  note VARCHAR(200) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by INT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_concessions_student (student_id, is_active)
) ENGINE=InnoDB;

-- Percent off for each younger sibling (the eldest pays in full). NULL/0 = no sibling discount.
ALTER TABLE school_settings ADD COLUMN sibling_discount DECIMAL(5,2) NULL AFTER late_fine;
