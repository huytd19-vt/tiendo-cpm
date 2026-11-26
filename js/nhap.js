/*
 * nhap.js — Nhập bảng tiến độ từ Excel (dán Ctrl+V hoặc chọn file .xlsx):
 * đọc dữ liệu, đoán dòng tiêu đề, đoán vai trò cột, dựng danh sách công việc.
 * Phần thuần (không DOM) — dùng được trong Node để test.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cpm.js'));
  else root.Nhap = factory(root.CPM);
})(typeof self !== 'undefined' ? self : this, function (CPM) {
  'use strict';

  var ROLES = [
    ['', '— Bỏ qua —'],
    ['stt', 'STT (số thứ tự dùng trong liên kết)'],
    ['wbs', 'Mã WBS (1 / 1.1 → tự ra cấp)'],
    ['code', 'Mã công việc (A1, M1-P1…)'],
    ['name', 'Tên công việc'],
    ['type', 'Loại (Hạng mục/Mốc/Việc)'],
    ['level', 'Cấp thụt lề (0,1,2…)'],
    ['duration', 'Thời lượng'],
    ['start', 'Ngày bắt đầu'],
    ['finish', 'Ngày kết thúc'],
    ['links', 'Liên kết tiền nhiệm (cú pháp 4FS+3; 6)'],
    ['pred', 'Tiền nhiệm (theo mã / STT, 1 cột 1 việc)'],
    ['lag', 'Lag (cho cột Tiền nhiệm liền trước)'],
    ['resources', 'Nguồn lực (NC:10; MAY:2)'],
    ['resNC', 'Số nhân công (→ NC:x)'],
    ['progress', '% hoàn thành'],
    ['constraint', 'Ràng buộc (SNET 10/01/2027)'],
    ['note', 'Ghi chú']
  ];

  /* ---------------- Dán từ Excel: TSV có ngoặc kép ---------------- */
  function parseTSV(text) {
    var rows = [], row = [], cell = '', i = 0, q = false;
    text = String(text || '').replace(/\r\n?/g, '\n');
    while (i < text.length) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i += 2; continue; } q = false; i++; continue; }
        cell += ch; i++; continue;
      }
      if (ch === '"' && cell === '') { q = true; i++; continue; }
      if (ch === '\t') { row.push(cell); cell = ''; i++; continue; }
      if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; continue; }
      cell += ch; i++;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    // bỏ dòng trống cuối
    while (rows.length && rows[rows.length - 1].every(function (c) { return String(c).trim() === ''; })) rows.pop();
    return rows;
  }

  function str(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return CPM.toISO(CPM.parseISO(v));
    return String(v).trim();
  }
  function norm(s) {
    return str(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
  }

  /* ---------------- Đoán dòng tiêu đề ---------------- */
  var KEYS = /(ten|cong viec|thoi luong|bat dau|ket thuc|tien nhiem|wbs|ma|stt|duration|start|finish|task|name|nguon luc|hoan thanh|ghi chu)/;
  function guessHeaderRow(rows) {
    var best = 0, bestScore = -1;
    for (var r = 0; r < Math.min(rows.length, 15); r++) {
      var score = 0, nonEmpty = 0;
      (rows[r] || []).forEach(function (c) {
        var s = norm(c);
        if (!s) return;
        nonEmpty++;
        if (s.length < 40 && KEYS.test(s)) score += 2;
        if (typeof c === 'number' || c instanceof Date) score -= 1;
      });
      if (nonEmpty >= 2 && score > bestScore) { bestScore = score; best = r; }
    }
    return best;
  }

  /* ---------------- Đoán vai trò cột ---------------- */
  function guessRoles(header, samples) {
    var roles = header.map(function (h, c) {
      var s = norm(h);
      var vals = samples.map(function (r) { return str(r[c]); }).filter(Boolean);
      if (!s) return '';
      if (/^stt$|^tt$|so thu tu/.test(s)) return 'stt';
      if (/wbs/.test(s)) return 'wbs';
      if (/^lag|do tre|^tre/.test(s)) return 'lag';
      if (/lk tien nhiem|lien ket|predecessor|^lk$/.test(s)) return 'links';
      if (/tien nhiem/.test(s)) {
        // giá trị dạng cú pháp số → links, còn lại theo mã
        var syn = vals.length && vals.every(function (v) { return /^[\d\s,;FSFfsS+\-]+$/.test(v); });
        return syn ? 'links' : 'pred';
      }
      if (/^ma\b|^ma cv|^ma hieu|^code|^id$/.test(s)) return 'code';
      if (/ten|cong viec|task|name|noi dung|hang muc cong viec/.test(s)) return 'name';
      if (/^loai|type/.test(s)) return 'type';
      if (/^cap|level|thut le/.test(s)) return 'level';
      if (/thoi luong|thoi gian|so ngay|duration|^tg/.test(s)) return 'duration';
      if (/bat dau|start|khoi cong/.test(s)) return 'start';
      if (/ket thuc|finish|hoan thanh ngay|^end/.test(s)) return 'finish';
      if (/nguon luc|resource/.test(s)) return 'resources';
      if (/nhan luc|nhan cong|so nguoi/.test(s)) return 'resNC';
      if (/%|hoan thanh|progress/.test(s)) return 'progress';
      if (/rang buoc|constraint/.test(s)) return 'constraint';
      if (/ghi chu|note|dien giai/.test(s)) return 'note';
      return '';
    });
    // Chỉ giữ 1 cột cho các vai trò đơn
    var seen = {};
    roles = roles.map(function (r) {
      if (!r || r === 'pred' || r === 'lag') return r;
      if (seen[r]) return '';
      seen[r] = 1; return r;
    });
    // 'lag' chỉ hợp lệ khi ngay sau 1 cột 'pred'
    roles = roles.map(function (r, i) { return r === 'lag' && roles[i - 1] !== 'pred' ? '' : r; });
    return roles;
  }

  /* ---------------- Chuyển ô → giá trị ---------------- */
  function cellDate(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return CPM.parseISO(v);
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) return CPM.addDays(new Date(Date.UTC(1899, 11, 30)), Math.floor(v));
      return null;
    }
    return CPM.parseISO(String(v).trim());
  }
  function cellPct(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v > 0 && v < 1 ? v * 100 : v;
    var s = String(v).replace(',', '.').trim();
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return n;
  }
  function cellType(v) {
    var s = norm(v);
    if (!s) return '';
    if (/hang muc|summary|nhom|tong/.test(s)) return 'hangmuc';
    if (/moc|milestone/.test(s)) return 'moc';
    return 'viec';
  }
  function parseConstraint(v) {
    var s = str(v);
    if (!s) return null;
    var m = /^(ASAP|SNET|SNLT|FNET|FNLT|MSO|MFO)\s*(.*)$/i.exec(s);
    if (!m) return null;
    var d = CPM.parseISO(m[2]);
    if (m[1].toUpperCase() === 'ASAP') return null;
    return d ? { type: m[1].toUpperCase(), date: CPM.toISO(d) } : null;
  }

  /* ---------------- Dựng công việc ---------------- */
  /**
   * rows: mảng 2 chiều; headerRow: chỉ số dòng tiêu đề; roles: vai trò từng cột;
   * opt: { workWeek, startDate, include: {chỉ số dòng: bool} (tuỳ chọn), newId: fn }
   * → { tasks, items:[{r, include, name, err}], errors:[], minStart }
   */
  function build(rows, headerRow, roles, opt) {
    opt = opt || {};
    var ww = opt.workWeek || 6;
    var newId = opt.newId || (function () { var k = 0; return function () { return 'n' + (++k); }; })();
    var col = {};
    var predCols = [];
    roles.forEach(function (r, c) {
      if (r === 'pred') predCols.push({ c: c, lag: roles[c + 1] === 'lag' ? c + 1 : -1 });
      else if (r && r !== 'lag' && col[r] === undefined) col[r] = c;
    });
    function get(row, role) { return col[role] === undefined ? '' : row[col[role]]; }

    // 1) Dòng dữ liệu + tự quyết dòng nào nhập
    var data = [];
    for (var r = headerRow + 1; r < rows.length; r++) {
      var row = rows[r] || [];
      if (row.every(function (c) { return str(c) === ''; })) continue;
      var name = str(get(row, 'name'));
      var hasData = str(get(row, 'duration')) !== '' || str(get(row, 'code')) !== '' || str(get(row, 'wbs')) !== '' ||
        str(get(row, 'links')) !== '' || str(get(row, 'start')) !== '' || cellType(get(row, 'type')) !== '';
      data.push({ r: r, row: row, name: name, hasData: hasData });
    }
    var lastData = -1;
    data.forEach(function (d, k) { if (d.hasData && d.name) lastData = k; });
    data.forEach(function (d, k) {
      var auto = !!d.name && (k <= lastData);
      d.include = opt.include && opt.include[d.r] !== undefined ? !!opt.include[d.r] : auto;
    });
    var used = data.filter(function (d) { return d.include; });

    // 2) Tạo task
    var cal = new CPM.Calendar(opt.startDate || CPM.toISO(new Date()), ww, opt.holidays);
    var errors = [];
    var codeMap = {}, sttMap = {};
    var minStart = null;
    var tasks = used.map(function (d, k) {
      var row = d.row;
      var t = { id: newId(), code: str(get(row, 'code')), name: d.name, type: cellType(get(row, 'type')) || 'viec', level: 0,
        duration: null, start: null, preds: [], constraint: parseConstraint(get(row, 'constraint')),
        resources: str(get(row, 'resources')), progress: 0, progressLog: [], note: str(get(row, 'note')), baseline: null };
      var wbs = str(get(row, 'wbs')).replace(/\.+$/, '');
      if (col.level !== undefined && str(get(row, 'level')) !== '') t.level = Math.max(0, parseInt(get(row, 'level'), 10) || 0);
      else if (wbs && /^\d+(\.\d+)*$/.test(wbs)) t.level = wbs.split('.').length - 1;
      else if (col.wbs !== undefined && !t.code && wbs) t.code = wbs; // WBS dạng chữ → giữ làm mã
      var nc = parseFloat(String(get(row, 'resNC')).replace(',', '.'));
      if (isFinite(nc) && nc > 0) t.resources = (t.resources ? t.resources + '; ' : '') + 'NC:' + nc;
      var pc = cellPct(get(row, 'progress'));
      t.progress = Math.max(0, Math.min(100, Math.round(pc)));
      var ds = cellDate(get(row, 'start')), df = cellDate(get(row, 'finish'));
      if (ds && (!minStart || ds < minStart)) minStart = ds;
      var dRaw = get(row, 'duration');
      var dur = CPM.parseDuration(typeof dRaw === 'number' ? dRaw : str(dRaw), ww);
      d._ds = ds; d._df = df;
      if (dur === null && ds && df) dur = '?'; // tính sau khi biết lịch
      if (dur === null) {
        if (t.type === 'moc') dur = 0;
        else if (t.type !== 'hangmuc') { dur = 1; d.err = 'Thiếu thời lượng → tạm 1 ngày'; }
        else dur = 0;
      }
      t.duration = dur;
      if (t.type === 'moc') t.duration = 0;
      if (t.code) codeMap[t.code.toUpperCase()] = t;
      var stt = str(get(row, 'stt'));
      sttMap[stt !== '' && col.stt !== undefined ? stt : String(k + 1)] = t;
      d.task = t;
      return t;
    });
    // Ngày khởi công gợi ý = ngày bắt đầu sớm nhất
    if (minStart && !opt.startDate) cal = new CPM.Calendar(CPM.toISO(minStart), ww, opt.holidays);
    used.forEach(function (d) {
      var t = d.task;
      if (t.duration === '?') {
        var a = cal.indexOnOrAfter(d._ds), b = cal.indexOnOrBefore(d._df);
        t.duration = Math.max(0, b - a + 1);
      }
    });

    // 3) Liên kết
    var RE_STT = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+\-])\s*(\d+(?:[.,]\d+)?)\s*([a-zà-ỹ]*))?$/i;
    var RE_CODE = /^(.+?)\s*(FS|SS|FF|SF)?\s*(?:([+\-])\s*(\d+(?:[.,]\d+)?)\s*([a-zà-ỹ]*))?$/i;
    function lagOf(sign, num, unit) {
      if (!sign) return 0;
      var v = CPM.parseDuration(String(num).replace(',', '.') + (unit || 'd'), ww) || 0;
      return sign === '-' ? -v : v;
    }
    function resolve(tok, t, d, extraLag) {
      tok = tok.trim(); if (!tok) return;
      var target = null, type = 'FS', lag = 0, m;
      var up = tok.toUpperCase();
      if (codeMap[up]) target = codeMap[up];
      else if ((m = RE_STT.exec(tok)) && sttMap[m[1]] && !codeMap[m[1].toUpperCase()]) {
        target = sttMap[m[1]]; type = (m[2] || 'FS').toUpperCase(); lag = lagOf(m[3], m[4], m[5]);
      } else if ((m = RE_CODE.exec(tok)) && codeMap[m[1].trim().toUpperCase()]) {
        target = codeMap[m[1].trim().toUpperCase()]; type = (m[2] || 'FS').toUpperCase(); lag = lagOf(m[3], m[4], m[5]);
      } else if ((m = RE_STT.exec(tok)) && sttMap[m[1]]) {
        target = sttMap[m[1]]; type = (m[2] || 'FS').toUpperCase(); lag = lagOf(m[3], m[4], m[5]);
      }
      if (!target) { errors.push({ r: d.r, msg: 'Dòng ' + (d.r + 1) + ': không tìm thấy tiền nhiệm "' + tok + '"' }); return; }
      if (target === t) return;
      if (extraLag) lag += extraLag;
      if (t.preds.some(function (p) { return p.id === target.id; })) return;
      t.preds.push({ id: target.id, type: type, lag: lag });
    }
    used.forEach(function (d) {
      var t = d.task;
      String(str(get(d.row, 'links'))).split(/[;,\n]+/).forEach(function (tok) { resolve(tok, t, d, 0); });
      predCols.forEach(function (pc) {
        var v = str(d.row[pc.c]);
        if (!v) return;
        var lg = pc.lag >= 0 ? (parseFloat(String(d.row[pc.lag]).replace(',', '.')) || 0) : 0;
        v.split(/[;,\n]+/).forEach(function (tok) { resolve(tok, t, d, Math.round(lg)); });
      });
      if (!t.preds.length && d._ds) t.start = CPM.toISO(d._ds);
    });

    var items = data.map(function (d) { return { r: d.r, include: d.include, name: d.name, err: d.err || '' }; });
    used.forEach(function (d) { if (d.err) errors.push({ r: d.r, msg: 'Dòng ' + (d.r + 1) + ': ' + d.err }); });
    return { tasks: tasks, items: items, errors: errors, minStart: minStart ? CPM.toISO(minStart) : null };
  }

  return { ROLES: ROLES, parseTSV: parseTSV, guessHeaderRow: guessHeaderRow, guessRoles: guessRoles, build: build, norm: norm, str: str };
});
