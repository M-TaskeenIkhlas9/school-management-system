-- Initial schema (formerly schema.sql). Idempotent: safe on databases created from schema.sql.


-- ============================================================
-- USERS (for JWT auth — single principal)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('principal','admin') DEFAULT 'principal',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- CLASSROOMS
-- ============================================================
CREATE TABLE IF NOT EXISTS classrooms (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade VARCHAR(20) NOT NULL,
  section VARCHAR(20),
  academic_year VARCHAR(20),
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- STUDENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  roll_number VARCHAR(50) UNIQUE,
  date_of_birth DATE,
  guardian_name VARCHAR(200),
  guardian_phone VARCHAR(30),
  status ENUM('active','inactive') DEFAULT 'active',
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_students_status (status),
  INDEX idx_students_roll (roll_number)
) ENGINE=InnoDB;

-- ============================================================
-- TEACHERS
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  subject VARCHAR(100),
  phone VARCHAR(30),
  email VARCHAR(255),
  joining_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ============================================================
-- ENROLLMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS enrollments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  classroom_id INT NOT NULL,
  start_date DATE,
  end_date DATE,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_enrollment (student_id, classroom_id),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  INDEX idx_enrollment_student (student_id),
  INDEX idx_enrollment_classroom (classroom_id)
) ENGINE=InnoDB;

-- ============================================================
-- CURRICULUM ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS curriculum_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  subject VARCHAR(100) NOT NULL,
  book_title VARCHAR(255),
  topics TEXT,
  chapter_number INT,
  learning_objectives TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  INDEX idx_curriculum_class (classroom_id)
) ENGINE=InnoDB;

-- ============================================================
-- ATTENDANCE
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  classroom_id INT NOT NULL,
  day DATE NOT NULL,
  status ENUM('present','absent','late') DEFAULT 'present',
  marked_by INT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_attendance_day (student_id, day),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  FOREIGN KEY (marked_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_attendance_student (student_id),
  INDEX idx_attendance_day (day),
  INDEX idx_attendance_class (classroom_id)
) ENGINE=InnoDB;

-- ============================================================
-- FEE LEDGERS
-- ============================================================
CREATE TABLE IF NOT EXISTS fee_ledgers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  month VARCHAR(7),
  due_date DATE NOT NULL,
  amount_due DECIMAL(10,2) NOT NULL,
  amount_paid DECIMAL(10,2) DEFAULT 0.00,
  status ENUM('pending','paid','partial','overdue') DEFAULT 'pending',
  paid_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_fee_student (student_id),
  INDEX idx_fee_status (status),
  INDEX idx_fee_due (due_date)
) ENGINE=InnoDB;

-- ============================================================
-- RESULT CARDS
-- ============================================================
CREATE TABLE IF NOT EXISTS result_cards (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  classroom_id INT NOT NULL,
  term VARCHAR(50) NOT NULL,
  total_score DECIMAL(8,2) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  grade VARCHAR(3),
  remarks TEXT,
  ai_remarks TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  INDEX idx_result_student (student_id),
  INDEX idx_result_class (classroom_id)
) ENGINE=InnoDB;

-- ============================================================
-- EXAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  classroom_id INT NOT NULL,
  subject VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  prompt TEXT NOT NULL,
  type ENUM('Test','Midterm','Final') DEFAULT 'Test',
  total_marks INT DEFAULT 50,
  created_by_ai TINYINT(1) DEFAULT 0,
  ai_prompt_used TEXT,
  ai_generated_content JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
  INDEX idx_exam_class (classroom_id)
) ENGINE=InnoDB;

-- ============================================================
-- EXAM QUESTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS exam_questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT NOT NULL,
  question TEXT NOT NULL,
  marks INT DEFAULT 5,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  INDEX idx_question_exam (exam_id)
) ENGINE=InnoDB;

-- ============================================================
-- AI LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ai_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  prompt TEXT,
  response TEXT,
  status ENUM('success','error','fallback') DEFAULT 'success',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ailog_module (module)
) ENGINE=InnoDB;

-- ============================================================
-- INSIGHTS
-- ============================================================
CREATE TABLE IF NOT EXISTS insights (
  id INT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(50) NOT NULL,
  priority ENUM('high','medium','low') DEFAULT 'medium',
  student_id INT,
  description TEXT,
  suggested_action TEXT,
  is_resolved TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL,
  INDEX idx_insight_type (type),
  INDEX idx_insight_priority (priority)
) ENGINE=InnoDB;
