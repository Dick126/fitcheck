/* 今日（首页 #/home） */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});

  Pages.home = function (container) {
    const seq = App.beginRender();
    container.innerHTML = App.loadingHTML('正在加载今日数据…');

    Promise.all([
      API.get('/auth/me'),
      API.get('/stats'),
      API.get('/profile'),
      API.get('/plans/current'),
      API.get('/feed'),
    ]).then(function (res) {
      if (!App.isCurrent(seq)) return;
      const me = res[0], stats = res[1], profile = res[2], plan = res[3], feed = res[4];
      const today = new Date();
      const todayStr = App.todayStr(today);
      const month = App.monthStr(today.getFullYear(), today.getMonth());
      API.get('/checkins?month=' + encodeURIComponent(month)).then(function (checkins) {
        if (!App.isCurrent(seq)) return;
        render(me, stats, profile, plan, feed, checkins || [], todayStr);
      }).catch(function (err) {
        if (!App.isCurrent(seq)) return;
        if (err && err.authHandled) return;
        render(me, stats, profile, plan, feed, [], todayStr);
      });
    }).catch(function (err) {
      if (!App.isCurrent(seq)) return;
      if (err && err.authHandled) return;
      container.innerHTML = App.errorHTML(err.message || '加载失败');
    });
  };

  function feedItemHTML(c) {
    const acts = [];
    (c.plan_items || []).forEach(function (it) { if (it.done && it.name) acts.push(it.name); });
    (c.custom_items || []).forEach(function (t) { acts.push(t); });
    const actCount = acts.length;
    const actText = actCount ? App.trim(acts.join('、'), 36) : '完成打卡';
    const badge = { done: ['完成', 'badge-done'], rest: ['休息', 'badge-rest'], skip: ['跳过', 'badge-skip'] }[c.status] || ['完成', 'badge-done'];
    return '<div class="feed-item">' +
      '<div class="feed-head"><span class="avatar">' + App.esc(String(c.nickname || '?').slice(0, 1)) + '</span>' +
      '<div class="feed-who"><b>' + App.esc(c.nickname || '好友') + '</b>' +
      '<span class="feed-date">' + App.dateZh(c.date) + '</span></div>' +
      '<span class="badge ' + badge[1] + '">' + badge[0] + '</span>' +
      '<span class="feed-likes">❤️ ' + App.likeCount(c.id, c.like_count) + '</span></div>' +
      '<p class="feed-acts">🏋️ ' + App.esc(actCount + ' 个动作 · ' + actText) + '</p>' +
      (c.notes ? '<p class="feed-notes">' + App.esc(App.trim(c.notes, 60)) + '</p>' : '') +
      '</div>';
  }

  function render(me, stats, profile, plan, feed, checkins, todayStr) {
    const container = document.getElementById('page');
    const nickname = (me && me.user && me.user.nickname) || '朋友';
    const hour = new Date().getHours();
    const greet = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
    const dateLabel = App.dateZh(todayStr) + ' ' + App.weekdayZh(todayStr);

    const target = profile && profile.days_per_week ? profile.days_per_week : null;
    const weekLabel = target
      ? '本周完成 ' + (stats ? stats.week_done : 0) + '/' + target
      : '本周完成 ' + (stats ? stats.week_done : 0) + ' 次';

    let html = '';
    html += '<header class="home-head card">' +
      '<div class="home-head-text"><h2>' + greet + '，' + App.esc(nickname) + ' 👋</h2>' +
      '<p class="home-date">' + dateLabel + '</p></div>' +
      '<div class="home-chips">' +
      '<span class="chip chip-fire">🔥 连续 ' + (stats ? stats.streak : 0) + ' 天</span>' +
      '<span class="chip chip-ok">✅ ' + weekLabel + '</span>' +
      '</div></header>';

    const todayIdx = App.planIndex(todayStr);
    const day = plan && plan.days ? (plan.days.find(function (d) { return d.index === todayIdx; }) || null) : null;
    const hasCheckin = (checkins || []).some(function (c) { return c.date === todayStr; });

    /* 督促横幅 */
    if (plan && plan.days) {
      if (!day || !day.exercises || !day.exercises.length) {
        html += '<div class="banner banner-rest"><span class="banner-icon">😌</span>' +
          '<div class="banner-text"><b>今天是休息日</b><span>好好恢复，睡够 8 小时</span></div></div>';
      } else if (!hasCheckin) {
        html += '<div class="banner banner-alert"><span class="banner-icon">🔥</span>' +
          '<div class="banner-text"><b>今天还没练！</b><span>' + App.esc(day.title || '') + '</span></div>' +
          '<button type="button" class="btn btn-primary btn-small" id="home-banner-ck">去打卡</button></div>';
      } else {
        html += '<div class="banner banner-ok"><span class="banner-icon">✅</span>' +
          '<div class="banner-text"><b>今日已打卡</b><span>继续保持，肌肉在感谢你</span></div></div>';
      }
    }

    /* 今日计划卡 */
    if (plan && day) {
      html += '<section class="card">' +
        '<div class="card-head"><h3>📋 今日计划</h3><span class="card-sub">' + App.esc(day.title || '') + '</span></div>';
      if (day.warmup) {
        html += '<div class="warmup"><b>热身：</b>' + App.esc(day.warmup) + '</div>';
      }
      if (day.exercises && day.exercises.length) {
        html += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>动作</th><th>器械</th><th>组 × 次</th><th>休息</th><th>要点</th></tr></thead><tbody>';
        day.exercises.forEach(function (e) {
          html += '<tr><td><b>' + App.esc(e.name) + '</b></td><td>' + App.esc(e.equipment || '—') + '</td>' +
            '<td>' + App.esc(e.sets || '—') + '</td><td>' + App.esc(e.rest || '—') + '</td>' +
            '<td class="td-note">' + App.esc(e.note || '') + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p class="hint">今天没有安排动作，休息一下吧。</p>';
      }
      html += '<button type="button" class="btn btn-primary btn-block" id="home-checkin">✅ 打卡</button></section>';
    } else if (!plan) {
      html += '<section class="card empty-card">' +
        '<div class="empty-icon">🏋️</div><h3>还没有训练计划</h3>' +
        '<p class="hint">根据你的目标和身体数据，生成专属的一周训练与饮食计划</p>' +
        '<a class="btn btn-primary btn-block" href="#/plan">生成我的计划</a></section>';
    }

    /* 好友动态（最近 5 条） */
    html += '<section class="card">' +
      '<div class="card-head"><h3>👥 好友动态</h3><a class="card-link" href="#/circle">查看全部</a></div>';
    const items = (feed || []).slice(0, 5);
    if (!items.length) {
      html += '<div class="empty"><p>还没有好友动态，去「圈子」加入或创建圈子吧～</p></div>';
    } else {
      items.forEach(function (c) { html += feedItemHTML(c); });
    }
    html += '</section>';

    container.innerHTML = html;

    const ckBtn = document.getElementById('home-checkin');
    if (ckBtn) ckBtn.addEventListener('click', function () { CheckinDialog.open(todayStr); });
    const bannerBtn = document.getElementById('home-banner-ck');
    if (bannerBtn) bannerBtn.addEventListener('click', function () { CheckinDialog.open(todayStr); });
  }
})();
