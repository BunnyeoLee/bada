/* 교사 화면: 학습 모니터링 대시보드, 학생 상세, 보고서 평가(AI 평가) */
"use strict";
const LOGOUT_LABEL = { manual: "직접 로그아웃", auto: "자동(활동 없음)", relogin: "다시 로그인함" };
const heatColor = (v) => v == null ? "#eef1f3;color:#9aa5ad" : v >= 80 ? "#d6f0e1;color:#1f7a4b" : v >= 60 ? "#fdf0dc;color:#9a5b00" : "#fde5e3;color:#b23a31";
const charts = [];
function mkChart(el, cfg) { if (!window.Chart || !el) return; const c = new Chart(el, cfg); charts.push(c); return c; }
function clearCharts() { while (charts.length) charts.pop().destroy(); }
function lastDays(n) { const out = []; for (let i = n - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5 + 9 * 3600e3); out.push(d.toISOString().slice(0, 10)); } return out; }
if (window.Chart) Chart.defaults.font.family = '"Noto Sans KR", system-ui, sans-serif';

const Teacher = {
  routes: {
    "t-dash": () => Teacher.dash(), "t-student": (p) => Teacher.student(p[1]), "t-reports": () => Teacher.reports(), "t-report": (p) => Teacher.report(p[1]),
    "t-guide": (p) => Book.renderGuide(p[1]),
  },
  sort: { k: "name", dir: 1 }, filter: "", refresh: null,
  async dash() {
    clearCharts(); clearInterval(Teacher.refresh);
    const main = App.shell("t-dash", `<div class="empty"><span class="spin"></span> 학습 기록을 불러오는 중…</div>`, { wide: true });
    let d; try { d = await API.get("/api/teacher/overview"); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!main.isConnected) return;
    const S = d.students, order = App.order(), P = App.content.labs.projects;
    const online = S.filter((s) => s.online).length, totalMs = S.reduce((a, s) => a + s.totalMs, 0);
    const scores = S.flatMap((s) => Object.values(s.quiz).map((q) => q.best)), avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const reps = S.reduce((a, s) => a + Object.keys(s.reports).length, 0), evald = S.reduce((a, s) => a + Object.values(s.reports).filter((r) => r.evaluated).length, 0);
    main.innerHTML = `
      <div class="row" style="margin-bottom:6px"><h1 class="title" style="margin:0">학습 모니터링 대시보드</h1><span class="spacer"></span>
        <button class="btn sm" data-x="sessions">⬇ 접속 기록 CSV</button><button class="btn sm" data-x="scores">⬇ 형성평가 점수 CSV</button><button class="btn sm" data-x="seteuk">⬇ 보고서 평가 CSV</button></div>
      <p class="sub">로그인·로그아웃 시각으로 학습 시간을 계산합니다. ${d.idleMinutes}분 동안 활동이 없으면 마지막 활동 시각에 자동 로그아웃으로 기록합니다. (1분마다 새로 고침)</p>
      <div class="grid g4">
        <div class="card stat"><div class="k">가입 학생</div><div class="v">${S.length}<small>명</small></div></div>
        <div class="card stat"><div class="k">지금 접속 중</div><div class="v">${online}<small>명</small></div></div>
        <div class="card stat"><div class="k">1인당 평균 학습 시간</div><div class="v" style="font-size:24px">${S.length ? fmtDur(totalMs / S.length) : "–"}</div></div>
        <div class="card stat"><div class="k">형성평가 평균(최고 점수)</div><div class="v">${avg ?? "–"}<small>${avg !== null ? "점" : ""}</small></div></div>
        <div class="card stat"><div class="k">보고서 제출 / 평가 완료</div><div class="v">${reps}<small>건 / ${evald}건</small></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>프로젝트별 형성평가 평균과 응시 인원</h3><div class="chartbox"><canvas id="c1"></canvas></div></div>
        <div class="card"><h3>최근 14일 전체 학습 시간(분)</h3><div class="chartbox"><canvas id="c2"></canvas></div></div>
      </div>
      <div class="card" style="margin-top:16px;padding:16px">
        <div class="row" style="margin-bottom:10px"><h3 style="margin:0">학생별 학습 현황</h3><span class="spacer"></span><input id="flt" placeholder="이름·메일 검색" style="max-width:240px" value="${esc(Teacher.filter)}"></div>
        <div class="twrap" id="tw"></div>
        <p class="small muted" style="margin:10px 0 0">칸의 숫자는 프로젝트별 형성평가 최고 점수입니다. 행을 누르면 학생 상세(접속 기록, 응시 기록, 보고서, 계획서)를 봅니다.</p>
      </div>`;
    $$("[data-x]", main).forEach((b) => (b.onclick = () => Teacher.exportCsv(b.dataset.x)));
    const qAvg = order.map((k) => { const v = S.map((s) => s.quiz[k]?.best).filter((x) => x != null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0; });
    const qN = order.map((k) => S.filter((s) => s.quiz[k]).length);
    mkChart($("#c1"), { type: "bar", data: { labels: order.map((k) => P[k].name.replace(/ 예측| 판별| 탐지| 군집/, "")), datasets: [
      { label: "평균 점수", data: qAvg, backgroundColor: "#087e8b", borderRadius: 4, yAxisID: "y" },
      { label: "응시 인원", data: qN, type: "line", borderColor: "#f2a541", backgroundColor: "#f2a541", yAxisID: "y1", tension: .3 }] },
      options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100, title: { display: true, text: "점" } }, y1: { position: "right", min: 0, suggestedMax: Math.max(5, S.length), grid: { display: false }, ticks: { precision: 0 }, title: { display: true, text: "명" } }, x: { ticks: { font: { size: 11 } } } } } });
    const days = lastDays(14);
    mkChart($("#c2"), { type: "line", data: { labels: days.map((x) => x.slice(5).replace("-", ".")), datasets: [{ label: "학습 시간(분)", data: days.map((x) => Math.round(d.daily[x] || 0)), borderColor: "#0b3954", backgroundColor: "rgba(15,163,177,.15)", fill: true, tension: .3 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
    const draw = () => {
      const f = Teacher.filter.trim().toLowerCase(), { k, dir } = Teacher.sort;
      const val = (s) => k === "name" ? s.name : k.startsWith("q:") ? (s.quiz[k.slice(2)]?.best ?? -1) : k === "reports" ? Object.keys(s.reports).length : s[k] ?? 0;
      const rows = S.filter((s) => !f || s.name.toLowerCase().includes(f) || s.email.includes(f)).sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
      const th = (key, label) => `<th class="sort" data-k="${key}">${label}${k === key ? (dir > 0 ? " ▲" : " ▼") : ""}</th>`;
      $("#tw").innerHTML = rows.length ? `<table class="t"><tr>${th("name", "이름")}<th>메일 · 연락처</th>${th("sessions", "접속")}${th("totalMs", "누적 학습")}${th("lastSeen", "마지막 활동")}
        ${order.map((x) => th("q:" + x, `<span title="${esc(P[x].name)}">${P[x].unitNo}${P[x].sec}</span>`)).join("")}${th("reports", "보고서")}${th("labRuns", "실습")}</tr>
        ${rows.map((s) => `<tr class="click" data-id="${s.id}"><td><span class="dot ${s.online ? "on" : ""}"></span><b>${esc(s.name)}</b></td>
          <td class="small">${esc(s.email)}<div class="muted">${esc(s.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3"))}</div></td>
          <td>${s.sessions}회</td><td>${fmtDur(s.totalMs)}</td><td class="small">${s.lastSeen ? fmtDT(s.lastSeen) : "-"}</td>
          ${order.map((x) => { const q = s.quiz[x]; return `<td style="padding:4px 3px"><span class="heat" style="background:${heatColor(q?.best)}" title="${q ? `최고 ${q.best} · 첫 응시 ${q.first} · ${q.attempts}회` : "미응시"}">${q ? q.best : "·"}</span></td>`; }).join("")}
          <td>${Object.keys(s.reports).length}<span class="small muted">/${Object.values(s.reports).filter((r) => r.evaluated).length}평가</span></td><td>${s.labRuns}회</td></tr>`).join("")}</table>`
        : `<div class="empty">${S.length ? "검색 결과가 없습니다." : "아직 가입한 학생이 없습니다. 학생들에게 웹앱 주소를 알려 주고 회원가입하게 하세요."}</div>`;
      $$("#tw th.sort").forEach((h) => (h.onclick = () => { Teacher.sort = { k: h.dataset.k, dir: Teacher.sort.k === h.dataset.k ? -Teacher.sort.dir : 1 }; draw(); }));
      $$("#tw tr.click").forEach((r) => (r.onclick = () => App.go("t-student/" + r.dataset.id)));
    };
    draw();
    $("#flt").oninput = (e) => { Teacher.filter = e.target.value; draw(); };
    Teacher.refresh = setInterval(() => {
      if (!location.hash.startsWith("#t-dash") || !App.user) return clearInterval(Teacher.refresh);
      if ($("#modal").hidden && document.activeElement?.id !== "flt") Teacher.dash();
    }, 60000);
  },
  async exportCsv(kind) {
    if (App.mode === "demo") return Local.exportCsv(kind);
    if (App.mode === "gas") { try { const r = await API.get("/api/teacher/export/" + kind); Files.saveBlob(new Blob([r.csv], { type: "text/csv" }), r.name); } catch (e) { toast(e.message); } return; }
    Files.download("/api/teacher/export/" + kind);
  },
  async student(uid) {
    clearCharts(); clearInterval(Teacher.refresh);
    const main = App.shell("t-dash", `<div class="empty"><span class="spin"></span></div>`, { wide: true });
    let d; try { d = await API.get("/api/teacher/student/" + uid); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!main.isConnected) return;
    const P = App.content.labs.projects, order = App.order(), u = d.user;
    const total = d.sessions.reduce((a, s) => a + s.durationMs, 0);
    const byP = {}; d.quiz.forEach((q) => (byP[q.pid] = byP[q.pid] || []).push(q));
    const latest = {}; d.reports.filter((r) => !r.replaced).forEach((r) => (latest[r.pid] = r));
    main.innerHTML = `
      <div class="crumb"><a href="#t-dash">학습 모니터링</a> › 학생 상세</div>
      <div class="row"><h1 class="title" style="margin:0">${esc(u.name)}</h1><span class="muted">${esc(u.email)} · ${esc(u.phone.replace(/(\d{3})(\d{3,4})(\d{4})/, "$1-$2-$3"))} · 가입 ${fmtDT(u.createdAt)}</span>
        <span class="spacer"></span><button class="btn danger sm" id="delst">학생 계정·기록 삭제</button></div>
      <div class="grid g4" style="margin-top:16px">
        <div class="card stat"><div class="k">누적 학습 시간</div><div class="v" style="font-size:24px">${fmtDur(total)}</div></div>
        <div class="card stat"><div class="k">접속 횟수</div><div class="v">${d.sessions.length}<small>회</small></div></div>
        <div class="card stat"><div class="k">응시한 형성평가</div><div class="v">${Object.keys(byP).length}<small>/${order.length} · ${d.quiz.length}회</small></div></div>
        <div class="card stat"><div class="k">제출 보고서</div><div class="v">${Object.keys(latest).length}<small>/${order.length}</small></div></div>
      </div>
      <div class="grid g2" style="margin-top:16px">
        <div class="card"><h3>최근 14일 학습 시간(분)</h3><div class="chartbox"><canvas id="sc1"></canvas></div></div>
        <div class="card"><h3>로그인·로그아웃 기록</h3><div class="twrap" style="max-height:260px">${d.sessions.length ? `<table class="t"><tr><th>로그인</th><th>로그아웃</th><th>학습 시간</th><th>방식</th></tr>
          ${d.sessions.slice().reverse().map((s) => `<tr><td>${fmtDT(s.loginAt)}</td><td>${s.open ? '<span class="pill ok">접속 중</span>' : fmtDT(s.logoutAt)}</td><td>${fmtDur(s.durationMs)}</td>
          <td class="small">${s.open ? `마지막 활동 ${fmtDT(s.lastSeen).slice(11)}` : LOGOUT_LABEL[s.logoutType] || "-"}</td></tr>`).join("")}</table>` : '<div class="empty">접속 기록이 없습니다.</div>'}</div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3>프로젝트별 학습 현황</h3><div class="twrap"><table class="t">
        <tr><th>프로젝트</th><th>교과서</th><th>실습(성공 셀)</th><th>형성평가 기록</th><th>보고서</th><th>평가</th></tr>
        ${order.map((k) => { const l = d.activity.labs?.[k], qq = byP[k] || [], r = latest[k], nc = App.content.labs.labs[k].cells.length; return `<tr>
          <td><b>${P[k].sec} ${esc(P[k].name)}</b><div class="small muted">${esc(P[k].algo)}</div></td>
          <td>${d.activity.pages?.[P[k].page] ? `<span class="pill ok">${d.activity.pages[P[k].page].n}회 열람</span>` : '<span class="pill gray">–</span>'}</td>
          <td>${l ? `${Object.values(l.cells).filter((x) => x === "ok").length}/${nc}셀 · 실행 ${l.runs}회` : "–"}</td>
          <td class="small">${qq.length ? qq.map((q) => `<span class="heat" style="width:auto;padding:0 6px;background:${heatColor(q.score)}" title="${fmtDT(q.at)}">${q.score}</span>`).join(" ") : "–"}</td>
          <td class="small">${r ? `<a href="#t-report/${r.id}">${esc(r.title || r.filename)}</a><div class="muted">${fmtDT(r.at)} · ${r.version}판</div>` : "–"}</td>
          <td>${r ? (r.eval ? `<a class="pill ok" href="#t-report/${r.id}">${r.eval.total}점 ${r.eval.grade}</a>` : `<a class="btn ai sm" href="#t-report/${r.id}">평가하기</a>`) : ""}</td></tr>`; }).join("")}
      </table></div></div>
      <div class="card" style="margin-top:16px"><h3>프로젝트 계획서 (Ⅳ단원)</h3><div id="planv">${d.plan ? `<div class="small muted">마지막 저장 ${fmtDT(d.plan.at)}</div><div class="content" id="planhtml"></div>` : '<div class="muted">아직 작성하지 않았습니다.</div>'}</div></div>`;
    const days = lastDays(14);
    mkChart($("#sc1"), { type: "bar", data: { labels: days.map((x) => x.slice(5).replace("-", ".")), datasets: [{ data: days.map((x) => Math.round(d.daily[x] || 0)), backgroundColor: "#0fa3b1", borderRadius: 4 }] },
      options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } } });
    if (d.plan) {
      const form = App.pages.find((p) => p.kind === "form"); const box = $("#planhtml");
      box.innerHTML = form.html; $$("textarea.form-cell", box).forEach((t) => { t.value = d.plan.data[t.dataset.key] || ""; t.readOnly = true; });
      $$("textarea.note-input,input.selfcheck", box).forEach((x) => x.remove());
    }
    $("#delst").onclick = async () => {
      if (!(await confirmBox(`<b>${esc(u.name)}</b> 학생의 계정과 접속 기록, 형성평가, 보고서, 평가 결과를 모두 지웁니다. 되돌릴 수 없습니다.`, "삭제"))) return;
      try { await API.del("/api/teacher/student/" + uid); toast("삭제했습니다."); App.go("t-dash"); } catch (e) { toast(e.message); }
    };
  },
  rfilter: { pid: "", st: "" },
  async reports() {
    clearCharts(); clearInterval(Teacher.refresh);
    const main = App.shell("t-reports", `<div class="empty"><span class="spin"></span></div>`, { wide: true });
    let d; try { d = await API.get("/api/teacher/reports"); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!main.isConnected) return;
    const P = App.content.labs.projects;
    main.innerHTML = `
      <div class="row"><h1 class="title" style="margin:0">보고서 평가</h1><span class="spacer"></span>
        <button class="btn ai" id="bulk">✨ 미평가 보고서 모두 평가하기</button><button class="btn sm" id="xse">⬇ 보고서 평가 CSV</button></div>
      <p class="sub">[평가하기]를 누르면 인공지능이 데이터 분석 6단계 평가 기준으로 보고서를 채점하고 종합 평가 의견 초안을 씁니다. 초안은 반드시 교사가 읽고 고친 뒤 확정하세요.</p>
      ${d.aiReady ? "" : `<div class="card" style="border-color:#f3c7c3;background:#fff6f5;margin-bottom:14px">⚠ AI 평가가 설정되지 않았습니다. ${App.mode === "gas"
        ? "구글 Apps Script의 Code.gs 맨 위 <code>ANTHROPIC_API_KEY</code>에 Claude API 키를 넣고 저장한 뒤 <b>[배포 → 배포 관리 → ✏️ 수정 → 버전: 새 버전 → 배포]</b>로 다시 배포하세요."
        : "서버의 <code>.env</code> 파일에 <code>ANTHROPIC_API_KEY</code>를 넣고 서버를 다시 시작하세요."}</div>`}
      <div class="row" style="margin-bottom:12px"><select id="fp" style="max-width:300px"><option value="">모든 프로젝트</option>${App.order().map((k) => `<option value="${k}">${P[k].sec} ${esc(P[k].name)}</option>`).join("")}</select>
        <select id="fs" style="max-width:160px"><option value="">모든 상태</option><option value="no">미평가</option><option value="yes">평가 완료</option></select><span class="small muted" id="cnt"></span></div>
      <div class="twrap" id="rt"></div>`;
    $("#fp").value = Teacher.rfilter.pid; $("#fs").value = Teacher.rfilter.st;
    const rows = () => d.reports.filter((r) => (!Teacher.rfilter.pid || r.pid === Teacher.rfilter.pid) && (!Teacher.rfilter.st || (Teacher.rfilter.st === "yes") === !!r.eval));
    const draw = () => {
      const R = rows(); $("#cnt").textContent = `${R.length}건`;
      $("#rt").innerHTML = R.length ? `<table class="t"><tr><th>학생</th><th>프로젝트</th><th>보고서</th><th>제출</th><th>평가</th><th></th></tr>${R.map((r) => `
        <tr><td><b>${esc(r.student)}</b><div class="small muted">${esc(r.email)}</div></td><td class="small">${P[r.pid].sec} ${esc(P[r.pid].name)}</td>
        <td><a href="#t-report/${r.id}">${esc(r.title || "(제목 없음)")}</a><div class="small muted">${esc(r.filename)} · ${r.chars.toLocaleString()}자${r.attachments.length ? ` · 첨부 ${r.attachments.length}` : ""}</div></td>
        <td class="small">${fmtDT(r.at)}<div class="muted">${r.version}판</div></td>
        <td data-ev="${r.id}">${r.eval ? `<span class="pill ok">${r.eval.total}점 · ${r.eval.grade}</span>${r.eval.final ? ' <span class="pill">평가 확정</span>' : ""}` : '<span class="pill gray">미평가</span>'}</td>
        <td style="white-space:nowrap">${r.eval ? `<a class="btn sm" href="#t-report/${r.id}">결과 보기</a>` : `<button class="btn ai sm" data-go="${r.id}">평가하기</button>`}</td></tr>`).join("")}</table>`
        : '<div class="empty">조건에 맞는 보고서가 없습니다.</div>';
      $$("[data-go]").forEach((b) => (b.onclick = () => App.go("t-report/" + b.dataset.go + "/run")));
    };
    draw();
    $("#fp").onchange = (e) => { Teacher.rfilter.pid = e.target.value; draw(); };
    $("#fs").onchange = (e) => { Teacher.rfilter.st = e.target.value; draw(); };
    $("#xse").onclick = () => Teacher.exportCsv("seteuk");
    $("#bulk").onclick = async () => {
      const todo = rows().filter((r) => !r.eval); if (!todo.length) return toast("미평가 보고서가 없습니다.");
      if (!(await confirmBox(`미평가 보고서 ${todo.length}건을 차례로 평가합니다. 한 건에 30초~1분 걸릴 수 있습니다.`, "평가 시작"))) return;
      const btn = $("#bulk"); btn.disabled = true; let n = 0;
      for (const r of todo) {
        btn.innerHTML = `<span class="spin"></span> ${++n}/${todo.length} 평가 중…`; const cell = $(`[data-ev="${r.id}"]`); cell && (cell.innerHTML = '<span class="spin"></span>');
        try { const e = await Teacher.evaluate(r.id); r.eval = { total: e.total, grade: e.grade }; cell && (cell.innerHTML = `<span class="pill ok">${e.total}점 · ${e.grade}</span>`); }
        catch (x) { cell && (cell.innerHTML = `<span class="pill bad" title="${esc(x.message)}">실패</span>`); if (/API 키|not_granted/.test(x.message)) { toast(x.message, 5000); break; } }
      }
      btn.disabled = false; btn.textContent = "✨ 미평가 보고서 모두 평가하기"; draw();
    };
  },
  evaluate(rid) { return App.mode === "demo" ? Local.evaluate(rid) : API.post(`/api/teacher/report/${rid}/evaluate`).then((r) => r.eval); },
  async report(rid) {
    clearCharts(); clearInterval(Teacher.refresh);
    const auto = location.hash.endsWith("/run");
    const main = App.shell("t-reports", `<div class="empty"><span class="spin"></span></div>`, { wide: true });
    let d; try { d = await API.get("/api/teacher/report/" + rid); } catch (e) { main.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
    if (!main.isConnected) return;
    const r = d.report, P = App.project(r.pid);
    main.innerHTML = `
      <div class="crumb"><a href="#t-reports">보고서 평가</a> › ${esc(r.student?.name || "")}</div>
      <div class="row"><h1 class="title" style="margin:0">${esc(r.title || "(제목 없음)")}</h1></div>
      <p class="sub">${esc(r.student?.name || "")} · ${P.unitNo} ${P.sec} ${esc(P.name)} · ${esc(P.algo)} · 제출 ${fmtDT(r.at)} (${r.version}판)</p>
      <div class="eval-grid">
        <div class="card"><h3>제출 보고서</h3>
          <div class="row"><button class="btn sm" data-f="main">⬇ ${esc(r.filename)} (${fmtSize(r.size)})</button>${r.attachments.map((a, i) => `<button class="btn sm" data-f="${i}">⬇ ${esc(a.name)}</button>`).join("")}</div>
          <label class="f">보고서 내용(자동 추출, ${r.chars.toLocaleString()}자)</label><div class="preview" style="max-height:640px">${esc(r.text || "(읽어 낸 글자가 없습니다)")}</div></div>
        <div class="card" id="evbox"></div>
      </div>`;
    $$("[data-f]", main).forEach((b) => (b.onclick = () => {
      if (App.mode === "demo") return Local.downloadReport(rid, b.dataset.f);
      if (App.mode === "gas") { const u = b.dataset.f === "main" ? r.fileUrl : r.attachments[+b.dataset.f]?.url; return u ? window.open(u, "_blank", "noopener") : toast("파일 주소가 없습니다."); }
      Files.download(`/api/teacher/report/${rid}/file/${b.dataset.f}`);
    }));
    Teacher.drawEval(d.eval, rid);
    if (auto && !d.eval) $("#evrun")?.click();
  },
  drawEval(e, rid) {
    const box = $("#evbox");
    if (!box) return;   // 평가 중에 다른 화면으로 옮긴 경우(결과는 이미 저장됨)
    if (!e) {
      box.innerHTML = `<h3>AI 평가</h3><p class="muted">아직 평가하지 않았습니다. [평가하기]를 누르면 6개 영역(문제 정의, 데이터 수집, 전처리, 탐색적 분석, 모델링·평가, 공유·윤리·성찰)을 5점 척도로 채점하고, 잘한 점·보완할 점과 종합 평가 의견 초안을 작성합니다.</p>
        <button class="btn ai" id="evrun" style="padding:12px 20px;font-size:16px">✨ 평가하기</button><div class="err" id="everr"></div><div class="caution"><b>⚠ 유의 사항</b> 이 화면의 점수와 종합 평가 의견은 인공지능이 작성한 <b>참고용 초안</b>입니다. 학교생활기록부의 교과 세부능력 및 특기사항(세특)을 작성할 때에는 <b>참조 자료로만</b> 활용하고, 그대로 옮겨 적지 마세요. 내용이 학생의 실제 수행과 일치하는지, 사실과 다르거나 과장된 표현은 없는지, 기재 요령을 지켰는지는 <b>반드시 교사가 직접 검토하고 수정</b>해야 합니다.</div>`;
    } else {
      const text = e.finalSeteuk || e.seteuk;
      box.innerHTML = `
        <div class="row"><h3 style="margin:0">AI 평가 결과</h3><span class="spacer"></span><span class="small muted">${fmtDT(e.at)}${e.model ? " · " + esc(e.model) : ""}</span></div>
        <div class="row" style="margin:14px 0 6px;gap:18px"><div class="grade">${esc(e.grade)}</div><div><div style="font-size:26px;font-weight:900;color:var(--teal)">${e.total}<small style="font-size:14px;color:var(--ink2)"> / 100점</small></div><div class="small muted">6개 영역 합계 ${e.scores.reduce((a, s) => a + s.score, 0)} / 30</div></div></div>
        ${e.scores.map((s) => `<div class="sbar"><span>${esc(s.area)}</span><span class="track"><i style="width:${s.score * 20}%"></i></span><b>${s.score}</b><div class="ev">${esc(s.evidence)}</div></div>`).join("")}
        ${e.summary ? `<label class="f">총평</label><div>${esc(e.summary)}</div>` : ""}
        <div class="grid g2" style="margin-top:6px;gap:10px"><div><label class="f">잘한 점</label><ul class="clean">${(e.strengths || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
          <div><label class="f">보완할 점</label><ul class="clean">${(e.improvements || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
        <label class="f">종합 평가 의견 ${e.finalSeteuk ? '<span class="pill ok">교사 확정본</span>' : '<span class="pill warn">AI 초안 · 검토 필요</span>'}</label>
        <textarea class="seteuk" id="se">${esc(text)}</textarea>
        <div class="row"><span class="counter" id="secnt"></span><span class="spacer"></span><button class="btn sm" id="secopy">복사</button>${e.finalSeteuk ? '<button class="btn sm" id="seai">AI 초안으로 되돌리기</button>' : ""}<button class="btn primary sm" id="sesave">확정 저장</button></div>
        <label class="f">교사 메모(학생에게 보이지 않음)</label><textarea id="tn" rows="2">${esc(e.teacherNote || "")}</textarea>
        <div class="row" style="margin-top:14px"><button class="btn ai sm" id="evrun">✨ 다시 평가하기</button><span class="small muted">다시 평가하면 확정한 평가 의견이 AI 새 초안으로 바뀝니다.</span></div><div class="err" id="everr"></div>
        <div class="caution"><b>⚠ 유의 사항</b> 이 화면의 점수와 종합 평가 의견은 인공지능이 작성한 <b>참고용 초안</b>입니다. 학교생활기록부의 교과 세부능력 및 특기사항(세특)을 작성할 때에는 <b>참조 자료로만</b> 활용하고, 그대로 옮겨 적지 마세요. 내용이 학생의 실제 수행과 일치하는지, 사실과 다르거나 과장된 표현은 없는지, 기재 요령을 지켰는지는 <b>반드시 교사가 직접 검토하고 수정</b>해야 합니다.</div>`;
      const se = $("#se"), cnt = () => { const n = [...se.value].length, b = neisBytes(se.value); $("#secnt").textContent = `${n}자 · ${b.toLocaleString()}바이트 (학교생활기록부 입력 기준 1,500바이트)`; $("#secnt").classList.toggle("over", b > 1500); };
      se.oninput = cnt; cnt();
      $("#secopy").onclick = () => navigator.clipboard.writeText(se.value).then(() => toast("평가 의견을 복사했습니다."), () => toast("복사하지 못했습니다."));
      $("#sesave").onclick = async () => { try { const r = await API.put(`/api/teacher/report/${rid}/eval`, { finalSeteuk: se.value, teacherNote: $("#tn").value }); toast("확정 저장했습니다."); Teacher.drawEval(r.eval, rid); } catch (x) { toast(x.message); } };
      $("#seai") && ($("#seai").onclick = async () => { const r = await API.put(`/api/teacher/report/${rid}/eval`, { finalSeteuk: "" }); r.eval.finalSeteuk = null; Teacher.drawEval(r.eval, rid); });
      $("#tn").onchange = () => API.put(`/api/teacher/report/${rid}/eval`, { teacherNote: $("#tn").value }).then(() => toast("메모를 저장했습니다.")).catch((x) => toast(x.message));
    }
    $("#evrun").onclick = async () => {
      if (e && !(await confirmBox("다시 평가할까요? 현재 결과와 확정한 평가 의견이 새 결과로 바뀝니다.", "다시 평가"))) return;
      const b = $("#evrun"); b.disabled = true; b.innerHTML = '<span class="spin"></span> 인공지능이 보고서를 읽고 평가하는 중… (30초~1분)'; $("#everr").textContent = "";
      try { const ne = await Teacher.evaluate(rid); toast("평가를 마쳤습니다."); Teacher.drawEval(ne, rid); }
      catch (x) { if (!b.isConnected) return toast(x.message, 5000); $("#everr").textContent = x.message; b.disabled = false; b.textContent = "✨ 평가하기"; }
    };
  },
  async teacherFiles(el) {
    if (!el) return;
    if (App.mode === "gas") {
      try {
        const list = await fetch("content/teacher_files.json").then((r) => r.json());
        el.innerHTML = list.map((f) => `<button class="btn sm" data-tf="${esc(f.name)}">⬇ ${esc(f.name)} <span class="muted">${fmtSize(f.size)}</span></button>`).join("");
        $$("[data-tf]", el).forEach((b) => (b.onclick = async () => {
          b.disabled = true;
          try { const f = list.find((x) => x.name === b.dataset.tf); Files.saveBlob(new Blob([await Crypt.open("files/teacher/" + f.enc)]), f.name); } catch (e) { toast(e.message); }
          b.disabled = false;
        }));
      } catch (e) { el.textContent = "교사 자료 목록을 불러오지 못했습니다."; }
      return;
    }
    if (App.mode === "demo") { el.innerHTML = `<span class="small muted">체험판에서는 교사 전용 파일(예시 풀이 노트북, 교과서·지도서 HWPX)을 내려받을 수 없습니다. 학교에 설치한 서버판에서 제공됩니다.</span>`; return; }
    try {
      const r = await API.get("/api/teacher/filelist");
      el.innerHTML = r.files.map((f) => `<button class="btn sm" data-tf="${esc(f.name)}">⬇ ${esc(f.name)} <span class="muted">${fmtSize(f.size)}</span></button>`).join("");
      $$("[data-tf]", el).forEach((b) => (b.onclick = () => Files.download("/api/teacher/files/" + encodeURIComponent(b.dataset.tf), b.dataset.tf)));
    } catch (e) { el.textContent = e.message; }
  },
};
