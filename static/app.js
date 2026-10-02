/**
 * Student Information Portal - Vanilla JavaScript Application Controller
 * High-performance SPA controller handling role-based views (Admin, Teacher, Student),
 * real-time API integrations, 3D spatial tilt effects, safe HTML escaping,
 * printable academic transcripts, and accessible modal feedback.
 */

// Application State
const state = {
  authToken: '',
  currentUser: null,
  currentTab: 'dashboard',
  authMode: 'signin',
  stats: {},
  students: [],
  subjects: [],
  attendance: [],
  grades: [],
  teacherData: null,
  studentPortalData: null,
  leaveRequests: [],
  studentLeaves: [],
  usersList: [],
  selectedGradeStudentId: null,
  studentSearchQuery: '',
  activeAttendanceDate: new Date().toISOString().split('T')[0],
  pendingDeleteAction: null
};

// =====================================================================
// Utility: XSS Escaping & Safe HTML
// =====================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Token management in storage
function getAuthToken() {
  if (state.authToken) return state.authToken;
  try {
    const token = localStorage.getItem('sip_auth_token') || sessionStorage.getItem('sip_auth_token') || '';
    state.authToken = token;
    return token;
  } catch (e) {
    return '';
  }
}

function setAuthToken(token) {
  state.authToken = token;
  try {
    if (token) {
      localStorage.setItem('sip_auth_token', token);
      sessionStorage.setItem('sip_auth_token', token);
    } else {
      localStorage.removeItem('sip_auth_token');
      sessionStorage.removeItem('sip_auth_token');
    }
  } catch (e) {
    // Ignore storage quota errors
  }
}

// Global API Fetch wrapper with credentials and Authorization header
async function apiFetch(endpoint, options = {}) {
  const token = getAuthToken();
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers
  });
}

// =====================================================================
// Toast Notification Engine
// =====================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'alert');

  const textSpan = document.createElement('span');
  textSpan.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'toast-close-btn';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Dismiss Notification');
  closeBtn.onclick = () => {
    toast.remove();
  };

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  // Auto remove after 4.5 seconds
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      toast.style.transition = 'all 200ms ease';
      setTimeout(() => toast.remove(), 220);
    }
  }, 4500);
}

// =====================================================================
// Cursor Tracking & 3D Spatial Tilt Interactions
// =====================================================================
function initSpatialEffects() {
  document.addEventListener('pointermove', (e) => {
    const panels = document.querySelectorAll('[data-tilt-panel], [data-tilt-card]');
    panels.forEach((panel) => {
      const rect = panel.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      panel.style.setProperty('--mouse-x', `${x}px`);
      panel.style.setProperty('--mouse-y', `${y}px`);
    });
  });

  const statCards = document.querySelectorAll('[data-tilt-card]');
  statCards.forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const rect = card.getBoundingClientRect();
      const cardWidth = rect.width;
      const cardHeight = rect.height;
      const centerX = rect.left + cardWidth / 2;
      const centerY = rect.top + cardHeight / 2;

      const mouseX = e.clientX - centerX;
      const mouseY = e.clientY - centerY;

      const rotateX = -(mouseY / (cardHeight / 2)) * 8;
      const rotateY = (mouseX / (cardWidth / 2)) * 8;

      card.style.transform = `perspective(1000px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translateY(-4px)`;
    });

    card.addEventListener('pointerleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
      card.style.transition = 'transform 400ms cubic-bezier(0.16, 1, 0.3, 1)';
    });

    card.addEventListener('pointerenter', () => {
      card.style.transition = 'transform 100ms ease-out';
    });
  });
}

// =====================================================================
// Authentication & Session Management
// =====================================================================
function switchAuthMode(mode) {
  state.authMode = mode;
  const tabSignIn = document.getElementById('tabSignIn');
  const tabRegister = document.getElementById('tabRegister');
  const submitLabel = document.getElementById('authSubmitLabel');
  const passwordHint = document.getElementById('passwordHint');
  const roleGroup = document.getElementById('authRoleGroup');

  if (mode === 'signin') {
    tabSignIn.classList.add('active');
    tabRegister.classList.remove('active');
    submitLabel.textContent = 'Sign In';
    if (passwordHint) passwordHint.classList.add('hidden');
    if (roleGroup) roleGroup.classList.add('hidden');
  } else {
    tabSignIn.classList.remove('active');
    tabRegister.classList.add('active');
    submitLabel.textContent = 'Create Account & Sign In';
    if (passwordHint) passwordHint.classList.remove('hidden');
    if (roleGroup) roleGroup.classList.remove('hidden');
  }
}

function fillDemo(username, password) {
  const userInput = document.getElementById('authUsername');
  const passInput = document.getElementById('authPassword');
  if (userInput && passInput) {
    userInput.value = username;
    passInput.value = password;
    switchAuthMode('signin');
    const form = document.getElementById('authForm');
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    } else if (form) {
      const event = new Event('submit', { cancelable: true });
      form.dispatchEvent(event);
    }
  }
}

