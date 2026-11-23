/* 공통: API, 라우터, 로그인·회원가입, 화면 틀 */
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = (n) => String(n).padStart(2, "0");
const fmtDT = (t) => { if (!t) return "-"; const d = new Date(t); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtD = (t) => { const d = new Date(t); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
const fmtDur = (ms) => { const m = Math.round((ms || 0) / 60000); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`; };
const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1) + "MB" : Math.max(1, Math.round(n / 1e3)) + "KB";
const neisBytes = (s) => { let b = 0; for (const ch of s) { const c = ch.codePointAt(0); b += c === 10 ? 2 : c < 128 ? 1 : 3; } return b; };

function toast(msg, ms = 2600) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), ms); }
function modal(html, onMount) {
  const m = $("#modal"); $("#modal-body").innerHTML = html; m.hidden = false;
  const close = () => { m.hidden = true; $("#modal-body").innerHTML = ""; };
  m.onclick = (e) => { if (e.target === m) close(); };
  $$("[data-close]", m).forEach((b) => (b.onclick = close));
  onMount && onMount($("#modal-body"), close);
  return close;
}
function confirmBox(msg, okLabel = "확인") {
  return new Promise((ok) => modal(`<p style="margin-top:0">${msg}</p><div class="row" style="justify-content:flex-end;margin-top:18px"><button class="btn" data-close>취소</button><button class="btn primary" id="cfm">${esc(okLabel)}</button></div>`,
    (el, close) => { $("#cfm", el).onclick = () => { close(); ok(true); }; $("[data-close]", el).addEventListener("click", () => ok(false)); }));
}

function inputBox(msg, value = "", okLabel = "저장") {
  return new Promise((ok) => modal(`<p style="margin-top:0">${msg}</p><input id="ibx" maxlength="120" style="width:100%" value="${esc(value)}"><div class="err" id="ibe"></div>
    <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn" data-close>취소</button><button class="btn primary" id="ibok">${esc(okLabel)}</button></div>`,
    (el, close) => { const i = $("#ibx", el); i.focus(); i.select();
      const go = () => { const v = i.value.trim(); if (!v) return ($("#ibe", el).textContent = "내용을 입력하세요."); close(); ok(v); };
      $("#ibok", el).onclick = go; i.onkeydown = (e) => e.key === "Enter" && go(); $("[data-close]", el).addEventListener("click", () => ok(null)); }));
}

const App = {
  mode: window.APP_MODE, artifact: window.APP_MODE === "demo" && !!window.claude, user: null, loginAt: null, content: {}, idleMinutes: 20,
  async start() {
    try {
      const [book, labs, quiz, insight] = await Promise.all(["book", "labs", "quiz", "insight"].map((n) => fetch(`content/${n}.json`).then((r) => r.json())));
      Object.assign(App.content, { book, labs, quiz, insight });
      App.pages = []; book.units.forEach((u) => u.pages.forEach((p) => App.pages.push({ ...p, unit: u })));
      if (App.mode === "demo") await Local.init();
      try { const me = await API.get("/api/me"); App.user = me.user; App.loginAt = me.loginAt; App.idleMinutes = me.idleMinutes; App.aiReady = me.aiReady; } catch (e) { App.user = null; }
    } catch (e) { $("#app").innerHTML = `<div class="boot">불러오기 실패: ${esc(e.message)}</div>`; return; }
    window.addEventListener("hashchange", () => App.route());
    Activity.init();
    App.route();
  },
  go(h) { if (location.hash === "#" + h) App.route(); else location.hash = h; },
  route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const parts = h.split("/").filter(Boolean);
    if (!App.user) return Auth.render(parts[0] === "signup" ? "signup" : "login");
    const T = App.user.role === "teacher";
    const r = parts[0] || (T ? "t-dash" : "home");
    const routes = T ? Teacher.routes : Student.routes;
    const common = { book: (p) => Book.render(p[1], p[2]), lab: (p) => Lab.render(p[1]), data: () => Student.data() };
    const fn = routes[r] || common[r] || routes[T ? "t-dash" : "home"];
    Lab.leave && Lab.leave(r);
    fn(parts);
    window.scrollTo(0, 0);
    if (r === "book" && parts[1]) Activity.page(parts[1]);
  },
  shell(active, html, opts = {}) {
    const T = App.user.role === "teacher";
    const nav = T ? [["t-dash", "학습 모니터링"], ["t-reports", "보고서 평가"], ["book", "교과서"], ["t-guide", "지도서"], ["lab", "실습실"], ["data", "자료실"]]
      : [["home", "나의 학습"], ["book", "교과서"], ["lab", "실습실"], ["quiz", "형성평가"], ["report", "보고서 제출"], ["data", "데이터 자료실"]];
    $("#app").innerHTML = `
      <header class="topbar">
        <a class="brand" href="#${T ? "t-dash" : "home"}"><span class="logo">🌊</span><span>바다를 읽는 인공지능<small>부산 해양 데이터 과학 디지털 교과서</small></span></a>
        <nav class="nav">${nav.map(([k, v]) => `<a href="#${k}" class="${active === k ? "on" : ""}">${v}</a>`).join("")}</nav>
        <div class="spacer"></div>
        <div class="who"><span class="role">${T ? "교사" : "학생"}</span><span class="nm"><b>${esc(App.user.name)}</b> 님</span>
          <span class="small" id="sess-timer" title="이번 접속 시간"></span><button class="btn" id="logout">로그아웃</button></div>
      </header>
      ${App.mode === "demo" ? Local.banner() : ""}
      <main id="main" class="${opts.bare ? "" : "page" + (opts.wide ? " wide" : "")}">${html}</main>`;
    $("#logout").onclick = () => Auth.logout();
    if (App.mode === "demo") Local.bindBanner();
    Activity.tick();
    return $("#main");
  },
  project(pid) { return App.content.labs.projects[pid]; },
  order() { return App.content.labs.order; },
};

