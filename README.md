# Student Information Portal

A high-performance, single-page web portal for managing student records, attendance tracking, and examination grades with a spatial liquid-glass design system.

## Stack & Architecture

- **Frontend**: Plain HTML5, Modern CSS3 (liquid glassmorphism, 3D pointer-driven card perspective, drifting blurred gradient orbs), and Vanilla JavaScript (ES6+ SPA without frameworks).
- **Backend**: Python Flask JSON REST API (`app.py`) with session-based authentication and Werkzeug password hashing.
- **Database**: MySQL via `mysql-connector-python` (`schema.sql` utf8mb4) with foreign keys and cascading deletes.
- **Preview Server**: TypeScript Express backend (`server.ts`) providing full API parity and instant preview in AI Studio.

---

## Deliverables & Directory Structure

```text
├── app.py                 # Flask JSON REST API backend with MySQL support
├── schema.sql             # MySQL utf8mb4 database schema with tables and seed data
├── requirements.txt       # Python dependencies (Flask, mysql-connector-python, Werkzeug)
├── templates/
│   └── index.html         # Plain HTML single-page application template
├── static/
│   ├── style.css          # Dark deep-blue theme, spatial 3D effects & glassmorphism
│   └── app.js             # Vanilla JS state controller, live search, bulk attendance & modals
├── README.md              # Project documentation and execution instructions
└── server.ts              # Full-stack dev runner for port 3000
```

---

## Database Schema (`schema.sql`)

1. **`users`**: `id`, `username` (unique), `password_hash`, `created_at`
2. **`students`**: `id`, `roll_no` (unique), `name`, `email`, `phone`, `class_name`, `dob`, `created_at`
3. **`subjects`**: `id`, `name` (unique) — pre-seeded with Mathematics, Science, English, Social Studies, Computer Science.
4. **`attendance`**: `id`, `student_id` (FK), `att_date`, `status` (`ENUM('Present', 'Absent', 'Late')`), unique on `(student_id, att_date)`, `ON DELETE CASCADE`.
5. **`grades`**: `id`, `student_id` (FK), `subject_id` (FK), `exam`, `marks`, `max_marks` (default 100), `ON DELETE CASCADE`.

---

## Quick Setup & Execution (Python Flask + MySQL)

### 1. Install dependencies
```bash
pip install -r requirements.txt
```

### 2. Import database schema into MySQL
Ensure your MySQL server is running, then execute:
```bash
mysql -u root -p < schema.sql
```

### 3. Launch Flask application
```bash
python app.py
```
By default, the server runs on `http://localhost:5000`.

### Environment Variables (Optional)
You can configure the following environment variables if your MySQL configuration differs from defaults:
- `DB_HOST`: Hostname (default: `localhost`)
- `DB_PORT`: Port (default: `3306`)
- `DB_USER`: Database username (default: `root`)
- `DB_PASS`: Database password (default: empty)
- `DB_NAME`: Database name (default: `student_portal`)
- `SECRET_KEY`: Flask session secret key

---

## Pre-seeded Demo Accounts

Use any of these demo accounts to sign in immediately:

| Username | Password | Role |
| :--- | :--- | :--- |
| `admin` | `admin123` | System Administrator |
| `teacher` | `teacher123` | Faculty Educator |
| `demo` | `demo123` | Guest Evaluator |

*(Tap-to-fill chips are available directly on the login card for one-click access)*

---

## Key Features

1. **Dashboard**:
   - Total Students enrolled counter
   - Present Today counter and ratio
   - Overall Weighted Attendance Rate %
   - Average Grade % across exams
   - Top 5 performing students leaderboard with animated score progress bars
   - Spatial 3D card tilt driven by cursor position
2. **Students Directory**:
   - Live instant search across student name, roll number, or class
   - Enroll new students with roll number duplicate detection and friendly errors
   - Edit student demographics
   - Delete students with confirmation dialog (cascades to attendance and grades)
3. **Attendance Management**:
   - Interactive date selector (defaults to current date)
   - 3-button segmented controls (Present, Late, Absent) with semantic glows
   - "Mark All Present" & "Mark All Absent" batch buttons
   - Bulk save with `INSERT ... ON DUPLICATE KEY UPDATE`
4. **Grades & Assessments**:
   - Filter evaluations by individual student or view all
   - Record grades by student, subject, assessment name, marks scored, and maximum marks
   - Percentage score progress bars with letter grade tags (A+, A, B, C, F)
   - Delete individual grade records
5. **Accessibility & Security**:
   - High-contrast WCAG AA dark deep-blue aesthetic
   - Complete XSS prevention via HTML escaping
   - Parameterized SQL queries to prevent SQL injection
   - `prefers-reduced-motion` compliance
