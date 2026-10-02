-- =====================================================================
-- Student Information Portal - Database Schema (MySQL utf8mb4)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS student_portal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE student_portal;

-- 1. Users Table (Authentication & RBAC)
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'teacher', 'student') NOT NULL DEFAULT 'student',
  student_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Students Table
CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  roll_no VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  class_name VARCHAR(50) NOT NULL,
  dob DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Subjects Table
CREATE TABLE IF NOT EXISTS subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  att_date DATE NOT NULL,
  status ENUM('Present', 'Absent', 'Late') NOT NULL DEFAULT 'Present',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_date (student_id, att_date),
  CONSTRAINT fk_attendance_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Grades Table
CREATE TABLE IF NOT EXISTS grades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  exam VARCHAR(50) NOT NULL,
  marks DECIMAL(5,2) NOT NULL,
  max_marks DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  remarks VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_grades_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_grades_subject
    FOREIGN KEY (subject_id) REFERENCES subjects(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Leave Requests Table (Student Self-Service & Faculty Review)
CREATE TABLE IF NOT EXISTS leave_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  leave_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status ENUM('Pending', 'Approved', 'Rejected') NOT NULL DEFAULT 'Pending',
  reviewed_by VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_leave_student
    FOREIGN KEY (student_id) REFERENCES students(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- Pre-seeded Data
-- =====================================================================

-- Pre-seed Subjects
INSERT INTO subjects (id, name) VALUES
  (1, 'Mathematics'),
  (2, 'Science'),
  (3, 'English'),
  (4, 'Social Studies'),
  (5, 'Computer Science')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- Pre-seed Demo Users with Distinct Roles
-- admin: System Administrator (Full platform control, user enrollments, system architecture)
-- teacher: Faculty Instructor (Attendance recording, grading & assessments, view rosters)
-- demo: Enrolled Student (Aiden Vance: Personal gradebook, attendance history, profile)
INSERT INTO users (username, password_hash, role, student_id) VALUES
  ('admin', 'scrypt:32768:8:1$kR8O8r4tJz9k$bbef6d3d4957e84988f5791244f77c38586f784e8df760a9270e53a25e1dfa96a93e36e659b922a7f50a80e1590e8e04b40742d45c55761bb9ee5d6c823862ae', 'admin', NULL),
  ('teacher', 'scrypt:32768:8:1$mX9T2b7vLq1w$73dfc58b6689d0c266f849a56a6ea7e53f191b7e411b0e5ee4b03657b982b6831d1f0ce0ea2a6cba4773c3ee67bf8e050ce733a1e5cbdfb194d221469e3a6190', 'teacher', NULL),
  ('demo', 'scrypt:32768:8:1$pY3N8c4wXz2v$81ca4876b5df3f3d1b6cf7168db745c4794e77169f447cf08a0d4c1851e51f842aa1ceb041cfbc4d0f6a27e7f724aa0b182cb9b6aa3bdf753b27b4096be277fb', 'student', 1),
  ('student', 'scrypt:32768:8:1$pY3N8c4wXz2v$81ca4876b5df3f3d1b6cf7168db745c4794e77169f447cf08a0d4c1851e51f842aa1ceb041cfbc4d0f6a27e7f724aa0b182cb9b6aa3bdf753b27b4096be277fb', 'student', 1)
ON DUPLICATE KEY UPDATE role = VALUES(role), student_id = VALUES(student_id);

-- Pre-seed Initial 5 Sample Students
INSERT INTO students (id, roll_no, name, email, phone, class_name, dob) VALUES
  (1, 'CS-2024-001', 'Aiden Vance', 'aiden.vance@academy.edu', '+1 (555) 234-5678', 'Grade 11-A', '2008-04-12'),
  (2, 'CS-2024-002', 'Elena Rostova', 'elena.rostova@academy.edu', '+1 (555) 345-6789', 'Grade 11-A', '2008-09-24'),
  (3, 'CS-2024-003', 'Marcus Chen', 'marcus.chen@academy.edu', '+1 (555) 456-7890', 'Grade 11-B', '2008-01-18'),
  (4, 'CS-2024-004', 'Sophia Sterling', 'sophia.sterling@academy.edu', '+1 (555) 567-8901', 'Grade 11-B', '2008-11-05'),
  (5, 'CS-2024-005', 'Liam Gallagher', 'liam.gallagher@academy.edu', '+1 (555) 678-9012', 'Grade 11-A', '2008-07-30')
ON DUPLICATE KEY UPDATE roll_no = VALUES(roll_no);

-- Pre-seed Sample Attendance for Today
INSERT INTO attendance (student_id, att_date, status) VALUES
  (1, CURRENT_DATE(), 'Present'),
  (2, CURRENT_DATE(), 'Present'),
  (3, CURRENT_DATE(), 'Late'),
  (4, CURRENT_DATE(), 'Present'),
  (5, CURRENT_DATE(), 'Absent')
ON DUPLICATE KEY UPDATE status = VALUES(status);

-- Pre-seed 3 Midterm Grades for Each Student
INSERT INTO grades (student_id, subject_id, exam, marks, max_marks) VALUES
  (1, 1, 'Midterm Exam', 94.00, 100.00),
  (1, 2, 'Midterm Exam', 91.50, 100.00),
  (1, 5, 'Midterm Exam', 98.00, 100.00),

  (2, 1, 'Midterm Exam', 88.00, 100.00),
  (2, 3, 'Midterm Exam', 95.00, 100.00),
  (2, 5, 'Midterm Exam', 92.50, 100.00),

  (3, 1, 'Midterm Exam', 82.00, 100.00),
  (3, 2, 'Midterm Exam', 85.00, 100.00),
  (3, 4, 'Midterm Exam', 79.50, 100.00),

  (4, 2, 'Midterm Exam', 96.00, 100.00),
  (4, 3, 'Midterm Exam', 92.00, 100.00),
  (4, 4, 'Midterm Exam', 94.50, 100.00),

  (5, 1, 'Midterm Exam', 76.50, 100.00),
  (5, 4, 'Midterm Exam', 84.00, 100.00),
  (5, 5, 'Midterm Exam', 88.50, 100.00);
