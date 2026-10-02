#!/usr/bin/env python3
"""
Student Information Portal - Flask JSON REST API
Backend engine supporting MySQL database storage with automatic seeding,
session authentication, and comprehensive academic record management.
"""

import os
import re
import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

# Initialize Flask app
app = Flask(__name__, template_folder='templates', static_folder='static')

# Application Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'student-portal-super-secret-key-2024')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASS = os.environ.get('DB_PASS', '')
DB_NAME = os.environ.get('DB_NAME', 'student_portal')
DB_PORT = int(os.environ.get('DB_PORT', '3306'))

# Try importing mysql.connector; if unavailable, provide graceful fallback
try:
    import mysql.connector
    from mysql.connector import errorcode
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False

def get_db_connection():
    """Establish and return a connection to MySQL database."""
    if not MYSQL_AVAILABLE:
        raise RuntimeError("mysql-connector-python is not installed. Run `pip install -r requirements.txt`.")
    
    return mysql.connector.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASS,
        database=DB_NAME,
        port=DB_PORT,
        charset='utf8mb4',
        autocommit=False
    )

def init_db():
    """Ensure schema and seed initial data on application boot."""
    if not MYSQL_AVAILABLE:
        print("[WARN] MySQL connector not available. Skipping automatic DB init.")
        return

    try:
        # First connect without database selected to ensure database exists
        server_conn = mysql.connector.connect(
            host=DB_HOST,
            user=DB_USER,
            password=DB_PASS,
            port=DB_PORT,
            charset='utf8mb4',
            autocommit=True
        )
        cur = server_conn.cursor()
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
        cur.close()
        server_conn.close()

        # Now connect to target DB
        conn = get_db_connection()
        cursor = conn.cursor(dictionary=True)

        # 1. Users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        # 2. Students table
        cursor.execute("""
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
        """)

        # 3. Subjects table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS subjects (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        # 4. Attendance table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                att_date DATE NOT NULL,
                status ENUM('Present', 'Absent', 'Late') NOT NULL DEFAULT 'Present',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY unique_student_date (student_id, att_date),
                CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        # 5. Grades table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS grades (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id INT NOT NULL,
                subject_id INT NOT NULL,
                exam VARCHAR(50) NOT NULL,
                marks DECIMAL(5,2) NOT NULL,
                max_marks DECIMAL(5,2) NOT NULL DEFAULT 100.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                CONSTRAINT fk_grades_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """)

        # Seed initial subjects
        subjects = ['Mathematics', 'Science', 'English', 'Social Studies', 'Computer Science']
        for sub in subjects:
            cursor.execute("INSERT IGNORE INTO subjects (name) VALUES (%s)", (sub,))

        # Seed demo users if empty or missing
        demo_accounts = [
            ('admin', 'admin123'),
            ('teacher', 'teacher123'),
            ('demo', 'demo123')
        ]
        for uname, pwd in demo_accounts:
            cursor.execute("SELECT id FROM users WHERE username = %s", (uname,))
            if not cursor.fetchone():
                p_hash = generate_password_hash(pwd)
                cursor.execute("INSERT INTO users (username, password_hash) VALUES (%s, %s)", (uname, p_hash))

        # Check if students table is empty; if so, seed sample students, attendance, and grades
        cursor.execute("SELECT COUNT(*) AS cnt FROM students")
        row = cursor.fetchone()
        if row and row['cnt'] == 0:
            sample_students = [
                ('CS-2024-001', 'Aiden Vance', 'aiden.vance@academy.edu', '+1 (555) 234-5678', 'Grade 11-A', '2008-04-12'),
                ('CS-2024-002', 'Elena Rostova', 'elena.rostova@academy.edu', '+1 (555) 345-6789', 'Grade 11-A', '2008-09-24'),
                ('CS-2024-003', 'Marcus Chen', 'marcus.chen@academy.edu', '+1 (555) 456-7890', 'Grade 11-B', '2008-01-18'),
                ('CS-2024-004', 'Sophia Sterling', 'sophia.sterling@academy.edu', '+1 (555) 567-8901', 'Grade 11-B', '2008-11-05'),
                ('CS-2024-005', 'Liam Gallagher', 'liam.gallagher@academy.edu', '+1 (555) 678-9012', 'Grade 11-A', '2008-07-30')
            ]
            for roll_no, name, email, phone, class_name, dob in sample_students:
                cursor.execute("""
                    INSERT INTO students (roll_no, name, email, phone, class_name, dob)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """, (roll_no, name, email, phone, class_name, dob))

            # Retrieve student IDs
            cursor.execute("SELECT id, roll_no FROM students")
            students_map = {s['roll_no']: s['id'] for s in cursor.fetchall()}

            # Retrieve subject IDs
            cursor.execute("SELECT id, name FROM subjects")
            subjects_map = {s['name']: s['id'] for s in cursor.fetchall()}

            # Seed today's attendance
            today_str = datetime.date.today().isoformat()
            attendance_seed = [
                (students_map.get('CS-2024-001'), today_str, 'Present'),
                (students_map.get('CS-2024-002'), today_str, 'Present'),
                (students_map.get('CS-2024-003'), today_str, 'Late'),
                (students_map.get('CS-2024-004'), today_str, 'Present'),
                (students_map.get('CS-2024-005'), today_str, 'Absent')
            ]
            for s_id, att_d, st in attendance_seed:
                if s_id:
                    cursor.execute("""
                        INSERT INTO attendance (student_id, att_date, status)
                        VALUES (%s, %s, %s)
                        ON DUPLICATE KEY UPDATE status = VALUES(status)
                    """, (s_id, att_d, st))

            # Seed 3 midterm grades each
            grades_seed = [
                # Aiden Vance
                (students_map.get('CS-2024-001'), subjects_map.get('Mathematics'), 'Midterm Exam', 94.0, 100.0),
                (students_map.get('CS-2024-001'), subjects_map.get('Science'), 'Midterm Exam', 91.5, 100.0),
                (students_map.get('CS-2024-001'), subjects_map.get('Computer Science'), 'Midterm Exam', 98.0, 100.0),

                # Elena Rostova
                (students_map.get('CS-2024-002'), subjects_map.get('Mathematics'), 'Midterm Exam', 88.0, 100.0),
                (students_map.get('CS-2024-002'), subjects_map.get('English'), 'Midterm Exam', 95.0, 100.0),
                (students_map.get('CS-2024-002'), subjects_map.get('Computer Science'), 'Midterm Exam', 92.5, 100.0),

                # Marcus Chen
                (students_map.get('CS-2024-003'), subjects_map.get('Mathematics'), 'Midterm Exam', 82.0, 100.0),
                (students_map.get('CS-2024-003'), subjects_map.get('Science'), 'Midterm Exam', 85.0, 100.0),
                (students_map.get('CS-2024-003'), subjects_map.get('Social Studies'), 'Midterm Exam', 79.5, 100.0),

                # Sophia Sterling
                (students_map.get('CS-2024-004'), subjects_map.get('Science'), 'Midterm Exam', 96.0, 100.0),
                (students_map.get('CS-2024-004'), subjects_map.get('English'), 'Midterm Exam', 92.0, 100.0),
                (students_map.get('CS-2024-004'), subjects_map.get('Social Studies'), 'Midterm Exam', 94.5, 100.0),

                # Liam Gallagher
                (students_map.get('CS-2024-005'), subjects_map.get('Mathematics'), 'Midterm Exam', 76.5, 100.0),
                (students_map.get('CS-2024-005'), subjects_map.get('Social Studies'), 'Midterm Exam', 84.0, 100.0),
                (students_map.get('CS-2024-005'), subjects_map.get('Computer Science'), 'Midterm Exam', 88.5, 100.0)
            ]
            for s_id, sub_id, exam, marks, max_m in grades_seed:
                if s_id and sub_id:
                    cursor.execute("""
                        INSERT INTO grades (student_id, subject_id, exam, marks, max_marks)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (s_id, sub_id, exam, marks, max_m))

        conn.commit()
        cursor.close()
        conn.close()
        print("[SUCCESS] MySQL database initialized and seeded successfully.")
    except Exception as e:
        print(f"[WARN] Database initialization notice: {e}")

