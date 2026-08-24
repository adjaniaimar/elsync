const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const loginBtnText = document.getElementById('loginBtnText');
const pwInput = document.getElementById('password');
const pwToggle = document.getElementById('pwToggle');
const eyeIcon = document.getElementById('eyeIcon');

// TOGGLE SHOW/HIDE PASSWORD //
pwToggle.addEventListener('click', () => {
  const isHidden = pwInput.type === 'password';
  pwInput.type = isHidden ? 'text' : 'password';
  eyeIcon.innerHTML = isHidden
    ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.8 21.8 0 0 1 5.06-6.06M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a21.8 21.8 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/>';
});

// LOGIN SUBMIT //
form.addEventListener('submit', (e) => {
  e.preventDefault();
  errorBox.classList.remove('show');

  const username = document.getElementById('username').value.trim();
  const password = pwInput.value.trim();

  if (!username || !password){
    errorBox.textContent = 'Username and password should be filled.';
    errorBox.classList.add('show');
    return;
  }

  loginBtn.disabled = true;
  loginBtnText.innerHTML = '<span class="spinner"></span>';

fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password })
})
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      sessionStorage.setItem('elsync_auth', '1');
      window.location.href = 'index.html';
    } else {
      errorBox.textContent = data.message || 'Login failed.';
      errorBox.classList.add('show');
      loginBtn.disabled = false;
      loginBtnText.textContent = 'Login';
    }
  })
  .catch(() => {
    errorBox.textContent = 'Failed to connect to server.';
    errorBox.classList.add('show');
    loginBtn.disabled = false;
    loginBtnText.textContent = 'Login';
  });
});