/* ---- API ---- */
const API = {
  async req(method, path, body) {
    if (App.mode === "demo") return Local.handle(method, path, body);
    if (App.mode === "gas") return GAS.req(method, path, body);
    const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "요청 실패(" + r.status + ")"); e.status = r.status; if (r.status === 401 && App.user && path !== "/api/logout") Auth.expired(); throw e; }
    return j;
  },
  get: (p) => API.req("GET", p), post: (p, b) => API.req("POST", p, b || {}), put: (p, b) => API.req("PUT", p, b || {}), del: (p) => API.req("DELETE", p),
};

/* ---- 파일 내려받기 (서버: 링크, 체험판: downloads 기능) ---- */
const Files = {
  async download(url, filename) {
    if (App.mode === "server") {
      const a = document.createElement("a"); a.href = url; a.download = filename || ""; document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if (App.artifact) return Local.download(url, filename);
    const r = await fetch(url); if (!r.ok) throw new Error("파일을 찾지 못했습니다.");
    Files.saveBlob(await r.blob(), filename || decodeURIComponent(url.split("/").pop()));
  },
  saveBlob(blob, name) {
    const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 30000);
  },
  async blob(url) { if (App.mode === "demo" && Local.isLocalUrl(url)) return Local.blobOf(url); const r = await fetch(url); if (!r.ok) throw new Error("파일을 가져오지 못했습니다."); return r.blob(); },
};

/* ---- 학습 활동 기록: 하트비트(실제로 활동 중일 때만), 쪽 열람, 실습 실행 ---- */
const Activity = {
  lastInput: Date.now(), timer: null, clock: null,
  init() {
    ["mousemove", "keydown", "scroll", "click", "touchstart"].forEach((ev) => window.addEventListener(ev, () => (Activity.lastInput = Date.now()), { passive: true }));
    Activity.timer = setInterval(Activity.beat, App.mode === "gas" ? 120000 : 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) Activity.beat(); });
  },
  async beat() {
    if (!App.user || document.hidden) return;
    if (Date.now() - Activity.lastInput > 5 * 60000) return; // 5분 넘게 입력이 없으면 학습 중으로 보지 않음
    try { await API.post("/api/heartbeat"); } catch (e) { /* 401이면 API가 처리 */ }
  },
  tick() {
    clearInterval(Activity.clock);
    const f = () => { const el = $("#sess-timer"); if (el && App.loginAt) el.textContent = "⏱ " + fmtDur(Date.now() - App.loginAt); };
    f(); Activity.clock = setInterval(f, 30000);
  },
  page(id) { if (App.user && App.user.role === "student") API.post("/api/activity", { type: "page", page: id }).catch(() => {}); },
  lab(pid, cell, ok) { if (App.user && App.user.role === "student") API.post("/api/activity", { type: "lab", pid, cell, ok }).catch(() => {}); },
};

