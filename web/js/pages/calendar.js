/* 打卡日历（#/calendar） */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});

  const state = { year: null, month: null, seq: 0, inited: false };

  Pages.calendar = function (container) {
    const now = new Date();
    if (!state.inited) {
      state.year = now.getFullYear();
      state.month = now.getMonth();
      state.inited = true;
    }
    const seq = App.beginRender();
    state.seq = seq;
    container.innerHTML =
      '<section class="card">' +
      '<div class="cal-head">' +
      '<button type="button" class="cal-nav" id="cal-prev" aria-label="上月">‹</button>' +
      '<div class="cal-title"><h3 id="cal-label"></h3>' +
      '<button type="button" class="cal-today" id="cal-today">回到今天</button></div>' +
      '<button type="button" class="cal-nav" id="cal-next" aria-label="下月">›</button>' +
      '</div>' +
      '<div class="cal-week">' +
      ['一', '二', '三', '四', '五', '六', '日'].map(function (d) { return '<span>' + d + '</span>'; }).join('') +
      '</div>' +
      '<div class="cal-grid" id="cal-grid"></div>' +
      '<div class="cal-legend">' +
      '<span><i class="dot dot-done"></i>完成</span>' +
      '<span><i class="dot dot-rest"></i>休息</span>' +
      '<span><i class="dot dot-skip"></i>跳过</span>' +
      '<span><i class="dot dot-none"></i>未记录</span>' +
      '<span><i class="ring"></i>今天</span>' +
      '</div>' +
      '</section>' +
      '<section class="card"><div class="card-head"><h3>🔥 年度打卡热力图</h3>' +
      '<span class="card-sub">最近一年</span></div>' +
      '<div class="heat-wrap"><div class="heat-grid" id="heat-grid"></div></div>' +
      '<div class="heat-legend"><span><i class="heat-cell heat-0"></i>未打卡</span>' +
      '<span><i class="heat-cell heat-1"></i>1 次</span>' +
      '<span><i class="heat-cell heat-2"></i>2 次</span>' +
      '<span><i class="heat-cell heat-3"></i>3 次以上</span></div>' +
      '</section>';

    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-label');

    function load() {
      if (state.seq !== seq) return;
      grid.innerHTML = App.loadingHTML('');
      API.get('/checkins?month=' + encodeURIComponent(App.monthStr(state.year, state.month)))
        .then(function (list) {
          if (state.seq !== seq) return;
          paint(list || []);
        })
        .catch(function (err) {
          if (state.seq !== seq) return;
          if (err && err.authHandled) return;
          grid.innerHTML = '<p class="form-error">' + App.esc(err.message || '加载失败') + '</p>';
        });
    }

    function paint(checkins) {
      label.textContent = state.year + ' 年 ' + (state.month + 1) + ' 月';
      const byDate = {};
      checkins.forEach(function (c) { byDate[c.date] = c; });
      const first = new Date(state.year, state.month, 1);
      const offset = (first.getDay() + 6) % 7;
      const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
      const todayStr = App.todayStr();
      let html = '';
      for (let i = 0; i < offset; i++) html += '<div class="cal-cell cal-blank"></div>';
      for (let d = 1; d <= daysInMonth; d++) {
        const ds = App.todayStr(new Date(state.year, state.month, d));
        const rec = byDate[ds];
        const cls = ['cal-cell'];
        if (ds === todayStr) cls.push('today');
        if (rec) cls.push('has');
        html += '<button type="button" class="' + cls.join(' ') + '" data-date="' + ds + '">' +
          '<span class="cal-num">' + d + '</span>' +
          '<span class="cal-dot ' + (rec ? 'dot-' + rec.status : 'dot-none') + '"></span></button>';
      }
      grid.innerHTML = html;
      grid.querySelectorAll('.cal-cell[data-date]').forEach(function (cell) {
        cell.addEventListener('click', function () {
          CheckinDialog.open(cell.getAttribute('data-date'));
        });
      });
      const todayBtn = document.getElementById('cal-today');
      const n = new Date();
      todayBtn.classList.toggle('on', state.year === n.getFullYear() && state.month === n.getMonth());
    }

    document.getElementById('cal-prev').addEventListener('click', function () {
      state.month--;
      if (state.month < 0) { state.month = 11; state.year--; }
      load();
    });
    document.getElementById('cal-next').addEventListener('click', function () {
      state.month++;
      if (state.month > 11) { state.month = 0; state.year++; }
      load();
    });
    document.getElementById('cal-today').addEventListener('click', function () {
      const n = new Date();
      state.year = n.getFullYear();
      state.month = n.getMonth();
      load();
    });

    load();
    loadHeat();

    /* ---------- 年度热力图 ---------- */
    function loadHeat() {
      API.get('/stats/heatmap').then(function (map) {
        if (state.seq !== seq) return;
        const grid = document.getElementById('heat-grid');
        if (!grid) return;
        map = map || {};
        const today = new Date();
        const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const start = new Date(end);
        start.setDate(start.getDate() - 364);
        const offset = (start.getDay() + 6) % 7; /* 周一为 0 */
        start.setDate(start.getDate() - offset);
        let html = '';
        const cur = new Date(start);
        while (cur <= end) {
          const ds = App.todayStr(cur);
          const n = map[ds] || 0;
          const lvl = n >= 3 ? 3 : n === 2 ? 2 : n === 1 ? 1 : 0;
          html += '<span class="heat-cell heat-' + lvl + '" title="' + ds +
            (n ? ' · 已打卡' : ' · 未打卡') + '"></span>';
          cur.setDate(cur.getDate() + 1);
        }
        grid.innerHTML = html;
      }).catch(function () { /* ignore */ });
    }
  };
})();
