/* 设置（#/settings）：资料、浏览器通知、退出登录 */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});

  Pages.settings = function (container) {
    const seq = App.beginRender();
    container.innerHTML = App.loadingHTML('正在加载资料…');
    Promise.all([API.get('/profile'), API.get('/auth/me')]).then(function (res) {
      if (!App.isCurrent(seq)) return;
      render(container, res[0] || {}, res[1]);
    }).catch(function (err) {
      if (!App.isCurrent(seq)) return;
      if (err && err.authHandled) return;
      container.innerHTML = App.errorHTML(err.message || '加载失败');
    });
  };

  function numOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseFloat(v);
  }
  function intOrNull(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : parseInt(v, 10);
  }

  function render(container, p, me) {
    const nickname = me && me.user ? me.user.nickname : '';
    const username = me && me.user ? me.user.username : '';

    function opt(sel, val, label) {
      return '<option value="' + val + '"' + (sel === val ? ' selected' : '') + '>' + label + '</option>';
    }

    container.innerHTML =
      '<section class="card"><div class="card-head"><h3>👤 账号</h3></div>' +
      '<div class="acc-row"><span class="avatar avatar-lg">' + App.esc(String(nickname || username || '?').slice(0, 1)) + '</span>' +
      '<div><b>' + App.esc(nickname || username || '') + '</b>' +
      '<p class="hint">@' + App.esc(username || '') + '</p></div></div>' +
      '<form id="nick-form" class="form-grid">' +
      '<div class="field field-full"><label for="p-nick">昵称（1–24 个字符）</label>' +
      '<input id="p-nick" maxlength="24" value="' + App.esc(nickname || '') + '"></div>' +
      '<div class="field field-full"><button class="btn btn-ghost btn-block" type="submit">保存昵称</button></div>' +
      '</form></section>' +
      '<section class="card"><div class="card-head"><h3>⚙️ 训练资料</h3>' +
      '<span class="card-sub">用于生成个性化计划</span></div>' +
      '<form id="profile-form" class="form-grid">' +
      '<div class="field"><label for="p-height">身高 (cm)</label>' +
      '<input id="p-height" type="number" step="1" min="100" max="250" inputmode="numeric" value="' + (p.height_cm != null ? p.height_cm : '') + '"></div>' +
      '<div class="field"><label for="p-gender">性别</label><select id="p-gender">' +
      opt(p.gender, 'male', '男') + opt(p.gender, 'female', '女') + '</select></div>' +
      '<div class="field"><label for="p-birth">出生年份</label>' +
      '<input id="p-birth" type="number" step="1" min="1930" max="2020" inputmode="numeric" value="' + (p.birth_year != null ? p.birth_year : '') + '"></div>' +
      '<div class="field"><label for="p-goal">目标</label><select id="p-goal">' +
      opt(p.goal, 'lean_muscle', '增肌薄肌') + opt(p.goal, 'cut', '减脂') + opt(p.goal, 'shape', '塑形') + '</select></div>' +
      '<div class="field"><label for="p-equip">器械</label><select id="p-equip">' +
      opt(p.equipment, 'gym', '健身房') + opt(p.equipment, 'home', '居家') + '</select></div>' +
      '<div class="field"><label for="p-days">每周训练天数</label><select id="p-days">' +
      [3, 4, 5, 6].map(function (n) { return opt(p.days_per_week, n, n + ' 天'); }).join('') + '</select></div>' +
      '<div class="field"><label for="p-time">训练时段</label><select id="p-time">' +
      opt(p.training_time, 'morning', '早晨') + opt(p.training_time, 'noon', '中午') + opt(p.training_time, 'evening', '晚上') + '</select></div>' +
      '<div class="field"><label for="p-remind">提醒时间</label>' +
      '<input id="p-remind" type="time" value="' + App.esc(p.remind_time || '07:00') + '"></div>' +
      '<div class="field field-full"><label for="p-apikey">我的 DeepSeek API Key（可选）</label>' +
      '<input id="p-apikey" type="password" autocomplete="off" placeholder="' +
      (p.has_api_key ? '已设置（留空保存会清除，改回使用圈主提供的 Key）' : '留空则使用圈主提供的 Key') + '">' +
      '<p class="hint">Key 只保存在你自己的账号资料里，任何人（包括管理员）都看不到。</p></div>' +
      '<div class="field field-full"><button class="btn btn-primary btn-block" type="submit">保存资料</button></div>' +
      '</form></section>' +
      '<section class="card"><div class="card-head"><h3>🔔 提醒</h3></div>' +
      '<p class="hint">开启浏览器通知，到点提醒你训练。</p>' +
      '<button type="button" class="btn btn-ghost" id="notify-btn">开启浏览器通知</button>' +
      '<p class="hint" id="notify-state"></p></section>' +
      '<section class="card"><div class="card-head"><h3>📤 数据导出</h3>' +
      '<span class="card-sub">备份到本地</span></div>' +
      '<div class="circle-actions">' +
      '<button type="button" class="btn btn-ghost" id="export-checkins">导出打卡记录（CSV）</button>' +
      '<button type="button" class="btn btn-ghost" id="export-body">导出身体数据（CSV）</button>' +
      '</div><p class="hint">用 Excel / WPS 打开，包含全部历史记录。</p></section>' +
      '<section class="card"><div class="card-head"><h3>🔒 修改密码</h3></div>' +
      '<form id="pwd-form" class="form-grid">' +
      '<div class="field field-full"><label for="pwd-old">原密码</label>' +
      '<input id="pwd-old" type="password" autocomplete="current-password"></div>' +
      '<div class="field field-full"><label for="pwd-new">新密码（至少 6 位）</label>' +
      '<input id="pwd-new" type="password" autocomplete="new-password"></div>' +
      '<div class="field field-full"><label for="pwd-new2">确认新密码</label>' +
      '<input id="pwd-new2" type="password" autocomplete="new-password"></div>' +
      '<div class="field field-full"><button class="btn btn-primary btn-block" type="submit">修改密码</button></div>' +
      '</form></section>' +
      '<section class="card"><div class="card-head"><h3>🚪 账号操作</h3></div>' +
      '<button type="button" class="btn btn-danger" id="logout-btn">退出登录</button></section>' +
      '<p class="ver">FitCheck v0.1</p>';

    document.getElementById('profile-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const remind = document.getElementById('p-remind').value;
      const body = {
        height_cm: numOrNull('p-height'),
        gender: document.getElementById('p-gender').value,
        birth_year: intOrNull('p-birth'),
        goal: document.getElementById('p-goal').value,
        equipment: document.getElementById('p-equip').value,
        days_per_week: intOrNull('p-days'),
        training_time: document.getElementById('p-time').value,
        remind_time: remind || null,
        api_key: document.getElementById('p-apikey').value,
      };
      API.put('/profile', body).then(function () {
        App.toast('资料已保存', 'success');
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '保存失败', 'error');
      });
    });

    document.getElementById('nick-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var nick = document.getElementById('p-nick').value.trim();
      if (nick.length < 1 || nick.length > 24) {
        App.toast('昵称需 1–24 个字符', 'error');
        return;
      }
      API.put('/profile', { nickname: nick }).then(function () {
        App.toast('昵称已更新', 'success');
        if (App.profile) App.profile.nickname = nick;
        setTimeout(function () { App.refresh(); }, 500);
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '保存失败', 'error');
      });
    });

    document.getElementById('pwd-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var oldP = document.getElementById('pwd-old').value;
      var newP = document.getElementById('pwd-new').value;
      var newP2 = document.getElementById('pwd-new2').value;
      if (!oldP) { App.toast('请输入原密码', 'error'); return; }
      if (newP.length < 6) { App.toast('新密码至少 6 位', 'error'); return; }
      if (newP !== newP2) { App.toast('两次输入的新密码不一致', 'error'); return; }
      API.post('/auth/change-password', { old_password: oldP, new_password: newP }).then(function () {
        App.toast('密码已修改，下次用新密码登录', 'success');
        e.target.reset();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '修改失败', 'error');
      });
    });

    function downloadCSV(path, name) {
      fetch(path, { headers: { Authorization: 'Bearer ' + API.getToken() } }).then(function (resp) {
        if (!resp.ok) throw new Error('导出失败（' + resp.status + '）');
        return resp.blob();
      }).then(function (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        App.toast('已开始下载', 'success');
      }).catch(function (err) {
        App.toast(err.message || '导出失败', 'error');
      });
    }

    document.getElementById('export-checkins').addEventListener('click', function () {
      downloadCSV('/api/export/checkins.csv', 'fitcheck-checkins.csv');
    });
    document.getElementById('export-body').addEventListener('click', function () {
      downloadCSV('/api/export/body.csv', 'fitcheck-body.csv');
    });

    document.getElementById('notify-btn').addEventListener('click', function () {
      const stateEl = document.getElementById('notify-state');
      if (!('Notification' in window)) {
        stateEl.textContent = '❌ 当前浏览器不支持通知';
        App.toast('当前浏览器不支持通知', 'error');
        return;
      }
      if (Notification.permission === 'granted') {
        App.toast('浏览器通知已开启', 'success');
        stateEl.textContent = '✅ 通知已开启';
        try { new Notification('FitCheck', { body: '到点训练啦，加油！' }); } catch (e) { /* ignore */ }
      } else if (Notification.permission === 'denied') {
        App.toast('通知已被浏览器拒绝，请在浏览器设置中允许', 'error');
        stateEl.textContent = '❌ 通知被拒绝，请在浏览器设置中开启';
      } else {
        Notification.requestPermission().then(function (perm) {
          if (perm === 'granted') {
            App.toast('已开启浏览器通知', 'success');
            stateEl.textContent = '✅ 通知已开启';
            try { new Notification('FitCheck', { body: '到点训练啦，加油！' }); } catch (e) { /* ignore */ }
          } else {
            App.toast('未开启通知', 'error');
            stateEl.textContent = '未开启';
          }
        });
      }
    });

    document.getElementById('logout-btn').addEventListener('click', function () {
      if (!confirm('确定退出登录吗？')) return;
      API.clearToken();
      App.toast('已退出登录');
      location.hash = '#/login';
    });
  }
})();
