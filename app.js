const STORAGE_KEYS = {
  users: 'edu_users',
  materials: 'edu_materials',
  session: 'edu_session',
  loginAttempts: 'edu_login_attempts',
};

const defaultMaterials = {
  preview: [],
  ppt: [],
  homework: [],
};

const MAX_ATTEMPTS = 5;
const LOCK_MS = 60 * 1000;

const authSection = document.getElementById('auth-section');
const dashboard = document.getElementById('dashboard');
const teacherPanel = document.getElementById('teacher-panel');
const studentPanel = document.getElementById('student-panel');
const welcomeText = document.getElementById('welcome-text');
const roleText = document.getElementById('role-text');
const toast = document.getElementById('toast');

const previewList = document.getElementById('preview-list');
const pptList = document.getElementById('ppt-list');
const homeworkList = document.getElementById('homework-list');

const tabs = document.querySelectorAll('.tab');
const forms = {
  login: document.getElementById('login-form'),
  register: document.getElementById('register-form'),
};

const loginForm = forms.login;
const registerForm = forms.register;
const uploadForm = document.getElementById('upload-form');
const logoutBtn = document.getElementById('logout-btn');

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getUsers() {
  return loadJson(STORAGE_KEYS.users, []);
}

function getMaterials() {
  return { ...defaultMaterials, ...loadJson(STORAGE_KEYS.materials, defaultMaterials) };
}

function getSession() {
  return loadJson(STORAGE_KEYS.session, null);
}

function setSession(user) {
  saveJson(STORAGE_KEYS.session, {
    username: user.username,
    role: user.role,
  });
}

function getAttempts() {
  return loadJson(STORAGE_KEYS.loginAttempts, {});
}

function saveAttempts(value) {
  saveJson(STORAGE_KEYS.loginAttempts, value);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function createMetaLine(text) {
  const div = document.createElement('div');
  div.className = 'material-meta';
  div.textContent = text;
  return div;
}

function renderMaterials() {
  const materials = getMaterials();
  const mapping = {
    preview: previewList,
    ppt: pptList,
    homework: homeworkList,
  };

  Object.entries(mapping).forEach(([type, list]) => {
    list.innerHTML = '';
    if (!materials[type]?.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '暂无内容';
      list.appendChild(li);
      return;
    }

    materials[type]
      .slice()
      .reverse()
      .forEach((item) => {
        const li = document.createElement('li');
        li.className = 'material-item';

        const title = document.createElement('h4');
        title.textContent = item.title;

        const meta = createMetaLine(`发布者：${item.author}\n发布时间：${item.createdAt}`);
        const content = createMetaLine(item.content);

        li.append(title, meta, content);
        list.appendChild(li);
      });
  });
}

function switchTab(tabName) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === tabName));
  Object.entries(forms).forEach(([name, form]) => form.classList.toggle('active', name === tabName));
}

function enterDashboard(user) {
  authSection.classList.add('hidden');
  dashboard.classList.remove('hidden');

  const roleName = user.role === 'teacher' ? '老师' : '学生';
  welcomeText.textContent = `欢迎你，${user.username}`;
  roleText.textContent = `当前身份：${roleName}`;

  teacherPanel.classList.toggle('hidden', user.role !== 'teacher');
  studentPanel.classList.toggle('hidden', user.role !== 'student');

  renderMaterials();
}

function logout() {
  localStorage.removeItem(STORAGE_KEYS.session);
  dashboard.classList.add('hidden');
  authSection.classList.remove('hidden');
  switchTab('login');
  showToast('已退出登录');
}

async function hashPassword(password) {
  if (!window.crypto?.subtle) {
    return `plain:${password}`;
  }

  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(digest));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `sha256:${hashHex}`;
}

function isStrongPassword(password) {
  return /[A-Za-z]/.test(password) && /\d/.test(password);
}

async function verifyPassword(user, inputPassword) {
  if (user.passwordHash) {
    const inputHash = await hashPassword(inputPassword);
    return inputHash === user.passwordHash;
  }

  if (typeof user.password === 'string' && user.password === inputPassword) {
    user.passwordHash = await hashPassword(inputPassword);
    delete user.password;
    return true;
  }

  return false;
}

function getAttemptKey(username, role) {
  return `${username}::${role}`;
}

function isLocked(username, role) {
  const key = getAttemptKey(username, role);
  const attempts = getAttempts();
  const record = attempts[key];

  if (!record || !record.lockUntil) {
    return false;
  }

  if (Date.now() > record.lockUntil) {
    delete attempts[key];
    saveAttempts(attempts);
    return false;
  }

  return true;
}

function registerFailure(username, role) {
  const key = getAttemptKey(username, role);
  const attempts = getAttempts();
  const record = attempts[key] ?? { count: 0, lockUntil: 0 };
  record.count += 1;

  if (record.count >= MAX_ATTEMPTS) {
    record.lockUntil = Date.now() + LOCK_MS;
    record.count = 0;
  }

  attempts[key] = record;
  saveAttempts(attempts);
}

function clearFailure(username, role) {
  const key = getAttemptKey(username, role);
  const attempts = getAttempts();
  delete attempts[key];
  saveAttempts(attempts);
}

tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('register-username').value.trim();
  const password = document.getElementById('register-password').value;
  const role = document.getElementById('register-role').value;

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    showToast('用户名仅支持字母、数字、下划线，长度3-24位');
    return;
  }

  if (!isStrongPassword(password)) {
    showToast('密码需包含字母和数字');
    return;
  }

  const users = getUsers();
  if (users.some((user) => user.username === username)) {
    showToast('用户名已存在，请更换');
    return;
  }

  const newUser = {
    username,
    role,
    passwordHash: await hashPassword(password),
  };

  users.push(newUser);
  saveJson(STORAGE_KEYS.users, users);

  showToast('注册成功，请登录');
  registerForm.reset();
  switchTab('login');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const role = document.getElementById('login-role').value;

  if (isLocked(username, role)) {
    showToast('登录失败次数过多，请1分钟后再试');
    return;
  }

  const users = getUsers();
  const user = users.find((item) => item.username === username && item.role === role);

  if (!user || !(await verifyPassword(user, password))) {
    registerFailure(username, role);
    showToast('账号、密码或身份不匹配');
    return;
  }

  saveJson(STORAGE_KEYS.users, users);
  clearFailure(username, role);
  setSession(user);
  showToast('登录成功');
  loginForm.reset();
  enterDashboard(user);
});

uploadForm?.addEventListener('submit', (event) => {
  event.preventDefault();

  const currentUser = getSession();
  if (!currentUser || currentUser.role !== 'teacher') {
    showToast('仅老师可上传资料');
    return;
  }

  const type = document.getElementById('material-type').value;
  const title = document.getElementById('material-title').value.trim();
  const content = document.getElementById('material-content').value.trim();

  const materials = getMaterials();
  materials[type].push({
    title,
    content,
    author: currentUser.username,
    createdAt: new Date().toLocaleString('zh-CN', { hour12: false }),
  });

  saveJson(STORAGE_KEYS.materials, materials);
  showToast('资料上传成功');
  uploadForm.reset();
  renderMaterials();
});

logoutBtn.addEventListener('click', logout);

(function bootstrap() {
  saveJson(STORAGE_KEYS.materials, getMaterials());
  const session = getSession();
  if (session && session.username && session.role) {
    enterDashboard(session);
  } else {
    switchTab('login');
  }
})();
