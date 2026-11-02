/* 登录 / 注册页 */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});

  function showError(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.hidden = !msg;
  }

  Pages.login = function (container) {
    const seq = App.beginRender();
    if (!App.isCurrent(seq)) return;
    container.innerHTML =
      '<div class="auth-wrap"><div class="card auth-card">' +
      '<div class="auth-logo">💪</div>' +
      '<h1 class="auth-title">FitCheck</h1>' +
      '<p class="auth-sub">健身打卡 · 和好友一起变强</p>' +
      '<form id="login-form" novalidate>' +
      '<div class="field"><label for="l-user">用户名</label>' +
      '<input id="l-user" type="text" autocomplete="username" placeholder="2–24 个字符"></div>' +
      '<div class="field"><label for="l-pass">密码</label>' +
      '<input id="l-pass" type="password" autocomplete="current-password" placeholder="至少 6 位"></div>' +
      '<p class="form-error" id="l-error" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="submit" id="l-submit">登录</button>' +
      '</form>' +
      '<p class="auth-switch">还没有账号？<a href="#/register">立即注册</a></p>' +
      '</div></div>';

    const form = document.getElementById('login-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('l-user').value.trim();
      const password = document.getElementById('l-pass').value;
      if (!username || !password) { showError('l-error', '请输入用户名和密码'); return; }
      const btn = document.getElementById('l-submit');
      btn.disabled = true;
      btn.textContent = '登录中…';
      showError('l-error', '');
      API.post('/auth/login', { username: username, password: password }, { skip401: true })
        .then(function (data) {
          localStorage.setItem('fitcheck_token', data.token);
          App.toast('欢迎回来，' + (data.user && data.user.nickname ? data.user.nickname : username) + '！', 'success');
          location.hash = '#/home';
        })
        .catch(function (err) {
          showError('l-error', err.message || '登录失败');
          btn.disabled = false;
          btn.textContent = '登录';
        });
    });
  };

  Pages.register = function (container) {
    const seq = App.beginRender();
    if (!App.isCurrent(seq)) return;
    container.innerHTML =
      '<div class="auth-wrap"><div class="card auth-card">' +
      '<div class="auth-logo">💪</div>' +
      '<h1 class="auth-title">注册 FitCheck</h1>' +
      '<p class="auth-sub">开始你的健身打卡之旅</p>' +
      '<form id="reg-form" novalidate>' +
      '<div class="field"><label for="r-user">用户名 <em>*</em></label>' +
      '<input id="r-user" type="text" autocomplete="username" placeholder="2–24 个字符"></div>' +
      '<div class="field"><label for="r-nick">昵称（可选）</label>' +
      '<input id="r-nick" type="text" placeholder="不填则使用用户名"></div>' +
      '<div class="field"><label for="r-pass">密码 <em>*</em></label>' +
      '<input id="r-pass" type="password" autocomplete="new-password" placeholder="至少 6 位"></div>' +
      '<div class="field"><label for="r-pass2">确认密码 <em>*</em></label>' +
      '<input id="r-pass2" type="password" autocomplete="new-password" placeholder="再次输入密码"></div>' +
      '<p class="form-error" id="r-error" hidden></p>' +
      '<button class="btn btn-primary btn-block" type="submit" id="r-submit">注册并登录</button>' +
      '</form>' +
      '<p class="auth-switch">已有账号？<a href="#/login">直接登录</a></p>' +
      '</div></div>';

    const form = document.getElementById('reg-form');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      const username = document.getElementById('r-user').value.trim();
      const nickname = document.getElementById('r-nick').value.trim();
      const password = document.getElementById('r-pass').value;
      const pass2 = document.getElementById('r-pass2').value;
      if (username.length < 2 || username.length > 24) { showError('r-error', '用户名需 2–24 个字符'); return; }
      if (password.length < 6) { showError('r-error', '密码至少 6 位'); return; }
      if (password !== pass2) { showError('r-error', '两次输入的密码不一致'); return; }
      const btn = document.getElementById('r-submit');
      btn.disabled = true;
      btn.textContent = '注册中…';
      showError('r-error', '');
      API.post('/auth/register', { username: username, password: password, nickname: nickname }, { skip401: true })
        .then(function (data) {
          localStorage.setItem('fitcheck_token', data.token);
          App.toast('注册成功，欢迎加入 FitCheck！', 'success');
          location.hash = '#/home';
        })
        .catch(function (err) {
          showError('r-error', err.message || '注册失败');
          btn.disabled = false;
          btn.textContent = '注册并登录';
        });
    });
  };
})();
