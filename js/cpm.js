/*
 * cpm.js — Lõi lịch làm việc + phân tích liên kết + thuật toán CPM.
 * Tự viết, không phụ thuộc thư viện. Dùng được trong trình duyệt (window.CPM)
 * và trong Node (require('./cpm.js')) để chạy unit test.
 *
 * Quy ước thời gian: mọi tính toán theo "chỉ số ngày làm việc" (số nguyên).
 *   - Ngày làm việc số 0 = ngày làm việc đầu tiên >= ngày khởi công.
 *   - ES (bắt đầu sớm) = chỉ số ngày bắt đầu (đầu ngày).
 *   - EF (kết thúc sớm) = ES + thời lượng  → mốc "cuối ngày EF-1" (kiểu loại trừ).
 *   - Ngày kết thúc hiển thị = ngày của chỉ số EF-1 (thời lượng > 0).
 *   - Mốc (thời lượng 0): ES = EF, ngày hiển thị = ngày của chỉ số ES-1 (cuối ngày
 *     của việc trước) — nếu ES = 0 thì là ngày khởi công.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Ngày tháng (dùng UTC để tránh lệch múi giờ / giờ mùa hè)            */
  /* ------------------------------------------------------------------ */
  var MS_NGAY = 86400000;

  function parseISO(s) {
    if (s instanceof Date) return new Date(Date.UTC(s.getFullYear(), s.getMonth(), s.getDate()));
    if (typeof s !== 'string') return null;
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s.trim());
    if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/.exec(s.trim()); // dd/mm/yyyy
    if (m) {
      var y = +m[3]; if (y < 100) y += 2000;
      return new Date(Date.UTC(y, +m[2] - 1, +m[1]));
    }
    return null;
  }
  function toISO(d) {
    if (!d) return '';
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + 1, n = d.getUTCDate();
    return y + '-' + (m < 10 ? '0' : '') + m + '-' + (n < 10 ? '0' : '') + n;
  }
  function fmtVN(d) { // dd/mm/yyyy
    if (!d) return '';
    var m = d.getUTCMonth() + 1, n = d.getUTCDate();
    return (n < 10 ? '0' : '') + n + '/' + (m < 10 ? '0' : '') + m + '/' + d.getUTCFullYear();
  }
  function addDays(d, n) { return new Date(d.getTime() + n * MS_NGAY); }
  function diffDays(a, b) { return Math.round((b.getTime() - a.getTime()) / MS_NGAY); }

  /* ------------------------------------------------------------------ */
  /* Lịch làm việc                                                       */
  /* workWeek: 5 (T2–T6), 6 (T2–T7), 7 (tất cả các ngày)                  */
  /* holidays: mảng 'yyyy-mm-dd' nghỉ thêm                               */
  /* ------------------------------------------------------------------ */
  function Calendar(startISO, workWeek, holidays) {
    this.start = parseISO(startISO) || parseISO(toISO(new Date()));
    this.workWeek = [5, 6, 7].indexOf(+workWeek) >= 0 ? +workWeek : 6;
    this.hol = {};
    (holidays || []).forEach(function (h) { var d = parseISO(h); if (d) this.hol[toISO(d)] = 1; }, this);
    // Ngày làm việc số 0
    var d = this.start;
    var guard = 0;
    while (!this.isWork(d) && guard++ < 3660) d = addDays(d, 1);
    this.fwd = [d];       // fwd[i]  = ngày của chỉ số i (i >= 0)
    this.bwd = [];        // bwd[k]  = ngày của chỉ số -(k+1)
    this._idx = {};       // ISO -> chỉ số (chỉ ngày làm việc)
    this._idx[toISO(d)] = 0;
  }
  Calendar.prototype.isWork = function (d) {
    var wd = d.getUTCDay(); // 0 = CN
    if (this.workWeek === 5 && (wd === 0 || wd === 6)) return false;
    if (this.workWeek === 6 && wd === 0) return false;
    return !this.hol[toISO(d)];
  };
  /** Ngày (Date UTC) của chỉ số ngày làm việc i (âm được). */
  Calendar.prototype.dateOf = function (i) {
    i = Math.round(i);
    if (i >= 0) {
      while (this.fwd.length <= i) {
        var d = addDays(this.fwd[this.fwd.length - 1], 1);
        while (!this.isWork(d)) d = addDays(d, 1);
        this._idx[toISO(d)] = this.fwd.length;
        this.fwd.push(d);
      }
      return this.fwd[i];
    }
    var k = -i - 1;
    while (this.bwd.length <= k) {
      var p = this.bwd.length ? this.bwd[this.bwd.length - 1] : this.fwd[0];
      var e = addDays(p, -1);
      while (!this.isWork(e)) e = addDays(e, -1);
      this._idx[toISO(e)] = -(this.bwd.length + 1);
      this.bwd.push(e);
    }
    return this.bwd[k];
  };
  /** Chỉ số của ngày làm việc đầu tiên >= d (dùng cho "bắt đầu vào ngày d"). */
  Calendar.prototype.indexOnOrAfter = function (d) {
    d = parseISO(d); if (!d) return null;
    var guard = 0;
    while (!this.isWork(d) && guard++ < 3660) d = addDays(d, 1);
    return this._find(d);
  };
  /** Chỉ số của ngày làm việc cuối cùng <= d (dùng cho "kết thúc vào ngày d"). */
  Calendar.prototype.indexOnOrBefore = function (d) {
    d = parseISO(d); if (!d) return null;
    var guard = 0;
    while (!this.isWork(d) && guard++ < 3660) d = addDays(d, -1);
    return this._find(d);
  };
  Calendar.prototype._find = function (d) {
    var key = toISO(d);
    if (key in this._idx) return this._idx[key];
    var f0 = this.fwd[0];
    if (d >= f0) { var i = this.fwd.length; while (true) { this.dateOf(i); if (key in this._idx) return this._idx[key]; i++; if (i > 200000) return null; } }
    var k = this.bwd.length + 1; while (true) { this.dateOf(-k); if (key in this._idx) return this._idx[key]; k++; if (k > 200000) return null; }
  };
  /** Số ngày làm việc đã trôi qua tính tới hết ngày d (d tính là 1 ngày nếu là ngày làm việc). */
  Calendar.prototype.workdaysThrough = function (d) {
    var i = this.indexOnOrBefore(d);
    return i === null ? 0 : i + 1;
  };

  /* ------------------------------------------------------------------ */
  /* Thời lượng: "12", "12d", "12n" (ngày), "2t"/"2w"/"2 tuần" (tuần LV),  */
  /* "1th"/"1m" (tháng ≈ 4 tuần LV) — quy đổi theo số ngày làm việc/tuần  */
  /* ------------------------------------------------------------------ */
  function parseDuration(txt, workWeek) {
    if (txt === null || txt === undefined || txt === '') return null;
    if (typeof txt === 'number') return isFinite(txt) ? Math.max(0, Math.round(txt)) : null;
    var s = String(txt).trim().toLowerCase().replace(',', '.');
    var m = /^(-?\d+(?:\.\d+)?)\s*([a-zà-ỹ]*)\.?$/.exec(s);
    if (!m) return null;
    var n = parseFloat(m[1]), u = m[2] || 'd';
    var ww = +workWeek || 6;
    var days;
    if (/^(d|n|ng|ngay|ngày|day|days)$/.test(u)) days = n;
    else if (/^(t|w|tuan|tuần|wk|week|weeks)$/.test(u)) days = n * ww;
    else if (/^(th|m|mo|thang|tháng|month|months)$/.test(u)) days = n * ww * 4;
    else return null;
    return Math.max(0, Math.round(days));
  }

  /* ------------------------------------------------------------------ */
  /* Liên kết tiền nhiệm: "<STT>[FS|SS|FF|SF][+|-lag]" ngăn bằng , hoặc ;  */
  /* Ví dụ: "4", "4FS+3", "8FS+3; 6", "2;3SS+1", "5FF-2", "7SF"          */
  /* Lag có thể kèm đơn vị: "4FS+1t" (1 tuần làm việc).                   */
  /* Trả về { links:[{stt,type,lag}], errors:[chuỗi] }                     */
  /* ------------------------------------------------------------------ */
  var RE_LINK = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+\-])\s*(\d+(?:[.,]\d+)?)\s*([a-zà-ỹ]*))?$/i;
  function parseLinks(txt, workWeek) {
    var out = { links: [], errors: [] };
    if (txt === null || txt === undefined) return out;
    String(txt).split(/[;,\n]+/).forEach(function (raw) {
      var s = raw.trim();
      if (!s) return;
      var m = RE_LINK.exec(s);
      if (!m) { out.errors.push('Không hiểu liên kết "' + s + '"'); return; }
      var lag = 0;
      if (m[3]) {
        lag = parseDuration(m[4] + (m[5] || 'd'), workWeek);
        if (lag === null) { out.errors.push('Lag sai "' + s + '"'); return; }
        if (m[3] === '-') lag = -lag;
      }
      out.links.push({ stt: parseInt(m[1], 10), type: (m[2] || 'FS').toUpperCase(), lag: lag });
    });
    return out;
  }
  function formatLink(stt, type, lag) {
    var s = String(stt);
    if (type && type !== 'FS') s += type;
    if (lag) { if (!type || type === 'FS') s += 'FS'; s += (lag > 0 ? '+' : '') + lag; }
    return s;
  }

  /* ------------------------------------------------------------------ */
  /* Cấu trúc cây: tính cha/con từ "level" (thụt lề), sinh mã WBS          */
  /* ------------------------------------------------------------------ */
  function buildTree(tasks) {
    var stack = []; // chỉ số các dòng cha theo cấp
    var counters = [];
    var parent = new Array(tasks.length).fill(-1);
    var wbs = new Array(tasks.length);
    var isSummary = new Array(tasks.length).fill(false);
    var level = new Array(tasks.length);
    for (var i = 0; i < tasks.length; i++) {
      var lv = Math.max(0, Math.round(+tasks[i].level || 0));
      // Không cho nhảy cấp quá 1 so với dòng trước
      var maxLv = i === 0 ? 0 : level[i - 1] + 1;
      if (lv > maxLv) lv = maxLv;
      level[i] = lv;
      while (stack.length > lv) stack.pop();
      parent[i] = stack.length ? stack[stack.length - 1] : -1;
      counters.length = lv + 1;
      counters[lv] = (counters[lv] || 0) + 1;
      wbs[i] = counters.slice(0, lv + 1).join('.');
      stack.push(i);
    }
    for (var j = 0; j < tasks.length; j++) {
      // "Hạng mục" khi có con, hoặc khai báo loại = hangmuc
      if (parent[j] >= 0) isSummary[parent[j]] = true;
    }
    for (var k = 0; k < tasks.length; k++) if (tasks[k].type === 'hangmuc') isSummary[k] = true;
    return { parent: parent, wbs: wbs, isSummary: isSummary, level: level };
  }

  /* ------------------------------------------------------------------ */
  /* CPM                                                                 */
  /* project = { startDate, workWeek, holidays, tasks:[...] }             */
  /* task = { id, name, type:'viec'|'moc'|'hangmuc', level, duration,      */
  /*          start (ISO, chỉ dùng khi không có tiền nhiệm),               */
  /*          preds:[{id,type,lag}], constraint:{type,date}, progress }     */
  /* Trả về { rows:[...], projectStart, projectFinish, totalDays,          */
  /*          criticalCount, warnings:[...], cal }                         */
  /* ------------------------------------------------------------------ */
  var INF = 1e9;

  function compute(project) {
    var tasks = project.tasks || [];
    var cal = new Calendar(project.startDate, project.workWeek, project.holidays);
    var tree = buildTree(tasks);
    var n = tasks.length;
    var warnings = [];
    var idToIdx = {};
    tasks.forEach(function (t, i) { idToIdx[t.id] = i; });

    var dur = new Array(n), ES = new Array(n), EF = new Array(n), LS = new Array(n), LF = new Array(n);
    var isMs = new Array(n);
    for (var i = 0; i < n; i++) {
      var t = tasks[i];
      var d = +t.duration;
      if (!isFinite(d) || d < 0) d = 0;
      d = Math.round(d);
      if (t.type === 'moc') d = 0;
      dur[i] = d;
      isMs[i] = !tree.isSummary[i] && (t.type === 'moc' || d === 0);
    }

    // Danh sách cạnh hợp lệ (bỏ cạnh vào/ra Hạng mục, tự trỏ, trỏ mất)
    var preds = []; var succs = [];
    for (i = 0; i < n; i++) { preds.push([]); succs.push([]); }
    for (i = 0; i < n; i++) {
      (tasks[i].preds || []).forEach(function (p) {
        var j = idToIdx[p.id];
        var nm = 'Dòng ' + (i + 1);
        if (j === undefined) { warnings.push({ row: i, msg: nm + ': tiền nhiệm không còn tồn tại — bỏ qua' }); return; }
        if (j === i) { warnings.push({ row: i, msg: nm + ': tự liên kết với chính nó — bỏ qua' }); return; }
        if (tree.isSummary[i] || tree.isSummary[j]) {
          warnings.push({ row: i, msg: nm + ': không liên kết vào/ra Hạng mục (dòng ' + (j + 1) + ') — bỏ qua' }); return;
        }
        var e = { from: j, to: i, type: (p.type || 'FS').toUpperCase(), lag: Math.round(+p.lag || 0) };
        if (['FS', 'SS', 'FF', 'SF'].indexOf(e.type) < 0) e.type = 'FS';
        preds[i].push(e); succs[j].push(e);
      });
    }

    // Sắp xếp tô-pô (Kahn); phát hiện vòng lặp
    var indeg = new Array(n).fill(0);
    for (i = 0; i < n; i++) indeg[i] = preds[i].length;
    var order = [], queue = [];
    for (i = 0; i < n; i++) if (!tree.isSummary[i] && indeg[i] === 0) queue.push(i);
    while (queue.length) {
      var u = queue.shift(); order.push(u);
      succs[u].forEach(function (e) { if (--indeg[e.to] === 0) queue.push(e.to); });
    }
    var inCycle = {};
    var nLeaf = 0; for (i = 0; i < n; i++) if (!tree.isSummary[i]) nLeaf++;
    if (order.length < nLeaf) {
      var cyc = [];
      for (i = 0; i < n; i++) if (!tree.isSummary[i] && indeg[i] > 0) { inCycle[i] = 1; cyc.push(i + 1); }
      warnings.push({ row: -1, msg: 'Vòng lặp liên kết ở các dòng ' + cyc.join(', ') + ' — các liên kết vòng bị bỏ qua' });
      // Bỏ các cạnh giữa các nút trong vòng, rồi sắp xếp lại
      for (i = 0; i < n; i++) {
        preds[i] = preds[i].filter(function (e) { return !(inCycle[e.from] && inCycle[e.to]); });
        succs[i] = succs[i].filter(function (e) { return !(inCycle[e.from] && inCycle[e.to]); });
      }
      indeg.fill(0); order = []; queue = [];
      for (i = 0; i < n; i++) indeg[i] = preds[i].length;
      for (i = 0; i < n; i++) if (!tree.isSummary[i] && indeg[i] === 0) queue.push(i);
      while (queue.length) {
        u = queue.shift(); order.push(u);
        succs[u].forEach(function (e) { if (--indeg[e.to] === 0) queue.push(e.to); });
      }
    }

    function cIdxStart(c) { return cal.indexOnOrAfter(c.date); }
    function cIdxFinish(c) { var k = cal.indexOnOrBefore(c.date); return k === null ? null : k + 1; }

    // ---- Lượt đi (forward pass) ----
    order.forEach(function (i) {
      var t = tasks[i], es = 0, hasPred = preds[i].length > 0;
      if (!hasPred && t.start) {
        var si = cal.indexOnOrAfter(t.start);
        if (si !== null) es = si;
      }
      preds[i].forEach(function (e) {
        var p = e.from, v;
        if (e.type === 'FS') v = EF[p] + e.lag;
        else if (e.type === 'SS') v = ES[p] + e.lag;
        else if (e.type === 'FF') v = EF[p] + e.lag - dur[i];
        else v = ES[p] + e.lag - dur[i]; // SF
        if (v > es) es = v;
      });
      var c = t.constraint;
      if (c && c.type && c.type !== 'ASAP' && c.date) {
        var ci;
        if (c.type === 'SNET') { ci = cIdxStart(c); if (ci !== null && ci > es) es = ci; }
        else if (c.type === 'FNET') { ci = cIdxFinish(c); if (ci !== null && ci - dur[i] > es) es = ci - dur[i]; }
        else if (c.type === 'MSO') { ci = cIdxStart(c); if (ci !== null) es = ci; }
        else if (c.type === 'MFO') { ci = cIdxFinish(c); if (ci !== null) es = ci - dur[i]; }
      }
      ES[i] = es; EF[i] = es + dur[i];
    });

    var pStart = INF, pFinish = -INF;
    order.forEach(function (i) { if (ES[i] < pStart) pStart = ES[i]; if (EF[i] > pFinish) pFinish = EF[i]; });
    if (pStart === INF) { pStart = 0; pFinish = 0; }

    // Hạn hoàn thành dự án (nếu có) — dùng làm mốc lượt về
    var lateEnd = pFinish;
    if (project.deadline) {
      var dl = cal.indexOnOrBefore(project.deadline);
      if (dl !== null) lateEnd = dl + 1;
    }

    // ---- Lượt về (backward pass) ----
    for (var r = order.length - 1; r >= 0; r--) {
      i = order[r];
      var lf = lateEnd;
      succs[i].forEach(function (e) {
        var s = e.to, v;
        if (e.type === 'FS') v = LS[s] - e.lag;
        else if (e.type === 'SS') v = LS[s] - e.lag + dur[i];
        else if (e.type === 'FF') v = LF[s] - e.lag;
        else v = LF[s] - e.lag + dur[i]; // SF
        if (v < lf) lf = v;
      });
      var c2 = tasks[i].constraint;
      if (c2 && c2.type && c2.date) {
        var cj;
        if (c2.type === 'SNLT' || c2.type === 'MSO') { cj = cIdxStart(c2); if (cj !== null && cj + dur[i] < lf) lf = cj + dur[i]; }
        else if (c2.type === 'FNLT' || c2.type === 'MFO') { cj = cIdxFinish(c2); if (cj !== null && cj < lf) lf = cj; }
      }
      LF[i] = lf; LS[i] = lf - dur[i];
    }

    // ---- Kết quả từng dòng ----
    var rows = [];
    for (i = 0; i < n; i++) {
      rows.push({
        idx: i, id: tasks[i].id, wbs: tree.wbs[i], level: tree.level[i], parent: tree.parent[i],
        isSummary: tree.isSummary[i], isMilestone: isMs[i], duration: dur[i],
        ES: ES[i], EF: EF[i], LS: LS[i], LF: LF[i], float: null, freeFloat: null, critical: false,
        inCycle: !!inCycle[i], preds: preds[i], succs: succs[i]
      });
    }
    var critCount = 0;
    order.forEach(function (i) {
      var row = rows[i];
      row.float = LS[i] - ES[i];
      // Dự trữ tự do (FS-based, đơn giản theo từng loại liên kết)
      var ff = lateEnd - EF[i];
      succs[i].forEach(function (e) {
        var s = e.to, v;
        if (e.type === 'FS') v = ES[s] - e.lag - EF[i];
        else if (e.type === 'SS') v = ES[s] - e.lag - ES[i];
        else if (e.type === 'FF') v = EF[s] - e.lag - EF[i];
        else v = EF[s] - e.lag - ES[i];
        if (v < ff) ff = v;
      });
      row.freeFloat = ff;
      row.critical = row.float <= 0;
      if (row.critical) critCount++;
      if (row.float < 0) warnings.push({ row: i, msg: 'Dòng ' + (i + 1) + ': dự trữ âm (' + row.float + ' ngày) — vi phạm ràng buộc/hạn' });
    });

    // Hạng mục: gộp từ con (từ dưới lên)
    for (i = n - 1; i >= 0; i--) {
      if (!tree.isSummary[i]) continue;
      var row2 = rows[i];
      var es2 = INF, ef2 = -INF, fl = INF, crit = false;
      for (var j = i + 1; j < n && tree.level[j] > tree.level[i]; j++) {
        var cr = rows[j];
        if (tree.parent[j] !== i) continue;
        if (cr.ES === undefined || cr.ES === null || cr.ES === INF) continue;
        if (cr.ES < es2) es2 = cr.ES;
        if (cr.EF > ef2) ef2 = cr.EF;
        if (cr.float !== null && cr.float < fl) fl = cr.float;
        if (cr.critical) crit = true;
      }
      if (es2 === INF) { es2 = pStart; ef2 = pStart; }
      row2.ES = es2; row2.EF = ef2; row2.LS = null; row2.LF = null;
      row2.duration = ef2 - es2;
      row2.float = fl === INF ? null : fl;
      row2.critical = crit;
    }
    // Gắn % cho việc thường (dùng trong gộp hạng mục — lặp lại sau khi biết)
    for (i = 0; i < n; i++) if (!tree.isSummary[i]) rows[i]._progress = Math.max(0, Math.min(100, +tasks[i].progress || 0));
    for (i = n - 1; i >= 0; i--) {
      if (!tree.isSummary[i]) continue;
      var ws = 0, ps = 0;
      for (j = i + 1; j < n && tree.level[j] > tree.level[i]; j++) {
        if (tree.parent[j] !== i) continue;
        var w2 = rows[j].isSummary ? (rows[j].EF - rows[j].ES) : rows[j].duration;
        if (!w2) w2 = rows[j].isSummary ? 0 : 0.0001; // mốc: trọng số ~0
        ws += w2; ps += w2 * rows[j]._progress;
      }
      rows[i]._progress = ws > 0 ? ps / ws : 0;
    }

    // Ngày hiển thị
    rows.forEach(function (row) {
      row.progress = Math.round(row._progress * 10) / 10;
      delete row._progress;
      row.startDate = row.isMilestone && row.ES > 0 ? cal.dateOf(row.ES - 1) : cal.dateOf(row.ES);
      row.finishDate = row.EF > row.ES ? cal.dateOf(row.EF - 1) : row.startDate;
      if (row.LS !== null && row.LS !== undefined) {
        row.lateStartDate = cal.dateOf(row.LS);
        row.lateFinishDate = row.LF > row.LS ? cal.dateOf(row.LF - 1) : row.lateStartDate;
      }
    });

    return {
      rows: rows, cal: cal, warnings: warnings,
      projectStartIdx: pStart, projectFinishIdx: pFinish,
      projectStart: cal.dateOf(pStart), projectFinish: cal.dateOf(Math.max(pStart, pFinish - 1)),
      totalDays: pFinish - pStart, criticalCount: critCount
    };
  }

  /* ------------------------------------------------------------------ */
  /* Tiến độ thực tế so kế hoạch                                          */
  /* planPct: % lẽ ra phải đạt tại ngày báo cáo theo (baseline || hiện tại) */
  /* slipDays: số ngày LV chậm (+) / sớm (−) ước theo %                    */
  /* ------------------------------------------------------------------ */
  function plannedPercent(cal, startDate, finishDate, durDays, statusDate) {
    if (!startDate || !statusDate) return null;
    var s = cal.indexOnOrAfter(startDate);
    var st = cal.workdaysThrough(statusDate); // số ngày LV tới hết ngày báo cáo
    if (!durDays) { // mốc
      var f = cal.indexOnOrBefore(finishDate);
      return st > f ? 100 : 0;
    }
    var done = st - s;
    if (done <= 0) return 0;
    if (done >= durDays) return 100;
    return Math.round(done / durDays * 1000) / 10;
  }

  return {
    parseISO: parseISO, toISO: toISO, fmtVN: fmtVN, addDays: addDays, diffDays: diffDays,
    Calendar: Calendar, parseDuration: parseDuration, parseLinks: parseLinks, formatLink: formatLink,
    buildTree: buildTree, compute: compute, plannedPercent: plannedPercent
  };
});
