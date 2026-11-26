/*
 * inan.js — In / xuất PDF: dựng các trang A3/A4 ngang gồm bảng việc gọn + Gantt
 * vừa khổ giấy, rồi gọi window.print(). Trình duyệt lo phần "Lưu PDF".
 */
(function (root) {
  'use strict';
  var CPM = root.CPM, Gantt = root.Gantt;
  var MM = 96 / 25.4;
  var PAGE = { A3: [420, 297], A4: [297, 210] };

  function esc(s) { return String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /**
   * opt: { size:'A3'|'A4', scale:'auto'|'tuan'|'thang', rows:[idx], links, baseline, foot }
   */
  function print(project, result, opt) {
    var size = PAGE[opt.size] ? opt.size : 'A3';
    var margin = 7;
    var Wmm = PAGE[size][0] - 2 * margin, Hmm = PAGE[size][1] - 2 * margin;
    var Wpx = Math.floor(Wmm * MM), Hpx = Math.floor(Hmm * MM);
    var rowH = 16, headH = 30, titleH = 38, footH = 22;
    var nameW = size === 'A3' ? 270 : 170;
    var cols = [
      { t: 'STT', w: 26, f: function (r, t, i) { return i + 1; }, c: 'ctr' },
      { t: 'WBS', w: 38, f: function (r) { return r.wbs; } },
      { t: 'Tên công việc', w: nameW, f: function (r, t) { return t.name; }, name: true },
      { t: 'TL', w: 30, f: function (r) { return r.duration; }, c: 'num' },
      { t: 'Bắt đầu', w: 62, f: function (r) { return CPM.fmtVN(r.startDate); }, c: 'ctr' },
      { t: 'Kết thúc', w: 62, f: function (r) { return CPM.fmtVN(r.finishDate); }, c: 'ctr' },
      { t: 'DT', w: 30, f: function (r) { return r.float === null ? '' : r.float; }, c: 'num' },
      { t: '%HT', w: 32, f: function (r) { return r.progress ? r.progress : ''; }, c: 'num' }
    ];
    var tblW = cols.reduce(function (s, c) { return s + c.w; }, 0);
    var gW = Wpx - tblW - 2;
    var perPage = Math.max(5, Math.floor((Hpx - titleH - headH - footH) / rowH));
    var rows = opt.rows;
    var pages = [];
    for (var k = 0; k < rows.length; k += perPage) pages.push(rows.slice(k, k + perPage));
    if (!pages.length) pages.push([]);

    // Thang: tự chọn theo độ rộng
    var scale = opt.scale;
    var probe = Gantt.render({ project: project, result: result, rows: [], scale: 'tuan', fitWidth: gW, rowH: rowH, headH: headH });
    if (scale === 'auto') scale = probe.pxPerDay * 7 >= 22 ? 'tuan' : 'thang';

    var html = [];
    var now = new Date();
    var sub = 'Khởi công ' + CPM.fmtVN(result.projectStart) + ' · Hoàn thành ' + CPM.fmtVN(result.projectFinish) +
      ' · ' + result.totalDays + ' ngày làm việc (' + (CPM.diffDays(result.projectStart, result.projectFinish) + 1) + ' ngày lịch) · Tuần LV ' + project.workWeek + ' ngày · Việc găng: ' + result.criticalCount +
      (project.statusDate ? ' · Ngày báo cáo ' + CPM.fmtVN(CPM.parseISO(project.statusDate)) : '');
    pages.forEach(function (pg, pi) {
      var g = Gantt.render({ project: project, result: result, rows: pg, scale: scale, fitWidth: gW, rowH: rowH, headH: headH,
        showLinks: opt.links, showBaseline: opt.baseline, labels: false });
      var t = ['<table class="p-tbl" style="width:' + tblW + 'px"><thead><tr style="height:' + headH + 'px">'];
      cols.forEach(function (c) { t.push('<th style="width:' + c.w + 'px">' + c.t + '</th>'); });
      t.push('</tr></thead><tbody>');
      pg.forEach(function (ri) {
        var r = result.rows[ri], tk = project.tasks[ri];
        t.push('<tr class="' + (r.isSummary ? 'sum ' : '') + (r.critical && !r.isSummary ? 'crit' : '') + '" style="height:' + rowH + 'px">');
        cols.forEach(function (c) {
          var v = c.f(r, tk, ri);
          var st = c.name ? ' style="padding-left:' + (3 + r.level * 10) + 'px"' : '';
          t.push('<td class="' + (c.c || '') + '"' + st + '>' + esc(v) + '</td>');
        });
        t.push('</tr>');
      });
      t.push('</tbody></table>');
      html.push('<div class="p-page" style="width:' + Wmm + 'mm;height:' + Hmm + 'mm">' +
        '<div class="p-title" style="height:' + titleH + 'px"><div><b>TIẾN ĐỘ THI CÔNG — ' + esc(project.name) + '</b><br><span>' + esc(sub) + '</span></div>' +
        '<div class="p-pg">Trang ' + (pi + 1) + '/' + pages.length + '<br>In ' + CPM.fmtVN(CPM.parseISO(now)) + '</div></div>' +
        '<div class="p-body">' + t.join('') +
        '<div class="p-gantt" style="width:' + gW + 'px">' + g.header + g.body + '</div></div>' +
        '<div class="p-foot" style="height:' + footH + 'px"><span class="lg"><i class="lg-t"></i>Việc thường <i class="lg-c"></i>Việc găng <i class="lg-s"></i>Hạng mục <i class="lg-m"></i>Mốc' +
        (opt.baseline ? ' <i class="lg-b"></i>Baseline' : '') + ' <i class="lg-st"></i>Ngày báo cáo</span><span>' + esc(opt.foot || '') + '</span></div>' +
        '</div>');
    });

    var pr = document.getElementById('print-root');
    pr.innerHTML = html.join('');
    var st = document.getElementById('page-style');
    if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); }
    st.textContent = '@page { size: ' + size + ' landscape; margin: ' + margin + 'mm; }';
    setTimeout(function () { window.print(); }, 50);
  }

  root.Inan = { print: print };
})(typeof self !== 'undefined' ? self : this);
