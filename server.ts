import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());
// Serve static directory directly
app.use('/static', express.static(path.resolve(__dirname, 'static')));

// In-Memory Data Storage (Mirrors MySQL schema)
interface User {
  id: number;
  username: string;
  passwordHash: string;
  role: 'admin' | 'teacher' | 'student';
  student_id?: number | null;
}

interface Student {
  id: number;
  roll_no: string;
  name: string;
  email: string;
  phone: string;
  class_name: string;
  dob: string;
  created_at: string;
}

interface Subject {
  id: number;
  name: string;
}

interface AttendanceRecord {
  id: number;
  student_id: number;
  att_date: string; // YYYY-MM-DD
  status: 'Present' | 'Absent' | 'Late';
}

interface GradeRecord {
  id: number;
  student_id: number;
  subject_id: number;
  exam: string;
  marks: number;
  max_marks: number;
  remarks?: string;
  created_at: string;
}

interface LeaveRequest {
  id: number;
  student_id: number;
  leave_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewed_by?: string;
  created_at: string;
}

// Memory Store with 3 Distinct Roles: Admin, Teacher, Student
const users: User[] = [
  { id: 1, username: 'admin', passwordHash: 'admin123', role: 'admin' },
  { id: 2, username: 'teacher', passwordHash: 'teacher123', role: 'teacher' },
  { id: 3, username: 'demo', passwordHash: 'demo123', role: 'student', student_id: 1 },
  { id: 4, username: 'student', passwordHash: 'student123', role: 'student', student_id: 1 }
];

let nextSubjectId = 6;
const subjects: Subject[] = [
  { id: 1, name: 'Mathematics' },
  { id: 2, name: 'Science' },
  { id: 3, name: 'English' },
  { id: 4, name: 'Social Studies' },
  { id: 5, name: 'Computer Science' }
];

let nextStudentId = 6;
const students: Student[] = [
  {
    id: 1,
    roll_no: 'CS-2024-001',
    name: 'Aiden Vance',
    email: 'aiden.vance@academy.edu',
    phone: '+1 (555) 234-5678',
    class_name: 'Grade 11-A',
    dob: '2008-04-12',
    created_at: '2024-09-01 09:00'
  },
  {
    id: 2,
    roll_no: 'CS-2024-002',
    name: 'Elena Rostova',
    email: 'elena.rostova@academy.edu',
    phone: '+1 (555) 345-6789',
    class_name: 'Grade 11-A',
    dob: '2008-09-24',
    created_at: '2024-09-01 09:05'
  },
  {
    id: 3,
    roll_no: 'CS-2024-003',
    name: 'Marcus Chen',
    email: 'marcus.chen@academy.edu',
    phone: '+1 (555) 456-7890',
    class_name: 'Grade 11-B',
    dob: '2008-01-18',
    created_at: '2024-09-01 09:10'
  },
  {
    id: 4,
    roll_no: 'CS-2024-004',
    name: 'Sophia Sterling',
    email: 'sophia.sterling@academy.edu',
    phone: '+1 (555) 567-8901',
    class_name: 'Grade 11-B',
    dob: '2008-11-05',
    created_at: '2024-09-01 09:15'
  },
  {
    id: 5,
    roll_no: 'CS-2024-005',
    name: 'Liam Gallagher',
    email: 'liam.gallagher@academy.edu',
    phone: '+1 (555) 678-9012',
    class_name: 'Grade 11-A',
    dob: '2008-07-30',
    created_at: '2024-09-01 09:20'
  }
];

const todayStr = new Date().toISOString().split('T')[0];
let nextAttendanceId = 6;
const attendance: AttendanceRecord[] = [
  { id: 1, student_id: 1, att_date: todayStr, status: 'Present' },
  { id: 2, student_id: 2, att_date: todayStr, status: 'Present' },
  { id: 3, student_id: 3, att_date: todayStr, status: 'Late' },
  { id: 4, student_id: 4, att_date: todayStr, status: 'Present' },
  { id: 5, student_id: 5, att_date: todayStr, status: 'Absent' }
];

