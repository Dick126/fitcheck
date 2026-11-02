/* 身体数据（#/body）：录入表单 + 倒序表格 + 内联 SVG 体重折线图 */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});

  Pages.body = function (container) {
    const seq = App.beginRender();
    container.innerHTML =
      '<section class="card"><div class="card-head"><h3>📝 录入身体数据</h3></div>' +
      '<form id="body-form" class="form-grid">' +
      '<div class="field"><label for="b-date">日期</label><input id="b-date" type="date"></div>' +
      '<div class="field"><label for="b-weight">体重 (kg) <em>*</em></label>' +
      '<input id="b-weight" type="number" step="0.1" min="20" max="400" inputmode="decimal" placeholder="如 65.5"></div>' +
      '<div class="field"><label for="b-fat">体脂 (%)</label>' +
      '<input id="b-fat" type="number" step="0.1" min="1" max="70" inputmode="decimal" placeholder="选填"></div>' +
      '<div class="field"><label for="b-muscle">骨骼肌 (kg)</label>' +
      '<input id="b-muscle" type="number" step="0.1" inputmode="decimal" placeholder="选填"></div>' +
      '<div class="field"><label for="b-waist">腰围 (cm)</label>' +
      '<input id="b-waist" type="number" step="0.1" inputmode="decimal" placeholder="选填"></div>' +
      '<div class="field"><label for="b-note">备注</label>' +
      '<input id="b-note" type="text" placeholder="如：早上空腹测量"></div>' +
      '<div class="field field-full"><button class="btn btn-primary btn-block" type="submit">保存记录</button></div>' +
      '</form></section>' +
      '<section class="card"><div class="card-head"><h3>📈 体重趋势（最近 30 条）</h3></div>' +
      '<div id="body-chart"></div></section>' +
      '<section class="card"><div class="card-head"><h3>📋 历史记录</h3></div>' +
      '<div id="body-table"></div></section>';

    document.getElementById('b-date').value = App.todayStr();

    function numOrNull(id) {
      const v = document.getElementById(id).value;
      return v === '' ? null : parseFloat(v);
    }

    document.getElementById('body-form').addEventListener('submit', function (e) {
      e.preventDefault();
      const weight = document.getElementById('b-weight').value;
      if (weight === '' || isNaN(parseFloat(weight))) { App.toast('请填写体重', 'error'); return; }
      const body = {
        date: document.getElementById('b-date').value,
        weight_kg: parseFloat(weight) || null,
        body_fat: numOrNull('b-fat'),
        muscle_kg: numOrNull('b-muscle'),
        waist_cm: numOrNull('b-waist'),
        note: document.getElementById('b-note').value.trim(),
      };
      API.post('/body/records', body).then(function () {
        App.toast('已保存身体数据', 'success');
        document.getElementById('body-form').reset();
        document.getElementById('b-date').value = App.todayStr();
        load();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '保存失败', 'error');
      });
    });

    function load() {
      API.get('/body/records').then(function (records) {
        if (!App.isCurrent(seq)) return;
        renderTable(records || []);
        renderChart(records || []);
      }).catch(function (err) {
        if (!App.isCurrent(seq)) return;
        if (err && err.authHandled) return;
        document.getElementById('body-table').innerHTML = App.errorHTML(err.message || '加载失败');
      });
    }

    function renderTable(records) {
      const box = document.getElementById('body-table');
      if (!records.length) {
        box.innerHTML = '<div class="empty"><p>还没有记录，先在上方录入一条吧</p></div>';
        return;
      }
      let html = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
        '<th>日期</th><th>体重 kg</th><th>体脂 %</th><th>骨骼肌 kg</th><th>腰围 cm</th><th>备注</th><th></th></tr></thead><tbody>';
      records.forEach(function (r) {
        html += '<tr><td>' + App.esc(r.date) + '</td>' +
          '<td>' + (r.weight_kg != null ? r.weight_kg : '—') + '</td>' +
          '<td>' + (r.body_fat != null ? r.body_fat : '—') + '</td>' +
          '<td>' + (r.muscle_kg != null ? r.muscle_kg : '—') + '</td>' +
          '<td>' + (r.waist_cm != null ? r.waist_cm : '—') + '</td>' +
          '<td class="td-note">' + App.esc(r.note || '') + '</td>' +
          '<td><button type="button" class="btn btn-danger btn-mini" data-id="' + r.id + '">删除</button></td></tr>';
      });
      html += '</tbody></table></div>';
      box.innerHTML = html;
      box.querySelectorAll('button[data-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('确定删除这条记录吗？')) return;
          API.del('/body/records/' + btn.getAttribute('data-id')).then(function () {
            App.toast('已删除');
            load();
          }).catch(function (err) {
            if (err && err.authHandled) return;
            App.toast(err.message || '删除失败', 'error');
          });
        });
      });
    }

    function renderChart(records) {
      const box = document.getElementById('body-chart');
      /* 接口倒序返回，取最近 30 条并转为时间正序 */
      const rows = records.filter(function (r) { return r.weight_kg != null; }).slice(0, 30).reverse();
      if (!rows.length) {
        box.innerHTML = '<div class="empty"><p>暂无体重数据，录入后自动生成趋势图</p></div>';
        return;
      }
      if (rows.length === 1) {
        box.innerHTML = '<div class="empty"><p>只有 1 条记录，再录 1 条即可看到趋势线</p></div>' +
          '<svg viewBox="0 0 640 240" class="chart-svg" role="img" aria-label="体重折线图">' +
          '<circle cx="320" cy="110" r="5" fill="#2E8B57"/>' +
          '<text x="320" y="98" text-anchor="middle" font-size="13" fill="#1F3A5F">' +
          App.esc(String(rows[0].weight_kg)) + ' kg</text>' +
          '<text x="320" y="140" text-anchor="middle" font-size="11" fill="#6B7A8C">' +
          App.esc(rows[0].date) + '</text></svg>';
        return;
      }
      const W = 640, H = 240, padL = 48, padR = 16, padT = 20, padB = 34;
      const ws = rows.map(function (r) { return r.weight_kg; });
      let min = Math.min.apply(null, ws);
      let max = Math.max.apply(null, ws);
      if (min === max) { min -= 1; max += 1; }
      const span = max - min;
      function x(i) { return padL + i * (W - padL - padR) / (rows.length - 1); }
      function y(w) { return padT + (max - w) / span * (H - padT - padB); }
      let points = '';
      let dots = '';
      rows.forEach(function (r, i) {
        const px = x(i).toFixed(1);
        const py = y(r.weight_kg).toFixed(1);
        points += (i ? ' ' : '') + px + ',' + py;
        dots += '<circle cx="' + px + '" cy="' + py + '" r="4" fill="#2E8B57">' +
          '<title>' + App.esc(r.date + ' · ' + r.weight_kg + ' kg') + '</title></circle>';
      });
      const mid = (min + max) / 2;
      const first = rows[0];
      const last = rows[rows.length - 1];
      box.innerHTML =
        '<svg viewBox="0 0 640 240" class="chart-svg" role="img" aria-label="体重折线图">' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (H - padB) + '" stroke="#E3E8EF"/>' +
        '<line x1="' + padL + '" y1="' + (H - padB) + '" x2="' + (W - padR) + '" y2="' + (H - padB) + '" stroke="#E3E8EF"/>' +
        '<text x="' + (padL - 6) + '" y="' + (y(max) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6B7A8C">' + max.toFixed(1) + '</text>' +
        '<text x="' + (padL - 6) + '" y="' + (y(mid) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6B7A8C">' + mid.toFixed(1) + '</text>' +
        '<text x="' + (padL - 6) + '" y="' + (y(min) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#6B7A8C">' + min.toFixed(1) + '</text>' +
        '<polyline points="' + points + '" fill="none" stroke="#1F3A5F" stroke-width="2.5" stroke-linejoin="round"/>' +
        dots +
        '<text x="' + padL + '" y="' + (H - 10) + '" text-anchor="start" font-size="11" fill="#6B7A8C">' + App.esc(first.date.slice(5)) + '</text>' +
        '<text x="' + (W - padR) + '" y="' + (H - 10) + '" text-anchor="end" font-size="11" fill="#6B7A8C">' + App.esc(last.date.slice(5)) + '</text>' +
        '</svg>' +
        '<p class="chart-caption">最新：' + App.esc(String(last.weight_kg)) + ' kg（' + App.esc(last.date) + '）· ' +
        '区间 ' + min.toFixed(1) + ' – ' + max.toFixed(1) + ' kg</p>';
    }

    load();
  };
})();
