/* FitCheck API 封装
 * - base 路径 /api
 * - 自动携带 localStorage.fitcheck_token（Authorization: Bearer）
 * - 统一解析 {ok, data} / {ok, error} 与 FastAPI {detail} 两种错误格式
 * - 401 时清除 token 并跳转登录页（skip401 的请求除外，如登录本身）
 */
(function () {
  'use strict';

  var BASE = '/api';

  function getToken() {
    try { return localStorage.getItem('fitcheck_token') || ''; } catch (e) { return ''; }
  }

  function clearToken() {
    try { localStorage.removeItem('fitcheck_token'); } catch (e) { /* ignore */ }
  }

  function request(path, options) {
    var opts = options || {};
    var headers = {};
    var k;
    if (opts.headers) { for (k in opts.headers) { if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k]; } }
    var token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var hasBody = opts.body !== undefined && opts.body !== null;
    if (hasBody) headers['Content-Type'] = 'application/json';

    return Promise.resolve().then(function () {
      return fetch(BASE + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: hasBody ? JSON.stringify(opts.body) : undefined,
      });
    }).catch(function () {
      throw new Error('网络连接失败，请检查网络后重试');
    }).then(function (resp) {
      return resp.json().catch(function () { return null; }).then(function (payload) {
        var msg = '';
        if (payload && typeof payload === 'object') {
          msg = payload.error || payload.detail || '';
        }
        if (resp.status === 401) {
          var err401 = new Error(msg || '用户名或密码错误');
          if (!opts.skip401) {
            clearToken();
            if (window.App && typeof App.redirectLogin === 'function') {
              App.redirectLogin(msg || '登录已过期，请重新登录');
            } else if (location.hash !== '#/login') {
              location.hash = '#/login';
            }
            err401.authHandled = true;
          }
          throw err401;
        }
        if (!resp.ok) {
          throw new Error(msg || ('请求失败（' + resp.status + '）'));
        }
        // 统一响应格式 {ok: true, data: ...} → 直接返回 data
        if (payload && typeof payload === 'object' && 'ok' in payload) {
          return payload.data;
        }
        return payload;
      });
    });
  }

  window.API = {
    request: request,
    get: function (p) { return request(p, { method: 'GET' }); },
    post: function (p, body, opts) { return request(p, Object.assign({ method: 'POST', body: body }, opts || {})); },
    put: function (p, body) { return request(p, { method: 'PUT', body: body }); },
    del: function (p) { return request(p, { method: 'DELETE' }); },
    getToken: getToken,
    clearToken: clearToken,
  };
})();
