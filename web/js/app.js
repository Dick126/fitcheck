/* FitCheck 前端主程序：路由、导航与通用 UI 工具 */
(function () {
  'use strict';

  const App = (window.App = window.App || {});

  /* ---------- 日期工具 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  App.todayStr = function (d) {
    const t = d || new Date();
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  };
  App.monthStr = function (y, m) { return y + '-' + pad2(m + 1); };
  /* JS getDay(): 0=周日 → 计划 index 7；1=周一 → 1 */
  App.planIndex = function (d) {
    const t = d instanceof Date ? d : new Date(String(d) + 'T00:00:00');
    const g = t.getDay();
    return g === 0 ? 7 : g;
  };
  App.weekdayZh = function (dateStr) {
    const g = new Date(String(dateStr) + 'T00:00:00').getDay();
    return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][g];
  };
  App.dateZh = function (dateStr) {
    const t = new Date(String(dateStr) + 'T00:00:00');
    return (t.getMonth() + 1) + '月' + t.getDate() + '日';
  };
  /* "4×6–8" → {sets:'4', reps:'6–8'} */
  App.parseSets = function (s) {
    const str = String(s || '');
    const i = str.indexOf('×');
    if (i > 0) return { sets: str.slice(0, i).trim(), reps: str.slice(i + 1).trim() };
    return { sets: '', reps: str.trim() };
  };
  App.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  App.trim = function (s, n) {
    const t = String(s || '');
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  /* ---------- Toast 轻提示 ---------- */
  App.toast = function (msg, type) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast-' + type : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(function () { el.classList.add('toast-out'); }, 2200);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 2700);
  };

  /* ---------- 弹窗 ---------- */
  App.modalGuard = null;
  App.openModal = function (html) {
    App.closeModal(true);
    const root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-overlay"><div class="modal" role="dialog">' + html + '</div></div>';
    const overlay = root.firstElementChild;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) App.closeModal();
    });
    document.body.classList.add('modal-open');
    return overlay.querySelector('.modal');
  };
  App.closeModal = function (force) {
    if (!force && typeof App.modalGuard === 'function') {
      if (!App.modalGuard()) return;
    }
    App.modalGuard = null;
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
  };

  /* ---------- 星级选择 ---------- */
  App.starsHTML = function (value) {
    let h = '<span class="stars" data-value="' + (value || 0) + '">';
    for (let i = 1; i <= 5; i++) h += '<button type="button" class="star" data-i="' + i + '">★</button>';
    return h + '</span>';
  };
  App.initStars = function (root) {
    root.querySelectorAll('.stars').forEach(function (group) {
      let val = parseInt(group.getAttribute('data-value') || '0', 10);
      function paint() {
        group.querySelectorAll('.star').forEach(function (b) {
          b.classList.toggle('on', parseInt(b.getAttribute('data-i'), 10) <= val);
        });
        group.setAttribute('data-value', String(val));
      }
      group.querySelectorAll('.star').forEach(function (b) {
        b.addEventListener('click', function () {
          val = parseInt(b.getAttribute('data-i'), 10);
          paint();
        });
      });
      paint();
    });
  };

  /* ---------- 渲染守卫（防止过期异步渲染覆盖新页面） ---------- */
  let renderSeq = 0;
  App.beginRender = function () { return ++renderSeq; };
  App.isCurrent = function (seq) { return seq === renderSeq; };

  App.loadingHTML = function (text) {
    return '<div class="loading"><div class="spinner"></div>' +
      (text ? '<p>' + App.esc(text) + '</p>' : '') + '</div>';
  };
  App.errorHTML = function (msg) {
    return '<div class="empty"><p>😵 ' + App.esc(msg || '加载失败') + '</p>' +
      '<button type="button" class="btn btn-ghost btn-small" onclick="App.refresh()">重试</button></div>';
  };

  /* ---------- 复制 ---------- */
  App.copyText = function (text) {
    function fallback() {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch (e) { return false; }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(
        function () { return true; },
        function () { return fallback(); }
      );
    }
    return Promise.resolve(fallback());
  };

  /* ---------- 点赞数本地缓存（feed 接口不返回 likes 计数） ---------- */
  App.likeCache = {};
  App.likeCount = function (id, serverCount) {
    if (typeof serverCount === 'number') return serverCount;
    return App.likeCache[id] || 0;
  };
  App.setLike = function (id, count) { App.likeCache[id] = count; };

  /* ---------- 路由与导航 ---------- */
  const NAV = [
    { hash: '#/home', icon: '☀️', label: '今日' },
    { hash: '#/calendar', icon: '📅', label: '日历' },
    { hash: '#/plan', icon: '📋', label: '计划' },
    { hash: '#/body', icon: '📏', label: '身体' },
    { hash: '#/circle', icon: '👥', label: '圈子' },
    { hash: '#/settings', icon: '⚙️', label: '设置' },
  ];
  const ROUTES = {
    '#/home': { page: 'home', title: '今日', hash: '#/home' },
    '#/calendar': { page: 'calendar', title: '打卡日历', hash: '#/calendar' },
    '#/plan': { page: 'plan', title: '训练计划', hash: '#/plan' },
    '#/body': { page: 'body', title: '身体数据', hash: '#/body' },
    '#/circle': { page: 'circle', title: '健身圈子', hash: '#/circle' },
    '#/settings': { page: 'settings', title: '设置', hash: '#/settings' },
    '#/login': { page: 'login', title: '登录', hash: '#/login', auth: false },
    '#/register': { page: 'register', title: '注册', hash: '#/register', auth: false },
  };

  function buildNav() {
    const tab = document.getElementById('tabbar');
    const side = document.getElementById('side-nav');
    let t = '', s = '';
    NAV.forEach(function (item) {
      const badge = item.hash === '#/circle' ? '<span class="nav-badge" data-badge="circle" hidden></span>' : '';
      t += '<a class="nav-item" data-hash="' + item.hash + '" href="' + item.hash + '">' +
        '<span class="nav-icon">' + item.icon + '</span><span class="nav-label">' + item.label + '</span>' + badge + '</a>';
      s += '<a class="side-item" data-hash="' + item.hash + '" href="' + item.hash + '">' +
        '<span class="nav-icon">' + item.icon + '</span><span>' + item.label + '</span>' + badge + '</a>';
    });
    tab.innerHTML = t;
    side.innerHTML = s;
  }

  /* ---------- 未读通知角标 ---------- */
  App.unread = 0;
  App.setUnread = function (n) {
    App.unread = n || 0;
    document.querySelectorAll('[data-badge="circle"]').forEach(function (el) {
      if (App.unread > 0) {
        el.textContent = App.unread > 99 ? '99+' : String(App.unread);
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });
  };
  App.loadUnread = function () {
    if (!window.API.getToken()) return;
    window.API.get('/notifications?limit=1').then(function (data) {
      App.setUnread(data && data.unread ? data.unread : 0);
    }).catch(function () { /* ignore */ });
  };
  setInterval(App.loadUnread, 60 * 1000);

  function highlight(hash) {
    document.querySelectorAll('.nav-item, .side-item').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-hash') === hash);
    });
  }

  function renderPage(def) {
    const container = document.getElementById('page');
    window.scrollTo(0, 0);
    document.title = 'FitCheck · ' + def.title;
    highlight(def.hash);
    const fn = window.Pages && window.Pages[def.page];
    if (fn) fn(container);
    else container.innerHTML = App.errorHTML('页面不存在');
    if (def.auth !== false) App.loadUnread();
  }

  function route() {
    const key = (location.hash || '#/home').split('?')[0];
    const def = ROUTES[key] || ROUTES['#/home'];
    const hasToken = !!window.API.getToken();
    if (def.auth !== false && !hasToken) {
      document.body.classList.add('app-auth');
      renderPage(ROUTES['#/login']);
      if (location.hash !== '#/login') location.replace('#/login');
      return;
    }
    if (def.auth === false && hasToken) {
      document.body.classList.remove('app-auth');
      renderPage(ROUTES['#/home']);
      if (location.hash !== '#/home') location.replace('#/home');
      return;
    }
    document.body.classList.toggle('app-auth', def.auth === false);
    renderPage(def);
  }

  App.refresh = function () { route(); };
  App.redirectLogin = function (msg) {
    App.toast(msg || '登录已过期，请重新登录', 'error');
    const key = (location.hash || '').split('?')[0];
    if (key !== '#/login') location.hash = '#/login';
    else route();
  };

  /* ---------- 每日提醒：页面开着时按资料里的提醒时间弹通知 ---------- */
  App.profile = null;
  function loadProfile() {
    if (!window.API.getToken()) return;
    window.API.get('/profile').then(function (data) {
      App.profile = data || {};
    }).catch(function () { /* 未登录时忽略 */ });
  }
  let reminderLast = '';
  function reminderTick() {
    if (!window.API.getToken() || !App.profile || !App.profile.remind_time) return;
    const now = new Date();
    const hhmm = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    if (hhmm !== App.profile.remind_time) return;
    const key = App.todayStr() + '|' + hhmm;
    if (reminderLast === key) return;
    reminderLast = key;
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('FitCheck · 该训练了', { body: '到点啦！今天还没打卡的话，动起来 💪' }); } catch (e) { /* ignore */ }
    }
    App.toast('到训练时间啦，记得打卡！');
  }
  setInterval(reminderTick, 30000);
  setInterval(loadProfile, 5 * 60 * 1000);
  loadProfile();

  function init() {
    buildNav();
    window.addEventListener('hashchange', route);
    route();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