import uuid

# In-memory store for API bearer tokens (to support both cookie sessions & token headers)
active_tokens = {}

def get_authenticated_user():
    """Retrieve user from session or Bearer Authorization header."""
    if 'user_id' in session:
        return {
            'id': session['user_id'],
            'username': session.get('username'),
            'role': session.get('role', 'student'),
            'student_id': session.get('student_id')
        }
    
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
        if token in active_tokens:
            return active_tokens[token]
    return None

# =====================================================================
# Auth Decorators
# =====================================================================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_authenticated_user()
        if not user:
            return jsonify({'error': 'Unauthorized. Please sign in to access this resource.'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_authenticated_user()
        if not user or user.get('role') != 'admin':
            return jsonify({'error': 'Access denied: Only Administrators can modify student records.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def staff_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_authenticated_user()
        if not user or user.get('role') not in ('admin', 'teacher'):
            return jsonify({'error': 'Access denied: Students cannot modify grades or attendance.'}), 403
        return f(*args, **kwargs)
    return decorated_function

# =====================================================================
# Frontend & Static Routes
# =====================================================================
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

# =====================================================================
# Authentication API
# =====================================================================
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role = data.get('role', 'student')
    if role not in ('admin', 'teacher', 'student'):
        role = 'student'

    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters long.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({'error': f"The username '{username}' is already taken. Please choose another."}), 400

        p_hash = generate_password_hash(password)
        cursor.execute("INSERT INTO users (username, password_hash, role, student_id) VALUES (%s, %s, %s, %s)",
                       (username, p_hash, role, 1 if role == 'student' else None))
        conn.commit()
        user_id = cursor.lastrowid
        cursor.close()
        conn.close()

        # Auto sign-in
        session['user_id'] = user_id
        session['username'] = username
        session['role'] = role
        session['student_id'] = 1 if role == 'student' else None

        token = str(uuid.uuid4())
        user_obj = {'id': user_id, 'username': username, 'role': role, 'student_id': session['student_id']}
        active_tokens[token] = user_obj

        return jsonify({
            'message': 'Account created successfully.',
            'token': token,
            'user': user_obj
        }), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': f'Failed to register: {str(e)}'}), 500

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'error': 'Both username and password are required.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, username, password_hash, COALESCE(role, 'student') as role, student_id FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({'error': 'Invalid username or password. Please try again.'}), 401

        session['user_id'] = user['id']
        session['username'] = user['username']
        session['role'] = user.get('role', 'student')
        session['student_id'] = user.get('student_id')

        token = str(uuid.uuid4())
        user_obj = {
            'id': user['id'],
            'username': user['username'],
            'role': session['role'],
            'student_id': session['student_id']
        }
        active_tokens[token] = user_obj

        return jsonify({
            'message': 'Sign in successful.',
            'token': token,
            'user': user_obj
        }), 200
    except Exception as e:
        conn.close()
        return jsonify({'error': f'Sign in error: {str(e)}'}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header[7:].strip()
        active_tokens.pop(token, None)
    session.clear()
    return jsonify({'message': 'Logged out successfully.'}), 200

@app.route('/api/me', methods=['GET'])
def me():
    user = get_authenticated_user()
    if user:
        return jsonify({
            'authenticated': True,
            'user': user
        })
    return jsonify({'authenticated': False, 'user': None}), 401

# =====================================================================
# Students API
# =====================================================================
@app.route('/api/students', methods=['GET'])
@login_required
def get_students():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, roll_no, name, email, phone, class_name, 
                   DATE_FORMAT(dob, '%Y-%m-%d') as dob,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as created_at
            FROM students 
            ORDER BY roll_no ASC
        """)
        students = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(students)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/students', methods=['POST'])
@login_required
@admin_required
def add_student():
    data = request.get_json() or {}
    roll_no = (data.get('roll_no') or '').strip()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    class_name = (data.get('class_name') or '').strip()
    dob = (data.get('dob') or '').strip() or None

    if not roll_no:
        return jsonify({'error': 'Roll number is required.'}), 400
    if not name:
        return jsonify({'error': 'Student name is required.'}), 400
    if not email:
        return jsonify({'error': 'Student email is required.'}), 400
    if not class_name:
        return jsonify({'error': 'Class name is required.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO students (roll_no, name, email, phone, class_name, dob)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (roll_no, name, email, phone, class_name, dob))
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({
            'message': 'Student created successfully.',
            'id': new_id
        }), 201
    except mysql.connector.Error as err:
        conn.rollback()
        conn.close()
        if err.errno == 1062:  # Duplicate entry
            return jsonify({'error': f"Roll number '{roll_no}' is already assigned to another student."}), 400
        return jsonify({'error': str(err)}), 500
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/<int:student_id>', methods=['PUT'])
@login_required
@admin_required
def update_student(student_id):
    data = request.get_json() or {}
    roll_no = (data.get('roll_no') or '').strip()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    class_name = (data.get('class_name') or '').strip()
    dob = (data.get('dob') or '').strip() or None

    if not roll_no or not name or not email or not class_name:
        return jsonify({'error': 'Roll number, Name, Email, and Class are required.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            UPDATE students
            SET roll_no = %s, name = %s, email = %s, phone = %s, class_name = %s, dob = %s
            WHERE id = %s
        """, (roll_no, name, email, phone, class_name, dob, student_id))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()

        if affected == 0:
            return jsonify({'error': 'Student not found or no changes made.'}), 404

        return jsonify({'message': 'Student updated successfully.'})
    except mysql.connector.Error as err:
        conn.rollback()
        conn.close()
        if err.errno == 1062:
            return jsonify({'error': f"Roll number '{roll_no}' is already assigned to another student."}), 400
        return jsonify({'error': str(err)}), 500
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_student(student_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("DELETE FROM students WHERE id = %s", (student_id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()

        if affected == 0:
            return jsonify({'error': 'Student not found.'}), 404

        return jsonify({'message': 'Student and all associated records deleted successfully.'})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Subjects API
# =====================================================================
@app.route('/api/subjects', methods=['GET'])
@login_required
def get_subjects():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT id, name FROM subjects ORDER BY name ASC")
        subjects = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(subjects)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/subjects', methods=['POST'])
@login_required
@admin_required
def add_subject():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Subject name is required.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("INSERT INTO subjects (name) VALUES (%s)", (name,))
        conn.commit()
        sub_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({'message': 'Subject added to curriculum successfully.', 'id': sub_id}), 201
    except mysql.connector.Error as err:
        conn.rollback()
        conn.close()
        if err.errno == 1062:
            return jsonify({'error': f"Subject '{name}' already exists."}), 400
        return jsonify({'error': str(err)}), 500
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/subjects/<int:sub_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_subject(sub_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("DELETE FROM subjects WHERE id = %s", (sub_id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()
        if affected == 0:
            return jsonify({'error': 'Subject not found.'}), 404
        return jsonify({'message': 'Subject removed from curriculum.'})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': 'Cannot remove subject with associated student grades.'}), 400

# =====================================================================
# Attendance API
# =====================================================================
@app.route('/api/attendance', methods=['GET'])
@login_required
def get_attendance():
    att_date = request.args.get('date')
    if not att_date:
        att_date = datetime.date.today().isoformat()

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # Fetch all students along with their attendance record for this date (if marked)
        cursor.execute("""
            SELECT s.id AS student_id, s.roll_no, s.name, s.class_name,
                   COALESCE(a.status, 'Present') AS status,
                   a.id AS attendance_id,
                   DATE_FORMAT(COALESCE(a.att_date, %s), '%Y-%m-%d') AS att_date
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id AND a.att_date = %s
            ORDER BY s.roll_no ASC
        """, (att_date, att_date))
        records = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(records)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/attendance', methods=['POST'])
@login_required
@staff_required
def save_attendance():
    """
    Bulk saves attendance records for multiple students using
    INSERT ... ON DUPLICATE KEY UPDATE status = VALUES(status).
    """
    data = request.get_json() or []
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({'error': 'Payload must be a non-empty array of attendance records.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        insert_query = """
            INSERT INTO attendance (student_id, att_date, status)
            VALUES (%s, %s, %s)
            ON DUPLICATE KEY UPDATE status = VALUES(status)
        """
        for item in data:
            s_id = item.get('student_id')
            a_date = item.get('att_date')
            status = item.get('status', 'Present')

            if s_id and a_date and status in ('Present', 'Absent', 'Late'):
                cursor.execute(insert_query, (s_id, a_date, status))

        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'message': f'Attendance for {len(data)} student(s) updated successfully.'})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Grades API
# =====================================================================
@app.route('/api/grades', methods=['GET'])
@login_required
def get_grades():
    student_id = request.args.get('student_id')
    user = get_authenticated_user()
    if user.get('role') == 'student':
        student_id = user.get('student_id') or 1

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        query = """
            SELECT g.id, g.student_id, g.subject_id, g.exam, 
                   CAST(g.marks AS FLOAT) as marks, 
                   CAST(g.max_marks AS FLOAT) as max_marks,
                   COALESCE(g.remarks, 'Standard evaluation recorded') as remarks,
                   ROUND((g.marks / g.max_marks) * 100, 1) as percentage,
                   s.name as student_name, s.roll_no, s.class_name,
                   sub.name as subject_name
            FROM grades g
            JOIN students s ON g.student_id = s.id
            JOIN subjects sub ON g.subject_id = sub.id
        """
        params = []
        if student_id:
            query += " WHERE g.student_id = %s"
            params.append(student_id)

        query += " ORDER BY g.created_at DESC"
        cursor.execute(query, params)
        grades = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(grades)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/grades', methods=['POST'])
@login_required
@staff_required
def add_grade():
    data = request.get_json() or {}
    student_id = data.get('student_id')
    subject_id = data.get('subject_id')
    exam = (data.get('exam') or '').strip()
    marks = data.get('marks')
    max_marks = data.get('max_marks', 100.0)
    remarks = (data.get('remarks') or '').strip()

    if not student_id or not subject_id or not exam or marks is None:
        return jsonify({'error': 'Student, Subject, Exam Name, and Marks are required.'}), 400

    try:
        marks = float(marks)
        max_marks = float(max_marks)
        if max_marks <= 0:
            return jsonify({'error': 'Max marks must be greater than 0.'}), 400
        if marks < 0 or marks > max_marks:
            return jsonify({'error': f'Marks must be between 0 and {max_marks}.'}), 400
    except ValueError:
        return jsonify({'error': 'Marks and Max marks must be valid numbers.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO grades (student_id, subject_id, exam, marks, max_marks, remarks)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (student_id, subject_id, exam, marks, max_marks, remarks or 'Assessment evaluation completed'))
        conn.commit()
        grade_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({'message': 'Grade record saved successfully.', 'id': grade_id}), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/grades/<int:grade_id>', methods=['DELETE'])
@login_required
@staff_required
def delete_grade(grade_id):
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("DELETE FROM grades WHERE id = %s", (grade_id,))
        conn.commit()
        affected = cursor.rowcount
        cursor.close()
        conn.close()

        if affected == 0:
            return jsonify({'error': 'Grade record not found.'}), 404

        return jsonify({'message': 'Grade deleted successfully.'})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Teacher Workspace & Alerts API
# =====================================================================
@app.route('/api/teacher/dashboard', methods=['GET'])
@login_required
@staff_required
def get_teacher_dashboard():
    today_str = datetime.date.today().isoformat()
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT COUNT(*) AS total_students FROM students")
        total_students = cursor.fetchone()['total_students']

        cursor.execute("""
            SELECT 
                COUNT(*) as marked,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as presents,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as lates,
                SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absents
            FROM attendance
            WHERE att_date = %s
        """, (today_str,))
        att_row = cursor.fetchone()
        marked = att_row['marked'] or 0
        presents = att_row['presents'] or 0
        lates = att_row['lates'] or 0
        absents = att_row['absents'] or 0

        # Attendance alerts (<75%)
        cursor.execute("""
            SELECT s.id, s.name, s.roll_no, s.class_name,
                   ROUND((SUM(CASE WHEN a.status = 'Present' THEN 1.0 WHEN a.status = 'Late' THEN 0.5 ELSE 0 END) / COUNT(a.id)) * 100, 1) as attendance_rate_pct,
                   SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
                   COUNT(a.id) as total_sessions
            FROM students s
            JOIN attendance a ON s.id = a.student_id
            GROUP BY s.id, s.name, s.roll_no, s.class_name
            HAVING attendance_rate_pct < 75.0
        """)
        attendance_alerts = cursor.fetchall()

        # Academic alerts (<60%)
        cursor.execute("""
            SELECT s.id, s.name, s.roll_no, s.class_name,
                   ROUND(AVG((g.marks / g.max_marks) * 100), 1) as average_grade_pct,
                   COUNT(g.id) as exam_count
            FROM students s
            JOIN grades g ON s.id = g.student_id
            GROUP BY s.id, s.name, s.roll_no, s.class_name
            HAVING average_grade_pct < 60.0
        """)
        academic_alerts = cursor.fetchall()

        # Recent grades
        cursor.execute("""
            SELECT g.id, s.name as student_name, s.roll_no, sub.name as subject_name,
                   g.exam, ROUND((g.marks / g.max_marks) * 100, 1) as percentage,
                   COALESCE(g.remarks, 'Standard evaluation recorded') as remarks,
                   DATE_FORMAT(g.created_at, '%Y-%m-%d') as created_at
            FROM grades g
            JOIN students s ON g.student_id = s.id
            JOIN subjects sub ON g.subject_id = sub.id
            ORDER BY g.created_at DESC
            LIMIT 6
        """)
        recent_grades = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify({
            'total_students': total_students,
            'today_attendance': {
                'date': today_str,
                'total_students': total_students,
                'marked': marked,
                'presents': presents,
                'lates': lates,
                'absents': absents,
                'not_marked': max(0, total_students - marked)
            },
            'attendance_alerts': attendance_alerts,
            'academic_alerts': academic_alerts,
            'recent_grades': recent_grades
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Leave Requests API
# =====================================================================
@app.route('/api/leave-requests', methods=['GET'])
@login_required
@staff_required
def get_leave_requests():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT l.id, l.student_id, s.name as student_name, s.roll_no, s.class_name,
                   DATE_FORMAT(l.leave_date, '%Y-%m-%d') as leave_date,
                   l.reason, l.status, l.reviewed_by,
                   DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') as created_at
            FROM leave_requests l
            JOIN students s ON l.student_id = s.id
            ORDER BY l.id DESC
        """)
        records = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(records)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/leave-requests/<int:req_id>/review', methods=['POST'])
@login_required
@staff_required
def review_leave_request(req_id):
    user = get_authenticated_user()
    data = request.get_json() or {}
    status = data.get('status')
    if status not in ('Approved', 'Rejected'):
        return jsonify({'error': 'Status must be Approved or Rejected.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            UPDATE leave_requests
            SET status = %s, reviewed_by = %s
            WHERE id = %s
        """, (status, user.get('username', 'teacher'), req_id))
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({'message': f'Leave request {status.lower()} successfully.'})
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/leaves', methods=['GET'])
@login_required
def get_student_leaves():
    user = get_authenticated_user()
    s_id = user.get('student_id') or 1
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT id, DATE_FORMAT(leave_date, '%Y-%m-%d') as leave_date,
                   reason, status, reviewed_by,
                   DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') as created_at
            FROM leave_requests
            WHERE student_id = %s
            ORDER BY id DESC
        """, (s_id,))
        records = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(records)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

@app.route('/api/student/leaves', methods=['POST'])
@login_required
def submit_student_leave():
    user = get_authenticated_user()
    s_id = user.get('student_id') or 1
    data = request.get_json() or {}
    leave_date = data.get('leave_date')
    reason = (data.get('reason') or '').strip()

    if not leave_date or not reason:
        return jsonify({'error': 'Date and reason are required.'}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            INSERT INTO leave_requests (student_id, leave_date, reason, status)
            VALUES (%s, %s, %s, 'Pending')
        """, (s_id, leave_date, reason))
        conn.commit()
        req_id = cursor.lastrowid
        cursor.close()
        conn.close()
        return jsonify({'message': 'Excuse note submitted for faculty review.', 'id': req_id}), 201
    except Exception as e:
        conn.rollback()
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Admin Users API
# =====================================================================
@app.route('/api/admin/users', methods=['GET'])
@login_required
@admin_required
def get_admin_users():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute("""
            SELECT u.id, u.username, u.role, u.student_id,
                   s.name as linked_student_name, s.roll_no as linked_student_roll
            FROM users u
            LEFT JOIN students s ON u.student_id = s.id
            ORDER BY u.id ASC
        """)
        users_list = cursor.fetchall()
        cursor.close()
        conn.close()
        return jsonify(users_list)
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Student Personal Portal API
# =====================================================================
@app.route('/api/student/portal', methods=['GET'])
@login_required
def get_student_portal():
    user = get_authenticated_user()
    s_id = user.get('student_id') or 1

    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)
        # Student info
        cursor.execute("""
            SELECT id, roll_no, name, email, phone, class_name,
                   DATE_FORMAT(dob, '%Y-%m-%d') as dob
            FROM students WHERE id = %s
        """, (s_id,))
        student = cursor.fetchone() or {}

        # Student attendance history
        cursor.execute("""
            SELECT id, DATE_FORMAT(att_date, '%Y-%m-%d') as att_date, status
            FROM attendance
            WHERE student_id = %s
            ORDER BY att_date DESC
        """, (s_id,))
        my_attendance = cursor.fetchall()

        presents = sum(1 for a in my_attendance if a['status'] == 'Present')
        lates = sum(1 for a in my_attendance if a['status'] == 'Late')
        absents = sum(1 for a in my_attendance if a['status'] == 'Absent')
        total_days = len(my_attendance)
        att_rate = round(((presents + (lates * 0.5)) / total_days) * 100, 1) if total_days > 0 else 100.0

        # Student grades
        cursor.execute("""
            SELECT g.id, g.exam, sub.name as subject_name,
                   CAST(g.marks AS FLOAT) as marks,
                   CAST(g.max_marks AS FLOAT) as max_marks,
                   ROUND((g.marks / g.max_marks) * 100, 1) as percentage,
                   DATE_FORMAT(g.created_at, '%Y-%m-%d') as created_at
            FROM grades g
            JOIN subjects sub ON g.subject_id = sub.id
            WHERE g.student_id = %s
            ORDER BY g.created_at DESC
        """, (s_id,))
        my_grades = cursor.fetchall()

        avg_grade = round(sum(g['percentage'] for g in my_grades) / len(my_grades), 1) if my_grades else 0.0

        cursor.close()
        conn.close()

        return jsonify({
            'student': student,
            'attendance': {
                'records': my_attendance,
                'total_days': total_days,
                'presents': presents,
                'lates': lates,
                'absents': absents,
                'attendance_rate_pct': att_rate
            },
            'grades': {
                'records': my_grades,
                'average_grade_pct': avg_grade,
                'total_exams': len(my_grades)
            }
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

# =====================================================================
# Dashboard Stats API
# =====================================================================
@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    conn = get_db_connection()
    try:
        cursor = conn.cursor(dictionary=True)

        # 1. Total students
        cursor.execute("SELECT COUNT(*) AS total_students FROM students")
        total_students = cursor.fetchone()['total_students']

        # 2. Present today
        today_str = datetime.date.today().isoformat()
        cursor.execute("""
            SELECT COUNT(*) AS present_today 
            FROM attendance 
            WHERE att_date = %s AND status = 'Present'
        """, (today_str,))
        present_today = cursor.fetchone()['present_today']

        # 3. Overall attendance rate %
        cursor.execute("""
            SELECT 
                COUNT(*) as total_attendance_records,
                SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as total_presents,
                SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as total_lates
            FROM attendance
        """)
        att_row = cursor.fetchone()
        tot_records = att_row['total_attendance_records'] or 0
        tot_presents = att_row['total_presents'] or 0
        tot_lates = att_row['total_lates'] or 0

        attendance_rate_pct = 0.0
        if tot_records > 0:
            # Weighted: Present = 1.0, Late = 0.5
            attendance_rate_pct = round(((tot_presents + (tot_lates * 0.5)) / tot_records) * 100, 1)

        # 4. Average grade percentage
        cursor.execute("""
            SELECT AVG((marks / max_marks) * 100) AS avg_pct
            FROM grades
        """)
        grade_row = cursor.fetchone()
        average_grade_pct = round(float(grade_row['avg_pct'] or 0.0), 1)

        # 5. Top 5 students by average grade %
        cursor.execute("""
            SELECT s.id, s.name, s.roll_no, s.class_name,
                   ROUND(AVG((g.marks / g.max_marks) * 100), 1) AS average_pct,
                   COUNT(g.id) AS exam_count
            FROM students s
            JOIN grades g ON s.id = g.student_id
            GROUP BY s.id, s.name, s.roll_no, s.class_name
            HAVING exam_count > 0
            ORDER BY average_pct DESC
            LIMIT 5
        """)
        top_students = cursor.fetchall()

        cursor.close()
        conn.close()

        return jsonify({
            'total_students': total_students,
            'present_today': present_today,
            'attendance_rate_pct': attendance_rate_pct,
            'average_grade_pct': average_grade_pct,
            'top_students': top_students
        })
    except Exception as e:
        conn.close()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Initialize DB tables and seed data if MySQL is connected
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"Starting Student Information Portal on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=True)
