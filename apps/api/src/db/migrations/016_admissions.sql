-- Admission records: General Register (GR) number, admission form details, School Leaving
-- Certificate, and what happened to each enrollment at year end.

ALTER TABLE students
  ADD COLUMN gr_number VARCHAR(30) NULL AFTER roll_number,
  ADD COLUMN admission_date DATE NULL AFTER gr_number,
  ADD COLUMN admission_class VARCHAR(100) NULL AFTER admission_date,
  ADD COLUMN gender ENUM('male','female') NULL AFTER date_of_birth,
  ADD COLUMN b_form VARCHAR(20) NULL AFTER gender,
  ADD COLUMN father_name VARCHAR(150) NULL AFTER b_form,
  ADD COLUMN father_cnic VARCHAR(20) NULL AFTER father_name,
  ADD COLUMN religion VARCHAR(50) NULL AFTER father_cnic,
  ADD COLUMN address VARCHAR(255) NULL AFTER religion,
  ADD COLUMN previous_school VARCHAR(150) NULL AFTER address,
  ADD COLUMN left_on DATE NULL,
  ADD COLUMN leaving_class VARCHAR(100) NULL,
  ADD COLUMN leaving_reason VARCHAR(200) NULL,
  ADD COLUMN leaving_conduct VARCHAR(50) NULL,
  ADD COLUMN slc_number INT NULL,
  MODIFY status ENUM('active','inactive','left','passed_out') DEFAULT 'active',
  ADD UNIQUE KEY uq_students_gr (gr_number),
  ADD UNIQUE KEY uq_students_slc (slc_number);

-- promoted / retained (kept back) / left / passed_out, set when an enrollment ends.
ALTER TABLE enrollments ADD COLUMN outcome ENUM('promoted','retained','left','passed_out') NULL AFTER end_date;

-- Existing students get GR numbers in the order they were added, and their admission date.
UPDATE students s
JOIN (SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS n FROM students) r ON r.id = s.id
SET s.gr_number = r.n,
    s.admission_date = COALESCE(s.admission_date, DATE(s.created_at))
WHERE s.gr_number IS NULL;
