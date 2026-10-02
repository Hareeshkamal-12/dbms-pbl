#!/usr/bin/env python3
"""
Student Information Portal - Flask REST API & Web Application
Comprehensive academic portal for managing student records, attendance tracking,
and examination grade reports with distinct roles for Admin, Teacher, and Student.
"""

import os
import re
import sys
import json
import sqlite3
import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, render_template, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

# Initialize Flask Application
app = Flask(__name__, template_folder='templates', static_folder='static')

# Application Configuration
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'student-portal-super-secret-key-2024')
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASS = os.environ.get('DB_PASS', '')
DB_NAME = os.environ.get('DB_NAME', 'student_portal')
DB_PORT = int(os.environ.get('DB_PORT', '3306'))

# Try importing MySQL connector
try:
    import mysql.connector
    from mysql.connector import errorcode
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False

SQLITE_PATH = os.environ.get('SQLITE_PATH', '/tmp/student_portal.db')

# =====================================================================
# Database Abstraction Layer (MySQL primary with SQLite seamless failover)
# =====================================================================
class SQLiteCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, query, params=None):
        # Convert MySQL %s placeholders to SQLite ? placeholders
        clean_query = query.replace('%s', '?')
        # Replace MySQL specific functions if any
        clean_query = clean_query.replace("DATE_FORMAT(", "strftime('%Y-%m-%d', ")
        clean_query = clean_query.replace("CURRENT_DATE()", "date('now')")
        clean_query = clean_query.replace("CURRENT_TIMESTAMP", "datetime('now')")
        clean_query = clean_query.replace("INSERT IGNORE", "INSERT OR IGNORE")
        
        # Handle ON DUPLICATE KEY UPDATE for bulk attendance
        if "ON DUPLICATE KEY UPDATE" in clean_query:
            clean_query = clean_query.split("ON DUPLICATE KEY UPDATE")[0].replace("INSERT INTO", "INSERT OR REPLACE INTO")

        if params:
            return self.cursor.execute(clean_query, params)
        return self.cursor.execute(clean_query)

    def fetchone(self):
        row = self.cursor.fetchone()
        if row is None:
            return None
        return dict(row)

    def fetchall(self):
        rows = self.cursor.fetchall()
        return [dict(r) for r in rows]

    @property
    def lastrowid(self):
        return self.cursor.lastrowid

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def close(self):
        self.cursor.close()

class DBWrapper:
    def __init__(self, mode='mysql', raw_conn=None):
        self.mode = mode
        self.conn = raw_conn

    def cursor(self, dictionary=True):
        if self.mode == 'mysql':
            return self.conn.cursor(dictionary=dictionary)
        else:
            return SQLiteCursorWrapper(self.conn.cursor())

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()

def get_db_connection():
    """Establish and return a database connection (MySQL if available, SQLite fallback)."""
    if MYSQL_AVAILABLE:
        try:
            raw_conn = mysql.connector.connect(
                host=DB_HOST,
                user=DB_USER,
                password=DB_PASS,
                database=DB_NAME,
                port=DB_PORT,
                charset='utf8mb4',
                autocommit=False
            )
            return DBWrapper('mysql', raw_conn)
        except Exception:
            pass

    # Seamless SQLite local bridge
    sqlite_conn = sqlite3.connect(SQLITE_PATH, timeout=10.0)
    sqlite_conn.row_factory = sqlite3.Row
    return DBWrapper('sqlite', sqlite_conn)