async function quickSwitchRole(role) {
  let u = 'admin';
  let p = 'admin123';
  if (role === 'teacher') {
    u = 'teacher';
    p = 'teacher123';
  } else if (role === 'demo' || role === 'student') {
    u = 'demo';
    p = 'demo123';
  }

  try {
    const res = await apiFetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    const data = await res.json();
    if (res.ok) {
      if (data.token) setAuthToken(data.token);
      state.currentUser = data.user;
      showToast(`Switched persona to ${data.user.role.toUpperCase()}: ${data.user.username}`, 'success');
      renderAuthenticatedShell();
    }
  } catch (e) {
    showToast('Failed to switch persona.', 'error');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const roleSelect = document.getElementById('authRoleSelect');
  const role = roleSelect ? roleSelect.value : 'student';
  const submitBtn = document.getElementById('authSubmitBtn');

  if (!username || !password) {
    showToast('Please enter both username and password.', 'error');
    return;
  }

  submitBtn.disabled = true;
  const endpoint = state.authMode === 'register' ? '/api/register' : '/api/login';
  const payload = state.authMode === 'register' ? { username, password, role } : { username, password };

  try {
    const res = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Authentication failed.', 'error');
      submitBtn.disabled = false;
      return;
    }

    if (data.token) {
      setAuthToken(data.token);
    }
    state.currentUser = data.user;
    showToast(data.message || 'Welcome!', 'success');
    renderAuthenticatedShell();
  } catch (err) {
    showToast('Network error while authenticating.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function checkAuthSession() {
  try {
    const res = await apiFetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      if (data.authenticated && data.user) {
        state.currentUser = data.user;
        renderAuthenticatedShell();
        return;
      }
    }
  } catch (err) {
    // Session check fallback
  }
  renderUnauthenticatedView();
}

async function handleLogout() {
  try {
    await apiFetch('/api/logout', { method: 'POST' });
  } catch (err) {
    // Ignore error
  }
  setAuthToken('');
  state.currentUser = null;
  window.location.hash = '';
  showToast('You have been signed out.', 'info');
  renderUnauthenticatedView();
}

// =====================================================================
// Role Workspace & UI Control Engine
// =====================================================================
function updateUIAccessControl() {
  const user = state.currentUser;
  if (!user) return;

  const role = user.role || 'student';

  // 1. Sidebar Nav Groups
  const groupAdmin = document.getElementById('navGroupAdmin');
  const groupTeacher = document.getElementById('navGroupTeacher');
  const groupStudent = document.getElementById('navGroupStudent');

  if (groupAdmin) groupAdmin.classList.toggle('hidden', role !== 'admin');
  if (groupTeacher) groupTeacher.classList.toggle('hidden', role !== 'teacher');
  if (groupStudent) groupStudent.classList.toggle('hidden', role !== 'student');

  // 2. Role Workspace Banner
  const chip = document.getElementById('currentRoleChip');
  const dutyDesc = document.getElementById('roleDutyDescription');
  const subNav = document.getElementById('sidebarSubNav');

  const btnAdmin = document.getElementById('btnSwitchAdmin');
  const btnTeacher = document.getElementById('btnSwitchTeacher');
  const btnStudent = document.getElementById('btnSwitchStudent');

  if (btnAdmin) btnAdmin.classList.toggle('active-role', role === 'admin');
  if (btnTeacher) btnTeacher.classList.toggle('active-role', role === 'teacher');
  if (btnStudent) btnStudent.classList.toggle('active-role', role === 'student');

  if (chip && dutyDesc) {
    chip.className = 'role-indicator-chip';
    if (role === 'admin') {
      chip.classList.add('role-chip-admin');
      chip.textContent = '👑 Administrator';
      dutyDesc.textContent = 'Managing Student Admissions, Curriculum Offerings & System Operations';
      if (subNav) subNav.textContent = 'Admissions & Admin';
    } else if (role === 'teacher') {
      chip.classList.add('role-chip-teacher');
      chip.textContent = '🍎 Faculty Instructor';
      dutyDesc.textContent = 'Daily Roll Call, Gradebook Assessments, Academic Alerts & Leave Reviews';
      if (subNav) subNav.textContent = 'Faculty Workspace';
    } else {
      chip.classList.add('role-chip-student');
      chip.textContent = '🎓 Enrolled Student';
      dutyDesc.textContent = 'Personal Academic ID, Attendance Tracker, Report Card & Absence Notes';
      if (subNav) subNav.textContent = 'Student Desk';
    }
  }

  // 3. User Avatar & Badge in Sidebar Footer
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userDisplayName');
  const roleBadge = document.getElementById('userRoleBadge');

  if (nameEl) nameEl.textContent = user.username;
  if (avatarEl) avatarEl.textContent = (user.username || 'U').charAt(0).toUpperCase();

  if (roleBadge) {
    roleBadge.className = 'user-role-badge';
    if (role === 'admin') {
      roleBadge.classList.add('badge-role-admin');
      roleBadge.textContent = 'Administrator';
    } else if (role === 'teacher') {
      roleBadge.classList.add('badge-role-teacher');
      roleBadge.textContent = 'Faculty Teacher';
    } else {
      roleBadge.classList.add('badge-role-student');
      roleBadge.textContent = 'Student';
    }
  }

  // 4. Admin vs Teacher student table permissions
  const adminStudentActions = document.getElementById('adminStudentActions');
  const studentsSubDesc = document.getElementById('studentsSubDesc');
  if (adminStudentActions) {
    adminStudentActions.style.display = role === 'admin' ? 'flex' : 'none';
  }
  if (studentsSubDesc) {
    if (role === 'admin') {
      studentsSubDesc.textContent = 'Manage enrollments, update academic profiles, and assign student records.';
    } else if (role === 'teacher') {
      studentsSubDesc.textContent = 'Class roster directory for academic evaluation and progress monitoring.';
    } else {
      studentsSubDesc.textContent = 'Directory of fellow enrolled scholars in your class.';
    }
  }
}

function renderAuthenticatedShell() {
  const authView = document.getElementById('authView');
  const appShell = document.getElementById('appShell');

  if (authView) authView.classList.add('hidden');
  if (appShell) appShell.classList.remove('hidden');

  updateUIAccessControl();

  // Route to the appropriate home tab based on role
  const role = state.currentUser ? state.currentUser.role : 'admin';
  const currentHash = (window.location.hash || '').replace('#', '');

  let defaultTab = 'dashboard';
  if (role === 'teacher') defaultTab = 'teacherHub';
  if (role === 'student') defaultTab = 'studentPortal';

  const validTabsForRole = {
    admin: ['dashboard', 'students', 'subjects', 'users', 'attendance', 'grades', 'setup'],
    teacher: ['teacherHub', 'attendance', 'grades', 'students', 'leaveReview'],
    student: ['studentPortal', 'studentAttendance', 'studentReportCard', 'studentLeave', 'studentCourses']
  };

  const allowedTabs = validTabsForRole[role] || validTabsForRole.admin;
  const targetTab = allowedTabs.includes(currentHash) ? currentHash : defaultTab;

  navigateToTab(targetTab);
  loadPortalData();
}

function renderUnauthenticatedView() {
  const appShell = document.getElementById('appShell');
  const authView = document.getElementById('authView');
  const pwdInput = document.getElementById('authPassword');

  if (appShell) appShell.classList.add('hidden');
  if (authView) authView.classList.remove('hidden');
  if (pwdInput) pwdInput.value = '';
}

// =====================================================================
// Navigation & Tab Switching
// =====================================================================
function navigateToTab(tabName) {
  state.currentTab = tabName;

  try {
    if (window.location.hash !== `#${tabName}`) {
      window.location.hash = tabName;
    }
  } catch (e) {
    // Ignore
  }

  // Update sidebar active buttons
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach((btn) => {
    if (btn.dataset.tab === tabName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Close mobile sidebar if open
  const sidebar = document.getElementById('mainSidebar');
  if (sidebar) sidebar.classList.remove('mobile-open');

  // Switch visible tab pane
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabPanes.forEach((pane) => {
    pane.classList.add('hidden');
    pane.classList.remove('active');
  });

  const activeId = `tabView${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
  const activePane = document.getElementById(activeId);
  if (activePane) {
    activePane.classList.remove('hidden');
    activePane.classList.add('active');
  }

  // Trigger tab-specific refresh
  if (tabName === 'dashboard') {
    fetchStats();
  } else if (tabName === 'teacherHub') {
    fetchTeacherDashboard();
  } else if (tabName === 'studentPortal') {
    fetchStudentPortal();
  } else if (tabName === 'studentAttendance') {
    fetchStudentPortal().then(renderStudentAttendance);
  } else if (tabName === 'studentReportCard') {
    fetchStudentPortal().then(renderStudentReportCard);
  } else if (tabName === 'studentLeave') {
    fetchStudentLeaves();
  } else if (tabName === 'studentCourses') {
    fetchSubjects().then(renderStudentCourses);
  } else if (tabName === 'students') {
    fetchStudents();
  } else if (tabName === 'subjects') {
    fetchSubjects();
  } else if (tabName === 'users') {
    fetchUsersList();
  } else if (tabName === 'attendance') {
    fetchAttendance(state.activeAttendanceDate);
  } else if (tabName === 'grades') {
    fetchGrades();
    fetchSubjects();
    fetchStudents();
  } else if (tabName === 'leaveReview') {
    fetchLeaveRequests();
  }
}

function toggleMobileNav() {
  const sidebar = document.getElementById('mainSidebar');
  if (sidebar) sidebar.classList.toggle('mobile-open');
}

// =====================================================================
// Data Fetching & Syncing Engine
// =====================================================================
async function loadPortalData() {
  const role = state.currentUser ? state.currentUser.role : 'admin';

  if (role === 'admin') {
    await Promise.all([
      fetchStats(),
      fetchStudents(),
      fetchSubjects(),
      fetchAttendance(state.activeAttendanceDate),
      fetchGrades(),
      fetchUsersList()
    ]);
  } else if (role === 'teacher') {
    await Promise.all([
      fetchTeacherDashboard(),
      fetchStudents(),
      fetchSubjects(),
      fetchAttendance(state.activeAttendanceDate),
      fetchGrades(),
      fetchLeaveRequests()
    ]);
  } else {
    // Student
    await Promise.all([
      fetchStudentPortal(),
      fetchSubjects(),
      fetchStudentLeaves()
    ]);
  }
}

// 1. Dashboard Stats (Admin)
async function fetchStats() {
  try {
    const res = await apiFetch('/api/stats');
    if (!res.ok) {
      if (res.status === 401) return renderUnauthenticatedView();
      return;
    }
    const data = await res.json();
    state.stats = data;
    renderDashboardStats();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function renderDashboardStats() {
  const stats = state.stats;
  const totalEl = document.getElementById('statTotalStudents');
  const presentEl = document.getElementById('statPresentToday');
  const ratioEl = document.getElementById('statPresentRatio');
  const rateEl = document.getElementById('statAttendanceRate');
  const gradeEl = document.getElementById('statAverageGrade');

  if (totalEl) totalEl.textContent = stats.total_students || 0;
  if (presentEl) presentEl.textContent = stats.present_today || 0;
  if (ratioEl) ratioEl.textContent = `${stats.present_today || 0} of ${stats.total_students || 0} students`;
  if (rateEl) rateEl.textContent = (stats.attendance_rate_pct || 0).toFixed(1);
  if (gradeEl) gradeEl.textContent = (stats.average_grade_pct || 0).toFixed(1);

  // Render Top 5 Performers
  const leaderboardEl = document.getElementById('topStudentsList');
  if (!leaderboardEl) return;

  if (!stats.top_students || stats.top_students.length === 0) {
    leaderboardEl.innerHTML = `
      <div class="empty-state-box" style="padding: 24px 12px;">
        <p class="empty-state-desc" style="font-size: 13px;">No examination grades recorded yet to rank students.</p>
        <button type="button" class="btn-secondary-glass btn-sm" onclick="openAddGradeModal()">Log Exam Score</button>
      </div>
    `;
    return;
  }

  leaderboardEl.innerHTML = stats.top_students.map((student, idx) => {
    const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : 'rank-n';
    const pct = parseFloat(student.average_pct) || 0;
    return `
      <div class="leaderboard-item">
        <div class="rank-badge ${rankClass}">#${idx + 1}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-name-row">
            <div>
              <span class="leaderboard-student-name">${escapeHtml(student.name)}</span>
              <span class="leaderboard-class">${escapeHtml(student.class_name)} · ${escapeHtml(student.roll_no)}</span>
            </div>
            <span class="leaderboard-pct tabular-nums">${pct.toFixed(1)}%</span>
          </div>
          <div class="score-progress-bar-wrap">
            <div class="score-progress-fill" style="width: ${Math.min(pct, 100)}%;"></div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 2. Teacher Dashboard Hub
async function fetchTeacherDashboard() {
  try {
    const res = await apiFetch('/api/teacher/dashboard');
    if (!res.ok) return;
    const data = await res.json();
    state.teacherData = data;
    renderTeacherDashboard();
  } catch (err) {
    console.error('Failed to load teacher dashboard:', err);
  }
}

function renderTeacherDashboard() {
  const data = state.teacherData;
  if (!data) return;

  // 1. Attendance banner
  const statusText = document.getElementById('teacherAttendanceStatusText');
  const todayAtt = data.today_attendance || {};
  if (statusText) {
    if (todayAtt.not_marked === 0) {
      statusText.innerHTML = `
        <span style="color: #6ee7b7; font-weight: 700;">✓ Roll call completed for today:</span>
        ${todayAtt.presents} Present · ${todayAtt.lates} Late · ${todayAtt.absents} Absent across ${todayAtt.total_students} students.
      `;
    } else {
      statusText.innerHTML = `
        <span style="color: #fcd34d; font-weight: 700;">⚠️ Roll call pending:</span>
        ${todayAtt.not_marked} of ${todayAtt.total_students} students have not been recorded for today's session (${todayAtt.date}).
      `;
    }
  }

  // 2. Attendance alerts (<75%)
  const attCountEl = document.getElementById('attAlertsCount');
  const attListEl = document.getElementById('attendanceAlertsList');
  const attAlerts = data.attendance_alerts || [];

  if (attCountEl) attCountEl.textContent = `${attAlerts.length} Student${attAlerts.length === 1 ? '' : 's'}`;
  if (attListEl) {
    if (attAlerts.length === 0) {
      attListEl.innerHTML = `
        <div class="alert-empty-good">
          <span>✅ All students currently meet the 75% attendance requirement.</span>
        </div>
      `;
    } else {
      attListEl.innerHTML = attAlerts.map(s => `
        <div class="alert-item-card">
          <div>
            <div class="alert-student-name">${escapeHtml(s.name)}</div>
            <div class="alert-student-meta">${escapeHtml(s.roll_no)} · ${escapeHtml(s.class_name)} (${s.absent_count} absences)</div>
          </div>
          <span class="alert-item-val val-warning tabular-nums">${s.attendance_rate_pct}% Rate</span>
        </div>
      `).join('');
    }
  }

  // 3. Academic alerts (<60%)
  const acadCountEl = document.getElementById('academicAlertsCount');
  const acadListEl = document.getElementById('academicAlertsList');
  const acadAlerts = data.academic_alerts || [];

  if (acadCountEl) acadCountEl.textContent = `${acadAlerts.length} Student${acadAlerts.length === 1 ? '' : 's'}`;
  if (acadListEl) {
    if (acadAlerts.length === 0) {
      acadListEl.innerHTML = `
        <div class="alert-empty-good">
          <span>✅ All enrolled students maintain passing examination averages.</span>
        </div>
      `;
    } else {
      acadListEl.innerHTML = acadAlerts.map(s => `
        <div class="alert-item-card">
          <div>
            <div class="alert-student-name">${escapeHtml(s.name)}</div>
            <div class="alert-student-meta">${escapeHtml(s.roll_no)} · ${escapeHtml(s.class_name)} (${s.exam_count} exams taken)</div>
          </div>
          <span class="alert-item-val val-danger tabular-nums">${s.average_grade_pct}% Avg</span>
        </div>
      `).join('');
    }
  }

  // 4. Recent grades
  const recentTbody = document.getElementById('teacherRecentGradesBody');
  if (recentTbody) {
    const recent = data.recent_grades || [];
    if (recent.length === 0) {
      recentTbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 20px; color: var(--text-dim);">No examination grades recorded yet.</td></tr>`;
    } else {
      recentTbody.innerHTML = recent.map(g => `
        <tr>
          <td>
            <strong>${escapeHtml(g.student_name)}</strong>
            <span style="font-size: 11px; color: var(--text-dim); display: block;">${escapeHtml(g.roll_no)}</span>
          </td>
          <td>${escapeHtml(g.subject_name)}</td>
          <td>${escapeHtml(g.exam)}</td>
          <td class="tabular-nums" style="font-weight: 700; color: #ffffff;">${g.percentage}%</td>
          <td style="font-size: 12px; color: var(--text-muted);">${escapeHtml(g.remarks)}</td>
          <td class="tabular-nums" style="font-size: 12px; color: var(--text-dim);">${g.created_at}</td>
        </tr>
      `).join('');
    }
  }
}

// 3. Student Personal Portal
async function fetchStudentPortal() {
  try {
    const res = await apiFetch('/api/student/portal');
    if (!res.ok) return;
    const data = await res.json();
    state.studentPortalData = data;
    renderStudentPortalView();
  } catch (err) {
    console.error('Failed to load student portal:', err);
  }
}

function renderStudentPortalView() {
  const data = state.studentPortalData;
  if (!data) return;

  const s = data.student || {};
  const att = data.attendance || {};
  const grd = data.grades || {};

  // Hero Card
  const heroName = document.getElementById('studentHeroName');
  const heroRoll = document.getElementById('studentHeroRollClass');
  const heroEmail = document.getElementById('studentHeroEmail');
  const heroPhone = document.getElementById('studentHeroPhone');
  const heroDob = document.getElementById('studentHeroDob');
  const heroAvatar = document.getElementById('studentHeroAvatar');
  const eligPill = document.getElementById('studentEligibilityPill');

  if (heroName) heroName.textContent = s.name || 'Student';
  if (heroRoll) heroRoll.textContent = `Roll No: ${s.roll_no || 'N/A'} · ${s.class_name || 'N/A'}`;
  if (heroEmail) heroEmail.textContent = s.email || 'N/A';
  if (heroPhone) heroPhone.textContent = s.phone || 'N/A';
  if (heroDob) heroDob.textContent = s.dob || 'N/A';
  if (heroAvatar) heroAvatar.textContent = (s.name || 'S').charAt(0).toUpperCase();

  const isEligible = (att.attendance_rate_pct || 0) >= 75.0;
  if (eligPill) {
    eligPill.textContent = isEligible ? '✅ Exam Eligible (>75%)' : '⚠️ Attendance Shortage Alert';
    eligPill.style.color = isEligible ? '#6ee7b7' : '#fca5a5';
  }

  // Stat Indicators
  const attRateEl = document.getElementById('studentStatAttRate');
  const attDaysEl = document.getElementById('studentStatAttDays');
  const gpaEl = document.getElementById('studentStatGpa');
  const gpaLetterEl = document.getElementById('studentStatGradeLetter');
  const examCountEl = document.getElementById('studentStatExamCount');
  const examDebarEl = document.getElementById('studentStatExamDebar');

  const attRate = (att.attendance_rate_pct || 0).toFixed(1);
  const avgGpa = (grd.average_grade_pct || 0).toFixed(1);

  if (attRateEl) attRateEl.textContent = attRate;
  if (attDaysEl) attDaysEl.textContent = `${att.total_days || 0} recorded sessions`;

  if (gpaEl) gpaEl.textContent = avgGpa;
  let letterGrade = 'F';
  if (avgGpa >= 90) letterGrade = 'Grade: A+ (Honors)';
  else if (avgGpa >= 80) letterGrade = 'Grade: A';
  else if (avgGpa >= 70) letterGrade = 'Grade: B';
  else if (avgGpa >= 60) letterGrade = 'Grade: C';
  if (gpaLetterEl) gpaLetterEl.textContent = letterGrade;

  if (examCountEl) examCountEl.textContent = grd.total_exams || 0;

  if (examDebarEl) {
    examDebarEl.textContent = isEligible ? 'Eligible' : 'Debarred';
    examDebarEl.style.color = isEligible ? '#6ee7b7' : '#f87171';
  }
}

function renderStudentAttendance() {
  const data = state.studentPortalData;
  if (!data || !data.attendance) return;

  const att = data.attendance;
  const countPresent = document.getElementById('studentAttCountPresent');
  const countLate = document.getElementById('studentAttCountLate');
  const countAbsent = document.getElementById('studentAttCountAbsent');
  const rateBanner = document.getElementById('studentAttRateBanner');
  const tbody = document.getElementById('studentAttendanceTableBody');

  if (countPresent) countPresent.textContent = att.presents || 0;
  if (countLate) countLate.textContent = att.lates || 0;
  if (countAbsent) countAbsent.textContent = att.absents || 0;
  if (rateBanner) rateBanner.textContent = `${(att.attendance_rate_pct || 0).toFixed(1)}%`;

  if (!tbody) return;
  const records = att.records || [];
  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="text-center" style="padding: 24px; color: var(--text-dim);">No attendance sessions logged for your account yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => {
    let dotClass = 'dot-present';
    let textClass = 'status-present';
    if (r.status === 'Late') { dotClass = 'dot-late'; textClass = 'status-late'; }
    if (r.status === 'Absent') { dotClass = 'dot-absent'; textClass = 'status-absent'; }

    return `
      <tr>
        <td class="tabular-nums" style="font-weight: 600; color: #ffffff;">${r.att_date}</td>
        <td>
          <span class="status-indicator-dot ${dotClass}"></span>
          <span class="${textClass}" style="font-weight: 700;">${r.status}</span>
        </td>
        <td style="color: #6ee7b7; font-size: 12px;">Verified by Faculty ✓</td>
      </tr>
    `;
  }).join('');
}

function renderStudentReportCard() {
  const data = state.studentPortalData;
  if (!data) return;

  const s = data.student || {};
  const grd = data.grades || {};

  const nameEl = document.getElementById('transcriptStudentName');
  const rollEl = document.getElementById('transcriptRollNo');
  const classEl = document.getElementById('transcriptClass');
  const dateEl = document.getElementById('transcriptDateGenerated');
  const avgEl = document.getElementById('transcriptCumulativeAvg');
  const letterEl = document.getElementById('transcriptCumulativeLetter');
  const tbody = document.getElementById('transcriptGradesBody');

  if (nameEl) nameEl.textContent = s.name || 'Student';
  if (rollEl) rollEl.textContent = s.roll_no || 'N/A';
  if (classEl) classEl.textContent = s.class_name || 'N/A';
  if (dateEl) dateEl.textContent = `Generated: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const avgGpa = (grd.average_grade_pct || 0).toFixed(1);
  if (avgEl) avgEl.textContent = `${avgGpa}%`;

  let letter = 'F';
  let badgeClass = 'grade-f';
  if (avgGpa >= 90) { letter = 'A+'; badgeClass = 'grade-a'; }
  else if (avgGpa >= 80) { letter = 'A'; badgeClass = 'grade-b'; }
  else if (avgGpa >= 70) { letter = 'B'; badgeClass = 'grade-c'; }
  else if (avgGpa >= 60) { letter = 'C'; badgeClass = 'grade-c'; }

  if (letterEl) {
    letterEl.textContent = letter;
    letterEl.className = `summary-letter-badge ${badgeClass}`;
  }

  if (!tbody) return;
  const records = grd.records || [];
  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 24px; color: var(--text-dim);">No examination grades recorded yet for official transcript.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(g => {
    const pct = parseFloat(g.percentage) || 0;
    let ltr = 'F';
    let bClass = 'grade-f';
    if (pct >= 90) { ltr = 'A+'; bClass = 'grade-a'; }
    else if (pct >= 80) { ltr = 'A'; bClass = 'grade-b'; }
    else if (pct >= 70) { ltr = 'B'; bClass = 'grade-c'; }
    else if (pct >= 60) { ltr = 'C'; bClass = 'grade-c'; }

    return `
      <tr>
        <td><strong>${escapeHtml(g.subject_name)}</strong></td>
        <td>${escapeHtml(g.exam)}</td>
        <td class="tabular-nums">${g.marks} / ${g.max_marks}</td>
        <td class="tabular-nums" style="font-weight: 700; color: #ffffff;">${pct.toFixed(1)}%</td>
        <td><span class="grade-badge-tag ${bClass}">${ltr}</span></td>
        <td style="font-size: 12px; color: var(--text-muted);">${escapeHtml(g.remarks || 'Standard evaluation recorded')}</td>
      </tr>
    `;
  }).join('');
}

// 4. Leave Requests (Student & Faculty Review)
async function fetchStudentLeaves() {
  try {
    const res = await apiFetch('/api/student/leaves');
    if (!res.ok) return;
    const data = await res.json();
    state.studentLeaves = data;
    renderStudentLeavesTable();
  } catch (err) {
    console.error('Failed to load student leaves:', err);
  }
}

function renderStudentLeavesTable() {
  const tbody = document.getElementById('studentLeavesTableBody');
  if (!tbody) return;

  if (state.studentLeaves.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center" style="padding: 20px; color: var(--text-dim);">No absence excuse notes submitted yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.studentLeaves.map(l => {
    let statusClass = 'badge-status-pending';
    if (l.status === 'Approved') statusClass = 'badge-status-approved';
    if (l.status === 'Rejected') statusClass = 'badge-status-rejected';

    return `
      <tr>
        <td class="tabular-nums" style="font-weight: 600; color: #ffffff;">${l.leave_date}</td>
        <td style="font-size: 13px;">${escapeHtml(l.reason)}</td>
        <td><span class="status-chip ${statusClass}">${l.status}</span></td>
        <td style="font-size: 12px; color: var(--text-dim);">${l.reviewed_by ? escapeHtml(l.reviewed_by) : 'Pending Review'}</td>
      </tr>
    `;
  }).join('');
}

async function handleStudentLeaveSubmit(e) {
  e.preventDefault();
  const leave_date = document.getElementById('leaveDateInput').value;
  const reason = document.getElementById('leaveReasonInput').value.trim();
  const btn = document.getElementById('btnSubmitLeave');

  if (!leave_date || !reason) {
    showToast('Please provide both absence date and explanation.', 'error');
    return;
  }

  btn.disabled = true;
  try {
    const res = await apiFetch('/api/student/leaves', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leave_date, reason })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to submit leave note.', 'error');
      return;
    }
    showToast('Absence excuse note submitted for faculty review!', 'success');
    document.getElementById('studentLeaveForm').reset();
    await fetchStudentLeaves();
  } catch (err) {
    showToast('Network error submitting excuse note.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function fetchLeaveRequests() {
  try {
    const res = await apiFetch('/api/leave-requests');
    if (!res.ok) return;
    const data = await res.json();
    state.leaveRequests = data;
    renderLeaveReviewTable();
  } catch (err) {
    console.error('Failed to load leave requests:', err);
  }
}

function renderLeaveReviewTable() {
  const tbody = document.getElementById('leaveReviewTableBody');
  if (!tbody) return;

  if (state.leaveRequests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: var(--text-dim);">No absence excuse notes awaiting review.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.leaveRequests.map(l => {
    let statusClass = 'badge-status-pending';
    if (l.status === 'Approved') statusClass = 'badge-status-approved';
    if (l.status === 'Rejected') statusClass = 'badge-status-rejected';

    const actions = l.status === 'Pending' ? `
      <div style="display: flex; justify-content: flex-end; gap: 6px;">
        <button type="button" class="btn-approve" onclick="reviewLeaveRequest(${l.id}, 'Approved')">Approve</button>
        <button type="button" class="btn-reject" onclick="reviewLeaveRequest(${l.id}, 'Rejected')">Reject</button>
      </div>
    ` : `<span style="font-size: 11px; color: var(--text-dim);">Decided</span>`;

    return `
      <tr>
        <td>
          <strong>${escapeHtml(l.student_name)}</strong>
          <span style="font-size: 11px; color: var(--text-dim); display: block;">${escapeHtml(l.roll_no)}</span>
        </td>
        <td>${escapeHtml(l.class_name)}</td>
        <td class="tabular-nums" style="font-weight: 600; color: #ffffff;">${l.leave_date}</td>
        <td style="font-size: 12px; max-width: 250px;">${escapeHtml(l.reason)}</td>
        <td><span class="status-chip ${statusClass}">${l.status}</span></td>
        <td style="font-size: 12px; color: var(--text-dim);">${l.reviewed_by ? escapeHtml(l.reviewed_by) : 'Pending'}</td>
        <td class="text-right">${actions}</td>
      </tr>
    `;
  }).join('');
}

async function reviewLeaveRequest(id, status) {
  try {
    const res = await apiFetch(`/api/leave-requests/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to review request.', 'error');
      return;
    }
    showToast(`Leave note marked as ${status}.`, 'success');
    await fetchLeaveRequests();
    if (state.teacherData) fetchTeacherDashboard();
  } catch (err) {
    showToast('Network error reviewing note.', 'error');
  }
}

// 5. Subjects & Curriculum Management (Admin)
async function fetchSubjects() {
  try {
    const res = await apiFetch('/api/subjects');
    if (!res.ok) return;
    const data = await res.json();
    state.subjects = data;
    renderSubjectsTable();
    populateSubjectSelects();
  } catch (err) {
    console.error('Failed to load subjects:', err);
  }
}

function renderSubjectsTable() {
  const tbody = document.getElementById('subjectsTableBody');
  if (!tbody) return;

  tbody.innerHTML = state.subjects.map(s => `
    <tr>
      <td class="tabular-nums" style="font-weight: 700; color: #ffffff;">#${s.id}</td>
      <td><strong style="color: #ffffff; font-size: 14px;">${escapeHtml(s.name)}</strong></td>
      <td><span class="student-hero-pill" style="color: #6ee7b7;">Active in Curriculum</span></td>
      <td class="text-right">
        <button type="button" class="btn-row-action action-delete" onclick="deleteSubject(${s.id}, '${escapeHtml(s.name).replace(/'/g, "\\'")}')">Remove</button>
      </td>
    </tr>
  `).join('');
}

function renderStudentCourses() {
  const grid = document.getElementById('studentCoursesGrid');
  if (!grid) return;

  grid.innerHTML = state.subjects.map(s => `
    <div class="liquid-panel" style="padding: 22px;" data-tilt-panel>
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
        <h4 style="font-size: 16px; font-weight: 700; color: #ffffff;">${escapeHtml(s.name)}</h4>
        <span class="student-hero-pill" style="color: #6ee7b7;">Enrolled</span>
      </div>
      <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">
        Comprehensive high school curriculum covering foundational and advanced college-preparatory modules with continuous assessment.
      </p>
    </div>
  `).join('');
}

function openAddSubjectModal() {
  document.getElementById('subjectForm').reset();
  document.getElementById('subjectModal').classList.remove('hidden');
}

function closeSubjectModal() {
  document.getElementById('subjectModal').classList.add('hidden');
}

async function handleSubjectFormSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('subjectNameInput').value.trim();
  if (!name) return;

  try {
    const res = await apiFetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Failed to add subject.', 'error');
      return;
    }
    showToast(`Subject '${name}' added to curriculum!`, 'success');
    closeSubjectModal();
    await fetchSubjects();
  } catch (e) {
    showToast('Network error adding subject.', 'error');
  }
}

