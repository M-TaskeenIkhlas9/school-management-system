-- Roles beyond the principal, teacher-to-class scoping, and an audit trail.

ALTER TABLE users
  MODIFY role ENUM('principal','admin','accountant','teacher') NOT NULL DEFAULT 'teacher',
  ADD COLUMN teacher_id INT NULL AFTER role,
  ADD COLUMN last_login_at DATETIME NULL AFTER is_active,
  ADD UNIQUE KEY uq_users_teacher (teacher_id),
  ADD CONSTRAINT fk_users_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL;

-- Which classes a teacher may see and manage.
CREATE TABLE IF NOT EXISTS teacher_classes (
  teacher_id INT NOT NULL,
  classroom_id INT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_id, classroom_id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  INDEX idx_teacher_classes_class (classroom_id)
) ENGINE=InnoDB;

-- Who did what, when (logins, user and permission changes, approvals later).
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  details JSON,
  ip VARCHAR(45),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_user (user_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB;