/* ---- 로그인·회원가입 ---- */
const Auth = {
  role: "student",
  render(view) {
    const isS = view === "signup";
    $("#app").innerHTML = `
    ${App.mode === "demo" ? Local.banner(true) : ""}
    <div class="auth">
      <section class="auth-hero">
        <div class="pill" style="background:rgba(255,255,255,.18);color:#fff;align-self:flex-start;margin-bottom:14px">고등학교 데이터 과학 연계 · 디지털 교과서</div>
        <h1>바다를 읽는 인공지능<br>부산 해양 데이터 과학</h1>
        <p>해수면, 이안류, 멸치, 해파리, 해양쓰레기, 태풍, 선박, 고등어, 갯녹음, 그리고 북항의 상어 부캉이까지. 부산 바다의 문제 11가지를 데이터 분석 6단계로 직접 해결해 봅니다.</p>
        <div class="chips"><span>교과서 4단원</span><span>프로젝트 11개</span><span>브라우저 파이썬 실습</span><span>형성평가</span><span>AI 보고서 평가</span></div>
        ${window.BADA_CONFIG ? '<a href="intro.html" style="color:#fff;margin-top:16px;display:inline-block;opacity:.9">📘 교과서 소개 보기 →</a>' : ""}
      </section>
      <section class="auth-panel"><div class="auth-box">
        <div class="tabs"><button data-r="student" class="${Auth.role === "student" ? "on" : ""}">학생</button><button data-r="teacher" class="${Auth.role === "teacher" ? "on" : ""}">교사</button></div>
        <h2 style="margin:0 0 4px">${isS ? (Auth.role === "teacher" ? "교사 회원가입" : "학생 회원가입") : (Auth.role === "teacher" ? "교사 로그인" : "학생 로그인")}</h2>
        <p class="muted small" style="margin:0 0 6px">${isS ? "메일 주소, 이름, 연락처만으로 가입합니다." : "가입할 때 쓴 메일 주소와 연락처로 로그인합니다."}</p>
        <form id="af" autocomplete="on">
          <label class="f">메일 주소</label><input name="email" type="email" required placeholder="name@school.kr" autocomplete="email">
          ${isS ? `<label class="f">이름</label><input name="name" required placeholder="홍길동" maxlength="30" autocomplete="name">` : ""}
          <label class="f">연락처(휴대전화)</label><input name="phone" type="tel" required placeholder="010-1234-5678" autocomplete="tel">
          ${isS && Auth.role === "teacher" ? `<label class="f">교사 인증 코드</label><input name="teacherCode" required placeholder="관리자에게 받은 코드">` : ""}
          ${isS ? `<div class="consent">수집 항목: 메일 주소, 이름, 연락처 / 목적: 회원 식별, 학습 기록·평가 관리 / 보유 기간: 해당 학년도 종료 시까지(담당 교사가 삭제)
            <label><input type="checkbox" name="agree" required> 개인정보 수집·이용에 동의합니다.</label></div>` : ""}
          <div class="err" id="aerr"></div>
          <button class="btn primary" style="width:100%;justify-content:center;padding:12px;margin-top:6px">${isS ? "가입하기" : "로그인"}</button>
        </form>
        <p class="small muted" style="text-align:center;margin-top:16px">${isS ? `이미 가입했나요? <a href="#login">로그인</a>` : `처음인가요? <a href="#signup">회원가입</a>`}</p>
        ${!isS ? `<p class="small muted" style="text-align:center">로그인한 시각과 로그아웃한 시각이 학습 기록으로 남습니다.</p>` : ""}
      </div></section>
    </div>`;
    if (App.mode === "demo") Local.bindBanner();
    $$(".tabs button").forEach((b) => (b.onclick = () => { Auth.role = b.dataset.r; Auth.render(view); }));
    $("#af").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target)); f.role = Auth.role; f.agree = !!f.agree;
      const btn = $("#af button"); btn.disabled = true; $("#aerr").textContent = "";
      try {
        if (isS) { await API.post("/api/signup", f); toast("가입되었습니다. 바로 로그인합니다."); }
        const r = await API.post("/api/login", { email: f.email, phone: f.phone, role: Auth.role });
        App.user = r.user; App.loginAt = r.loginAt;
        try { const me = await API.get("/api/me"); App.idleMinutes = me.idleMinutes; App.aiReady = me.aiReady; } catch (x) {}
        toast(`${r.user.name} 님, 로그인했습니다. (${fmtDT(r.loginAt)})`);
        App.go(r.user.role === "teacher" ? "t-dash" : "home");
      } catch (x) { $("#aerr").textContent = x.message; btn.disabled = false; }
    };
  },
  async logout() {
    try { const r = await API.post("/api/logout"); toast(`로그아웃했습니다. 이번 학습 시간: ${fmtDur(r.durationMs)}`, 4000); } catch (e) {}
    App.user = null; App.loginAt = null; App.go("login");
  },
  expired() {
    if (!App.user) return;
    App.user = null; toast(`${App.idleMinutes}분 동안 활동이 없어 자동 로그아웃되었습니다. 다시 로그인하세요.`, 5000);
    App.go("login");
  },
};
