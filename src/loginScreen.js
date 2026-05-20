import { register, login, getLastUsername } from './auth.js';

export function showLoginScreen() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.innerHTML = `
      <div class="login-card">
        <div class="login-title">🌲 Skogens Skördare</div>
        <div class="login-subtitle">Logga in för att spela</div>

        <div class="login-tabs">
          <button class="login-tab active" data-mode="login">Logga in</button>
          <button class="login-tab" data-mode="register">Skapa konto</button>
        </div>

        <form class="login-form" autocomplete="on">
          <label>
            Användarnamn
            <input type="text" name="username" autocomplete="username"
              maxlength="20" required />
          </label>
          <label>
            Lösenord
            <input type="password" name="password" autocomplete="current-password"
              minlength="6" required />
          </label>
          <div class="login-error"></div>
          <button type="submit" class="login-submit">Logga in</button>
        </form>

        <div class="login-hint">
          Inget verifieringsmail. Lösenordet sparas säkert hos Supabase.
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const tabs = overlay.querySelectorAll('.login-tab');
    const form = overlay.querySelector('.login-form');
    const errorEl = overlay.querySelector('.login-error');
    const submitBtn = overlay.querySelector('.login-submit');
    const usernameInput = form.elements.username;
    const passwordInput = form.elements.password;

    const last = getLastUsername();
    if (last) {
      usernameInput.value = last;
      passwordInput.focus();
    } else {
      usernameInput.focus();
    }

    let mode = 'login';

    function setMode(next) {
      mode = next;
      tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
      submitBtn.textContent = mode === 'login' ? 'Logga in' : 'Skapa konto';
      passwordInput.setAttribute(
        'autocomplete',
        mode === 'login' ? 'current-password' : 'new-password',
      );
      errorEl.textContent = '';
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => setMode(tab.dataset.mode));
    });

    async function handleSubmit(e) {
      e.preventDefault();
      errorEl.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = mode === 'login' ? 'Loggar in…' : 'Skapar konto…';

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      const result =
        mode === 'login'
          ? await login(username, password)
          : await register(username, password);

      if (result.error || !result.session) {
        errorEl.textContent =
          result.error ||
          (mode === 'register'
            ? 'Något gick fel. Försök igen.'
            : 'Kunde inte logga in.');
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'login' ? 'Logga in' : 'Skapa konto';
        return;
      }

      overlay.remove();
      resolve(result.session);
    }

    form.addEventListener('submit', handleSubmit);
  });
}