let nextGradeId = 16;
const grades: GradeRecord[] = [
  // Aiden Vance
  { id: 1, student_id: 1, subject_id: 1, exam: 'Midterm Exam', marks: 94.0, max_marks: 100.0, remarks: 'Excellent algebraic proofs and analytical reasoning', created_at: '2024-10-15' },
  { id: 2, student_id: 1, subject_id: 2, exam: 'Midterm Exam', marks: 91.5, max_marks: 100.0, remarks: 'Great laboratory performance in optics', created_at: '2024-10-16' },
  { id: 3, student_id: 1, subject_id: 5, exam: 'Midterm Exam', marks: 98.0, max_marks: 100.0, remarks: 'Outstanding algorithmic implementation and code clarity', created_at: '2024-10-17' },

  // Elena Rostova
  { id: 4, student_id: 2, subject_id: 1, exam: 'Midterm Exam', marks: 88.0, max_marks: 100.0, remarks: 'Solid calculation skills', created_at: '2024-10-15' },
  { id: 5, student_id: 2, subject_id: 3, exam: 'Midterm Exam', marks: 95.0, max_marks: 100.0, remarks: 'Superb essay structure and critical analysis', created_at: '2024-10-16' },
  { id: 6, student_id: 2, subject_id: 5, exam: 'Midterm Exam', marks: 92.5, max_marks: 100.0, remarks: 'Consistent programming style and thorough testing', created_at: '2024-10-17' },

  // Marcus Chen
  { id: 7, student_id: 3, subject_id: 1, exam: 'Midterm Exam', marks: 82.0, max_marks: 100.0, remarks: 'Good grasp of fundamentals', created_at: '2024-10-15' },
  { id: 8, student_id: 3, subject_id: 2, exam: 'Midterm Exam', marks: 85.0, max_marks: 100.0, remarks: 'Thorough scientific report writeup', created_at: '2024-10-16' },
  { id: 9, student_id: 3, subject_id: 4, exam: 'Midterm Exam', marks: 79.5, max_marks: 100.0, remarks: 'Needs more elaboration on historical dates', created_at: '2024-10-17' },

  // Sophia Sterling
  { id: 10, student_id: 4, subject_id: 2, exam: 'Midterm Exam', marks: 96.0, max_marks: 100.0, remarks: 'Top scores in organic chemistry unit', created_at: '2024-10-15' },
  { id: 11, student_id: 4, subject_id: 3, exam: 'Midterm Exam', marks: 92.0, max_marks: 100.0, remarks: 'Vibrant vocabulary and speech delivery', created_at: '2024-10-16' },
  { id: 12, student_id: 4, subject_id: 4, exam: 'Midterm Exam', marks: 94.5, max_marks: 100.0, remarks: 'Insightful sociological perspectives', created_at: '2024-10-17' },

  // Liam Gallagher
  { id: 13, student_id: 5, subject_id: 1, exam: 'Midterm Exam', marks: 76.5, max_marks: 100.0, remarks: 'Review trigonometry formulas before next quiz', created_at: '2024-10-15' },
  { id: 14, student_id: 5, subject_id: 4, exam: 'Midterm Exam', marks: 84.0, max_marks: 100.0, remarks: 'Constructive participation in debates', created_at: '2024-10-16' },
  { id: 15, student_id: 5, subject_id: 5, exam: 'Midterm Exam', marks: 88.5, max_marks: 100.0, remarks: 'Completed database normalization schema cleanly', created_at: '2024-10-17' }
];

let nextLeaveId = 3;
const leaveRequests: LeaveRequest[] = [
  {
    id: 1,
    student_id: 1,
    leave_date: todayStr,
    reason: 'Attending regional mathematics olympiad finals.',
    status: 'Approved',
    reviewed_by: 'teacher',
    created_at: '2024-10-01 08:30'
  },
  {
    id: 2,
    student_id: 3,
    leave_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    reason: 'Dental checkup appointment with specialist.',
    status: 'Pending',
    created_at: '2024-10-02 09:15'
  }
];

// Active Sessions map
interface SessionData {
  id: number;
  username: string;
  role: 'admin' | 'teacher' | 'student';
  student_id?: number | null;
}
const activeSessions = new Map<string, SessionData>();

// Helper to extract session from Authorization header or Cookie
function getSessionFromReq(req: Request): SessionData | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (activeSessions.has(token)) {
      return activeSessions.get(token)!;
    }
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/session_id=([^;]+)/);
    if (match && activeSessions.has(match[1])) {
      return activeSessions.get(match[1])!;
    }
  }
  return null;
}

