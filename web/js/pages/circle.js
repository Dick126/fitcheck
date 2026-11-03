/* 圈子（#/circle）：我的圈子 + 成员/排行榜 + 好友动态与点赞 */
(function () {
  'use strict';
  const Pages = (window.Pages = window.Pages || {});
  const state = { selectedId: null, seq: 0, circles: [] };

  Pages.circle = function (container) {
    const seq = App.beginRender();
    state.seq = seq;
    container.innerHTML =
      '<section class="card"><div class="card-head"><h3>👥 我的圈子</h3></div>' +
      '<div class="circle-actions">' +
      '<button type="button" class="btn btn-primary" id="circle-create">＋ 创建圈子</button>' +
      '<div class="join-row">' +
      '<input id="circle-code" type="text" placeholder="输入邀请码" maxlength="10" autocapitalize="characters">' +
      '<button type="button" class="btn btn-ghost" id="circle-join">加入</button>' +
      '</div></div>' +
      '<div id="circle-list"></div></section>' +
      '<div id="circle-detail"></div>' +
      '<section class="card"><div class="card-head"><h3>🔥 好友动态</h3>' +
      '<span class="card-sub">最近 14 天</span></div>' +
      '<div id="circle-feed"></div></section>';

    document.getElementById('circle-create').addEventListener('click', function () {
      const btn = document.getElementById('circle-create');
      btn.disabled = true;
      API.post('/circles', { name: '健身小圈子' }).then(function (data) {
        App.toast('圈子创建成功！邀请码：' + data.invite_code, 'success');
        App.refresh();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '创建失败', 'error');
        btn.disabled = false;
      });
    });

    function join() {
      const code = document.getElementById('circle-code').value.trim();
      if (!code) { App.toast('请输入邀请码', 'error'); return; }
      API.post('/circles/join', { invite_code: code }).then(function (data) {
        App.toast('已加入「' + data.name + '」', 'success');
        App.refresh();
      }).catch(function (err) {
        if (err && err.authHandled) return;
        App.toast(err.message || '加入失败', 'error');
      });
    }
    document.getElementById('circle-join').addEventListener('click', join);
    document.getElementById('circle-code').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') join();
    });

    loadCircles();
    loadFeed();

    /* ---------- 圈子列表 ---------- */
    function loadCircles() {
      API.get('/circles/mine').then(function (circles) {
        if (!App.isCurrent(seq)) return;
        state.circles = circles || [];
        const listBox = document.getElementById('circle-list');
        if (!circles || !circles.length) {
          listBox.innerHTML = '<div class="empty"><p>还没有圈子，创建或加入一个吧</p></div>';
          document.getElementById('circle-detail').innerHTML = '';
          return;
        }
        if (state.selectedId == null || !circles.some(function (c) { return c.id === state.selectedId; })) {
          state.selectedId = circles[0].id;
        }
        let html = '';
        circles.forEach(function (c) {
          html += '<div class="circle-item' + (c.id === state.selectedId ? ' selected' : '') + '" data-id="' + c.id + '">' +
            '<div class="circle-item-main">' +
            '<b>' + App.esc(c.name || '圈子') + (c.is_owner ? ' <span class="badge badge-owner">圈主</span>' : '') + '</b>' +
            '<span class="hint">成员 ' + (c.member_count != null ? c.member_count : '—') +
            ' · 邀请码 ' + App.esc(c.invite_code || '') + '</span></div>' +
            '<button type="button" class="btn btn-ghost btn-mini" data-copy="' + App.esc(c.invite_code || '') + '">复制</button></div>';
        });
        listBox.innerHTML = html;
        listBox.querySelectorAll('.circle-item').forEach(function (item) {
          item.addEventListener('click', function (e) {
            if (e.target.closest('button')) return;
            state.selectedId = parseInt(item.getAttribute('data-id'), 10);
            listBox.querySelectorAll('.circle-item').forEach(function (i) {
              i.classList.toggle('selected', i === item);
            });
            loadDetail();
          });
        });
        listBox.querySelectorAll('button[data-copy]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            const code = btn.getAttribute('data-copy');
            App.copyText(code).then(function (ok) {
              App.toast(ok ? '邀请码已复制：' + code : '复制失败，邀请码：' + code, ok ? 'success' : 'error');
            });
          });
        });
        loadDetail();
      }).catch(function (err) {
        if (!App.isCurrent(seq)) return;
        if (err && err.authHandled) return;
        document.getElementById('circle-list').innerHTML = App.errorHTML(err.message || '加载失败');
      });
    }

    /* ---------- 成员 + 排行榜 ---------- */
    function loadDetail() {
      const id = state.selectedId;
      if (id == null) return;
      const box = document.getElementById('circle-detail');
      box.innerHTML = App.loadingHTML('');
      Promise.all([
        API.get('/circles/' + id + '/members'),
        API.get('/circles/' + id + '/leaderboard?days=7'),
      ]).then(function (res) {
        if (!App.isCurrent(seq)) return;
        const circle = state.circles.find(function (c) { return c.id === id; }) || {};
        renderDetail(box, circle, res[0] || [], res[1] || []);
      }).catch(function (err) {
        if (!App.isCurrent(seq)) return;
        if (err && err.authHandled) return;
        box.innerHTML = App.errorHTML(err.message || '加载失败');
      });
    }

    function renderDetail(box, circle, members, board) {
      const medals = ['🥇', '🥈', '🥉'];
      const isOwner = !!circle.is_owner;
      let html = '<section class="card"><div class="card-head"><h3>👥 圈友（' + members.length + '）</h3>' +
        '<span class="card-sub">' + (isOwner ? '你是圈主' : '成员') + '</span></div>';
      if (circle.notice) {
        html += '<p class="circle-notice">📢 ' + App.esc(circle.notice) + '</p>';
      }
      if (!members.length) {
        html += '<div class="empty"><p>暂无成员</p></div>';
      } else {
        html += '<div class="member-list">';
        members.forEach(function (m) {
          html += '<div class="member-row">' +
            '<span class="avatar">' + App.esc(String(m.nickname || '?').slice(0, 1)) + '</span>' +
            '<div class="member-who"><b>' + App.esc(m.nickname || '圈友') + (m.is_owner ? ' 👑' : '') + '</b>' +
            '<span class="hint">' + (m.today_done ? '✅ 今日已打卡' : '⏳ 今日未打卡') + '</span></div>' +
            (isOwner && !m.is_owner
              ? '<button type="button" class="btn btn-ghost btn-mini" data-kick="' + m.user_id + '">移除</button>'
              : '') +
            '</div>';
        });
        html += '</div>';
      }
      html += '<div class="circle-actions">';
      if (isOwner) {
        html += '<button type="button" class="btn btn-ghost" id="circle-edit">✏️ 编辑名称/公告</button>' +
          '<button type="button" class="btn btn-danger" id="circle-dissolve">解散圈子</button>';
      } else {
        html += '<button type="button" class="btn btn-danger" id="circle-leave">退出圈子</button>';
      }
      html += '</div></section>';

      html += '<section class="card"><div class="card-head"><h3>🏆 七日排行榜</h3>' +
        '<span class="card-sub">按完成次数排序</span></div>';
      const list = board.slice().sort(function (a, b) {
        return (b.done_count || 0) - (a.done_count || 0) || (b.streak || 0) - (a.streak || 0);
      });
      if (!list.length) {
        html += '<div class="empty"><p>暂无排行数据</p></div>';
      } else {
        list.forEach(function (row, i) {
          html += '<div class="lb-row"><span class="lb-rank">' + (medals[i] || (i + 1)) + '</span>' +
            '<div class="lb-who"><b>' + App.esc(row.nickname || '圈友') + '</b>' +
            '<span class="hint">连续 ' + (row.streak || 0) + ' 天</span></div>' +
            '<span class="lb-count">' + (row.done_count || 0) + ' 次</span></div>';
        });
      }
      html += '</section>';
      box.innerHTML = html;

      // ---- 管理操作绑定 ----
      box.querySelectorAll('[data-kick]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const uid = parseInt(btn.getAttribute('data-kick'), 10);
          const nickEl = btn.closest('.member-row').querySelector('b');
          const nick = nickEl ? nickEl.textContent : '该成员';
          if (!confirm('确定把 ' + nick + ' 移出圈子吗？')) return;
          API.del('/circles/' + circle.id + '/members/' + uid).then(function () {
            App.toast('已移除', 'success');
            App.refresh();
          }).catch(function (err) {
            if (err && err.authHandled) return;
            App.toast(err.message || '操作失败', 'error');
          });
        });
      });

      const editBtn = document.getElementById('circle-edit');
      if (editBtn) editBtn.addEventListener('click', function () { openEditModal(circle); });

      const leaveBtn = document.getElementById('circle-leave');
      if (leaveBtn) leaveBtn.addEventListener('click', function () {
        if (!confirm('退出后需邀请码才能重新加入，确定退出吗？')) return;
        API.post('/circles/' + circle.id + '/leave', {}).then(function () {
          App.toast('已退出圈子', 'success');
          App.refresh();
        }).catch(function (err) {
          if (err && err.authHandled) return;
          App.toast(err.message || '退出失败', 'error');
        });
      });

      const dissolveBtn = document.getElementById('circle-dissolve');
      if (dissolveBtn) dissolveBtn.addEventListener('click', function () {
        if (!confirm('解散后所有成员退出圈子（各自打卡记录保留），确定解散吗？')) return;
        API.del('/circles/' + circle.id).then(function () {
          App.toast('圈子已解散', 'success');
          App.refresh();
        }).catch(function (err) {
          if (err && err.authHandled) return;
          App.toast(err.message || '解散失败', 'error');
        });
      });
    }

    function openEditModal(circle) {
      const modal = App.openModal(
        '<h3>编辑圈子</h3>' +
        '<form id="ce-form" class="form-grid">' +
        '<div class="field field-full"><label for="ce-name">圈子名称</label>' +
        '<input id="ce-name" maxlength="24" value="' + App.esc(circle.name || '') + '"></div>' +
        '<div class="field field-full"><label for="ce-notice">公告（可为空，最多 100 字）</label>' +
        '<textarea id="ce-notice" rows="3" maxlength="100">' + App.esc(circle.notice || '') + '</textarea></div>' +
        '<div class="field field-full"><button class="btn btn-primary btn-block" type="submit">保存</button></div>' +
        '</form>'
      );
      modal.querySelector('#ce-form').addEventListener('submit', function (e) {
        e.preventDefault();
        API.put('/circles/' + circle.id, {
          name: modal.querySelector('#ce-name').value.trim(),
          notice: modal.querySelector('#ce-notice').value.trim(),
        }).then(function () {
          App.closeModal();
          App.toast('已保存', 'success');
          App.refresh();
        }).catch(function (err) {
          if (err && err.authHandled) return;
          App.toast(err.message || '保存失败', 'error');
        });
      });
    }

    /* ---------- 好友动态 ---------- */
    function loadFeed() {
      API.get('/feed').then(function (feed) {
        if (!App.isCurrent(seq)) return;
        renderFeed(feed || []);
      }).catch(function (err) {
        if (!App.isCurrent(seq)) return;
        if (err && err.authHandled) return;
        document.getElementById('circle-feed').innerHTML = App.errorHTML(err.message || '加载失败');
      });
    }

    function renderFeed(feed) {
      const box = document.getElementById('circle-feed');
      if (!feed.length) {
        box.innerHTML = '<div class="empty"><p>暂无动态，好友打卡后会出现在这里</p></div>';
        return;
      }
      let html = '';
      feed.forEach(function (c) { html += feedCard(c); });
      box.innerHTML = html;
      box.querySelectorAll('.like-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const id = parseInt(btn.getAttribute('data-id'), 10);
          const liked = btn.getAttribute('data-liked') === '1';
          const p = liked ? API.del('/checkins/' + id + '/like') : API.post('/checkins/' + id + '/like', {});
          btn.disabled = true;
          p.then(function (data) {
            App.setLike(id, data.likes);
            updateLikeBtn(btn, data.liked_by_me, data.likes);
          }).catch(function (err) {
            if (err && err.authHandled) return;
            App.toast(err.message || '操作失败', 'error');
            btn.disabled = false;
          });
        });
      });
    }

    function updateLikeBtn(btn, liked, count) {
      btn.setAttribute('data-liked', liked ? '1' : '0');
      btn.classList.toggle('liked', !!liked);
      btn.innerHTML = (liked ? '❤️' : '🤍') + ' ' + count;
      btn.disabled = false;
    }

    function feedCard(c) {
      const badge = { done: ['完成', 'badge-done'], rest: ['休息', 'badge-rest'], skip: ['跳过', 'badge-skip'] }[c.status] || ['完成', 'badge-done'];
      const acts = [];
      (c.plan_items || []).forEach(function (it) { if (it.done && it.name) acts.push(it.name); });
      (c.custom_items || []).forEach(function (t) { acts.push(t); });
      const actText = acts.length ? acts.join('、') : (c.status === 'done' ? '完成打卡' : '—');
      const liked = !!c.liked_by_me;
      const count = App.likeCount(c.id, c.like_count);
      return '<div class="feed-card">' +
        '<div class="feed-head"><span class="avatar">' + App.esc(String(c.nickname || '?').slice(0, 1)) + '</span>' +
        '<div class="feed-who"><b>' + App.esc(c.nickname || '好友') + '</b>' +
        '<span class="feed-date">' + App.dateZh(c.date) + ' ' + App.weekdayZh(c.date) + '</span></div>' +
        '<span class="badge ' + badge[1] + '">' + badge[0] + '</span></div>' +
        '<p class="feed-acts">🏋️ ' + App.esc(actText) + '</p>' +
        (c.notes ? '<p class="feed-notes">' + App.esc(c.notes) + '</p>' : '') +
        '<div class="feed-foot">' +
        (c.mood ? '<span class="feed-meta">😊 心情 ' + c.mood + '/5</span>' : '') +
        (c.energy ? '<span class="feed-meta">⚡ 精力 ' + c.energy + '/5</span>' : '') +
        '<span class="spacer"></span>' +
        '<button type="button" class="like-btn' + (liked ? ' liked' : '') + '" data-id="' + c.id + '" data-liked="' + (liked ? 1 : 0) + '">' +
        (liked ? '❤️' : '🤍') + ' ' + count + '</button>' +
        '</div></div>';
    }
  };
})();