def init_db():
    """Initialize tables and pre-seed initial demo accounts and data."""
    conn = get_db_connection()
    cur = conn.cursor()

    # Schema creation
    cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'student',
            student_id INTEGER DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            roll_no TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            class_name TEXT NOT NULL,
            dob TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            att_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Present',
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE (student_id, att_date)
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject_id INTEGER NOT NULL,
            exam TEXT NOT NULL,
            marks REAL NOT NULL,
            max_marks REAL NOT NULL DEFAULT 100.0,
            remarks TEXT,
            created_at TEXT DEFAULT (date('now'))
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            leave_date TEXT NOT NULL,
            reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            reviewed_by TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.commit()

    # Pre-seed Subjects
    subjects = ['Mathematics', 'Science', 'English', 'Social Studies', 'Computer Science']
    for s in subjects:
        try:
            cur.execute("INSERT OR IGNORE INTO subjects (name) VALUES (%s)", (s,))
        except Exception:
            pass
    conn.commit()

    # Pre-seed 5 Students
    sample_students = [
        (1, 'CS-2024-001', 'Aiden Vance', 'aiden.vance@academy.edu', '+1 (555) 234-5678', 'Grade 11-A', '2008-04-12'),
        (2, 'CS-2024-002', 'Elena Rostova', 'elena.rostova@academy.edu', '+1 (555) 345-6789', 'Grade 11-A', '2008-09-24'),
        (3, 'CS-2024-003', 'Marcus Chen', 'marcus.chen@academy.edu', '+1 (555) 456-7890', 'Grade 11-B', '2008-01-18'),
        (4, 'CS-2024-004', 'Sophia Sterling', 'sophia.sterling@academy.edu', '+1 (555) 567-8901', 'Grade 11-B', '2008-11-05'),
        (5, 'CS-2024-005', 'Liam Gallagher', 'liam.gallagher@academy.edu', '+1 (555) 678-9012', 'Grade 11-A', '2008-07-30')
    ]
    for s_id, roll, name, email, phone, c_name, dob in sample_students:
        try:
            cur.execute("""
                INSERT OR IGNORE INTO students (id, roll_no, name, email, phone, class_name, dob)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (s_id, roll, name, email, phone, c_name, dob))
        except Exception:
            pass
    conn.commit()

    # Pre-seed Demo Users
    demo_users = [
        ('admin', 'admin123', 'admin', None),
        ('teacher', 'teacher123', 'teacher', None),
        ('demo', 'demo123', 'student', 1),
        ('student', 'student123', 'student', 1)
    ]
    for uname, pwd, role, s_id in demo_users:
        try:
            cur.execute("SELECT id FROM users WHERE username = %s", (uname,))
            if not cur.fetchone():
                h = generate_password_hash(pwd)
                cur.execute("""
                    INSERT INTO users (username, password_hash, role, student_id)
                    VALUES (%s, %s, %s, %s)
                """, (uname, h, role, s_id))
        except Exception:
            pass
    conn.commit()

    # Pre-seed Today Attendance
    today_str = datetime.date.today().isoformat()
    sample_att = [
        (1, today_str, 'Present'),
        (2, today_str, 'Present'),
        (3, today_str, 'Late'),
        (4, today_str, 'Present'),
        (5, today_str, 'Absent')
    ]
    for s_id, dt, st in sample_att:
        try:
            cur.execute("""
                INSERT OR IGNORE INTO attendance (student_id, att_date, status)
                VALUES (%s, %s, %s)
            """, (s_id, dt, st))
        except Exception:
            pass
    conn.commit()

    # Pre-seed Grades
    sample_grades = [
        (1, 1, 'Midterm Exam', 94.0, 100.0, 'Excellent algebraic proofs and analytical reasoning'),
        (1, 2, 'Midterm Exam', 91.5, 100.0, 'Great laboratory performance in optics'),
        (1, 5, 'Midterm Exam', 98.0, 100.0, 'Outstanding algorithmic implementation and code clarity'),
        (2, 1, 'Midterm Exam', 88.0, 100.0, 'Solid calculation skills'),
        (2, 3, 'Midterm Exam', 95.0, 100.0, 'Superb essay structure and critical analysis'),
        (2, 5, 'Midterm Exam', 92.5, 100.0, 'Consistent programming style and thorough testing'),
        (3, 1, 'Midterm Exam', 82.0, 100.0, 'Good grasp of fundamentals'),
        (3, 2, 'Midterm Exam', 85.0, 100.0, 'Thorough scientific report writeup'),
        (3, 4, 'Midterm Exam', 79.5, 100.0, 'Needs more elaboration on historical dates'),
        (4, 2, 'Midterm Exam', 96.0, 100.0, 'Top scores in organic chemistry unit'),
        (4, 3, 'Midterm Exam', 92.0, 100.0, 'Vibrant vocabulary and speech delivery'),
        (4, 4, 'Midterm Exam', 94.5, 100.0, 'Insightful sociological perspectives'),
        (5, 1, 'Midterm Exam', 76.5, 100.0, 'Review trigonometry formulas before next quiz'),
        (5, 4, 'Midterm Exam', 84.0, 100.0, 'Constructive participation in debates'),
        (5, 5, 'Midterm Exam', 88.5, 100.0, 'Completed database normalization schema cleanly')
    ]
    cur.execute("SELECT COUNT(*) as cnt FROM grades")
    if cur.fetchone()['cnt'] == 0:
        for s_id, sub_id, ex, mk, max_m, rem in sample_grades:
            cur.execute("""
                INSERT INTO grades (student_id, subject_id, exam, marks, max_marks, remarks, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (s_id, sub_id, ex, mk, max_m, rem, '2024-10-15'))
        conn.commit()

    # Pre-seed Sample Leave Request
    cur.execute("SELECT COUNT(*) as cnt FROM leave_requests")
    if cur.fetchone()['cnt'] == 0:
        cur.execute("""
            INSERT INTO leave_requests (student_id, leave_date, reason, status, reviewed_by, created_at)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (1, today_str, 'Attending regional mathematics olympiad finals.', 'Approved', 'teacher', '2024-10-01 08:30'))
        cur.execute("""
            INSERT INTO leave_requests (student_id, leave_date, reason, status, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (3, '2026-10-05', 'Dental checkup appointment with specialist.', 'Pending', '2024-10-02 09:15'))
        conn.commit()

    cur.close()
    conn.close()

# Token Store in Memory
active_tokens = {}

def get_authenticated_user():
    """Extract authenticated user session from Bearer token or Flask session."""
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ', 1)[1].strip()
        if token in active_tokens:
            return active_tokens[token]

    if 'user' in session:
        return session['user']

    return None

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
            return jsonify({'error': 'Access denied: Only Administrators have permission for this operation.'}), 403
        return f(*args, **kwargs)
    return decorated_function

def staff_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_authenticated_user()
        if not user or user.get('role') not in ('admin', 'teacher'):
            return jsonify({'error': 'Access denied: Faculty or Administrator credentials required.'}), 403
        return f(*args, **kwargs)
    return decorated_function

# =====================================================================
# Authentication Routes
# =====================================================================
@app.route('/api/login', methods=['POST'])
def api_login():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''

    if not username or not password:
        return jsonify({'error': 'Both username and password are required.'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, username, password_hash, role, student_id FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
    user = cur.fetchone()
    cur.close()
    conn.close()

    if not user:
        return jsonify({'error': 'Invalid username or password. Please try again.'}), 401

    pwd_hash = user['password_hash']
    # Verify using Werkzeug check_password_hash or plain demo match
    is_valid = False
    try:
        is_valid = check_password_hash(pwd_hash, password)
    except Exception:
        is_valid = (pwd_hash == password)

    if not is_valid:
        return jsonify({'error': 'Invalid username or password. Please try again.'}), 401

    token = os.urandom(24).hex()
    user_info = {
        'id': user['id'],
        'username': user['username'],
        'role': user['role'],
        'student_id': user.get('student_id')
    }
    active_tokens[token] = user_info
    session['user'] = user_info

    resp = jsonify({
        'message': 'Sign in successful.',
        'token': token,
        'user': user_info
    })
    resp.set_cookie('session_id', token, httponly=True, samesite='None', secure=True)
    return resp, 200

@app.route('/api/register', methods=['POST'])
def api_register():
    data = request.get_json() or {}
    username = (data.get('username') or '').strip()
    password = data.get('password') or ''
    role = data.get('role', 'student')

    if len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters long.'}), 400
    if len(password) < 6:
        return jsonify({'error': 'Password must be at least 6 characters long.'}), 400

    valid_role = role if role in ('admin', 'teacher', 'student') else 'student'

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(%s)", (username,))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({'error': f"The username '{username}' is already taken. Please choose another."}), 400

    hashed_pw = generate_password_hash(password)
    student_id = 1 if valid_role == 'student' else None
    cur.execute("""
        INSERT INTO users (username, password_hash, role, student_id)
        VALUES (%s, %s, %s, %s)
    """, (username, hashed_pw, valid_role, student_id))
    conn.commit()
    new_id = cur.lastrowid
    cur.close()
    conn.close()

    token = os.urandom(24).hex()
    user_info = {
        'id': new_id,
        'username': username,
        'role': valid_role,
        'student_id': student_id
    }
    active_tokens[token] = user_info
    session['user'] = user_info

    resp = jsonify({
        'message': 'Account created successfully.',
        'token': token,
        'user': user_info
    })
    resp.set_cookie('session_id', token, httponly=True, samesite='None', secure=True)
    return resp, 201

@app.route('/api/logout', methods=['POST'])
def api_logout():
    session.pop('user', None)
    resp = jsonify({'message': 'Logged out successfully.'})
    resp.set_cookie('session_id', '', expires=0, httponly=True)
    return resp, 200

@app.route('/api/me', methods=['GET'])
def api_me():
    user = get_authenticated_user()
    if user:
        return jsonify({'authenticated': True, 'user': user}), 200
    return jsonify({'authenticated': False, 'user': None}), 401

# =====================================================================
# Student Personal Portal API
# =====================================================================
@app.route('/api/student/portal', methods=['GET'])
@login_required
def get_student_portal():
    user = get_authenticated_user()
    s_id = user.get('student_id') or 1

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, roll_no, name, email, phone, class_name, dob, created_at
        FROM students WHERE id = %s
    """, (s_id,))
    student = cur.fetchone() or {}

    cur.execute("""
        SELECT id, att_date, status
        FROM attendance
        WHERE student_id = %s
        ORDER BY att_date DESC
    """, (s_id,))
    my_att = cur.fetchall()

    presents = sum(1 for a in my_att if a['status'] == 'Present')
    lates = sum(1 for a in my_att if a['status'] == 'Late')
    absents = sum(1 for a in my_att if a['status'] == 'Absent')
    total_days = len(my_att)
    att_rate = round(((presents + (lates * 0.5)) / total_days) * 100, 1) if total_days > 0 else 100.0

    cur.execute("""
        SELECT g.id, g.exam, sub.name as subject_name,
               CAST(g.marks AS FLOAT) as marks,
               CAST(g.max_marks AS FLOAT) as max_marks,
               ROUND((g.marks / g.max_marks) * 100, 1) as percentage,
               COALESCE(g.remarks, 'Standard evaluation recorded') as remarks,
               g.created_at
        FROM grades g
        JOIN subjects sub ON g.subject_id = sub.id
        WHERE g.student_id = %s
        ORDER BY g.created_at DESC
    """, (s_id,))
    my_grades = cur.fetchall()

    avg_grade = round(sum(g['percentage'] for g in my_grades) / len(my_grades), 1) if my_grades else 0.0

    cur.close()
    conn.close()

    return jsonify({
        'student': student,
        'attendance': {
            'records': my_att,
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

# =====================================================================
# Students Directory API
# =====================================================================
@app.route('/api/students', methods=['GET'])
@login_required
def get_students():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, roll_no, name, email, phone, class_name, dob, created_at FROM students ORDER BY roll_no ASC")
    students = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(students)

@app.route('/api/students', methods=['POST'])
@login_required
@admin_required
def create_student():
    data = request.get_json() or {}
    roll_no = (data.get('roll_no') or '').strip()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    class_name = (data.get('class_name') or '').strip()
    dob = data.get('dob') or ''

    if not roll_no or not name or not email or not class_name:
        return jsonify({'error': 'Roll number, Name, Email, and Class are required.'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM students WHERE LOWER(roll_no) = LOWER(%s)", (roll_no,))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({'error': f"Roll number '{roll_no}' is already assigned to another student."}), 400

    cur.execute("""
        INSERT INTO students (roll_no, name, email, phone, class_name, dob)
        VALUES (%s, %s, %s, %s, %s, %s)
    """, (roll_no, name, email, phone, class_name, dob))
    conn.commit()
    new_id = cur.lastrowid
    cur.close()
    conn.close()

    return jsonify({'message': 'Student created successfully.', 'id': new_id}), 201

@app.route('/api/students/<int:s_id>', methods=['PUT'])
@login_required
@admin_required
def update_student(s_id):
    data = request.get_json() or {}
    roll_no = (data.get('roll_no') or '').strip()
    name = (data.get('name') or '').strip()
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    class_name = (data.get('class_name') or '').strip()
    dob = data.get('dob') or ''

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM students WHERE LOWER(roll_no) = LOWER(%s) AND id != %s", (roll_no, s_id))
    if cur.fetchone():
        cur.close()
        conn.close()
        return jsonify({'error': f"Roll number '{roll_no}' is already assigned to another student."}), 400

    cur.execute("""
        UPDATE students
        SET roll_no = %s, name = %s, email = %s, phone = %s, class_name = %s, dob = %s
        WHERE id = %s
    """, (roll_no, name, email, phone, class_name, dob, s_id))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Student updated successfully.'})

@app.route('/api/students/<int:s_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_student(s_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM attendance WHERE student_id = %s", (s_id,))
    cur.execute("DELETE FROM grades WHERE student_id = %s", (s_id,))
    cur.execute("DELETE FROM leave_requests WHERE student_id = %s", (s_id,))
    cur.execute("DELETE FROM students WHERE id = %s", (s_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Student and all associated records deleted successfully.'})

# =====================================================================
# Subjects API
# =====================================================================
@app.route('/api/subjects', methods=['GET'])
@login_required
def get_subjects():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id, name FROM subjects ORDER BY name ASC")
    subs = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(subs)

@app.route('/api/subjects', methods=['POST'])
@login_required
@admin_required
def add_subject():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Subject name is required.'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("INSERT INTO subjects (name) VALUES (%s)", (name,))
        conn.commit()
        sub_id = cur.lastrowid
        cur.close()
        conn.close()
        return jsonify({'message': 'Subject added to curriculum successfully.', 'id': sub_id}), 201
    except Exception:
        cur.close()
        conn.close()
        return jsonify({'error': f"Subject '{name}' already exists in curriculum."}), 400

@app.route('/api/subjects/<int:sub_id>', methods=['DELETE'])
@login_required
@admin_required
def delete_subject(sub_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) as cnt FROM grades WHERE subject_id = %s", (sub_id,))
    if cur.fetchone()['cnt'] > 0:
        cur.close()
        conn.close()
        return jsonify({'error': 'Cannot delete subject: Examination grades are associated with this subject.'}), 400

    cur.execute("DELETE FROM subjects WHERE id = %s", (sub_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Subject removed from curriculum.'})

# =====================================================================
# Attendance API
# =====================================================================
@app.route('/api/attendance', methods=['GET'])
@login_required
def get_attendance():
    att_date = request.args.get('date') or datetime.date.today().isoformat()
    user = get_authenticated_user()

    conn = get_db_connection()
    cur = conn.cursor()

    if user.get('role') == 'student':
        s_id = user.get('student_id') or 1
        cur.execute("""
            SELECT s.id AS student_id, s.roll_no, s.name, s.class_name,
                   COALESCE(a.status, 'Present') AS status,
                   %s AS att_date
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id AND a.att_date = %s
            WHERE s.id = %s
        """, (att_date, att_date, s_id))
    else:
        cur.execute("""
            SELECT s.id AS student_id, s.roll_no, s.name, s.class_name,
                   COALESCE(a.status, 'Present') AS status,
                   %s AS att_date
            FROM students s
            LEFT JOIN attendance a ON s.id = a.student_id AND a.att_date = %s
            ORDER BY s.roll_no ASC
        """, (att_date, att_date))

    records = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(records)

@app.route('/api/attendance', methods=['POST'])
@login_required
@staff_required
def save_attendance():
    data = request.get_json() or []
    if not isinstance(data, list) or len(data) == 0:
        return jsonify({'error': 'Payload must be a non-empty array of attendance records.'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    for item in data:
        s_id = item.get('student_id')
        a_date = item.get('att_date')
        status = item.get('status', 'Present')
        if s_id and a_date and status in ('Present', 'Absent', 'Late'):
            cur.execute("""
                INSERT OR REPLACE INTO attendance (student_id, att_date, status)
                VALUES (%s, %s, %s)
            """, (s_id, a_date, status))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': f'Attendance for {len(data)} student(s) updated successfully.'})

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
    cur = conn.cursor()
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

    cur.execute(query, params)
    grades = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(grades)

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
        m = float(marks)
        mm = float(max_marks)
        if mm <= 0 or m < 0 or m > mm:
            return jsonify({'error': f'Marks must be between 0 and {mm}.'}), 400
    except ValueError:
        return jsonify({'error': 'Invalid numeric marks.'}), 400

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO grades (student_id, subject_id, exam, marks, max_marks, remarks, created_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (student_id, subject_id, exam, m, mm, remarks or 'Assessment evaluation completed', datetime.date.today().isoformat()))
    conn.commit()
    new_id = cur.lastrowid
    cur.close()
    conn.close()
    return jsonify({'message': 'Grade record saved successfully.', 'id': new_id}), 201

@app.route('/api/grades/<int:g_id>', methods=['DELETE'])
@login_required
@staff_required
def delete_grade(g_id):
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM grades WHERE id = %s", (g_id,))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': 'Grade deleted successfully.'})

# =====================================================================
# Teacher Workspace & Alerts API
# =====================================================================
@app.route('/api/teacher/dashboard', methods=['GET'])
@login_required
@staff_required
def get_teacher_dashboard():
    today_str = datetime.date.today().isoformat()
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS total_students FROM students")
    total_students = cur.fetchone()['total_students']

    cur.execute("""
        SELECT 
            COUNT(*) as marked,
            SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as presents,
            SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as lates,
            SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absents
        FROM attendance
        WHERE att_date = %s
    """, (today_str,))
    att_row = cur.fetchone()
    marked = att_row['marked'] or 0

    # Attendance alerts (<75%)
    cur.execute("""
        SELECT s.id, s.name, s.roll_no, s.class_name,
               ROUND((SUM(CASE WHEN a.status = 'Present' THEN 1.0 WHEN a.status = 'Late' THEN 0.5 ELSE 0 END) / COUNT(a.id)) * 100, 1) as attendance_rate_pct,
               SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) as absent_count,
               COUNT(a.id) as total_sessions
        FROM students s
        JOIN attendance a ON s.id = a.student_id
        GROUP BY s.id, s.name, s.roll_no, s.class_name
        HAVING attendance_rate_pct < 75.0
    """)
    attendance_alerts = cur.fetchall()

    # Academic alerts (<60%)
    cur.execute("""
        SELECT s.id, s.name, s.roll_no, s.class_name,
               ROUND(AVG((g.marks / g.max_marks) * 100), 1) as average_grade_pct,
               COUNT(g.id) as exam_count
        FROM students s
        JOIN grades g ON s.id = g.student_id
        GROUP BY s.id, s.name, s.roll_no, s.class_name
        HAVING average_grade_pct < 60.0
    """)
    academic_alerts = cur.fetchall()

    # Recent grades
    cur.execute("""
        SELECT g.id, s.name as student_name, s.roll_no, sub.name as subject_name,
               g.exam, ROUND((g.marks / g.max_marks) * 100, 1) as percentage,
               COALESCE(g.remarks, 'Standard evaluation recorded') as remarks,
               g.created_at
        FROM grades g
        JOIN students s ON g.student_id = s.id
        JOIN subjects sub ON g.subject_id = sub.id
        ORDER BY g.id DESC
        LIMIT 6
    """)
    recent_grades = cur.fetchall()

    cur.close()
    conn.close()

    return jsonify({
        'total_students': total_students,
        'today_attendance': {
            'date': today_str,
            'total_students': total_students,
            'marked': marked,
            'presents': att_row['presents'] or 0,
            'lates': att_row['lates'] or 0,
            'absents': att_row['absents'] or 0,
            'not_marked': max(0, total_students - marked)
        },
        'attendance_alerts': attendance_alerts,
        'academic_alerts': academic_alerts,
        'recent_grades': recent_grades
    })

# =====================================================================
# Leave Requests API
# =====================================================================
@app.route('/api/leave-requests', methods=['GET'])
@login_required
@staff_required
def get_leave_requests():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT l.id, l.student_id, s.name as student_name, s.roll_no, s.class_name,
               l.leave_date, l.reason, l.status, l.reviewed_by, l.created_at
        FROM leave_requests l
        JOIN students s ON l.student_id = s.id
        ORDER BY l.id DESC
    """)
    records = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(records)

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
    cur = conn.cursor()
    cur.execute("""
        UPDATE leave_requests
        SET status = %s, reviewed_by = %s
        WHERE id = %s
    """, (status, user.get('username', 'teacher'), req_id))
    conn.commit()
    cur.close()
    conn.close()
    return jsonify({'message': f'Leave request {status.lower()} successfully.'})

@app.route('/api/student/leaves', methods=['GET'])
@login_required
def get_student_leaves():
    user = get_authenticated_user()
    s_id = user.get('student_id') or 1
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT id, leave_date, reason, status, reviewed_by, created_at
        FROM leave_requests
        WHERE student_id = %s
        ORDER BY id DESC
    """, (s_id,))
    records = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(records)

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
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO leave_requests (student_id, leave_date, reason, status, created_at)
        VALUES (%s, %s, %s, 'Pending', datetime('now'))
    """, (s_id, leave_date, reason))
    conn.commit()
    new_id = cur.lastrowid
    cur.close()
    conn.close()
    return jsonify({'message': 'Absence excuse note submitted for faculty review.', 'id': new_id}), 201

# =====================================================================
# Admin Users API
# =====================================================================
@app.route('/api/admin/users', methods=['GET'])
@login_required
@admin_required
def get_admin_users():
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT u.id, u.username, u.role, u.student_id,
               s.name as linked_student_name, s.roll_no as linked_student_roll
        FROM users u
        LEFT JOIN students s ON u.student_id = s.id
        ORDER BY u.id ASC
    """)
    users_list = cur.fetchall()
    cur.close()
    conn.close()
    return jsonify(users_list)

# =====================================================================
# Dashboard Stats API
# =====================================================================
@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) AS total_students FROM students")
    total_students = cur.fetchone()['total_students']

    today_str = datetime.date.today().isoformat()
    cur.execute("SELECT COUNT(*) AS present_today FROM attendance WHERE att_date = %s AND status = 'Present'", (today_str,))
    present_today = cur.fetchone()['present_today']

    cur.execute("""
        SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as total_presents,
            SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as total_lates
        FROM attendance
    """)
    att_row = cur.fetchone()
    tot_records = att_row['total_records'] or 0
    tot_presents = att_row['total_presents'] or 0
    tot_lates = att_row['total_lates'] or 0

    attendance_rate_pct = 0.0
    if tot_records > 0:
        attendance_rate_pct = round(((tot_presents + (tot_lates * 0.5)) / tot_records) * 100, 1)

    cur.execute("SELECT AVG((marks / max_marks) * 100) AS avg_pct FROM grades")
    grade_row = cur.fetchone()
    average_grade_pct = round(float(grade_row['avg_pct'] or 0.0), 1)

    cur.execute("""
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
    top_students = cur.fetchall()

    cur.close()
    conn.close()

    return jsonify({
        'total_students': total_students,
        'present_today': present_today,
        'attendance_rate_pct': attendance_rate_pct,
        'average_grade_pct': average_grade_pct,
        'top_students': top_students
    })

# =====================================================================
# HTML Single-Page App Entry Point & Static Files
# =====================================================================
@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    print(f"Student Information Portal (Flask API) active on http://0.0.0.0:{port}")
    app.run(host='0.0.0.0', port=port, debug=False)
