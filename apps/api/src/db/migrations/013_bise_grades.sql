-- Grades now follow the BISE scale used across Pakistan (pass mark 33%). Recompute stored grades
-- so old results agree with new ones and with Pass/Fail on report cards.
UPDATE result_cards SET grade = CASE
  WHEN percentage >= 80 THEN 'A+'
  WHEN percentage >= 70 THEN 'A'
  WHEN percentage >= 60 THEN 'B'
  WHEN percentage >= 50 THEN 'C'
  WHEN percentage >= 40 THEN 'D'
  WHEN percentage >= 33 THEN 'E'
  ELSE 'F'
END;
