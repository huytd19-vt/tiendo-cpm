/*
 * model.js — Dữ liệu dự án: tạo mới, chuẩn hoá, liên kết STT <-> id,
 * lưu/mở JSON, sao lưu localStorage, hoàn tác, baseline, nguồn lực.
 * Phụ thuộc: CPM (cpm.js).
 */
(function (root) {
  'use strict';
  var CPM = root.CPM;
  var SCHEMA = 'tiendo-cpm';
  var VERSION = 1;
  var KEY_CUR = 'tiendo_cpm_hientai';
  var KEY_BAK = 'tiendo_cpm_saoluu';
  var MAX_BAK = 20;

  var seq = Date.now() % 100000;
  function newId() { seq++; return 't' + seq.toString(36) + Math.random().toString(36).slice(2, 6); }

  function todayISO() { return CPM.toISO(CPM.parseISO(new Date())); }

  function newTask(o) {
    o = o || {};
    return {
      id: o.id || newId(),
      code: o.code || '',
      name: o.name || '',
      type: o.type || 'viec',           // 'viec' | 'moc' | 'hangmuc'
      level: o.level || 0,
      duration: o.duration === undefined ? (o.type === 'moc' ? 0 : 1) : o.duration,
      start: o.start || null,          // chỉ dùng khi không có tiền nhiệm
      preds: o.preds || [],            // [{id, type:'FS'|'SS'|'FF'|'SF', lag}]
      constraint: o.constraint || null,// {type:'SNET'|'FNET'|'MSO'|'MFO'|'SNLT'|'FNLT', date}
      resources: o.resources || '',    // "NC:10; MAY:2"
      progress: o.progress || 0,       // 0..100
      progressLog: o.progressLog || [],// [{date, pct}]
      note: o.note || '',
      baseline: o.baseline || null     // {start, finish, duration}
    };
  }

  function newProject(name) {
    return {
      schema: SCHEMA, version: VERSION,
      name: name || 'Dự án mới',
      startDate: todayISO(),
      workWeek: 6,
      holidays: [],
      deadline: null,
      statusDate: todayISO(),
      baselineDate: null,
      resourceLimits: {},
      tasks: [newTask({ name: 'Công việc 1', duration: 5 })]
    };
  }

  /** Chuẩn hoá dữ liệu đọc từ file (thiếu trường → mặc định, bỏ rác). */
  function normalize(p) {
    if (!p || typeof p !== 'object') throw new Error('File không phải dự án hợp lệ');
    if (p.schema && p.schema !== SCHEMA) throw new Error('Sai định dạng (schema = ' + p.schema + ')');
    if (!Array.isArray(p.tasks)) throw new Error('Thiếu danh sách công việc (tasks)');
    var out = newProject(p.name);
    out.startDate = CPM.toISO(CPM.parseISO(p.startDate || '')) || out.startDate;
    out.workWeek = [5, 6, 7].indexOf(+p.workWeek) >= 0 ? +p.workWeek : 6;
    out.holidays = Array.isArray(p.holidays) ? p.holidays.filter(function (h) { return CPM.parseISO(h); }) : [];
    out.deadline = p.deadline || null;
    out.statusDate = p.statusDate || out.statusDate;
    out.baselineDate = p.baselineDate || null;
    out.resourceLimits = p.resourceLimits && typeof p.resourceLimits === 'object' ? p.resourceLimits : {};
    var ids = {};
    out.tasks = p.tasks.map(function (t) {
      var nt = newTask(t);
      if (!nt.id || ids[nt.id]) nt.id = newId();
      ids[nt.id] = 1;
      nt.duration = Math.max(0, Math.round(+nt.duration || 0));
      nt.progress = Math.max(0, Math.min(100, +nt.progress || 0));
      nt.level = Math.max(0, Math.round(+nt.level || 0));
      if (['viec', 'moc', 'hangmuc'].indexOf(nt.type) < 0) nt.type = 'viec';
      nt.preds = (Array.isArray(nt.preds) ? nt.preds : []).filter(function (x) { return x && x.id; })
        .map(function (x) { return { id: String(x.id), type: (x.type || 'FS').toUpperCase(), lag: Math.round(+x.lag || 0) }; });
      return nt;
    });
    // Bỏ liên kết trỏ tới id không còn
    out.tasks.forEach(function (t) { t.preds = t.preds.filter(function (x) { return ids[x.id]; }); });
    return out;
  }

  /* ---------------- Liên kết dạng chữ <-> id ---------------- */
  function linksText(project, task) {
    var pos = {};
    project.tasks.forEach(function (t, i) { pos[t.id] = i + 1; });
    return (task.preds || []).filter(function (p) { return pos[p.id]; })
      .map(function (p) { return CPM.formatLink(pos[p.id], p.type, p.lag); }).join('; ');
  }
  /** Gán liên kết từ chữ "4FS+3; 6". Trả về mảng lỗi (rỗng nếu ổn). */
  function setLinksText(project, rowIdx, txt) {
    var res = CPM.parseLinks(txt, project.workWeek);
    var errs = res.errors.slice();
    var task = project.tasks[rowIdx];
    var preds = [];
    res.links.forEach(function (l) {
      var t = project.tasks[l.stt - 1];
      if (!t) { errs.push('Không có dòng ' + l.stt); return; }
      if (l.stt - 1 === rowIdx) { errs.push('Không tự liên kết dòng ' + l.stt); return; }
      if (preds.some(function (p) { return p.id === t.id; })) return;
      preds.push({ id: t.id, type: l.type, lag: l.lag });
    });
    task.preds = preds;
    return errs;
  }

  /* ---------------- Nguồn lực "NC:10; MAY:2" ---------------- */
  function parseResources(s) {
    var out = {};
    String(s || '').split(/[;,]+/).forEach(function (p) {
      var m = /^\s*([^:=\s][^:=]*?)\s*[:=]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(p);
      if (m) { var k = m[1].trim().toUpperCase(); out[k] = (out[k] || 0) + parseFloat(m[2].replace(',', '.')); }
    });
    return out;
  }

  /* ---------------- Ràng buộc ---------------- */
  var CONSTRAINTS = {
    ASAP: 'Càng sớm càng tốt',
    SNET: 'Bắt đầu không sớm hơn',
    SNLT: 'Bắt đầu không muộn hơn',
    FNET: 'Kết thúc không sớm hơn',
    FNLT: 'Kết thúc không muộn hơn',
    MSO: 'Phải bắt đầu vào',
    MFO: 'Phải kết thúc vào'
  };
  function constraintText(c) {
    if (!c || !c.type || c.type === 'ASAP' || !c.date) return '';
    return c.type + ' ' + CPM.fmtVN(CPM.parseISO(c.date));
  }

  /* ---------------- Baseline ---------------- */
  function saveBaseline(project, result) {
    project.tasks.forEach(function (t, i) {
      var r = result.rows[i];
      t.baseline = { start: CPM.toISO(r.startDate), finish: CPM.toISO(r.finishDate), duration: r.duration };
    });
    project.baselineDate = todayISO();
  }
  function clearBaseline(project) {
    project.tasks.forEach(function (t) { t.baseline = null; });
    project.baselineDate = null;
  }

  /* ---------------- % hoàn thành theo ngày báo cáo ---------------- */
  function setProgress(project, task, pct) {
    pct = Math.max(0, Math.min(100, Math.round(+pct || 0)));
    task.progress = pct;
    var d = project.statusDate || todayISO();
    task.progressLog = (task.progressLog || []).filter(function (e) { return e.date !== d; });
    task.progressLog.push({ date: d, pct: pct });
    task.progressLog.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /* ---------------- Lưu / sao lưu ---------------- */
  function toJSON(project) {
    var p = JSON.parse(JSON.stringify(project));
    p.schema = SCHEMA; p.version = VERSION; p.savedAt = new Date().toISOString();
    return JSON.stringify(p, null, 1);
  }
  function saveLocal(project) {
    try { localStorage.setItem(KEY_CUR, JSON.stringify(project)); return true; } catch (e) { return false; }
  }
  function loadLocal() {
    try { var s = localStorage.getItem(KEY_CUR); return s ? normalize(JSON.parse(s)) : null; } catch (e) { return null; }
  }
  function listBackups() {
    try { return JSON.parse(localStorage.getItem(KEY_BAK) || '[]'); } catch (e) { return []; }
  }
  /** Sao lưu dự án hiện tại trước khi thay thế (lý do ghi kèm). */
  function backup(project, reason) {
    if (!project || !project.tasks || !project.tasks.length) return;
    var list = listBackups();
    var data = JSON.stringify(project);
    if (list.length && list[0].data === data) return; // trùng bản gần nhất
    list.unshift({ time: new Date().toISOString(), reason: reason || '', name: project.name, n: project.tasks.length, data: data });
    while (list.length > MAX_BAK) list.pop();
    // Nếu đầy bộ nhớ: bỏ dần bản cũ
    while (list.length) {
      try { localStorage.setItem(KEY_BAK, JSON.stringify(list)); break; } catch (e) { list.pop(); }
    }
  }

  /* ---------------- Hoàn tác ---------------- */
  function History(limit) { this.undo = []; this.redo = []; this.limit = limit || 60; }
  History.prototype.push = function (project) {
    this.undo.push(JSON.stringify(project));
    if (this.undo.length > this.limit) this.undo.shift();
    this.redo = [];
  };
  History.prototype.back = function (project) {
    if (!this.undo.length) return null;
    this.redo.push(JSON.stringify(project));
    return JSON.parse(this.undo.pop());
  };
  History.prototype.fwd = function (project) {
    if (!this.redo.length) return null;
    this.undo.push(JSON.stringify(project));
    return JSON.parse(this.redo.pop());
  };

  root.Model = {
    SCHEMA: SCHEMA, VERSION: VERSION, CONSTRAINTS: CONSTRAINTS,
    newId: newId, newTask: newTask, newProject: newProject, normalize: normalize, todayISO: todayISO,
    linksText: linksText, setLinksText: setLinksText, parseResources: parseResources,
    constraintText: constraintText, saveBaseline: saveBaseline, clearBaseline: clearBaseline,
    setProgress: setProgress, toJSON: toJSON, saveLocal: saveLocal, loadLocal: loadLocal,
    listBackups: listBackups, backup: backup, History: History
  };
})(typeof self !== 'undefined' ? self : this);