// Authentication Middleware
function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = getSessionFromReq(req);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized. Please sign in to access this resource.' });
  }
  (req as any).user = session;
  next();
}

// Role: Admin Only (Student enrollments, DB architecture, system controls)
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).user as SessionData;
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Access denied: Only Administrators have permission to modify student enrollment records.' });
  }
  next();
}

// Role: Staff Only (Admin & Teacher can record attendance and grades)
function requireStaff(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).user as SessionData;
  if (!session || (session.role !== 'admin' && session.role !== 'teacher')) {
    return res.status(403).json({ error: 'Access denied: Students cannot alter academic records or attendance.' });
  }
  next();
}

// =====================================================================
// AUTH ROUTES
// =====================================================================
app.post('/api/register', (req: Request, res: Response) => {
  const { username, password, role = 'student' } = req.body || {};
  const cleanUsername = (username || '').trim();
  const cleanPassword = password || '';

  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }
  if (cleanPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const existing = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: `The username '${cleanUsername}' is already taken. Please choose another.` });
  }

  const userRole = ['admin', 'teacher', 'student'].includes(role) ? role : 'student';
  const newUser: User = {
    id: users.length + 1,
    username: cleanUsername,
    passwordHash: cleanPassword,
    role: userRole,
    student_id: userRole === 'student' ? 1 : null
  };
  users.push(newUser);

  // Auto sign-in
  const sessionId = crypto.randomUUID();
  activeSessions.set(sessionId, { id: newUser.id, username: newUser.username, role: newUser.role, student_id: newUser.student_id });
  res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure`);

  return res.status(201).json({
    message: 'Account created successfully.',
    token: sessionId,
    user: { id: newUser.id, username: newUser.username, role: newUser.role, student_id: newUser.student_id }
  });
});

app.post('/api/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const cleanUsername = (username || '').trim();
  const cleanPassword = password || '';

  if (!cleanUsername || !cleanPassword) {
    return res.status(400).json({ error: 'Both username and password are required.' });
  }

  const user = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (!user || user.passwordHash !== cleanPassword) {
    return res.status(401).json({ error: 'Invalid username or password. Please try again.' });
  }

  const sessionId = crypto.randomUUID();
  activeSessions.set(sessionId, { id: user.id, username: user.username, role: user.role, student_id: user.student_id });
  res.setHeader('Set-Cookie', `session_id=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure`);

  return res.status(200).json({
    message: 'Sign in successful.',
    token: sessionId,
    user: { id: user.id, username: user.username, role: user.role, student_id: user.student_id }
  });
});

app.post('/api/logout', (req: Request, res: Response) => {
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/session_id=([^;]+)/);
    if (match) {
      activeSessions.delete(match[1]);
    }
  }
  res.setHeader('Set-Cookie', 'session_id=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly');
  return res.status(200).json({ message: 'Logged out successfully.' });
});

app.get('/api/me', (req: Request, res: Response) => {
  const session = getSessionFromReq(req);
  if (session) {
    return res.status(200).json({ authenticated: true, user: session });
  }
  return res.status(401).json({ authenticated: false, user: null });
});

// Dedicated Student Portal Personal View
app.get('/api/student/portal', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  const sId = session.student_id || 1;
  const student = students.find(s => s.id === sId) || students[0];

  const myAttendance = attendance.filter(a => a.student_id === student.id).sort((a, b) => b.att_date.localeCompare(a.att_date));
  const presents = myAttendance.filter(a => a.status === 'Present').length;
  const lates = myAttendance.filter(a => a.status === 'Late').length;
  const absents = myAttendance.filter(a => a.status === 'Absent').length;
  const totalDays = myAttendance.length;
  const attRate = totalDays > 0 ? parseFloat((((presents + (lates * 0.5)) / totalDays) * 100).toFixed(1)) : 100.0;

  const myGrades = grades.filter(g => g.student_id === student.id).map(g => {
    const subject = subjects.find(s => s.id === g.subject_id);
    const pct = parseFloat(((g.marks / g.max_marks) * 100).toFixed(1));
    return {
      id: g.id,
      exam: g.exam,
      subject_name: subject ? subject.name : 'Unknown',
      marks: g.marks,
      max_marks: g.max_marks,
      percentage: pct,
      remarks: g.remarks || 'Standard evaluation recorded',
      created_at: g.created_at
    };
  });

  const avgGrade = myGrades.length > 0
    ? parseFloat((myGrades.reduce((sum, g) => sum + g.percentage, 0) / myGrades.length).toFixed(1))
    : 0.0;

  return res.json({
    student,
    attendance: {
      records: myAttendance,
      total_days: totalDays,
      presents,
      lates,
      absents,
      attendance_rate_pct: attRate
    },
    grades: {
      records: myGrades,
      average_grade_pct: avgGrade,
      total_exams: myGrades.length
    }
  });
});

// =====================================================================
// STUDENTS ROUTES
// =====================================================================
app.get('/api/students', requireAuth, (req: Request, res: Response) => {
  const sorted = [...students].sort((a, b) => a.roll_no.localeCompare(b.roll_no));
  return res.json(sorted);
});

app.post('/api/students', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { roll_no, name, email, phone, class_name, dob } = req.body || {};
  const cleanRoll = (roll_no || '').trim();
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim();
  const cleanClass = (class_name || '').trim();

  if (!cleanRoll) return res.status(400).json({ error: 'Roll number is required.' });
  if (!cleanName) return res.status(400).json({ error: 'Student name is required.' });
  if (!cleanEmail) return res.status(400).json({ error: 'Student email is required.' });
  if (!cleanClass) return res.status(400).json({ error: 'Class name is required.' });

  const duplicate = students.find(s => s.roll_no.toLowerCase() === cleanRoll.toLowerCase());
  if (duplicate) {
    return res.status(400).json({ error: `Roll number '${cleanRoll}' is already assigned to another student.` });
  }

  const newStudent: Student = {
    id: nextStudentId++,
    roll_no: cleanRoll,
    name: cleanName,
    email: cleanEmail,
    phone: (phone || '').trim(),
    class_name: cleanClass,
    dob: dob || '',
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 16)
  };
  students.push(newStudent);

  return res.status(201).json({ message: 'Student created successfully.', id: newStudent.id });
});

app.put('/api/students/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { roll_no, name, email, phone, class_name, dob } = req.body || {};
  const cleanRoll = (roll_no || '').trim();
  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim();
  const cleanClass = (class_name || '').trim();

  const student = students.find(s => s.id === id);
  if (!student) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  const duplicate = students.find(s => s.id !== id && s.roll_no.toLowerCase() === cleanRoll.toLowerCase());
  if (duplicate) {
    return res.status(400).json({ error: `Roll number '${cleanRoll}' is already assigned to another student.` });
  }

  student.roll_no = cleanRoll;
  student.name = cleanName;
  student.email = cleanEmail;
  student.phone = (phone || '').trim();
  student.class_name = cleanClass;
  student.dob = dob || '';

  return res.json({ message: 'Student updated successfully.' });
});

app.delete('/api/students/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = students.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  students.splice(index, 1);
  // Cascade delete attendance & grades
  for (let i = attendance.length - 1; i >= 0; i--) {
    if (attendance[i].student_id === id) attendance.splice(i, 1);
  }
  for (let i = grades.length - 1; i >= 0; i--) {
    if (grades[i].student_id === id) grades.splice(i, 1);
  }

  return res.json({ message: 'Student and all associated records deleted successfully.' });
});

// =====================================================================
// SUBJECTS ROUTES
// =====================================================================
app.get('/api/subjects', requireAuth, (req: Request, res: Response) => {
  return res.json(subjects);
});

app.post('/api/subjects', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const { name } = req.body || {};
  const cleanName = (name || '').trim();
  if (!cleanName) {
    return res.status(400).json({ error: 'Subject name is required.' });
  }

  const existing = subjects.find(s => s.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: `Subject '${cleanName}' already exists in curriculum.` });
  }

  const newSubject: Subject = {
    id: nextSubjectId++,
    name: cleanName
  };
  subjects.push(newSubject);
  return res.status(201).json({ message: 'Subject added to curriculum successfully.', subject: newSubject });
});

app.delete('/api/subjects/:id', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = subjects.findIndex(s => s.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Subject not found.' });
  }

  // Prevent deletion if existing grades link to this subject
  const hasGrades = grades.some(g => g.subject_id === id);
  if (hasGrades) {
    return res.status(400).json({ error: 'Cannot delete subject: Student examination records are associated with this subject.' });
  }

  subjects.splice(index, 1);
  return res.json({ message: 'Subject removed from curriculum.' });
});

// =====================================================================
// ATTENDANCE ROUTES
// =====================================================================
app.get('/api/attendance', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  const dateQuery = (req.query.date as string) || new Date().toISOString().split('T')[0];

  // If student role, only show student's own attendance
  const studentList = session.role === 'student'
    ? students.filter(s => s.id === (session.student_id || 1))
    : students;

  const results = studentList.map(s => {
    const existing = attendance.find(a => a.student_id === s.id && a.att_date === dateQuery);
    return {
      student_id: s.id,
      roll_no: s.roll_no,
      name: s.name,
      class_name: s.class_name,
      status: existing ? existing.status : 'Present',
      att_date: dateQuery
    };
  });

  return res.json(results);
});

app.post('/api/attendance', requireAuth, requireStaff, (req: Request, res: Response) => {
  const records = req.body;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Payload must be a non-empty array of attendance records.' });
  }

  for (const item of records) {
    const { student_id, att_date, status } = item;
    if (student_id && att_date && ['Present', 'Absent', 'Late'].includes(status)) {
      const existing = attendance.find(a => a.student_id === student_id && a.att_date === att_date);
      if (existing) {
        existing.status = status;
      } else {
        attendance.push({
          id: nextAttendanceId++,
          student_id,
          att_date,
          status
        });
      }
    }
  }

  return res.json({ message: `Attendance for ${records.length} student(s) updated successfully.` });
});

// =====================================================================
// GRADES ROUTES
// =====================================================================
app.get('/api/grades', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  let studentIdQuery = req.query.student_id ? parseInt(req.query.student_id as string, 10) : null;

  // Student can only query their own grades
  if (session.role === 'student') {
    studentIdQuery = session.student_id || 1;
  }

  let filtered = grades;
  if (studentIdQuery) {
    filtered = grades.filter(g => g.student_id === studentIdQuery);
  }

  const results = filtered.map(g => {
    const student = students.find(s => s.id === g.student_id);
    const subject = subjects.find(sub => sub.id === g.subject_id);
    const pct = ((g.marks / g.max_marks) * 100).toFixed(1);

    return {
      id: g.id,
      student_id: g.student_id,
      subject_id: g.subject_id,
      exam: g.exam,
      marks: g.marks,
      max_marks: g.max_marks,
      remarks: g.remarks || 'Standard evaluation recorded',
      percentage: pct,
      student_name: student ? student.name : 'Unknown',
      roll_no: student ? student.roll_no : 'Unknown',
      class_name: student ? student.class_name : 'Unknown',
      subject_name: subject ? subject.name : 'Unknown'
    };
  });

  return res.json(results);
});

app.post('/api/grades', requireAuth, requireStaff, (req: Request, res: Response) => {
  const { student_id, subject_id, exam, marks, max_marks = 100.0, remarks = '' } = req.body || {};
  const sId = parseInt(student_id, 10);
  const subId = parseInt(subject_id, 10);
  const cleanExam = (exam || '').trim();
  const m = parseFloat(marks);
  const mm = parseFloat(max_marks);
  const cleanRemarks = (remarks || '').trim();

  if (!sId || !subId || !cleanExam || isNaN(m)) {
    return res.status(400).json({ error: 'Student, Subject, Exam Name, and Marks are required.' });
  }

  if (mm <= 0) return res.status(400).json({ error: 'Max marks must be greater than 0.' });
  if (m < 0 || m > mm) return res.status(400).json({ error: `Marks must be between 0 and ${mm}.` });

  const newGrade: GradeRecord = {
    id: nextGradeId++,
    student_id: sId,
    subject_id: subId,
    exam: cleanExam,
    marks: m,
    max_marks: mm,
    remarks: cleanRemarks || 'Assessment completed successfully',
    created_at: new Date().toISOString().split('T')[0]
  };
  grades.unshift(newGrade);

  return res.status(201).json({ message: 'Grade record saved successfully.', id: newGrade.id });
});

app.delete('/api/grades/:id', requireAuth, requireStaff, (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const index = grades.findIndex(g => g.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Grade record not found.' });
  }
  grades.splice(index, 1);
  return res.json({ message: 'Grade deleted successfully.' });
});

// =====================================================================
// TEACHER WORKSPACE & ACADEMIC ALERTS ROUTE
// =====================================================================
app.get('/api/teacher/dashboard', requireAuth, requireStaff, (req: Request, res: Response) => {
  const currentToday = new Date().toISOString().split('T')[0];
  const total_students = students.length;

  const todayAtt = attendance.filter(a => a.att_date === currentToday);
  const presents = todayAtt.filter(a => a.status === 'Present').length;
  const lates = todayAtt.filter(a => a.status === 'Late').length;
  const absents = todayAtt.filter(a => a.status === 'Absent').length;
  const not_marked = Math.max(0, total_students - todayAtt.length);

  // Student-level attendance analysis for warnings (< 75%)
  const attendanceAlerts = students.map(s => {
    const sAtt = attendance.filter(a => a.student_id === s.id);
    if (sAtt.length === 0) return null;
    const p = sAtt.filter(a => a.status === 'Present').length;
    const l = sAtt.filter(a => a.status === 'Late').length;
    const rate = parseFloat((((p + (l * 0.5)) / sAtt.length) * 100).toFixed(1));
    if (rate < 75.0) {
      return {
        id: s.id,
        name: s.name,
        roll_no: s.roll_no,
        class_name: s.class_name,
        attendance_rate_pct: rate,
        absent_count: sAtt.filter(a => a.status === 'Absent').length,
        total_sessions: sAtt.length
      };
    }
    return null;
  }).filter(Boolean);

  // Student-level grades analysis for academic alerts (< 60%)
  const academicAlerts = students.map(s => {
    const sGrades = grades.filter(g => g.student_id === s.id);
    if (sGrades.length === 0) return null;
    const avg = sGrades.reduce((sum, g) => sum + (g.marks / g.max_marks) * 100, 0) / sGrades.length;
    if (avg < 60.0) {
      return {
        id: s.id,
        name: s.name,
        roll_no: s.roll_no,
        class_name: s.class_name,
        average_grade_pct: parseFloat(avg.toFixed(1)),
        exam_count: sGrades.length
      };
    }
    return null;
  }).filter(Boolean);

  // Recent grades entered
  const recentGrades = grades.slice(0, 6).map(g => {
    const student = students.find(s => s.id === g.student_id);
    const subject = subjects.find(sub => sub.id === g.subject_id);
    return {
      id: g.id,
      student_name: student ? student.name : 'Unknown',
      roll_no: student ? student.roll_no : 'Unknown',
      subject_name: subject ? subject.name : 'Unknown',
      exam: g.exam,
      percentage: ((g.marks / g.max_marks) * 100).toFixed(1),
      remarks: g.remarks || 'Standard evaluation recorded',
      created_at: g.created_at
    };
  });

  const pendingLeaves = leaveRequests.filter(l => l.status === 'Pending').length;

  return res.json({
    total_students,
    today_attendance: {
      date: currentToday,
      total_students,
      marked: todayAtt.length,
      presents,
      lates,
      absents,
      not_marked,
      is_complete: not_marked === 0
    },
    attendance_alerts: attendanceAlerts,
    academic_alerts: academicAlerts,
    recent_grades: recentGrades,
    pending_leaves_count: pendingLeaves
  });
});

// =====================================================================
// LEAVE REQUESTS & ABSENCE NOTES ROUTES
// =====================================================================
app.get('/api/leave-requests', requireAuth, requireStaff, (req: Request, res: Response) => {
  const results = leaveRequests.map(l => {
    const student = students.find(s => s.id === l.student_id);
    return {
      id: l.id,
      student_id: l.student_id,
      student_name: student ? student.name : 'Unknown',
      roll_no: student ? student.roll_no : 'Unknown',
      class_name: student ? student.class_name : 'Unknown',
      leave_date: l.leave_date,
      reason: l.reason,
      status: l.status,
      reviewed_by: l.reviewed_by || null,
      created_at: l.created_at
    };
  }).sort((a, b) => b.id - a.id);

  return res.json(results);
});

app.post('/api/leave-requests/:id/review', requireAuth, requireStaff, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be either Approved or Rejected.' });
  }

  const reqItem = leaveRequests.find(l => l.id === id);
  if (!reqItem) {
    return res.status(404).json({ error: 'Leave request not found.' });
  }

  reqItem.status = status;
  reqItem.reviewed_by = session.username;

  return res.json({ message: `Leave request ${status.toLowerCase()} successfully.`, request: reqItem });
});

// Student's own leave requests
app.get('/api/student/leaves', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  const sId = session.student_id || 1;
  const myLeaves = leaveRequests.filter(l => l.student_id === sId).sort((a, b) => b.id - a.id);
  return res.json(myLeaves);
});

app.post('/api/student/leaves', requireAuth, (req: Request, res: Response) => {
  const session = (req as any).user as SessionData;
  const sId = session.student_id || 1;
  const { leave_date, reason } = req.body || {};
  const cleanReason = (reason || '').trim();

  if (!leave_date || !cleanReason) {
    return res.status(400).json({ error: 'Date of absence and reason are required.' });
  }

  const newLeave: LeaveRequest = {
    id: nextLeaveId++,
    student_id: sId,
    leave_date,
    reason: cleanReason,
    status: 'Pending',
    created_at: new Date().toISOString().replace('T', ' ').slice(0, 16)
  };
  leaveRequests.unshift(newLeave);

  return res.status(201).json({ message: 'Absence excuse note submitted for faculty review.', request: newLeave });
});

// =====================================================================
// ADMIN USER ACCOUNTS & SYSTEM STATS ROUTES
// =====================================================================
app.get('/api/admin/users', requireAuth, requireAdmin, (req: Request, res: Response) => {
  const userList = users.map(u => {
    const linkedStudent = u.student_id ? students.find(s => s.id === u.student_id) : null;
    return {
      id: u.id,
      username: u.username,
      role: u.role,
      student_id: u.student_id || null,
      linked_student_name: linkedStudent ? linkedStudent.name : null,
      linked_student_roll: linkedStudent ? linkedStudent.roll_no : null
    };
  });
  return res.json(userList);
});

app.get('/api/admin/system-stats', requireAuth, requireAdmin, (req: Request, res: Response) => {
  return res.json({
    total_users: users.length,
    total_students: students.length,
    total_subjects: subjects.length,
    total_grades_logged: grades.length,
    total_attendance_records: attendance.length,
    pending_leaves_count: leaveRequests.filter(l => l.status === 'Pending').length,
    server_time: new Date().toISOString(),
    database_engine: 'MySQL 8.3 / Memory Bridge (Operational)',
    system_version: 'v2.4-enterprise-academic'
  });
});

// =====================================================================
// STATS ROUTE
// =====================================================================
app.get('/api/stats', requireAuth, (req: Request, res: Response) => {
  const total_students = students.length;
  const currentToday = new Date().toISOString().split('T')[0];

  const present_today = attendance.filter(a => a.att_date === currentToday && a.status === 'Present').length;

  let attendance_rate_pct = 0.0;
  if (attendance.length > 0) {
    const presents = attendance.filter(a => a.status === 'Present').length;
    const lates = attendance.filter(a => a.status === 'Late').length;
    attendance_rate_pct = parseFloat((((presents + (lates * 0.5)) / attendance.length) * 100).toFixed(1));
  }

  let average_grade_pct = 0.0;
  if (grades.length > 0) {
    const sumPct = grades.reduce((acc, g) => acc + (g.marks / g.max_marks) * 100, 0);
    average_grade_pct = parseFloat((sumPct / grades.length).toFixed(1));
  }

  // Top 5 students
  const studentGradesMap: { [studentId: number]: number[] } = {};
  grades.forEach(g => {
    if (!studentGradesMap[g.student_id]) studentGradesMap[g.student_id] = [];
    studentGradesMap[g.student_id].push((g.marks / g.max_marks) * 100);
  });

  const rankedStudents = Object.keys(studentGradesMap).map(sIdStr => {
    const sId = parseInt(sIdStr, 10);
    const student = students.find(s => s.id === sId);
    const scores = studentGradesMap[sId];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return {
      id: sId,
      name: student ? student.name : 'Unknown',
      roll_no: student ? student.roll_no : 'Unknown',
      class_name: student ? student.class_name : 'Unknown',
      average_pct: parseFloat(avg.toFixed(1)),
      exam_count: scores.length
    };
  }).sort((a, b) => b.average_pct - a.average_pct).slice(0, 5);

  return res.json({
    total_students,
    present_today,
    attendance_rate_pct,
    average_grade_pct,
    top_students: rankedStudents
  });
});

// Setup Vite or static serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Student Information Portal running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
