-- School details set by the principal on the Settings page (one row). Empty values fall back to
-- the server settings (.env). The bank details are SAMPLE values until the principal replaces them.
CREATE TABLE IF NOT EXISTS school_settings (
  id TINYINT PRIMARY KEY,
  name VARCHAR(150) NULL,
  address VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  bank_details VARCHAR(255) NULL,
  late_fine DECIMAL(10,2) NULL,
  updated_by INT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT INTO school_settings (id, bank_details, late_fine)
VALUES (1, 'SAMPLE — Meezan Bank · A/C title: School Fee Account · A/C no. 0101-0123456789', 200)
ON DUPLICATE KEY UPDATE id = id;
