/* 打卡弹窗：首页与日历页共用
 * - 按日期加载当日计划动作（默认带上计划的组×次）
 * - 已有记录时预填并走 PUT，提供删除按钮
 */
(function () {
  'use strict';

  const STATUS = [
    { v: 'done', label: '✅ 完成' },
    { v: 'rest', label: '😌 休息' },
    { v: 'skip', label: '⏭️ 跳过' },
  ];

  function open(dateStr) {
    const seq = App.beginRender();
    App.openModal('<div class="modal-pad loading"><div class="spinner"></div><p>加载中…</p></div>');
    Promise.all([
      API.get('/plans/current'),
      API.get('/checkins?month=' + encodeURIComponent(String(dateStr).slice(0, 7))),
    ]).then(function (res) {
      if (!App.isCurrent(seq)) return;
      build(dateStr, res[0], res[1]);
    }).catch(function (err) {
      if (!App.isCurrent(seq)) return;
      if (err && err.authHandled) { App.closeModal(true); return; }
      App.openModal('<div class="modal-pad"><p class="form-error">加载失败：' + App.esc(err.message) + '</p>' +
        '<div class="modal-actions"><span class="spacer"></span>' +
        '<button type="button" class="btn btn-ghost" onclick="App.closeModal()">关闭</button></div></div>');
    });
  }

  function customRowHTML(value) {
    return '<div class="ck-custom-row">' +
      '<input type="text" class="ck-custom-input" value="' + App.esc(value) + '" placeholder="如：椭圆机 20min">' +
      '<button type="button" class="ck-custom-del" title="删除">×</button></div>';
  }

  function build(dateStr, plan, checkins) {
    const existing = (checkins || []).find(function (c) { return c.date === dateStr; }) || null;
    const idx = App.planIndex(dateStr);
    const day = plan && plan.days ? (plan.days.find(function (d) { return d.index === idx; }) || null) : null;

    let items = [];
    if (existing && existing.plan_items && existing.plan_items.length) {
      items = existing.plan_items.map(function (it) {
        return { name: it.name || '', sets: it.sets || '', reps: it.reps || '', weight: it.weight || '', done: !!it.done };
      });
    } else if (day && day.exercises && day.exercises.length) {
      items = day.exercises.map(function (e) {
        const p = App.parseSets(e.sets);
        return { name: e.name, sets: p.sets, reps: p.reps, weight: '', done: true };
      });
    }
    const customs = existing && existing.custom_items ? existing.custom_items.slice() : [];
    const status = existing ? existing.status : 'done';
    const mood = existing && existing.mood ? existing.mood : 0;
    const energy = existing && existing.energy ? existing.energy : 0;
    const visibility = existing && existing.visibility === 'private' ? 'private' : 'public';
    const notes = existing && existing.notes ? existing.notes : '';
    const hint = day ? (day.title || '') : '';

    let rows = '';
    if (items.length) {
      items.forEach(function (it) {
        rows += '<div class="ck-item">' +
          '<label class="ck-check"><input type="checkbox" class="ck-done"' + (it.done ? ' checked' : '') + '>' +
          '<span>' + App.esc(it.name) + '</span></label>' +
          '<div class="ck-item-inputs">' +
          '<input type="text" class="ck-sets" value="' + App.esc(it.sets) + '" placeholder="组数" inputmode="numeric">' +
          '<span class="mul">×</span>' +
          '<input type="text" class="ck-reps" value="' + App.esc(it.reps) + '" placeholder="次数">' +
          '<span class="mul">kg</span>' +
          '<input type="text" class="ck-weight" value="' + App.esc(it.weight) + '" placeholder="重量" inputmode="decimal">' +
          '</div></div>';
      });
    } else {
      rows = '<p class="hint">当日计划没有动作，可在下方添加自定义项目。</p>';
    }
    let customRows = '';
    customs.forEach(function (t) { customRows += customRowHTML(t); });

    const segs = STATUS.map(function (s) {
      return '<label class="' + (status === s.v ? 'active' : '') + '">' +
        '<input type="radio" name="ck-status" value="' + s.v + '"' + (status === s.v ? ' checked' : '') + '>' + s.label + '</label>';
    }).join('');

    const vis = ['public', 'private'].map(function (v) {
      return '<label class="' + (visibility === v ? 'active' : '') + '">' +
        '<input type="radio" name="ck-vis" value="' + v + '"' + (visibility === v ? ' checked' : '') + '>' +
        (v === 'public' ? '公开' : '仅自己') + '</label>';
    }).join('');

    const modal = App.openModal(
      '<div class="modal-head">' +
      '<div class="modal-title"><h3>打卡 · ' + App.esc(dateStr) + '</h3>' +
      '<span class="modal-sub">' + App.weekdayZh(dateStr) + (hint ? ' · ' + App.esc(hint) : '') + '</span></div>' +
      '<button type="button" class="modal-x" aria-label="关闭" onclick="App.closeModal()">×</button>' +
      '</div>' +
      '<div class="field"><label>状态</label><div class="seg" id="ck-seg">' + segs + '</div></div>' +
      '<div id="ck-done-wrap"' + (status === 'done' ? '' : ' style="display:none"') + '>' +
      '<h4 class="ck-title">训练动作 <span class="hint">勾选已完成项</span></h4>' +
      '<div class="ck-items">' + rows + '</div>' +
      '<h4 class="ck-title">自定义项目</h4>' +
      '<div class="ck-custom">' + customRows + '</div>' +
      '<button type="button" class="btn btn-ghost btn-small" id="ck-add-custom">＋ 添加自定义项目</button>' +
      '</div>' +
      '<div class="field"><label for="ck-notes">心得 / 备注</label>' +
      '<textarea id="ck-notes" rows="3" placeholder="今天练得怎么样？">' + App.esc(notes) + '</textarea></div>' +
      '<div class="ck-grid">' +
      '<div class="field"><label>心情</label>' + App.starsHTML(mood) + '</div>' +
      '<div class="field"><label>精力</label>' + App.starsHTML(energy) + '</div>' +
      '</div>' +
      '<div class="field"><label>可见性</label><div class="seg seg-small" id="ck-vis">' + vis + '</div></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-danger" id="ck-delete"' + (existing ? '' : ' hidden') + '>删除</button>' +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn btn-ghost" onclick="App.closeModal()">取消</button>' +
      '<button type="button" class="btn btn-primary" id="ck-save">保存</button>' +
      '</div>'
    );

    App.initStars(modal);

    function markDirty() {
      App.modalGuard = function () { return confirm('有未保存的内容，确定关闭吗？'); };
    }

    /* 状态切换 */
    const seg = modal.querySelector('#ck-seg');
    const doneWrap = modal.querySelector('#ck-done-wrap');
    seg.addEventListener('change', function () {
      seg.querySelectorAll('label').forEach(function (l) {
        l.classList.toggle('active', l.querySelector('input').checked);
      });
      doneWrap.style.display = seg.querySelector('input:checked').value === 'done' ? '' : 'none';
      markDirty();
    });

    /* 可见性切换 */
    const visSeg = modal.querySelector('#ck-vis');
    visSeg.addEventListener('change', function () {
      visSeg.querySelectorAll('label').forEach(function (l) {
        l.classList.toggle('active', l.querySelector('input').checked);
      });
      markDirty();
    });

    /* 自定义项目增删 */
    modal.querySelector('#ck-add-custom').addEventListener('click', function () {
      const wrap = modal.querySelector('.ck-custom');
      wrap.insertAdjacentHTML('beforeend', customRowHTML(''));
      const input = wrap.lastElementChild.querySelector('input');
      input.focus();
      markDirty();
    });
    modal.querySelector('.ck-custom').addEventListener('click', function (e) {
      if (e.target.classList.contains('ck-custom-del')) {
        e.target.parentElement.remove();
        markDirty();
      }
    });
    modal.addEventListener('input', markDirty);

    /* 保存（POST 新增 / PUT 更新） */
    modal.querySelector('#ck-save').addEventListener('click', function () {
      const st = seg.querySelector('input:checked').value;
      let planItems = [];
      let customItems = [];
      if (st === 'done') {
        modal.querySelectorAll('.ck-item').forEach(function (row) {
          const nameEl = row.querySelector('.ck-check span');
          planItems.push({
            name: nameEl ? nameEl.textContent : '',
            sets: row.querySelector('.ck-sets').value.trim(),
            reps: row.querySelector('.ck-reps').value.trim(),
            weight: row.querySelector('.ck-weight').value.trim(),
            done: row.querySelector('.ck-done').checked,
          });
        });
        modal.querySelectorAll('.ck-custom-input').forEach(function (input) {
          const v = input.value.trim();
          if (v) customItems.push(v);
        });
      }
      const stars = modal.querySelectorAll('.stars');
      const moodV = parseInt(stars[0].getAttribute('data-value'), 10) || null;
      const energyV = parseInt(stars[1].getAttribute('data-value'), 10) || null;
      const body = {
        date: dateStr,
        status: st,
        plan_items: planItems,
        custom_items: customItems,
        notes: modal.querySelector('#ck-notes').value.trim(),
        mood: moodV,
        energy: energyV,
        visibility: visSeg.querySelector('input:checked').value,
      };
      const btn = modal.querySelector('#ck-save');
      btn.disabled = true;
      const p = existing ? API.put('/checkins/' + existing.id, body) : API.post('/checkins', body);
      p.then(function () {
        App.modalGuard = null;
        App.closeModal();
        App.toast(existing ? '打卡已更新' : '打卡成功！', 'success');
        App.refresh();
      }).catch(function (err) {
        if (err && err.authHandled) { App.closeModal(true); return; }
        App.toast(err.message || '保存失败', 'error');
        btn.disabled = false;
      });
    });

    /* 删除 */
    const delBtn = modal.querySelector('#ck-delete');
    if (delBtn && existing) {
      delBtn.addEventListener('click', function () {
        if (!confirm('确定删除 ' + dateStr + ' 的打卡记录吗？')) return;
        delBtn.disabled = true;
        API.del('/checkins/' + existing.id).then(function () {
          App.modalGuard = null;
          App.closeModal();
          App.toast('已删除打卡记录');
          App.refresh();
        }).catch(function (err) {
          if (err && err.authHandled) { App.closeModal(true); return; }
          App.toast(err.message || '删除失败', 'error');
          delBtn.disabled = false;
        });
      });
    }
  }

  window.CheckinDialog = { open: open };
})();
