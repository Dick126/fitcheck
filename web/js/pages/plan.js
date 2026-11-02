/* 训练计划（#/plan） */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});
  const GOAL_LABEL = { lean_muscle: '增肌薄肌', cut: '减脂', shape: '塑形' };

  Pages.plan = function (container) {
    const seq = App.beginRender();
    container.innerHTML = App.loadingHTML('正在加载计划…');
    API.get('/plans/current').then(function (plan) {
      if (!App.isCurrent(seq)) return;
      if (!plan) { renderEmpty(container); return; }
      renderPlan(container, plan);
    }).catch(function (err) {
      if (!App.isCurrent(seq)) return;
      if (err && err.authHandled) return;
      container.innerHTML = App.errorHTML(err.message || '加载失败');
    });
  };

  function renderEmpty(container) {
    container.innerHTML =
      '<section class="card empty-card"><div class="empty-icon">🏋️</div>' +
      '<h3>还没有训练计划</h3>' +
      '<p class="hint">根据你的身体数据和训练目标，生成专属的一周训练 + 饮食计划</p>' +
      '<button type="button" class="btn btn-primary btn-block" id="plan-generate">生成我的计划</button></section>';
    document.getElementById('plan-generate').addEventListener('click', function () {
      const btn = document.getElementById('plan-generate');
      btn.disabled = true;
      btn.textContent = '生成中…';
      API.post('/plans/generate', {}).then(function () {
        App.toast('计划已生成！', 'success');
        App.refresh();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '生成失败，请稍后重试', 'error');
        btn.disabled = false;
        btn.textContent = '生成我的计划';
      });
    });
  }

  function renderPlan(container, plan) {
    const goalLabel = GOAL_LABEL[plan.goal] || plan.goal || '—';
    const weight = plan.weight != null ? plan.weight : '—';
    let html = '';
    html += '<div class="plan-top">' +
      '<h2>📋 我的训练计划</h2>' +
      '<button type="button" class="btn btn-primary" id="plan-regen">🔄 重新生成</button></div>' +
      '<p class="hint">计划周期：' + App.esc(plan.week_start || '') + '（周一）起 · 目标：' + App.esc(goalLabel) +
      ' · 参考体重 ' + App.esc(String(weight)) + ' kg</p>';

    /* AI 教练的话 */
    if (plan.coach_note) {
      html += '<section class="coach-card"><div class="coach-head">🤖 AI 教练的话</div>' +
        '<p>' + App.esc(plan.coach_note) + '</p></section>';
    }

    /* 饮食 */
    if (plan.diet) {
      const d = plan.diet;
      html += '<section class="card">' +
        '<div class="card-head"><h3>🍚 每日营养</h3>' +
        '<span class="card-sub">参考体重 ' + App.esc(String(weight)) + ' kg</span></div>' +
        '<div class="diet-macro">' +
        '<div class="diet-kcal"><b>' + (d.kcal != null ? d.kcal : '—') + '</b><span>kcal / 天</span></div>' +
        '<div class="diet-chips">' +
        '<span class="chip">🥩 蛋白质 ' + (d.protein != null ? d.protein : '—') + ' g</span>' +
        '<span class="chip">🥑 脂肪 ' + (d.fat != null ? d.fat : '—') + ' g</span>' +
        '<span class="chip">🍚 碳水 ' + (d.carbs != null ? d.carbs : '—') + ' g</span>' +
        '</div></div>';
      if (d.meals && d.meals.length) {
        html += '<div class="meals">';
        d.meals.forEach(function (m) {
          html += '<div class="meal-row">' +
            '<div class="meal-head"><b>' + App.esc(m.name || '') + '</b>' +
            '<span class="badge badge-kcal">' + App.esc(String(m.kcal != null ? m.kcal : '—')) + ' kcal</span></div>' +
            '<p class="hint">' + App.esc(m.content || '') + '</p></div>';
        });
        html += '</div>';
      }
      html += '</section>';
    }

    /* 7 天安排 */
    const days = (plan.days || []).slice().sort(function (a, b) { return a.index - b.index; });
    html += '<h3 class="section-title">一周安排</h3>';
    if (!days.length) html += '<div class="empty"><p>暂无安排</p></div>';
    days.forEach(function (day) {
      const isRest = !day.exercises || !day.exercises.length;
      html += '<section class="card day-card">' +
        '<div class="card-head"><h3>' + App.esc(day.title || ('第 ' + day.index + ' 天')) + '</h3>' +
        (isRest ? '<span class="badge badge-rest">休息</span>' : '') + '</div>';
      if (!isRest && day.warmup) {
        html += '<div class="warmup"><b>热身：</b>' + App.esc(day.warmup) + '</div>';
      }
      if (!isRest) {
        html += '<div class="tbl-wrap"><table class="tbl"><thead><tr>' +
          '<th>动作</th><th>器械</th><th>组 × 次</th><th>休息</th><th>要点</th></tr></thead><tbody>';
        day.exercises.forEach(function (e) {
          html += '<tr><td><b>' + App.esc(e.name) + '</b></td><td>' + App.esc(e.equipment || '—') + '</td>' +
            '<td>' + App.esc(e.sets || '—') + '</td><td>' + App.esc(e.rest || '—') + '</td>' +
            '<td class="td-note">' + App.esc(e.note || '') + '</td></tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p class="hint">' + App.esc(day.warmup || '休息日，好好恢复') + '</p>';
      }
      html += '</section>';
    });

    container.innerHTML = html;
    document.getElementById('plan-regen').addEventListener('click', function () {
      if (!confirm('重新生成会覆盖当前计划，确定吗？')) return;
      const btn = document.getElementById('plan-regen');
      btn.disabled = true;
      btn.textContent = '生成中…';
      API.post('/plans/generate', {}).then(function () {
        App.toast('新计划已生成！', 'success');
        App.refresh();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '生成失败', 'error');
        btn.disabled = false;
        btn.textContent = '🔄 重新生成';
      });
    });
  }
})();