async function deleteSubject(id, name) {
  if (!confirm(`Are you sure you want to remove "${name}" from curriculum?`)) return;
  try {
    const res = await apiFetch(`/api/subjects/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Cannot remove subject.', 'error');
      return;
    }
    showToast(`Subject "${name}" removed.`, 'success');
    await fetchSubjects();
  } catch (e) {
    showToast('Network error removing subject.', 'error');
  }
}

// 6. User Accounts & RBAC (Admin)
async function fetchUsersList() {
  try {
    const res = await apiFetch('/api/admin/users');
    if (!res.ok) return;
    const data = await res.json();
    state.usersList = data;
    renderUsersTable();
  } catch (err) {
    console.error('Failed to load users list:', err);
  }
}

function renderUsersTable() {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;

  tbody.innerHTML = state.usersList.map(u => {
    let chipClass = 'role-chip-student';
    let label = '🎓 Student';
    let scope = 'Personal Academic Records & Report Card';
    if (u.role === 'admin') {
      chipClass = 'role-chip-admin';
      label = '👑 Administrator';
      scope = 'Full Admissions, Curriculum & Database Access';
    } else if (u.role === 'teacher') {
      chipClass = 'role-chip-teacher';
      label = '🍎 Faculty Teacher';
      scope = 'Daily Roll Call, Gradebook Assessments & Alerts';
    }

    const linkedStudent = u.linked_student_name
      ? `${escapeHtml(u.linked_student_name)} (${escapeHtml(u.linked_student_roll)})`
      : '<span style="color: var(--text-dim);">N/A (Staff/Faculty)</span>';

    return `
      <tr>
        <td class="tabular-nums" style="font-weight: 700; color: #ffffff;">#${u.id}</td>
        <td><strong style="color: #ffffff;">${escapeHtml(u.username)}</strong></td>
        <td><span class="role-indicator-chip ${chipClass}">${label}</span></td>
        <td>${linkedStudent}</td>
        <td style="font-size: 12px; color: var(--text-muted);">${scope}</td>
      </tr>
    `;
  }).join('');
}

// 7. Students Directory (CRUD for Admin, Roster for Teacher)
async function fetchStudents() {
  try {
    const res = await apiFetch('/api/students');
    if (!res.ok) return;
    const data = await res.json();
    state.students = data;
    renderStudentsTable();
    populateStudentSelects();
  } catch (err) {
    console.error('Failed to load students:', err);
  }
}

function handleStudentSearch(query) {
  state.studentSearchQuery = (query || '').toLowerCase().trim();
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !state.studentSearchQuery);
  }
  renderStudentsTable();
}

function clearStudentSearch() {
  const searchInput = document.getElementById('studentSearchInput');
  if (searchInput) searchInput.value = '';
  handleStudentSearch('');
}

function renderStudentsTable() {
  const tbody = document.getElementById('studentsTableBody');
  const emptyBox = document.getElementById('studentsEmptyState');
  const countBadge = document.getElementById('studentCountBadge');
  if (!tbody) return;

  const query = state.studentSearchQuery;
  const filtered = state.students.filter((s) => {
    if (!query) return true;
    return (
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.roll_no && s.roll_no.toLowerCase().includes(query)) ||
      (s.class_name && s.class_name.toLowerCase().includes(query)) ||
      (s.email && s.email.toLowerCase().includes(query))
    );
  });

  if (countBadge) {
    countBadge.textContent = `${filtered.length} student${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (emptyBox) {
      emptyBox.classList.remove('hidden');
      const desc = document.getElementById('studentsEmptyDesc');
      if (desc) {
        desc.textContent = query
          ? `No students matched the query "${query}".`
          : 'There are currently no students registered in the system.';
      }
    }
    return;
  }

  if (emptyBox) emptyBox.classList.add('hidden');

  const isAdmin = state.currentUser && state.currentUser.role === 'admin';

  tbody.innerHTML = filtered.map((student) => {
    const actions = isAdmin ? `
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="btn-row-action action-edit" onclick="openEditStudentModal(${student.id})">Edit</button>
        <button type="button" class="btn-row-action action-delete" onclick="confirmDeleteStudent(${student.id}, '${escapeHtml(student.name).replace(/'/g, "\\'")}')">Expel</button>
      </div>
    ` : `
      <div style="display: flex; justify-content: flex-end; gap: 8px;">
        <button type="button" class="btn-secondary-glass btn-sm" onclick="openAddGradeModalForStudent(${student.id})">+ Log Score</button>
      </div>
    `;

    return `
      <tr>
        <td class="tabular-nums"><strong>${escapeHtml(student.roll_no)}</strong></td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div class="user-avatar" style="width: 32px; height: 32px; font-size: 13px;">${escapeHtml(student.name.charAt(0).toUpperCase())}</div>
            <span style="font-weight: 600; color: #ffffff;">${escapeHtml(student.name)}</span>
          </div>
        </td>
        <td><span class="student-hero-pill">${escapeHtml(student.class_name)}</span></td>
        <td><a href="mailto:${escapeHtml(student.email)}" style="color: var(--accent-blue); text-decoration: none;">${escapeHtml(student.email)}</a></td>
        <td class="tabular-nums">${escapeHtml(student.phone || '—')}</td>
        <td class="tabular-nums">${escapeHtml(student.dob || '—')}</td>
        <td class="text-right">${actions}</td>
      </tr>
    `;
  }).join('');
}

// 8. Attendance Management
async function fetchAttendance(dateStr) {
  try {
    const res = await apiFetch(`/api/attendance?date=${encodeURIComponent(dateStr)}`);
    if (!res.ok) return;
    const data = await res.json();
    state.attendance = data;
    renderAttendanceTable();
  } catch (err) {
    console.error('Failed to load attendance:', err);
  }
}

function handleAttendanceDateChange(val) {
  if (!val) return;
  state.activeAttendanceDate = val;
  fetchAttendance(val);
}

function setAttendanceToday() {
  const today = new Date().toISOString().split('T')[0];
  state.activeAttendanceDate = today;
  const picker = document.getElementById('attendanceDatePicker');
  if (picker) picker.value = today;
  fetchAttendance(today);
}

function markAllAttendance(status) {
  state.attendance.forEach((rec) => {
    rec.status = status;
  });
  renderAttendanceTable();
}

function setStudentAttendance(studentId, status) {
  const record = state.attendance.find((r) => r.student_id === studentId);
  if (record) {
    record.status = status;
    renderAttendanceSummaryRibbon();
  }
}

function renderAttendanceTable() {
  const tbody = document.getElementById('attendanceTableBody');
  const emptyBox = document.getElementById('attendanceEmptyState');
  if (!tbody) return;

  if (state.attendance.length === 0) {
    tbody.innerHTML = '';
    if (emptyBox) emptyBox.classList.remove('hidden');
    return;
  }

  if (emptyBox) emptyBox.classList.add('hidden');
  renderAttendanceSummaryRibbon();

  tbody.innerHTML = state.attendance.map((rec) => `
    <tr>
      <td class="tabular-nums"><strong>${escapeHtml(rec.roll_no)}</strong></td>
      <td><span style="font-weight: 600; color: #ffffff;">${escapeHtml(rec.name)}</span></td>
      <td><span class="student-hero-pill">${escapeHtml(rec.class_name)}</span></td>
      <td class="text-right">
        <div class="segmented-control" role="group" aria-label="Attendance status for ${escapeHtml(rec.name)}">
          <input 
            type="radio" 
            id="att_${rec.student_id}_present" 
            name="att_status_${rec.student_id}" 
            value="Present" 
            ${rec.status === 'Present' ? 'checked' : ''}
            onchange="setStudentAttendance(${rec.student_id}, 'Present')"
          />
          <label for="att_${rec.student_id}_present" class="seg-present">Present</label>

          <input 
            type="radio" 
            id="att_${rec.student_id}_late" 
            name="att_status_${rec.student_id}" 
            value="Late" 
            ${rec.status === 'Late' ? 'checked' : ''}
            onchange="setStudentAttendance(${rec.student_id}, 'Late')"
          />
          <label for="att_${rec.student_id}_late" class="seg-late">Late</label>

          <input 
            type="radio" 
            id="att_${rec.student_id}_absent" 
            name="att_status_${rec.student_id}" 
            value="Absent" 
            ${rec.status === 'Absent' ? 'checked' : ''}
            onchange="setStudentAttendance(${rec.student_id}, 'Absent')"
          />
          <label for="att_${rec.student_id}_absent" class="seg-absent">Absent</label>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderAttendanceSummaryRibbon() {
  const presents = state.attendance.filter((r) => r.status === 'Present').length;
  const lates = state.attendance.filter((r) => r.status === 'Late').length;
  const absents = state.attendance.filter((r) => r.status === 'Absent').length;
  const total = state.attendance.length;

  const pEl = document.getElementById('attSummaryPresent');
  const lEl = document.getElementById('attSummaryLate');
  const aEl = document.getElementById('attSummaryAbsent');
  const pctEl = document.getElementById('attSummaryPct');

  if (pEl) pEl.textContent = presents;
  if (lEl) lEl.textContent = lates;
  if (aEl) aEl.textContent = absents;

  if (pctEl) {
    const rate = total > 0 ? (((presents + lates * 0.5) / total) * 100).toFixed(0) : 0;
    pctEl.textContent = `${rate}%`;
  }
}

async function submitBulkAttendance() {
  const btn = document.getElementById('saveAttendanceBtn');
  btn.disabled = true;

  const payload = state.attendance.map((rec) => ({
    student_id: rec.student_id,
    att_date: state.activeAttendanceDate,
    status: rec.status
  }));

  try {
    const res = await apiFetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to save attendance.', 'error');
      return;
    }

    showToast(data.message || 'Attendance saved successfully.', 'success');
    fetchStats();
    if (state.teacherData) fetchTeacherDashboard();
  } catch (err) {
    showToast('Network error while saving attendance.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// 9. Grades & Exam Assessments
async function fetchGrades(studentId = '') {
  try {
    const query = studentId ? `?student_id=${encodeURIComponent(studentId)}` : '';
    const res = await apiFetch(`/api/grades${query}`);
    if (!res.ok) return;
    const data = await res.json();
    state.grades = data;
    renderGradesTable();
  } catch (err) {
    console.error('Failed to load grades:', err);
  }
}

function handleGradeStudentFilter(studentId) {
  state.selectedGradeStudentId = studentId;
  fetchGrades(studentId);
}

function renderGradesTable() {
  const tbody = document.getElementById('gradesTableBody');
  const emptyBox = document.getElementById('gradesEmptyState');
  const countSpan = document.getElementById('gradesTotalCount');
  const avgScoreSpan = document.getElementById('gradesAvgScore');
  if (!tbody) return;

  const total = state.grades.length;
  if (countSpan) countSpan.textContent = total;

  if (total === 0) {
    tbody.innerHTML = '';
    if (emptyBox) emptyBox.classList.remove('hidden');
    if (avgScoreSpan) avgScoreSpan.textContent = '0.0%';
    return;
  }

  if (emptyBox) emptyBox.classList.add('hidden');

  let sumPct = 0;
  state.grades.forEach((g) => {
    sumPct += parseFloat(g.percentage) || 0;
  });
  const avg = sumPct / total;
  if (avgScoreSpan) avgScoreSpan.textContent = `${avg.toFixed(1)}%`;

  tbody.innerHTML = state.grades.map((grade) => {
    const pct = parseFloat(grade.percentage) || 0;
    let badgeClass = 'grade-f';
    let letter = 'F';

    if (pct >= 90) { badgeClass = 'grade-a'; letter = 'A+'; }
    else if (pct >= 80) { badgeClass = 'grade-b'; letter = 'A'; }
    else if (pct >= 70) { badgeClass = 'grade-c'; letter = 'B'; }
    else if (pct >= 60) { badgeClass = 'grade-c'; letter = 'C'; }

    return `
      <tr>
        <td>
          <strong style="color: #ffffff;">${escapeHtml(grade.student_name)}</strong>
          <span style="font-size: 11px; color: var(--text-dim); display: block;">${escapeHtml(grade.roll_no)} · ${escapeHtml(grade.class_name)}</span>
        </td>
        <td>${escapeHtml(grade.subject_name)}</td>
        <td>${escapeHtml(grade.exam)}</td>
        <td class="tabular-nums">
          <strong>${grade.marks}</strong> <span style="color: var(--text-dim);">/ ${grade.max_marks}</span>
        </td>
        <td style="font-size: 12px; color: var(--text-muted); max-width: 200px;">
          ${escapeHtml(grade.remarks || 'Standard evaluation recorded')}
        </td>
        <td>
          <div class="grade-progress-cell">
            <div class="grade-bar-track">
              <div class="grade-bar-fill score-progress-fill" style="width: ${Math.min(pct, 100)}%;"></div>
            </div>
            <span class="tabular-nums" style="font-size: 13px; font-weight: 600; min-width: 44px;">${pct.toFixed(1)}%</span>
            <span class="grade-badge-tag ${badgeClass}">${letter}</span>
          </div>
        </td>
        <td class="text-right">
          <button type="button" class="btn-row-action action-delete" onclick="confirmDeleteGrade(${grade.id}, '${escapeHtml(grade.exam).replace(/'/g, "\\'")}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Dropdown population helpers
function populateStudentSelects() {
  const filterSelect = document.getElementById('gradeStudentFilter');
  const formSelect = document.getElementById('gradeFormStudent');

  if (filterSelect) {
    const curVal = filterSelect.value;
    filterSelect.innerHTML = '<option value="">All Students</option>' +
      state.students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.roll_no)})</option>`).join('');
    filterSelect.value = curVal;
  }

  if (formSelect) {
    const curVal = formSelect.value;
    formSelect.innerHTML = '<option value="">-- Choose Student --</option>' +
      state.students.map((s) => `<option value="${s.id}">${escapeHtml(s.name)} · ${escapeHtml(s.roll_no)} (${escapeHtml(s.class_name)})</option>`).join('');
    formSelect.value = curVal;
  }
}

function populateSubjectSelects() {
  const select = document.getElementById('gradeFormSubject');
  if (!select) return;

  const curVal = select.value;
  select.innerHTML = '<option value="">-- Choose Subject --</option>' +
    state.subjects.map((sub) => `<option value="${sub.id}">${escapeHtml(sub.name)}</option>`).join('');
  select.value = curVal;
}

// Student Modal & Form Operations
function openAddStudentModal() {
  document.getElementById('studentModalTitle').textContent = 'Enroll Student';
  document.getElementById('studentSubmitLabel').textContent = 'Save Student';
  document.getElementById('studentFormId').value = '';
  document.getElementById('studentForm').reset();
  document.getElementById('studentModal').classList.remove('hidden');
}

function openEditStudentModal(studentId) {
  const student = state.students.find((s) => s.id === studentId);
  if (!student) return;

  document.getElementById('studentModalTitle').textContent = 'Edit Student Details';
  document.getElementById('studentSubmitLabel').textContent = 'Update Record';
  document.getElementById('studentFormId').value = student.id;
  document.getElementById('studentRollNo').value = student.roll_no;
  document.getElementById('studentName').value = student.name;
  document.getElementById('studentClass').value = student.class_name;
  document.getElementById('studentEmail').value = student.email;
  document.getElementById('studentPhone').value = student.phone || '';
  document.getElementById('studentDob').value = student.dob || '';

  document.getElementById('studentModal').classList.remove('hidden');
}

function closeStudentModal() {
  document.getElementById('studentModal').classList.add('hidden');
}

async function handleStudentFormSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('studentFormId').value;
  const roll_no = document.getElementById('studentRollNo').value.trim();
  const name = document.getElementById('studentName').value.trim();
  const class_name = document.getElementById('studentClass').value.trim();
  const email = document.getElementById('studentEmail').value.trim();
  const phone = document.getElementById('studentPhone').value.trim();
  const dob = document.getElementById('studentDob').value;

  const submitBtn = document.getElementById('studentFormSubmitBtn');
  submitBtn.disabled = true;

  const payload = { roll_no, name, class_name, email, phone, dob };
  const isEdit = !!id;
  const url = isEdit ? `/api/students/${id}` : '/api/students';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to save student.', 'error');
      submitBtn.disabled = false;
      return;
    }

    showToast(data.message || 'Student record updated successfully.', 'success');
    closeStudentModal();
    await fetchStudents();
    fetchStats();
  } catch (err) {
    showToast('Network error while saving student record.', 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

// Grade Modal & Form Operations
function openAddGradeModal() {
  document.getElementById('gradeForm').reset();
  document.getElementById('gradeFormMaxMarks').value = '100';
  populateStudentSelects();
  populateSubjectSelects();

  if (state.selectedGradeStudentId) {
    document.getElementById('gradeFormStudent').value = state.selectedGradeStudentId;
  }

  document.getElementById('gradeModal').classList.remove('hidden');
}

function openAddGradeModalForStudent(studentId) {
  openAddGradeModal();
  document.getElementById('gradeFormStudent').value = studentId;
}

function closeGradeModal() {
  document.getElementById('gradeModal').classList.add('hidden');
}

async function handleGradeFormSubmit(e) {
  e.preventDefault();
  const student_id = document.getElementById('gradeFormStudent').value;
  const subject_id = document.getElementById('gradeFormSubject').value;
  const exam = document.getElementById('gradeFormExam').value.trim();
  const marks = parseFloat(document.getElementById('gradeFormMarks').value);
  const max_marks = parseFloat(document.getElementById('gradeFormMaxMarks').value);
  const remarks = document.getElementById('gradeFormRemarks').value.trim();

  if (marks < 0 || marks > max_marks) {
    showToast(`Marks scored must be between 0 and max marks (${max_marks}).`, 'error');
    return;
  }

  try {
    const res = await apiFetch('/api/grades', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student_id, subject_id, exam, marks, max_marks, remarks })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to save grade.', 'error');
      return;
    }

    showToast(data.message || 'Assessment grade recorded successfully.', 'success');
    closeGradeModal();
    await fetchGrades();
    fetchStats();
    if (state.teacherData) fetchTeacherDashboard();
  } catch (err) {
    showToast('Network error while saving grade.', 'error');
  }
}

// Deletions
function confirmDeleteStudent(studentId, studentName) {
  state.pendingDeleteAction = {
    type: 'student',
    id: studentId
  };
  document.getElementById('deleteModalTitle').textContent = 'Expel / Delete Student';
  document.getElementById('deleteModalMessage').textContent =
    `Are you sure you want to permanently expel and delete "${studentName}"? All associated attendance and grade records will also be removed.`;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function confirmDeleteGrade(gradeId, examName) {
  state.pendingDeleteAction = {
    type: 'grade',
    id: gradeId
  };
  document.getElementById('deleteModalTitle').textContent = 'Delete Assessment Score';
  document.getElementById('deleteModalMessage').textContent =
    `Are you sure you want to delete this grade record for "${examName}"?`;
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  state.pendingDeleteAction = null;
  document.getElementById('deleteModal').classList.add('hidden');
}

async function executeDelete() {
  if (!state.pendingDeleteAction) return;
  const { type, id } = state.pendingDeleteAction;
  const confirmBtn = document.getElementById('confirmDeleteBtn');
  confirmBtn.disabled = true;

  const url = type === 'student' ? `/api/students/${id}` : `/api/grades/${id}`;

  try {
    const res = await apiFetch(url, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Failed to delete record.', 'error');
      return;
    }

    showToast(data.message || 'Record deleted successfully.', 'success');
    closeDeleteModal();

    if (type === 'student') {
      await fetchStudents();
      fetchAttendance(state.activeAttendanceDate);
      fetchGrades();
      fetchStats();
      if (state.teacherData) fetchTeacherDashboard();
    } else {
      await fetchGrades();
      fetchStats();
      if (state.teacherData) fetchTeacherDashboard();
    }
  } catch (err) {
    showToast('Network error while deleting.', 'error');
  } finally {
    confirmBtn.disabled = false;
  }
}

// Setup Commands Copy
function copySetupCommands() {
  const text = document.getElementById('setupCommands').textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Setup commands copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Unable to copy automatically.', 'info');
  });
}

// Global App Boot & Hashchange Listener
window.addEventListener('hashchange', () => {
  if (state.currentUser) {
    const hash = (window.location.hash || '').replace('#', '');
    const validTabs = [
      'dashboard', 'teacherHub', 'studentPortal', 'studentAttendance',
      'studentReportCard', 'studentLeave', 'studentCourses', 'students',
      'subjects', 'users', 'attendance', 'grades', 'leaveReview', 'setup'
    ];
    if (validTabs.includes(hash) && hash !== state.currentTab) {
      navigateToTab(hash);
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  initSpatialEffects();
  const todayStr = new Date().toISOString().split('T')[0];
  state.activeAttendanceDate = todayStr;
  const dateInput = document.getElementById('attendanceDatePicker');
  if (dateInput) dateInput.value = todayStr;

  checkAuthSession();
});
