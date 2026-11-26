/*
 * gantt.js — Vẽ biểu đồ Gantt dạng SVG (chuỗi). Không phụ thuộc thư viện.
 * Gantt.render(opts) → { header: svgString, body: svgString, width, pxPerDay, x0 }
 * opts: { project, result, rows:[chỉ số dòng hiển thị], scale:'ngay'|'tuan'|'thang',
 *         rowH, headH, pxPerDay?, fitWidth?, showLinks, showBaseline, selected:{idx:true} }
 */
(function (root) {
  'use strict';
  var CPM = root.CPM;
  var PX = { ngay: 24, tuan: 6, thang: 1.8 };
  var THANG = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
  var THU = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function isoWeek(d) {
    var t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    var day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
    var y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }

  function render(o) {
    var res = o.result, project = o.project, cal = res.cal;
    var rowH = o.rowH || 26, headH = o.headH || 44;
    var rows = o.rows;
    // Khoảng thời gian hiển thị (lịch)
    var dMin = null, dMax = null;
    function upd(d) { if (!d) return; if (!dMin || d < dMin) dMin = d; if (!dMax || d > dMax) dMax = d; }
    res.rows.forEach(function (r) { upd(r.startDate); upd(r.finishDate); });
    project.tasks.forEach(function (t) { if (t.baseline) { upd(CPM.parseISO(t.baseline.start)); upd(CPM.parseISO(t.baseline.finish)); } });
    if (project.statusDate) upd(CPM.parseISO(project.statusDate));
    if (!dMin) { dMin = cal.dateOf(0); dMax = CPM.addDays(dMin, 30); }
    var scale = o.scale || 'tuan';
    var padL = scale === 'ngay' ? 3 : scale === 'tuan' ? 7 : 15;
    var padR = scale === 'ngay' ? 7 : scale === 'tuan' ? 21 : 45;
    var x0 = CPM.addDays(dMin, -padL);
    // Căn đầu tuần (T2) / đầu tháng cho đẹp
    if (scale === 'tuan') x0 = CPM.addDays(x0, -(((x0.getUTCDay() + 6) % 7)));
    if (scale === 'thang') x0 = new Date(Date.UTC(x0.getUTCFullYear(), x0.getUTCMonth(), 1));
    var x1 = CPM.addDays(dMax, padR);
    var nDays = CPM.diffDays(x0, x1) + 1;
    var ppd = o.pxPerDay || PX[scale];
    if (o.fitWidth) ppd = o.fitWidth / nDays;
    var W = Math.ceil(nDays * ppd);
    var H = rows.length * rowH;
    function X(d) { return CPM.diffDays(x0, d) * ppd; }

    /* ---------- Thang thời gian (2 tầng) ---------- */
    var h = [];
    h.push('<svg xmlns="http://www.w3.org/2000/svg" class="g-head" width="' + W + '" height="' + headH + '">');
    h.push('<rect width="' + W + '" height="' + headH + '" class="g-hbg"/>');
    var half = headH / 2;
    var d, x, i;
    // Tầng trên
    if (scale === 'thang') {
      // năm
      for (d = x0; d <= x1;) {
        var yEnd = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
        x = X(d); var w = X(yEnd < x1 ? yEnd : CPM.addDays(x1, 1)) - x;
        h.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + half + '" class="g-hl"/>');
        if (w > 24) h.push('<text x="' + (x + 4) + '" y="' + (half - 4) + '" class="g-ht">' + d.getUTCFullYear() + '</text>');
        d = yEnd;
      }
    } else {
      for (d = x0; d <= x1;) {
        var mEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        x = X(d); var w2 = X(mEnd < x1 ? mEnd : CPM.addDays(x1, 1)) - x;
        h.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + half + '" class="g-hl"/>');
        if (w2 > 40) h.push('<text x="' + (x + 4) + '" y="' + (half - 4) + '" class="g-ht">' + THANG[d.getUTCMonth()] + '/' + d.getUTCFullYear() + '</text>');
        d = mEnd;
      }
    }
    h.push('<line x1="0" y1="' + half + '" x2="' + W + '" y2="' + half + '" class="g-hl"/>');
    // Tầng dưới
    if (scale === 'ngay') {
      for (i = 0; i < nDays; i++) {
        d = CPM.addDays(x0, i); x = i * ppd;
        var off = !cal.isWork(d);
        if (off) h.push('<rect x="' + x + '" y="' + half + '" width="' + ppd + '" height="' + half + '" class="g-off"/>');
        h.push('<line x1="' + x + '" y1="' + half + '" x2="' + x + '" y2="' + headH + '" class="g-hl"/>');
        h.push('<text x="' + (x + ppd / 2) + '" y="' + (half + 12) + '" class="g-hs" text-anchor="middle">' + d.getUTCDate() + '</text>');
        h.push('<text x="' + (x + ppd / 2) + '" y="' + (headH - 2) + '" class="g-hxs" text-anchor="middle">' + THU[d.getUTCDay()] + '</text>');
      }
    } else if (scale === 'tuan') {
      for (d = x0; d <= x1; d = CPM.addDays(d, 7)) {
        x = X(d);
        h.push('<line x1="' + x + '" y1="' + half + '" x2="' + x + '" y2="' + headH + '" class="g-hl"/>');
        if (7 * ppd >= 30) h.push('<text x="' + (x + 3) + '" y="' + (headH - 5) + '" class="g-hs">' + d.getUTCDate() + '/' + (d.getUTCMonth() + 1) + '</text>');
        else if (7 * ppd >= 16) h.push('<text x="' + (x + 2) + '" y="' + (headH - 6) + '" class="g-hxs">' + d.getUTCDate() + '</text>');
      }
    } else {
      for (d = x0; d <= x1;) {
        var m2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
        x = X(d); var w3 = X(m2) - x;
        h.push('<line x1="' + x + '" y1="' + half + '" x2="' + x + '" y2="' + headH + '" class="g-hl"/>');
        if (w3 >= 22) h.push('<text x="' + (x + w3 / 2) + '" y="' + (headH - 6) + '" class="g-hs" text-anchor="middle">' + THANG[d.getUTCMonth()] + '</text>');
        d = m2;
      }
    }
    h.push('</svg>');

    /* ---------- Thân ---------- */
    var b = [];
    b.push('<svg xmlns="http://www.w3.org/2000/svg" class="g-body" width="' + W + '" height="' + H + '">');
    b.push('<defs><marker id="g-arr" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L6,3L0,6z" class="g-arrh"/></marker>' +
      '<marker id="g-arr-c" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L6,3L0,6z" class="g-arrh-c"/></marker></defs>');
    // Nền: ngày nghỉ (chế độ ngày/tuần), sọc dòng
    rows.forEach(function (ri, k) {
      if (o.selected && o.selected[ri]) b.push('<rect x="0" y="' + (k * rowH) + '" width="' + W + '" height="' + rowH + '" class="g-sel"/>');
      else if (k % 2) b.push('<rect x="0" y="' + (k * rowH) + '" width="' + W + '" height="' + rowH + '" class="g-alt"/>');
    });
    if (scale !== 'thang' && H > 0) {
      for (i = 0; i < nDays; i++) {
        d = CPM.addDays(x0, i);
        if (!cal.isWork(d)) b.push('<rect x="' + (i * ppd) + '" y="0" width="' + ppd + '" height="' + H + '" class="g-off"/>');
      }
    }
    // Lưới dọc
    if (scale === 'ngay') { for (i = 0; i <= nDays; i++) b.push('<line x1="' + (i * ppd) + '" y1="0" x2="' + (i * ppd) + '" y2="' + H + '" class="g-grid"/>'); }
    else if (scale === 'tuan') { for (d = x0; d <= x1; d = CPM.addDays(d, 7)) { x = X(d); b.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" class="g-grid"/>'); } }
    else { for (d = x0; d <= x1;) { x = X(d); b.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" class="g-grid"/>'); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } }

    // Vị trí thanh cho từng dòng hiển thị
    var pos = {}; // idx -> {y, xs, xe, mid}
    var barH = Math.max(8, Math.round(rowH * 0.5));
    rows.forEach(function (ri, k) {
      var r = res.rows[ri];
      var xs = X(r.startDate), xe = X(r.finishDate) + ppd;
      if (r.isMilestone) { xs = xe; }
      pos[ri] = { y: k * rowH, xs: xs, xe: xe, mid: k * rowH + rowH / 2 };
    });

    // Liên kết
    if (o.showLinks !== false) {
      var lk = [];
      rows.forEach(function (ri) {
        var r = res.rows[ri];
        (r.preds || []).forEach(function (e) {
          var a = pos[e.from], c = pos[ri];
          if (!a || !c) return;
          var fromEnd = e.type === 'FS' || e.type === 'FF';
          var toEnd = e.type === 'FF' || e.type === 'SF';
          var xa = fromEnd ? a.xe : a.xs, xt = toEnd ? c.xe : c.xs;
          var ya = a.mid, yt = c.mid;
          var crit = res.rows[e.from].critical && r.critical;
          var dpath;
          var dir = toEnd ? -1 : 1; // đi vào từ trái (đầu) hay phải (cuối)
          if (dir === 1 && xt - xa >= 10) {
            dpath = 'M' + xa + ',' + ya + 'H' + Math.max(xa + 4, xt - 8) + 'V' + yt + 'H' + xt;
          } else if (dir === -1 && xa - xt >= 10 && fromEnd === false) {
            dpath = 'M' + xa + ',' + ya + 'H' + (xt + 8) + 'V' + yt + 'H' + xt;
          } else {
            var out = fromEnd ? xa + 6 : xa - 6;
            var inn = dir === 1 ? xt - 8 : xt + 8;
            var ymid = yt > ya ? c.y : c.y + rowH;
            dpath = 'M' + xa + ',' + ya + 'H' + out + 'V' + ymid + 'H' + inn + 'V' + yt + 'H' + xt;
          }
          lk.push('<path d="' + dpath + '" class="g-link' + (crit ? ' c' : '') + '" marker-end="url(#g-arr' + (crit ? '-c' : '') + ')"/>');
        });
      });
      b.push(lk.join(''));
    }

    // Thanh
    rows.forEach(function (ri) {
      var r = res.rows[ri], t = project.tasks[ri], p = pos[ri];
      var y = p.y + (rowH - barH) / 2;
      var tip = esc((r.wbs + ' ' + (t.name || '')) + '\n' + CPM.fmtVN(r.startDate) + ' → ' + CPM.fmtVN(r.finishDate) +
        ' (' + r.duration + ' ngày)' + (r.float !== null ? '\nDự trữ: ' + r.float : '') + '\nHoàn thành: ' + r.progress + '%');
      var s = '<g class="g-bar" data-i="' + ri + '"><title>' + tip + '</title>';
      // Baseline (bóng mờ)
      if (o.showBaseline !== false && t.baseline && t.baseline.start) {
        var bs = X(CPM.parseISO(t.baseline.start)), be = X(CPM.parseISO(t.baseline.finish)) + ppd;
        var by = p.y + rowH - 6;
        if (r.isMilestone || !t.baseline.duration) s += '<path d="M' + be + ',' + (by - 1) + 'l3,3l-3,3l-3,-3z" class="g-base"/>';
        else s += '<rect x="' + bs + '" y="' + by + '" width="' + Math.max(2, be - bs) + '" height="4" class="g-base"/>';
      }
      if (r.isSummary) {
        var sy = p.y + rowH / 2 - 4;
        s += '<path d="M' + p.xs + ',' + sy + 'H' + p.xe + 'v9l-5,-4H' + (p.xs + 5) + 'l-5,4z" class="g-sum' + (r.critical ? ' c' : '') + '"/>';
        if (r.progress > 0) s += '<rect x="' + p.xs + '" y="' + sy + '" width="' + ((p.xe - p.xs) * r.progress / 100) + '" height="4" class="g-sump"/>';
      } else if (r.isMilestone) {
        var m = barH / 2 + 2;
        s += '<path d="M' + p.xs + ',' + (p.mid - m) + 'l' + m + ',' + m + 'l-' + m + ',' + m + 'l-' + m + ',-' + m + 'z" class="g-ms' + (r.critical ? ' c' : '') + (r.progress >= 100 ? ' done' : '') + '"/>';
      } else {
        var w = Math.max(2, p.xe - p.xs);
        s += '<rect x="' + p.xs + '" y="' + y + '" width="' + w + '" height="' + barH + '" rx="2" class="g-task' + (r.critical ? ' c' : '') + '"/>';
        if (r.progress > 0) s += '<rect x="' + p.xs + '" y="' + (y + barH / 2 - 2) + '" width="' + (w * r.progress / 100) + '" height="4" class="g-prog"/>';
        // Dự trữ (đuôi mảnh tới LF)
        if (o.showFloat && r.float > 0 && r.lateFinishDate) {
          var xf = X(r.lateFinishDate) + ppd;
          s += '<line x1="' + p.xe + '" y1="' + p.mid + '" x2="' + xf + '" y2="' + p.mid + '" class="g-float"/>';
        }
      }
      // Nhãn bên phải
      if (o.labels !== false) {
        var lab = r.isMilestone ? CPM.fmtVN(r.finishDate) : (r.progress > 0 ? r.progress + '%' : '');
        if (o.labelName) lab = (t.name || '') + (lab ? ' · ' + lab : '');
        if (lab) s += '<text x="' + (p.xe + (r.isMilestone ? 9 : 4)) + '" y="' + (p.mid + 4) + '" class="g-lab">' + esc(lab) + '</text>';
      }
      s += '</g>';
      b.push(s);
    });

    // Đường ngày báo cáo + hôm nay
    if (project.statusDate) {
      var sd = CPM.parseISO(project.statusDate);
      if (sd) { x = X(sd) + ppd; b.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" class="g-status"><title>Ngày báo cáo ' + CPM.fmtVN(sd) + '</title></line>'); }
    }
    if (o.today) {
      var td = CPM.parseISO(o.today);
      x = X(td) + ppd / 2; b.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + H + '" class="g-today"><title>Hôm nay</title></line>');
    }
    b.push('</svg>');
    return { header: h.join(''), body: b.join(''), width: W, pxPerDay: ppd, x0: x0, nDays: nDays };
  }

  root.Gantt = { render: render, PX: PX, isoWeek: isoWeek };
})(typeof self !== 'undefined' ? self : this);
