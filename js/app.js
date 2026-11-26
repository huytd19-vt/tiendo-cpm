/*
 * app.js — Giao diện: bảng công việc, lọc, Gantt, nhập/xuất, lưu/mở, baseline, in.
 * Phụ thuộc: CPM, Model, Gantt, Nhap, Inan, XLSX (SheetJS).
 */
(function () {
  'use strict';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ================= TRẠNG THÁI ================= */
  var S = {
    project: null, result: null, hist: new Model.History(80),
    filter: 'all', scale: 'tuan', query: '', selected: {}, anchor: null, collapsed: {},
    visible: [], derived: [], rowH: 26, headH: 44
  };

  var TYPES = [['viec', 'Việc'], ['moc', 'Mốc'], ['hangmuc', 'Hạng mục']];
  var COLS = [
    { k: 'stt', t: 'STT', w: 38 },
    { k: 'wbs', t: 'Mã WBS', w: 54 },
    { k: 'code', t: 'Mã', w: 104 },
    { k: 'name', t: 'Tên công việc', w: 300 },
    { k: 'type', t: 'Loại', w: 82 },
    { k: 'duration', t: 'Thời lượng (ngày)', w: 64 },
    { k: 'start', t: 'Bắt đầu', w: 88 },
    { k: 'finish', t: 'Kết thúc', w: 88 },
    { k: 'links', t: 'LK tiền nhiệm', w: 110 },
    { k: 'float', t: 'Dự trữ', w: 50 },
    { k: 'cons', t: 'Ràng buộc', w: 110 },
    { k: 'res', t: 'Nguồn lực', w: 92 },
    { k: 'progress', t: '% HT', w: 48 },
    { k: 'plan', t: '% KH', w: 46 },
    { k: 'slip', t: 'Chậm (ngày)', w: 54 },
    { k: 'var', t: 'Lệch BL', w: 54 },
    { k: 'note', t: 'Ghi chú', w: 160 }
  ];
  var EDIT_ORDER = ['code', 'name', 'type', 'duration', 'start', 'finish', 'links', 'res', 'progress', 'note'];

  function toast(msg, ms) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
  }

  /* ================= TÍNH TOÁN ================= */
  function recalc() {
    var p = S.project;
    S.result = CPM.compute(p);
    // Chuẩn hoá level theo cây (tránh nhảy cấp)
    S.result.rows.forEach(function (r, i) { p.tasks[i].level = r.level; });
    derive();
  }

  /** % kế hoạch, chậm, lệch baseline cho từng dòng */
  function derive() {
    var p = S.project, res = S.result, cal = res.cal;
    var sd = p.statusDate ? CPM.parseISO(p.statusDate) : null;
    var D = res.rows.map(function (r, i) {
      var t = p.tasks[i], bl = t.baseline;
      var o = { plan: null, slip: null, varBL: null };
      if (bl && bl.finish) {
        var a = cal.indexOnOrBefore(r.finishDate), b = cal.indexOnOrBefore(bl.finish);
        if (a !== null && b !== null) o.varBL = a - b;
      }
      if (sd && !r.isSummary) {
        var s = bl && bl.start ? bl.start : r.startDate, f = bl && bl.finish ? bl.finish : r.finishDate;
        var du = bl && bl.start ? bl.duration : r.duration;
        o.plan = CPM.plannedPercent(cal, s, f, du, sd);
        if (o.plan !== null) o.slip = Math.round((o.plan - r.progress) / 100 * Math.max(du, r.isMilestone ? 1 : 0));
      }
      return o;
    });
    // Hạng mục: % KH gộp theo thời lượng con
    for (var i = res.rows.length - 1; i >= 0; i--) {
      var r = res.rows[i];
      if (!r.isSummary || !sd) continue;
      var ws = 0, ps = 0;
      for (var j = i + 1; j < res.rows.length && res.rows[j].level > r.level; j++) {
        if (res.rows[j].parent !== i) continue;
        var w = res.rows[j].isSummary ? (res.rows[j].EF - res.rows[j].ES) : res.rows[j].duration;
        if (D[j].plan === null) continue;
        ws += w; ps += w * D[j].plan;
      }
      D[i].plan = ws > 0 ? Math.round(ps / ws * 10) / 10 : null;
      if (D[i].plan !== null) D[i].slip = Math.round((D[i].plan - r.progress) / 100 * r.duration);
    }
    S.derived = D;
  }

  /* ================= LỌC ================= */
  function computeVisible() {
    var p = S.project, res = S.result, n = p.tasks.length;
    var match = new Array(n).fill(false);
    var sd = CPM.parseISO(p.statusDate || Model.todayISO());
    var wk0 = CPM.addDays(sd, -((sd.getUTCDay() + 6) % 7)), wk1 = CPM.addDays(wk0, 6);
    var q = Nhap.norm(S.query || '');
    for (var i = 0; i < n; i++) {
      var r = res.rows[i], t = p.tasks[i], ok = true;
      if (S.filter === 'week') ok = !r.isSummary && r.startDate <= wk1 && r.finishDate >= wk0;
      else if (S.filter === 'late') ok = !r.isSummary && S.derived[i].slip !== null && S.derived[i].slip > 0 && r.progress < 100;
      else if (S.filter === 'crit') ok = !r.isSummary && r.critical;
      if (ok && q) ok = Nhap.norm(t.name + ' ' + t.code + ' ' + r.wbs).indexOf(q) >= 0;
      match[i] = ok;
    }
    var show = new Array(n).fill(false);
    var anyFilter = S.filter !== 'all' || q;
    for (i = 0; i < n; i++) {
      if (!match[i]) continue;
      show[i] = true;
      if (anyFilter) { var pa = res.rows[i].parent; while (pa >= 0) { show[pa] = true; pa = res.rows[pa].parent; } }
    }
    // Thu gọn hạng mục
    var vis = [];
    for (i = 0; i < n; i++) {
      if (!show[i]) continue;
      var hidden = false, pp = res.rows[i].parent;
      while (pp >= 0) { if (S.collapsed[p.tasks[pp].id]) { hidden = true; break; } pp = res.rows[pp].parent; }
      if (!hidden) vis.push(i);
    }
    S.visible = vis;
  }

  /* ================= VẼ BẢNG ================= */
  function renderHead() {
    var h = '<tr>' + COLS.map(function (c) { return '<th style="width:' + c.w + 'px">' + c.t + '</th>'; }).join('') + '</tr>';
    $('#grid-head').innerHTML = h;
  }

  function fmtNum(v, sign) {
    if (v === null || v === undefined || v === '') return '';
    if (sign && v > 0) return '+' + v;
    return String(v);
  }

  function rowHTML(i) {
    var p = S.project, t = p.tasks[i], r = S.result.rows[i], d = S.derived[i];
    var hasPred = r.preds.length > 0 || (t.preds && t.preds.length > 0);
    var cls = (S.selected[i] ? 'sel ' : '') + (r.isSummary ? 'sum ' : '') + (r.critical && !r.isSummary ? 'crit ' : '');
    var h = ['<tr data-i="' + i + '" class="' + cls + '">'];
    COLS.forEach(function (c) {
      switch (c.k) {
        case 'stt': h.push('<td class="stt" title="Bấm để chọn dòng">' + (i + 1) + '</td>'); break;
        case 'wbs': h.push('<td class="ro">' + r.wbs + '</td>'); break;
        case 'code': h.push('<td><input data-f="code" value="' + esc(t.code) + '"></td>'); break;
        case 'name':
          var ic = r.isSummary ? '<span class="ic sm tg" data-tg="1" title="Thu gọn/mở">' + (S.collapsed[t.id] ? '▸' : '▾') + '</span>' :
            r.isMilestone ? '<span class="ic ms">◆</span>' : '<span class="ic"></span>';
          h.push('<td class="c-name"><div class="cell" style="padding-left:' + (r.level * 16) + 'px">' + ic +
            '<input data-f="name" value="' + esc(t.name) + '" title="' + esc(t.name) + '"></div></td>'); break;
        case 'type':
          var tv = r.isSummary ? 'hangmuc' : (t.type === 'moc' || r.isMilestone ? 'moc' : 'viec');
          h.push('<td><select data-f="type">' + TYPES.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === tv ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></td>'); break;
        case 'duration':
          h.push('<td class="num"><input data-f="duration" value="' + r.duration + '"' + (r.isSummary ? ' readonly class="calc" title="Hạng mục: tự gộp từ việc con"' : ' title="Ngày làm việc; gõ 2t = 2 tuần, 1th = 1 tháng"') + '></td>'); break;
        case 'start':
          var canS = !r.isSummary && !hasPred;
          h.push('<td class="ctr"><input data-f="start" value="' + CPM.fmtVN(r.startDate) + '"' + (canS ? ' title="Nhập ngày bắt đầu (dd/mm/yyyy)"' : ' readonly class="calc" title="Tự tính từ tiền nhiệm"') + '></td>'); break;
        case 'finish':
          var canF = !r.isSummary && !r.isMilestone;
          h.push('<td class="ctr"><input data-f="finish" value="' + CPM.fmtVN(r.finishDate) + '"' + (canF ? ' title="Nhập ngày kết thúc → tự tính thời lượng"' : ' readonly class="calc"') + '></td>'); break;
        case 'links':
          h.push('<td><input data-f="links" value="' + esc(Model.linksText(p, t)) + '"' + (r.isSummary ? ' readonly class="calc" title="Không liên kết hạng mục"' : ' title="vd. 4FS+3; 6"') + '></td>'); break;
        case 'float':
          var fv = r.float;
          h.push('<td class="ro num ' + (fv !== null && fv <= 0 ? 'flt-0' : '') + '" style="text-align:right">' + (fv === null ? '' : fv) + '</td>'); break;
        case 'cons':
          h.push('<td class="c-cons" data-cons="1" title="Bấm để đặt ràng buộc">' + esc(Model.constraintText(t.constraint)) + '</td>'); break;
        case 'res': h.push('<td><input data-f="res" value="' + esc(t.resources) + '" title="vd. NC:10; MAY:2"></td>'); break;
        case 'progress':
          h.push('<td class="num"><input data-f="progress" value="' + (r.progress || 0) + '"' + (r.isSummary ? ' readonly class="calc"' : '') + '></td>'); break;
        case 'plan': h.push('<td class="ro" style="text-align:right">' + (d.plan === null ? '' : d.plan) + '</td>'); break;
        case 'slip':
          var sc = d.slip === null ? '' : d.slip > 0 ? 'late' : d.slip < 0 ? 'early' : '';
          h.push('<td class="ro ' + sc + '" style="text-align:right" title="+ chậm / − vượt (ngày làm việc)">' + fmtNum(d.slip, true) + '</td>'); break;
        case 'var':
          var vc = d.varBL === null ? '' : d.varBL > 0 ? 'late' : d.varBL < 0 ? 'early' : '';
          h.push('<td class="ro ' + vc + '" style="text-align:right" title="Kết thúc hiện tại − kết thúc baseline (+ trễ / − sớm)">' + fmtNum(d.varBL, true) + '</td>'); break;
        case 'note': h.push('<td><input data-f="note" value="' + esc(t.note) + '" title="' + esc(t.note) + '"></td>'); break;
      }
    });
    h.push('</tr>');
    return h.join('');
  }

  function renderTable() {
    $('#grid-body').innerHTML = S.visible.map(rowHTML).join('');
    // Đo chiều cao thật để Gantt khớp dòng
    var tr = $('#grid-body tr');
    if (tr) S.rowH = tr.getBoundingClientRect().height || 26;
    var th = $('#grid-head tr');
    if (th) S.headH = th.getBoundingClientRect().height || 44;
  }

  function renderSummary() {
    var p = S.project, res = S.result;
    var tot = 0, pr = 0, pl = 0, plw = 0;
    res.rows.forEach(function (r, i) {
      if (r.isSummary) return;
      tot += r.duration; pr += r.duration * r.progress;
      if (S.derived[i].plan !== null) { plw += r.duration; pl += r.duration * S.derived[i].plan; }
    });
    var cal = CPM.diffDays(res.projectStart, res.projectFinish) + 1;
    var w = res.warnings.length;
    var late = res.rows.filter(function (r, i) { return !r.isSummary && S.derived[i].slip > 0 && r.progress < 100; }).length;
    var h = [
      '<span>Khởi công: <b>' + CPM.fmtVN(res.projectStart) + '</b></span>',
      '<span>Hoàn thành: <b>' + CPM.fmtVN(res.projectFinish) + '</b></span>',
      '<span>Tổng: <b>' + res.totalDays + '</b> ngày LV (' + cal + ' ngày lịch, tuần ' + p.workWeek + ' ngày)</span>',
      '<span>Việc găng: <b class="crit">' + res.criticalCount + '</b></span>',
      '<span>Số dòng: <b>' + p.tasks.length + '</b></span>',
      '<span>% HT: <b>' + (tot ? Math.round(pr / tot * 10) / 10 : 0) + '%</b>' + (plw ? ' / KH <b>' + Math.round(pl / plw * 10) / 10 + '%</b>' : '') + '</span>'
    ];
    if (late) h.push('<span class="crit">Chậm: ' + late + ' việc</span>');
    if (p.baselineDate) h.push('<span>Baseline: ' + CPM.fmtVN(CPM.parseISO(p.baselineDate)) + '</span>');
    if (p.deadline) h.push('<span>Hạn: <b>' + CPM.fmtVN(CPM.parseISO(p.deadline)) + '</b></span>');
    if (w) h.push('<span class="warnlink" id="warn-link">⚠ ' + w + ' cảnh báo</span>');
    $('#summary').innerHTML = h.join('');
    var wl = $('#warn-link');
    if (wl) wl.onclick = function () { alert(res.warnings.map(function (x) { return '• ' + x.msg; }).join('\n')); };
  }

  /* ================= GANTT ================= */
  var G = null;
  function renderGantt() {
    G = Gantt.render({
      project: S.project, result: S.result, rows: S.visible, scale: S.scale, rowH: S.rowH, headH: S.headH,
      showLinks: $('#o-links').checked, showFloat: $('#o-float').checked, showBaseline: true,
      selected: S.selected, today: Model.todayISO()
    });
    var gh = $('#g-head'), gb = $('#g-body');
    gh.style.height = S.headH + 'px';
    var sl = gb.scrollLeft, st = gb.scrollTop;
    gh.innerHTML = G.header;
    gb.innerHTML = G.body + '<div style="height:18px"></div>';
    gb.scrollLeft = sl; gb.scrollTop = st;
  }

  /* ================= NGUỒN LỰC ================= */
  function renderRes() {
    var pane = $('#res-pane');
    if (!$('#o-res').checked) { pane.hidden = true; return; }
    pane.hidden = false;
    var p = S.project, res = S.result, cal = res.cal;
    var use = {}; // code -> {idx: qty}
    res.rows.forEach(function (r, i) {
      if (r.isSummary) return;
      var rs = Model.parseResources(p.tasks[i].resources);
      Object.keys(rs).forEach(function (k) {
        use[k] = use[k] || {};
        for (var d = r.ES; d < r.EF; d++) use[k][d] = (use[k][d] || 0) + rs[k];
      });
    });
    var codes = Object.keys(use).sort();
    var cur = S.resCode && use[S.resCode] ? S.resCode : codes[0];
    S.resCode = cur;
    var lw = $('#pane-left').getBoundingClientRect().width + 5;
    var left = '<div class="res-left" style="width:' + lw + 'px">';
    if (!codes.length) left += '<i>Chưa có nguồn lực. Nhập cột Nguồn lực dạng <code>NC:10; MAY:2</code>.</i>';
    else {
      var u = use[cur], peak = 0, days = 0, over = 0, lim = +p.resourceLimits[cur] || 0;
      Object.keys(u).forEach(function (k) { peak = Math.max(peak, u[k]); days++; if (lim && u[k] > lim) over++; });
      var sum = Object.keys(u).reduce(function (s, k) { return s + u[k]; }, 0);
      left += '<b>Biểu đồ nguồn lực</b> <select id="res-code">' + codes.map(function (c) { return '<option' + (c === cur ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select><br>' +
        'Giới hạn/ngày: <input id="res-lim" type="number" min="0" style="width:70px" value="' + (lim || '') + '"><br>' +
        'Đỉnh: <b>' + peak + '</b>/ngày · Tổng: <b>' + Math.round(sum) + '</b> công' +
        (lim ? '<br>' + (over ? '<span class="crit">⚠ Vượt giới hạn ' + over + ' ngày</span>' : '<span style="color:var(--ok)">Không vượt giới hạn</span>') : '');
    }
    left += '</div>';
    var right = '<div class="res-right" id="res-right">';
    if (codes.length && G) {
      var u2 = use[cur], lim2 = +p.resourceLimits[cur] || 0;
      var mx = Math.max(lim2, Math.max.apply(null, Object.keys(u2).map(function (k) { return u2[k]; })));
      var H = 160, top = 12, sc = (H - top - 14) / (mx || 1);
      var s = ['<svg width="' + G.width + '" height="' + H + '">'];
      Object.keys(u2).forEach(function (k) {
        var d = cal.dateOf(+k), x = CPM.diffDays(G.x0, d) * G.pxPerDay, v = u2[k], hh = v * sc;
        s.push('<rect x="' + x + '" y="' + (H - 14 - hh) + '" width="' + Math.max(1, G.pxPerDay - (G.pxPerDay > 3 ? 1 : 0)) + '" height="' + hh + '" class="res-bar' + (lim2 && v > lim2 ? ' over' : '') + '"><title>' + CPM.fmtVN(d) + ': ' + v + '</title></rect>');
      });
      if (lim2) { var yl = H - 14 - lim2 * sc; s.push('<line x1="0" x2="' + G.width + '" y1="' + yl + '" y2="' + yl + '" class="res-lim"/>'); }
      s.push('<text x="4" y="10" class="res-ax">max ' + mx + '</text></svg>');
      right += s.join('');
    }
    right += '</div>';
    pane.innerHTML = left + right;
    var rc = $('#res-code'); if (rc) rc.onchange = function () { S.resCode = rc.value; renderRes(); };
    var rl = $('#res-lim'); if (rl) rl.onchange = function () { mutate(function () { var v = +rl.value; if (v > 0) S.project.resourceLimits[S.resCode] = v; else delete S.project.resourceLimits[S.resCode]; }); };
    var rr = $('#res-right'); if (rr) rr.scrollLeft = $('#g-body').scrollLeft;
  }

  /* ================= VẼ TẤT CẢ ================= */
  function render() {
    computeVisible();
    renderTable();
    renderSummary();
    renderGantt();
    renderRes();
    $('#pj-name').value = S.project.name;
    $('#status-date').value = S.project.statusDate || '';
    document.title = 'Tiến độ CPM — ' + S.project.name;
  }
  var saveTimer = null;
  function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { if (!Model.saveLocal(S.project)) toast('⚠ Không lưu được vào trình duyệt (đầy bộ nhớ?) — hãy Lưu ra file .json'); }, 300); }

  /** Thay đổi có hoàn tác: fn sửa S.project; sau đó tính lại + vẽ. */
  function mutate(fn, keepFocus) {
    S.hist.push(S.project);
    var r = fn();
    recalc(); render(); autosave();
    return r;
  }
  function setProject(p, reason) {
    if (S.project && reason) Model.backup(S.project, reason);
    S.project = p; S.selected = {}; S.collapsed = {};
    recalc(); render(); autosave();
  }

  /* ================= SỬA Ô ================= */
  function applyEdit(i, f, val) {
    var p = S.project, t = p.tasks[i], r = S.result.rows[i];
    var msg = null;
    switch (f) {
      case 'code': t.code = val.trim(); break;
      case 'name': t.name = val; break;
      case 'type':
        if (val === 'moc') { t.type = 'moc'; t.duration = 0; }
        else if (val === 'hangmuc') { t.type = 'hangmuc'; if (t.preds.length) { t.preds = []; msg = 'Đã bỏ liên kết của dòng (hạng mục không liên kết)'; } }
        else { if (r.isSummary && S.result.rows.some(function (x) { return x.parent === i; })) { msg = 'Dòng có việc con nên vẫn là Hạng mục — lùi cấp các dòng con trước'; } t.type = 'viec'; if (!t.duration) t.duration = 1; }
        break;
      case 'duration':
        var d = CPM.parseDuration(val, p.workWeek);
        if (d === null) { msg = 'Thời lượng không hợp lệ: "' + val + '"'; break; }
        t.duration = d; if (d === 0 && t.type === 'viec') t.type = 'moc'; else if (d > 0 && t.type === 'moc') t.type = 'viec';
        break;
      case 'start':
        if (!val.trim()) { t.start = null; break; }
        var ds = CPM.parseISO(val);
        if (!ds) { msg = 'Ngày không hợp lệ (dd/mm/yyyy)'; break; }
        t.start = CPM.toISO(ds);
        if (ds < CPM.parseISO(p.startDate)) msg = 'Ngày bắt đầu trước ngày khởi công — sẽ tính từ ngày khởi công. Đổi ngày khởi công ở ⚙ Dự án';
        break;
      case 'finish':
        var df = CPM.parseISO(val);
        if (!df) { msg = 'Ngày không hợp lệ (dd/mm/yyyy)'; break; }
        var b = S.result.cal.indexOnOrBefore(df);
        var nd = b - r.ES + 1;
        if (nd < 1) { msg = 'Ngày kết thúc trước ngày bắt đầu'; break; }
        t.duration = nd;
        break;
      case 'links':
        var errs = Model.setLinksText(p, i, val);
        if (errs.length) msg = errs.join(' · ');
        break;
      case 'res': t.resources = val.trim(); break;
      case 'progress':
        var pc = parseFloat(String(val).replace(',', '.').replace('%', ''));
        if (!isFinite(pc)) { msg = '% không hợp lệ'; break; }
        Model.setProgress(p, t, pc);
        break;
      case 'note': t.note = val; break;
    }
    return msg;
  }

  function focusCell(i, f, select) {
    var el = $('#grid-body tr[data-i="' + i + '"] [data-f="' + f + '"]');
    if (el) { el.focus(); if (select && el.select) el.select(); }
    return el;
  }
  function nextVisible(i, dir) {
    var k = S.visible.indexOf(i);
    if (k < 0) return null;
    var n = S.visible[k + dir];
    return n === undefined ? null : n;
  }

  var committing = false;
  function commit(el) {
    if (committing) return;
    var tr = el.closest('tr'); if (!tr) return;
    var i = +tr.dataset.i, f = el.dataset.f;
    if (el.readOnly) return;
    var t = S.project.tasks[i];
    // Bỏ qua nếu không đổi
    var cur = { code: t.code, name: t.name, res: t.resources, note: t.note }[f];
    if (cur !== undefined && cur === el.value) return;
    committing = true;
    var msg;
    try { msg = mutate(function () { return applyEdit(i, f, el.value); }); }
    finally { committing = false; }
    if (msg) toast(msg, 4000);
  }

  /* ================= THAO TÁC DÒNG ================= */
  function selList() { return Object.keys(S.selected).map(Number).filter(function (i) { return i < S.project.tasks.length; }).sort(function (a, b) { return a - b; }); }
  function setSel(list) { S.selected = {}; list.forEach(function (i) { S.selected[i] = true; }); }
  function focusedRow() { var a = document.activeElement; var tr = a && a.closest && a.closest('#grid-body tr'); return tr ? +tr.dataset.i : null; }

  function insertRow(type) {
    var sel = selList(); var fr = focusedRow();
    var at = sel.length ? sel[sel.length - 1] : (fr !== null ? fr : S.project.tasks.length - 1);
    var newIdx;
    mutate(function () {
      var p = S.project, lv = 0;
      if (at >= 0 && p.tasks[at]) {
        var r = S.result.rows[at];
        lv = r.isSummary && !S.collapsed[p.tasks[at].id] ? r.level + 1 : r.level;
        // chèn sau toàn bộ con nếu hạng mục đang thu gọn
        if (r.isSummary && S.collapsed[p.tasks[at].id]) { var j = at + 1; while (j < p.tasks.length && S.result.rows[j].level > r.level) j++; at = j - 1; }
      }
      var t = Model.newTask({ type: type, level: lv, name: type === 'moc' ? 'Mốc mới' : type === 'hangmuc' ? 'Hạng mục mới' : 'Việc mới', duration: type === 'moc' ? 0 : type === 'hangmuc' ? 0 : 1 });
      p.tasks.splice(at + 1, 0, t);
      newIdx = at + 1;
      setSel([newIdx]);
    });
    focusCell(newIdx, 'name', true);
  }
  function deleteRows() {
    var sel = selList(); var fr = focusedRow();
    if (!sel.length && fr !== null) sel = [fr];
    if (!sel.length) { toast('Chọn dòng (bấm cột STT) trước'); return; }
    if (!confirm('Xoá ' + sel.length + ' dòng?')) return;
    mutate(function () {
      var p = S.project, ids = {};
      sel.forEach(function (i) { ids[p.tasks[i].id] = 1; });
      p.tasks = p.tasks.filter(function (t) { return !ids[t.id]; });
      p.tasks.forEach(function (t) { t.preds = t.preds.filter(function (x) { return !ids[x.id]; }); });
      S.selected = {};
    });
  }
  function moveRows(dir) {
    var sel = selList(); var fr = focusedRow();
    if (!sel.length && fr !== null) sel = [fr];
    if (!sel.length) return;
    var p = S.project;
    if ((dir < 0 && sel[0] === 0) || (dir > 0 && sel[sel.length - 1] === p.tasks.length - 1)) return;
    mutate(function () {
      var order = dir < 0 ? sel : sel.slice().reverse();
      order.forEach(function (i) { var j = i + dir; var tmp = p.tasks[j]; p.tasks[j] = p.tasks[i]; p.tasks[i] = tmp; });
      setSel(sel.map(function (i) { return i + dir; }));
    });
  }
  function indentRows(dir) {
    var sel = selList(); var fr = focusedRow();
    if (!sel.length && fr !== null) sel = [fr];
    if (!sel.length) return;
    mutate(function () {
      sel.forEach(function (i) {
        var t = S.project.tasks[i];
        t.level = Math.max(0, (t.level || 0) + dir);
        // dòng con đi theo
        var base = S.result.rows[i].level;
        for (var j = i + 1; j < S.project.tasks.length && S.result.rows[j].level > base; j++) {
          if (!S.selected[j]) S.project.tasks[j].level = Math.max(0, S.project.tasks[j].level + dir);
        }
      });
    });
    // Hạng mục mới có liên kết → báo
    var bad = S.result.warnings.filter(function (w) { return /Hạng mục/.test(w.msg); }).length;
    if (bad) toast('⚠ Có liên kết vào/ra Hạng mục bị bỏ qua — xem cảnh báo', 4000);
  }
  function linkRows() {
    var sel = selList();
    if (sel.length < 2) { toast('Chọn ≥ 2 dòng (Ctrl+bấm STT) để liên kết FS theo thứ tự'); return; }
    mutate(function () {
      var p = S.project;
      for (var k = 1; k < sel.length; k++) {
        var a = p.tasks[sel[k - 1]], b = p.tasks[sel[k]];
        if (!b.preds.some(function (x) { return x.id === a.id; })) b.preds.push({ id: a.id, type: 'FS', lag: 0 });
      }
    });
  }

  /* ================= LƯU / MỞ / XUẤT ================= */
  function fileStamp() { var d = new Date(); return '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  function safeName(s) { return String(s || 'du_an').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 60); }
  function download(name, blob) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function saveJSON() {
    download(safeName(S.project.name) + '_' + fileStamp() + '.tiendo.json', new Blob([Model.toJSON(S.project)], { type: 'application/json' }));
    toast('Đã lưu file .json (thư mục Tải xuống)');
  }
  function openJSON(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var p = Model.normalize(JSON.parse(fr.result));
        S.hist.push(S.project);
        setProject(p, 'Trước khi mở file ' + file.name);
        toast('Đã mở ' + file.name + ' (' + p.tasks.length + ' dòng). Bản cũ đã sao lưu.');
      } catch (e) { alert('Không mở được file: ' + e.message); }
    };
    fr.readAsText(file, 'utf-8');
  }
  function exportXlsx() {
    var p = S.project, res = S.result;
    function ld(d) { return d ? new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : ''; }
    var aoa = [['STT', 'Mã WBS', 'Mã', 'Tên công việc', 'Loại', 'Cấp', 'Thời lượng (ngày)', 'Ngày bắt đầu', 'Ngày kết thúc', 'LK tiền nhiệm', 'Dự trữ', 'Găng', 'Ràng buộc', 'Nguồn lực', '% Hoàn thành', '% Kế hoạch', 'Chậm (ngày)', 'BL bắt đầu', 'BL kết thúc', 'Lệch BL', 'Ghi chú']];
    res.rows.forEach(function (r, i) {
      var t = p.tasks[i], d = S.derived[i];
      aoa.push([i + 1, r.wbs, t.code, t.name, r.isSummary ? 'Hạng mục' : r.isMilestone ? 'Mốc' : 'Việc', r.level, r.duration,
        ld(r.startDate), ld(r.finishDate), Model.linksText(p, t), r.float === null ? '' : r.float, r.critical && !r.isSummary ? 'Găng' : '',
        Model.constraintText(t.constraint), t.resources, r.progress, d.plan === null ? '' : d.plan, d.slip === null ? '' : d.slip,
        t.baseline ? ld(CPM.parseISO(t.baseline.start)) : '', t.baseline ? ld(CPM.parseISO(t.baseline.finish)) : '', d.varBL === null ? '' : d.varBL, t.note]);
    });
    var ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mm/yyyy' });
    ws['!cols'] = [6, 8, 12, 60, 10, 5, 10, 12, 12, 16, 8, 7, 18, 16, 10, 10, 10, 12, 12, 8, 30].map(function (w) { return { wch: w }; });
    var info = [['Dự án', p.name], ['Ngày khởi công', ld(CPM.parseISO(p.startDate))], ['Tuần làm việc (ngày)', p.workWeek],
      ['Hoàn thành', ld(res.projectFinish)], ['Tổng (ngày làm việc)', res.totalDays], ['Số việc găng', res.criticalCount],
      ['Ngày báo cáo', p.statusDate ? ld(CPM.parseISO(p.statusDate)) : ''], ['Ngày nghỉ lễ', (p.holidays || []).join(', ')],
      ['Xuất từ', 'Tiến độ CPM (_congcu/web/tiendo_cpm) — số liệu tính sẵn, không phải công thức sống']];
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tien do CPM');
    var ws2 = XLSX.utils.aoa_to_sheet(info, { cellDates: true, dateNF: 'dd/mm/yyyy' }); ws2['!cols'] = [{ wch: 22 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Thong tin');
    XLSX.writeFile(wb, safeName(p.name) + '_CPM_' + fileStamp() + '.xlsx', { cellDates: true });
  }

  /* ================= NHẬP EXCEL ================= */
  var IMP = { sheets: null, rows: null, roles: null, include: {} };
  function openImport(text) {
    var d = $('#dlg-import');
    IMP = { sheets: null, rows: null, roles: null, include: {} };
    $('#i-paste').value = text || '';
    $('#i-sheet').hidden = true;
    $('#i-start').value = S.project.startDate;
    $('#i-ww').value = String(S.project.workWeek);
    $('#i-map').innerHTML = ''; $('#i-prev').innerHTML = ''; $('#i-stat').textContent = '';
    if (!d.open) d.showModal();
    if (text) loadRows(Nhap.parseTSV(text), true);
  }
  function loadRows(rows, guessStart) {
    IMP.rows = rows; IMP.include = {};
    var h = Nhap.guessHeaderRow(rows);
    $('#i-hrow').value = h + 1;
    IMP.roles = Nhap.guessRoles(rows[h] || [], rows.slice(h + 1, h + 11));
    IMP.guessStart = guessStart;
    renderImport(true);
  }
  function renderImport(first) {
    var rows = IMP.rows; if (!rows) return;
    var h = Math.max(0, Math.min(rows.length - 1, (+$('#i-hrow').value || 1) - 1));
    var header = rows[h] || [];
    var nc = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    if (!IMP.roles || IMP.roles.length < nc) { IMP.roles = (IMP.roles || []).concat(new Array(nc).fill('')).slice(0, nc); }
    // Bảng ghép cột: mỗi cột 1 dòng
    var m = ['<table><tr><th>Cột</th><th>Tiêu đề nguồn</th><th>Vai trò</th><th>Mẫu dữ liệu</th></tr>'];
    for (var c = 0; c < nc; c++) {
      var samp = rows.slice(h + 1, h + 4).map(function (r) { return Nhap.str(r[c]); }).filter(Boolean).join(' | ');
      m.push('<tr class="' + (IMP.roles[c] ? 'used' : '') + '"><td>' + colName(c) + '</td><td>' + esc(Nhap.str(header[c])) + '</td><td><select data-c="' + c + '">' +
        Nhap.ROLES.map(function (x) { return '<option value="' + x[0] + '"' + (IMP.roles[c] === x[0] ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') +
        '</select></td><td>' + esc(samp) + '</td></tr>');
    }
    m.push('</table>');
    $('#i-map').innerHTML = m.join('');
    // Dựng thử
    var opt = { workWeek: +$('#i-ww').value, startDate: IMP.guessStart && first ? null : $('#i-start').value, include: IMP.include, newId: Model.newId };
    var b = Nhap.build(rows, h, IMP.roles, opt);
    if (IMP.guessStart && first && b.minStart) { $('#i-start').value = b.minStart; }
    if (IMP.guessStart && first) { opt.startDate = $('#i-start').value; b = Nhap.build(rows, h, IMP.roles, opt); }
    IMP.built = b;
    var nameCol = IMP.roles.indexOf('name');
    var used = b.items.filter(function (x) { return x.include; });
    var pv = ['<table><tr><th>Nhập</th><th>Dòng</th><th>Tên</th><th>Mã</th><th>TL</th><th>Tiền nhiệm</th><th>Lỗi</th></tr>'];
    var k = 0;
    b.items.forEach(function (it) {
      var t = it.include ? b.tasks[k++] : null;
      var preds = t ? t.preds.map(function (p) { var j = b.tasks.findIndex(function (x) { return x.id === p.id; }); return CPM.formatLink(j + 1, p.type, p.lag); }).join('; ') : '';
      pv.push('<tr class="' + (it.include ? '' : 'off') + '"><td><input type="checkbox" data-r="' + it.r + '"' + (it.include ? ' checked' : '') + '></td><td>' + (it.r + 1) + '</td><td>' + esc(it.name) + '</td><td>' + esc(t ? t.code : '') + '</td><td>' + (t ? t.duration : '') + '</td><td>' + esc(preds) + '</td><td class="err">' + esc(it.err) + '</td></tr>');
    });
    pv.push('</table>');
    if (b.errors.length) pv.unshift('<div class="imp-errs">' + b.errors.map(function (e) { return '• ' + esc(e.msg); }).join('<br>') + '</div>');
    $('#i-prev').innerHTML = pv.join('');
    $('#i-stat').textContent = nameCol < 0 ? '— chưa chọn cột "Tên công việc"' : '— ' + used.length + ' dòng sẽ nhập, ' + b.errors.length + ' lỗi/cảnh báo';
  }
  function colName(c) { var s = ''; c++; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }
  function doImport() {
    var b = IMP.built;
    if (!b || !b.tasks.length) { alert('Chưa có dòng nào để nhập (kiểm tra cột "Tên công việc").'); return; }
    var mode = $('input[name=i-mode]:checked').value;
    var ww = +$('#i-ww').value, st = $('#i-start').value;
    $('#dlg-import').close();
    if (mode === 'replace') {
      var p = Model.newProject(S.project.name === 'Dự án mới' ? 'Dự án nhập từ Excel' : S.project.name);
      p.startDate = st || p.startDate; p.workWeek = ww; p.statusDate = S.project.statusDate;
      p.holidays = S.project.holidays.slice();
      p.tasks = b.tasks.map(function (t) { return Model.newTask(t); });
      S.hist.push(S.project);
      setProject(p, 'Trước khi nhập Excel (thay thế)');
    } else {
      mutate(function () { b.tasks.forEach(function (t) { S.project.tasks.push(Model.newTask(t)); }); });
    }
    toast('Đã nhập ' + b.tasks.length + ' dòng' + (S.result.warnings.length ? ' — ' + S.result.warnings.length + ' cảnh báo' : ''), 4000);
  }
  function readImportFile(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true });
        IMP.sheets = wb.SheetNames.map(function (n) { return { name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }; });
        var sel = $('#i-sheet');
        sel.innerHTML = IMP.sheets.map(function (s, k) { return '<option value="' + k + '">' + esc(s.name) + ' (' + s.rows.length + ' dòng)</option>'; }).join('');
        sel.hidden = IMP.sheets.length < 2;
        // Chọn sheet có nhiều dòng nhất có dữ liệu
        var best = 0; IMP.sheets.forEach(function (s, k) { if (s.rows.length > IMP.sheets[best].rows.length) best = k; });
        sel.value = String(best);
        $('#i-paste').value = '';
        loadRows(IMP.sheets[best].rows, true);
      } catch (e) { alert('Không đọc được file: ' + e.message); }
    };
    fr.readAsArrayBuffer(file);
  }

  /* ================= HỘP THOẠI KHÁC ================= */
  function openSettings() {
    var p = S.project;
    $('#s-name').value = p.name; $('#s-start').value = p.startDate; $('#s-ww').value = String(p.workWeek);
    $('#s-deadline').value = p.deadline || '';
    $('#s-hol').value = (p.holidays || []).map(function (h) { return CPM.fmtVN(CPM.parseISO(h)); }).join('\n');
    var d = $('#dlg-settings');
    d.returnValue = '';
    d.showModal();
  }
  function applySettings() {
    var start = $('#s-start').value; if (!CPM.parseISO(start)) { alert('Ngày khởi công không hợp lệ'); return; }
    var hol = $('#s-hol').value.split(/\n+/).map(function (s) { return CPM.parseISO(s.trim()); }).filter(Boolean).map(CPM.toISO);
    mutate(function () {
      var p = S.project;
      p.name = $('#s-name').value.trim() || p.name; p.startDate = start; p.workWeek = +$('#s-ww').value;
      p.deadline = $('#s-deadline').value || null; p.holidays = hol.filter(function (h, k) { return hol.indexOf(h) === k; }).sort();
    });
  }
  var consRow = null;
  function openConstraint(i) {
    consRow = i;
    var t = S.project.tasks[i], c = t.constraint || { type: 'ASAP', date: '' };
    $('#c-type').innerHTML = Object.keys(Model.CONSTRAINTS).map(function (k) { return '<option value="' + k + '"' + (c.type === k ? ' selected' : '') + '>' + k + ' — ' + Model.CONSTRAINTS[k] + '</option>'; }).join('');
    $('#c-date').value = c.date || CPM.toISO(S.result.rows[i].startDate);
    var d = $('#dlg-constraint'); d.returnValue = ''; d.showModal();
  }
  function openBackups() {
    var list = Model.listBackups();
    var h = list.length ? '<table><tr><th>Thời điểm</th><th>Dự án</th><th>Số dòng</th><th>Lý do</th><th></th></tr>' + list.map(function (b, k) {
      var dt = new Date(b.time);
      return '<tr><td>' + dt.toLocaleString('vi-VN') + '</td><td>' + esc(b.name) + '</td><td>' + b.n + '</td><td>' + esc(b.reason) + '</td><td><button type="button" data-bk="' + k + '">Khôi phục</button> <button type="button" data-bkdl="' + k + '">Tải .json</button></td></tr>';
    }).join('') + '</table>' : '<i>Chưa có bản sao lưu.</i>';
    $('#b-list').innerHTML = h;
    $('#dlg-backups').showModal();
  }

  /* ================= SỰ KIỆN ================= */
  function bind() {
    renderHead();
    // Nút hành động
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.dataset.act;
      switch (a) {
        case 'new':
          if (!confirm('Tạo dự án mới? (Dự án hiện tại được tự sao lưu)')) return;
          S.hist.push(S.project); setProject(Model.newProject(), 'Trước khi tạo dự án mới'); break;
        case 'open': $('#f-open').value = ''; $('#f-open').click(); break;
        case 'save': saveJSON(); break;
        case 'import': openImport(''); break;
        case 'export-xlsx': exportXlsx(); break;
        case 'print': $('#dlg-print').showModal(); break;
        case 'backups': openBackups(); break;
        case 'settings': openSettings(); break;
        case 'help': $('#dlg-help').showModal(); break;
        case 'add-task': insertRow('viec'); break;
        case 'add-ms': insertRow('moc'); break;
        case 'add-sum': insertRow('hangmuc'); break;
        case 'del': deleteRows(); break;
        case 'up': moveRows(-1); break;
        case 'down': moveRows(1); break;
        case 'indent': indentRows(1); break;
        case 'outdent': indentRows(-1); break;
        case 'link': linkRows(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'baseline':
          if (S.project.baselineDate && !confirm('Ghi đè baseline ngày ' + CPM.fmtVN(CPM.parseISO(S.project.baselineDate)) + '?')) return;
          mutate(function () { Model.saveBaseline(S.project, S.result); }); toast('Đã lưu baseline'); break;
        case 'clear-baseline':
          if (!S.project.baselineDate || !confirm('Xoá baseline?')) return;
          mutate(function () { Model.clearBaseline(S.project); }); break;
      }
    });
    $('#f-open').addEventListener('change', function () { if (this.files[0]) openJSON(this.files[0]); });
    $('#pj-name').addEventListener('change', function () { var v = this.value.trim(); if (v) mutate(function () { S.project.name = v; }); });
    $('#status-date').addEventListener('change', function () { var v = this.value; mutate(function () { S.project.statusDate = v || null; }); });

    // Lọc / thang
    $('#flt').addEventListener('click', function (e) {
      var b = e.target.closest('[data-flt]'); if (!b) return;
      S.filter = b.dataset.flt; $$('#flt [data-flt]').forEach(function (x) { x.classList.toggle('on', x === b); }); render();
    });
    $('#q').addEventListener('input', function () { S.query = this.value; render(); });
    $('#scl').addEventListener('click', function (e) {
      var b = e.target.closest('[data-scl]'); if (!b) return;
      S.scale = b.dataset.scl; $$('#scl [data-scl]').forEach(function (x) { x.classList.toggle('on', x === b); }); renderGantt(); renderRes();
    });
    ['#o-links', '#o-float'].forEach(function (s) { $(s).addEventListener('change', renderGantt); });
    $('#o-res').addEventListener('change', renderRes);

    // Bảng
    var body = $('#grid-body');
    body.addEventListener('change', function (e) { if (e.target.matches('[data-f]')) commit(e.target); });
    body.addEventListener('click', function (e) {
      var tr = e.target.closest('tr'); if (!tr) return;
      var i = +tr.dataset.i;
      if (e.target.closest('.stt')) {
        if (e.shiftKey && S.anchor !== null) {
          var a = S.visible.indexOf(S.anchor), b2 = S.visible.indexOf(i), lo = Math.min(a, b2), hi = Math.max(a, b2);
          if (!(e.ctrlKey || e.metaKey)) S.selected = {};
          for (var k = lo; k <= hi; k++) S.selected[S.visible[k]] = true;
        } else if (e.ctrlKey || e.metaKey) { if (S.selected[i]) delete S.selected[i]; else S.selected[i] = true; S.anchor = i; }
        else { S.selected = {}; S.selected[i] = true; S.anchor = i; }
        refreshSel(); return;
      }
      if (e.target.dataset.tg) { var id = S.project.tasks[i].id; if (S.collapsed[id]) delete S.collapsed[id]; else S.collapsed[id] = 1; render(); return; }
      if (e.target.closest('[data-cons]')) { openConstraint(i); return; }
    });
    body.addEventListener('keydown', function (e) {
      var el = e.target; if (!el.matches('[data-f]')) return;
      var tr = el.closest('tr'), i = +tr.dataset.i, f = el.dataset.f;
      var dir = 0;
      if (e.key === 'Enter' || (e.key === 'ArrowDown' && el.tagName !== 'SELECT')) dir = 1;
      else if (e.key === 'ArrowUp' && el.tagName !== 'SELECT') dir = -1;
      else if (e.key === 'Escape') { el.blur(); render(); return; }
      if (!dir) return;
      e.preventDefault();
      var ni = nextVisible(i, dir);
      var tid = ni === null ? null : S.project.tasks[ni].id;
      commit(el);
      if (tid) { var k = S.project.tasks.findIndex(function (t) { return t.id === tid; }); if (k >= 0) focusCell(k, f, true); }
      else if (dir === 1 && e.key === 'Enter' && i === S.project.tasks.length - 1) { /* Enter ở dòng cuối: thêm dòng mới */ S.selected = {}; S.selected[i] = true; insertRow('viec'); }
    });
    body.addEventListener('focusin', function (e) { if (e.target.select && e.target.matches('input[data-f]')) setTimeout(function () { try { e.target.select(); } catch (x) {} }, 0); });

    // Gantt: bấm thanh → chọn dòng
    $('#g-body').addEventListener('click', function (e) {
      var g = e.target.closest('.g-bar'); if (!g) return;
      var i = +g.dataset.i; S.selected = {}; S.selected[i] = true; S.anchor = i; refreshSel();
      var tr = $('#grid-body tr[data-i="' + i + '"]'); if (tr) { var pl = $('#pane-left'); var y = tr.offsetTop - S.headH; if (y < pl.scrollTop || y > pl.scrollTop + pl.clientHeight - 60) pl.scrollTop = y - 60; }
    });
    $('#g-body').addEventListener('dblclick', function (e) {
      var g = e.target.closest('.g-bar'); if (!g) return; focusCell(+g.dataset.i, 'duration', true);
    });

    // Đồng bộ cuộn
    var pl = $('#pane-left'), gb = $('#g-body'), gh = $('#g-head'), lock = false;
    pl.addEventListener('scroll', function () { if (lock) return; lock = true; gb.scrollTop = pl.scrollTop; lock = false; });
    gb.addEventListener('scroll', function () {
      gh.scrollLeft = gb.scrollLeft; var rr = $('#res-right'); if (rr) rr.scrollLeft = gb.scrollLeft;
      if (lock) return; lock = true; pl.scrollTop = gb.scrollTop; lock = false;
    });
    // Kéo thanh chia
    var sp = $('#splitter'), drag = null;
    sp.addEventListener('mousedown', function (e) { drag = { x: e.clientX, w: pl.getBoundingClientRect().width }; e.preventDefault(); });
    document.addEventListener('mousemove', function (e) { if (!drag) return; pl.style.width = Math.max(200, drag.w + e.clientX - drag.x) + 'px'; });
    document.addEventListener('mouseup', function () { if (drag) { drag = null; renderRes(); } });

    // Hộp thoại
    $('#dlg-settings').addEventListener('close', function () { if (this.returnValue === 'ok') applySettings(); });
    $('#s-hol-vn').addEventListener('click', function () {
      var y0 = CPM.parseISO(S.project.startDate).getUTCFullYear(), y1 = S.result.projectFinish.getUTCFullYear() + 1;
      var cur = $('#s-hol').value.split(/\n+/).filter(Boolean);
      for (var y = y0; y <= y1; y++) ['01/01/', '30/04/', '01/05/', '02/09/'].forEach(function (d) { if (cur.indexOf(d + y) < 0) cur.push(d + y); });
      $('#s-hol').value = cur.join('\n');
    });
    $('#dlg-constraint').addEventListener('close', function () {
      if (this.returnValue !== 'ok' || consRow === null) return;
      var ty = $('#c-type').value, dt = $('#c-date').value, i = consRow;
      mutate(function () { S.project.tasks[i].constraint = ty === 'ASAP' || !dt ? null : { type: ty, date: dt }; });
    });
    $('#b-list').addEventListener('click', function (e) {
      var b = e.target.closest('[data-bk]'), dl = e.target.closest('[data-bkdl]');
      var list = Model.listBackups();
      if (b) {
        var it = list[+b.dataset.bk]; if (!it) return;
        if (!confirm('Khôi phục bản ' + new Date(it.time).toLocaleString('vi-VN') + '? Dự án hiện tại sẽ được sao lưu.')) return;
        S.hist.push(S.project); setProject(Model.normalize(JSON.parse(it.data)), 'Trước khi khôi phục bản sao lưu');
        $('#dlg-backups').close(); toast('Đã khôi phục');
      } else if (dl) {
        var it2 = list[+dl.dataset.bkdl]; if (!it2) return;
        download(safeName(it2.name) + '_saoluu_' + it2.time.slice(0, 10).replace(/-/g, '') + '.tiendo.json', new Blob([it2.data], { type: 'application/json' }));
      }
    });
    $('#dlg-print').addEventListener('close', function () {
      if (this.returnValue !== 'ok') return;
      var rows = $('#p-rows').value === 'all' ? S.project.tasks.map(function (t, i) { return i; }) : S.visible;
      Inan.print(S.project, S.result, { size: $('#p-size').value, scale: $('#p-scale').value, rows: rows, links: $('#p-links').checked, baseline: $('#p-bl').checked, foot: $('#p-foot').value });
    });
    // Nhập
    $('#i-file').addEventListener('change', function () { if (this.files[0]) readImportFile(this.files[0]); this.value = ''; });
    $('#i-paste').addEventListener('input', function () { var v = this.value; if (v.trim()) loadRows(Nhap.parseTSV(v), true); });
    $('#i-sheet').addEventListener('change', function () { loadRows(IMP.sheets[+this.value].rows, true); });
    $('#i-hrow').addEventListener('change', function () {
      var h = (+this.value || 1) - 1; IMP.roles = Nhap.guessRoles(IMP.rows[h] || [], IMP.rows.slice(h + 1, h + 11)); IMP.include = {}; renderImport(false);
    });
    $('#i-start').addEventListener('change', function () { renderImport(false); });
    $('#i-ww').addEventListener('change', function () { renderImport(false); });
    $('#i-map').addEventListener('change', function (e) { var s = e.target.closest('select[data-c]'); if (!s) return; IMP.roles[+s.dataset.c] = s.value; renderImport(false); });
    $('#i-prev').addEventListener('change', function (e) { var c = e.target.closest('input[data-r]'); if (!c) return; IMP.include[+c.dataset.r] = c.checked; renderImport(false); });
    $('#i-ok').addEventListener('click', doImport);

    // Phím tắt toàn cục
    document.addEventListener('keydown', function (e) {
      var inField = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
      var inDialog = !!document.querySelector('dialog[open]');
      var k = e.key;
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 's') { e.preventDefault(); saveJSON(); return; }
      if (inDialog) return;
      if ((e.ctrlKey || e.metaKey) && !inField && k.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
      if ((e.ctrlKey || e.metaKey) && !inField && k.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (k === 'Insert') { e.preventDefault(); insertRow('viec'); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'Delete') { e.preventDefault(); deleteRows(); return; }
      if (!inField && k === 'Delete' && selList().length) { e.preventDefault(); deleteRows(); return; }
      if (e.altKey && e.shiftKey && k === 'ArrowRight') { e.preventDefault(); indentRows(1); return; }
      if (e.altKey && e.shiftKey && k === 'ArrowLeft') { e.preventDefault(); indentRows(-1); return; }
      if (e.altKey && !e.shiftKey && k === 'ArrowUp') { e.preventDefault(); moveRows(-1); return; }
      if (e.altKey && !e.shiftKey && k === 'ArrowDown') { e.preventDefault(); moveRows(1); return; }
    });
    document.addEventListener('paste', function (e) {
      var inField = /^(INPUT|TEXTAREA)$/.test(document.activeElement && document.activeElement.tagName);
      if (inField || document.querySelector('dialog[open]')) return;
      var txt = (e.clipboardData || window.clipboardData).getData('text');
      if (txt && /\t|\n/.test(txt)) { e.preventDefault(); openImport(txt); }
    });
    window.addEventListener('resize', function () { renderRes(); });
  }

  function refreshSel() {
    $$('#grid-body tr').forEach(function (tr) { tr.classList.toggle('sel', !!S.selected[+tr.dataset.i]); });
    renderGantt();
  }
  function undo() { var p = S.hist.back(S.project); if (!p) { toast('Hết bước hoàn tác'); return; } S.project = Model.normalize(p); recalc(); render(); autosave(); }
  function redo() { var p = S.hist.fwd(S.project); if (!p) return; S.project = Model.normalize(p); recalc(); render(); autosave(); }

  /* ================= KHỞI ĐỘNG ================= */
  function start() {
    bind();
    var p = Model.loadLocal();
    if (!p) { p = Model.newProject(); }
    S.project = p;
    recalc(); render();
    window.APP = S; // để kiểm tra/test trên console
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
