-- Subject-wise marks for a result card (as on a Pakistani report card / award list):
-- each subject's obtained marks out of its total. The card's total and percentage follow from them.
CREATE TABLE IF NOT EXISTS result_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  result_id INT NOT NULL,
  subject VARCHAR(100) NOT NULL,
  obtained DECIMAL(6,2) NOT NULL,
  total DECIMAL(6,2) NOT NULL,
  position INT NOT NULL DEFAULT 0, -- order on the card
  UNIQUE KEY uq_result_subject (result_id, subject),
  FOREIGN KEY (result_id) REFERENCES result_cards(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Finding a class's sheet for a term quickly.
CREATE INDEX idx_result_class_term ON result_cards (classroom_id, term);
