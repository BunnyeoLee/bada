/* 학생 화면: 나의 학습, 형성평가, 보고서 제출, 데이터 자료실 */
"use strict";
const Extract = {
  async lib(name) {
    const map = { pdf: ["vendor/pdf.min.js", () => window.pdfjsLib], mammoth: ["vendor/mammoth.browser.min.js", () => window.mammoth], jszip: ["vendor/jszip.min.js", () => window.JSZip] };
    const [src, get] = map[name]; if (!get()) await Lab.loadScript(src);
    if (name === "pdf") window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
    return get();
  },
  ext: (n) => (n.split(".").pop() || "").toLowerCase(),
  async text(file) {
    const e = Extract.ext(file.name), buf = await file.arrayBuffer();
    if (["txt", "md", "csv", "py", "json"].includes(e)) return new TextDecoder().decode(buf);
    if (e === "ipynb") { const nb = JSON.parse(new TextDecoder().decode(buf)); return (nb.cells || []).map((c) => `[${c.cell_type === "code" ? "코드" : "설명"}]\n` + [].concat(c.source || []).join("")).join("\n\n"); }
    if (e === "pdf") {
      const pdf = await (await Extract.lib("pdf")).getDocument({ data: buf }).promise; let out = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 60); i++) { const tc = await (await pdf.getPage(i)).getTextContent(); out.push(tc.items.map((x) => x.str + (x.hasEOL ? "\n" : " ")).join("")); }
      return out.join("\n\n");
    }
    if (e === "docx") return (await (await Extract.lib("mammoth")).extractRawText({ arrayBuffer: buf })).value;
    if (e === "hwpx" || e === "pptx" || e === "xlsx") {
      const zip = await (await Extract.lib("jszip")).loadAsync(buf);
      const re = e === "hwpx" ? /^Contents\/section\d+\.xml$/ : e === "pptx" ? /^ppt\/slides\/slide\d+\.xml$/ : /^xl\/sharedStrings\.xml$/;
      const names = Object.keys(zip.files).filter((n) => re.test(n)).sort((a, b) => (+a.match(/\d+/)?.[0] || 0) - (+b.match(/\d+/)?.[0] || 0));
      const parts = [];
      for (const n of names) {
        const xml = await zip.file(n).async("string");
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        if (e === "hwpx") {
          const nearP = (n) => { for (let x = n.parentNode; x; x = x.parentNode) if (x.localName === "p") return x; return null; };
          parts.push([...doc.getElementsByTagNameNS("*", "p")].map((p) => [...p.getElementsByTagNameNS("*", "t")].filter((t) => nearP(t) === p).map((t) => t.textContent).join("")).filter(Boolean).join("\n"));
        }
        else parts.push([...doc.getElementsByTagNameNS("*", "t")].map((t) => t.textContent).join(" "));
      }
      return parts.join("\n\n");
    }
    if (e === "hwp") throw new Error("HWP(구형 한글) 파일은 내용을 읽을 수 없습니다. 한글에서 'PDF' 또는 'HWPX'로 저장해 올려 주세요.");
    return "";
  },
  b64(file) { return new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1] || ""); r.onerror = no; r.readAsDataURL(file); }); },
};

const Student = {
  routes: {
    home: () => Student.home(), quiz: (p) => (p[1] ? Student.quiz(p[1]) : Student.quizIndex()), report: (p) => Student.report(p[1]), data: (p) => Student.data(p[1]),
  },
  progressPills(pid, prog) {
    const P = App.project(pid), q = prog.quiz[pid], r = prog.reports[pid], l = prog.labs[pid], ncell = App.content.labs.labs[pid].cells.length;
    const read = prog.pages.includes(P.page);
    return `<span class="pill ${read ? "ok" : "gray"}">교과서 ${read ? "✔" : "–"}</span>
      <span class="pill ${l ? (l.cells >= ncell ? "ok" : "warn") : "gray"}">실습 ${l ? `${l.cells}/${ncell}` : "–"}</span>
      <span class="pill ${q ? (q.best >= 80 ? "ok" : "warn") : "gray"}">평가 ${q ? q.best + "점" : "–"}</span>
      <span class="pill ${r ? "ok" : "gray"}">보고서 ${r ? "제출" : "–"}</span>`;
  },
  async home() {
    const main = App.shell("home", `<div class="empty"><span class="spin"></span></div>`);
    const prog0 = await Book.loadProgress(); if (!main.isConnected) return;
    const prog = prog0 || { quiz: {}, reports: {}, labs: {}, pages: [], studyMs: 0, sessions: 0 };
    const P = App.content.labs.projects, order = App.order();
    const qs = Object.values(prog.quiz), avg = qs.length ? Math.round(qs.reduce((a, q) => a + q.best, 0) / qs.length) : null;
    const last = LS.get("lastPage:" + App.user.id, null), lastP = App.pages.find((p) => p.id === last);
    const units = App.content.book.units.filter((u) => u.no);
    main.innerHTML = `
      <h1 class="title">${esc(App.user.name)} 님의 학습 공간</h1>
      <p class="sub">${App.order().length}개의 부산 바다 프로젝트를 교과서 → 실습실 → 형성평가 → 보고서 순서로 해결해 봅시다. 로그인 ${fmtDT(App.loginAt)}</p>
      <div class="grid g4">
        <div class="card stat"><div class="k">누적 학습 시간</div><div class="v">${fmtDur(prog.studyMs).replace(/(\d+)/g, "$1")}</div></div>
        <div class="card stat"><div class="k">접속 횟수</div><div class="v">${prog.sessions}<small>회</small></div></div>
        <div class="card stat"><div class="k">형성평가 평균(최고 점수 기준)</div><div class="v">${avg ?? "–"}<small>${avg !== null ? `점 · ${qs.length}/${App.order().length}` : ""}</small></div></div>
        <div class="card stat"><div class="k">제출한 보고서</div><div class="v">${Object.keys(prog.reports).length}<small>/${App.order().length}</small></div></div>
      </div>
      <div class="card" style="margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:240px"><b>이어서 학습하기</b><div class="muted small">${lastP ? esc(lastP.unit.no + " " + lastP.title) : "처음이라면 '들어가며'부터 시작해 보세요."}</div></div>
        <a class="btn primary" href="#book/${lastP ? lastP.id : App.pages[0].id}">📖 ${lastP ? "이어서 읽기" : "교과서 시작하기"}</a>
      </div>
      ${units.slice(0, 3).map((u) => `
        <h2 style="margin:28px 0 12px;font-size:19px">${u.no}. ${esc(u.title)}</h2>
        <div class="grid g3">${u.pages.filter((p) => p.kind === "project").map((p) => card(p.pid)).join("")}</div>`).join("")}
      <h2 style="margin:28px 0 12px;font-size:19px">Ⅳ. 바다 데이터 과학 프로젝트</h2>
      <div class="grid g3">${(units[3] ? units[3].pages.filter((p) => p.kind === "project") : []).map((p) => card(p.pid)).join("")}
        <div class="card" style="display:flex;flex-direction:column;gap:10px"><b>우리 모둠 프로젝트</b><span class="small muted">우리 모둠만의 부산 바다 문제를 찾아 6단계로 해결합니다. 교과서의 <b>프로젝트 계획서 양식</b>은 웹에서 바로 작성·저장할 수 있습니다.</span>
          <div class="row" style="margin-top:auto"><a class="btn sm" href="#book/u4-intro">단원 열기</a><a class="btn primary sm" href="#book/${(App.pages.find((p) => p.kind === "form") || {}).id}">계획서 작성</a></div></div>
      </div>`;
    function card(k) { return `
          <div class="card pcard">
            <div class="img" style="background-image:url(fig/${k.toLowerCase()}_story.png)"><span class="tag">${P[k].sec} · ${esc(P[k].algo)}</span></div>
            <div class="body"><b>${esc(P[k].name)}</b><span class="q">${esc(P[k].story)}</span><div class="prog">${Student.progressPills(k, prog)}</div></div>
            <div class="acts"><a class="btn sm" href="#book/${P[k].page}">📖 교과서</a><a class="btn sm" href="#lab/${k}">💻 실습</a><a class="btn sm" href="#quiz/${k}">📝 평가</a><a class="btn sm" href="#report/${k}">📤 보고서</a></div>
          </div>`; }
  },
  quizIndex() {
    const P = App.content.labs.projects;
    const main = App.shell("quiz", `<h1 class="title">형성평가</h1><p class="sub">프로젝트마다 5문항입니다. 여러 번 풀 수 있고, 모든 응시 기록과 점수가 저장됩니다.</p><div id="ql" class="grid g2"></div>`);
    Book.loadProgress().then((prog) => {
      $("#ql", main).innerHTML = App.order().map((k) => { const q = prog?.quiz[k]; return `
        <div class="card row"><div style="flex:1"><div class="small muted">${P[k].unitNo} ${P[k].sec} · ${esc(P[k].algo)}</div><b>${esc(P[k].name)}</b>
          <div class="small">${q ? `최고 <b>${q.best}점</b> · 최근 ${q.last}점 · ${q.attempts}회 응시` : '<span class="muted">아직 풀지 않음</span>'}</div></div>
          <a class="btn ${q ? "" : "primary"}" href="#quiz/${k}">${q ? "다시 풀기" : "풀기"}</a></div>`; }).join("");
    });
  },
  quiz(pid) {
    const P = App.project(pid), Q = App.content.quiz[pid]; if (!P || !Q) return App.go("quiz");
    const main = App.shell("quiz", `
      <div class="crumb"><a href="#quiz">형성평가</a> › ${P.unitNo} ${P.sec}</div>
      <h1 class="title">📝 ${esc(P.name)} · 형성평가</h1><p class="sub">${esc(P.algo)} · 5문항(문항당 20점). 모두 답한 뒤 제출하세요.</p>
      <form id="qf">${Q.map((q, i) => `<div class="qitem" data-i="${i}"><div class="qq">${i + 1}. ${esc(q.q)}</div>
        ${q.options.map((o, j) => `<label><input type="radio" name="q${i}" value="${j}"><span>${"①②③④⑤"[j]} ${esc(o)}</span></label>`).join("")}<div class="ex hidden"></div></div>`).join("")}
        <div class="row" style="margin-top:16px"><button class="btn primary" id="qsub">제출하고 채점하기</button><a class="btn" href="#book/${P.page}">교과서 다시 보기</a></div></form>
      <div id="qres"></div>`);
    $("#qf", main).onsubmit = async (e) => {
      e.preventDefault();
      const ans = Q.map((q, i) => { const c = $(`input[name=q${i}]:checked`, main); return c ? +c.value : null; });
      if (ans.some((a) => a === null)) return toast("모든 문항에 답하세요.");
      $("#qsub").disabled = true;
      try {
        const r = await API.post("/api/quiz/" + pid, { answers: ans });
        r.result.forEach((x, i) => {
          const it = $(`.qitem[data-i="${i}"]`, main);
          $$("label", it).forEach((lb, j) => { if (j === x.answer) lb.classList.add("right"); else if (j === x.chosen) lb.classList.add("wrong"); $("input", lb).disabled = true; });
          const ex = $(".ex", it); ex.classList.remove("hidden"); ex.innerHTML = `${x.correct ? "⭕ 정답" : "❌ 오답 · 정답은 " + "①②③④⑤"[x.answer]} — ${esc(x.explain)}`;
        });
        $("#qres", main).innerHTML = `<div class="card row" style="margin-top:20px"><div class="score-big">${r.score}점</div>
          <div style="flex:1">${r.score === 100 ? "완벽합니다! 실습실에서 코드를 바꿔 가며 더 탐구해 보세요." : r.score >= 60 ? "잘했습니다. 틀린 문항의 해설을 읽고 교과서의 해당 단계를 복습해 보세요." : "교과서를 다시 읽고 실습실에서 코드를 실행해 본 뒤 다시 도전해 보세요."}
          <div class="small muted">이번이 ${r.attempts}번째 응시입니다. 점수는 선생님께 기록됩니다.</div></div>
          <button class="btn" id="again">다시 풀기</button><a class="btn primary" href="#report/${pid}">보고서 제출 →</a></div>`;
        $("#again").onclick = () => Student.quiz(pid);
        $("#qres", main).scrollIntoView({ behavior: "smooth" });
      } catch (x) { toast(x.message); $("#qsub").disabled = false; }
    };
  },
  async report(pid) {
    const P = App.content.labs.projects;
    const main = App.shell("report", `
      <h1 class="title">📤 빅데이터 분석 결과보고서 제출</h1>
      <p class="sub">프로젝트를 6단계로 수행한 결과보고서를 올리세요. PDF, HWPX, DOCX, PPTX, 노트북(IPYNB), TXT를 받습니다. 같은 프로젝트에 다시 올리면 새 판으로 바뀝니다.</p>
      <div class="grid g2">
        <form class="card" id="rf">
          <h3>보고서 올리기</h3>
          <label class="f">프로젝트</label><select name="pid" required>${App.order().map((k) => `<option value="${k}" ${k === pid ? "selected" : ""}>${P[k].unitNo} ${P[k].sec} ${esc(P[k].name)} · ${esc(P[k].algo)}</option>`).join("")}</select>
          <label class="f">보고서 제목</label><input name="title" required maxlength="120" placeholder="예: 2050년 부산 해수면 예측과 저지대 대응 제안">
          <label class="f">결과보고서 파일 (20MB 이하)</label>
          <div class="drop" id="drop"><b>여기를 눌러 파일 선택</b> 또는 끌어다 놓기<div class="small muted" id="fname">PDF · HWPX · DOCX · PPTX · IPYNB · TXT · MD</div></div>
          <input type="file" id="file" class="hidden" accept=".pdf,.hwpx,.docx,.pptx,.ipynb,.txt,.md">
          <label class="f">산출물 첨부(선택, 최대 5개: 노트북, 그래프 이미지, 데이터 등)</label><input type="file" id="atts" multiple>
          <div id="pv" class="hidden"><label class="f">읽어 낸 보고서 내용 미리보기</label><div class="preview" id="pvt"></div><div class="small muted" id="pvn"></div></div>
          <div class="err" id="rerr"></div>
          <button class="btn primary" id="rsub" style="margin-top:8px">제출하기</button>
          <div class="hint">보고서에는 ① 문제 정의 ② 데이터 수집·명세 ③ 전처리(문제점과 해결 이유) ④ 탐색적 분석(그래프와 해석) ⑤ 모델링·평가(기준선, 지표) ⑥ 공유·한계·성찰이 드러나게 써 주세요.</div>
        </form>
        <div class="card"><h3>내가 제출한 보고서</h3><div id="mine"><span class="spin"></span></div>
          <p class="small muted" style="margin-top:14px">제출한 보고서는 선생님이 확인하고 평가합니다. 평가 결과는 선생님만 볼 수 있습니다.</p></div>
      </div>`);
    let main_file = null, text = "";
    const show = async (f) => {
      main_file = f; text = ""; $("#fname").textContent = `${f.name} (${fmtSize(f.size)})`; $("#rerr").textContent = "";
      if (f.size > 20e6) { $("#rerr").textContent = "20MB 이하 파일만 올릴 수 있습니다."; main_file = null; return; }
      $("#pv").classList.remove("hidden"); $("#pvt").innerHTML = '<span class="spin"></span> 내용을 읽는 중…';
      try { text = (await Extract.text(f)).trim(); $("#pvt").textContent = text.slice(0, 3000) || "(읽어 낸 글자가 없습니다)"; $("#pvn").textContent = `${text.length.toLocaleString()}자를 읽었습니다.` + (text.length < 300 ? " 글자가 너무 적으면 AI 평가가 정확하지 않을 수 있습니다. 그림으로만 된 파일이라면 글로 된 설명을 덧붙여 주세요." : ""); }
      catch (e) { $("#pvt").textContent = ""; $("#rerr").textContent = e.message; main_file = null; }
    };
    const drop = $("#drop"), fi = $("#file");
    drop.onclick = () => fi.click(); fi.onchange = () => fi.files[0] && show(fi.files[0]);
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("over"); }; drop.ondragleave = () => drop.classList.remove("over");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("over"); e.dataTransfer.files[0] && show(e.dataTransfer.files[0]); };
    $("#rf").onsubmit = async (e) => {
      e.preventDefault(); if (!main_file) return ($("#rerr").textContent = "보고서 파일을 선택하세요.");
      const f = Object.fromEntries(new FormData(e.target)); $("#rsub").disabled = true; $("#rsub").innerHTML = '<span class="spin"></span> 올리는 중…';
      try {
        const atts = [];
        for (const a of [...$("#atts").files].slice(0, 5)) { if (a.size > 20e6) continue; let t = ""; try { t = await Extract.text(a); } catch (x) {} atts.push({ name: a.name, data: await Extract.b64(a), text: t.slice(0, 30000) }); }
        await API.post("/api/reports", { pid: f.pid, title: f.title, filename: main_file.name, mime: main_file.type || "", data: await Extract.b64(main_file), text, attachments: atts });
        toast("보고서를 제출했습니다."); Student.report(f.pid);
      } catch (x) { $("#rerr").textContent = x.message; $("#rsub").disabled = false; $("#rsub").textContent = "제출하기"; }
    };
    try {
      const r = await API.get("/api/reports/mine");
      $("#mine").innerHTML = r.reports.length ? `<div class="twrap"><table class="t"><tr><th>프로젝트</th><th>제목·파일</th><th>제출</th><th>상태</th></tr>${r.reports.map((x) => `
        <tr><td>${P[x.pid].sec} ${esc(P[x.pid].name)}</td><td><b>${esc(x.title || "(제목 없음)")}</b><div class="small muted">${esc(x.filename)} · ${fmtSize(x.size)}${x.attachments.length ? ` · 첨부 ${x.attachments.length}` : ""}</div></td>
        <td class="small">${fmtDT(x.at)}<div class="muted">${x.version}판</div></td><td>${x.replaced ? '<span class="pill gray">이전 판</span>' : '<span class="pill ok">제출됨</span>'}</td></tr>`).join("")}</table></div>` : '<div class="empty">아직 제출한 보고서가 없습니다.</div>';
    } catch (e) { $("#mine").textContent = e.message; }
  },
  data(pid) {
    const P = App.content.labs.projects, T = App.user.role === "teacher";
    const fileBtn = (path, label) => `<button class="btn sm" data-dl="${esc(path)}">⬇ ${esc(label)}</button>`;
    const main = App.shell("data", `
      <h1 class="title">🗂 데이터 자료실</h1>
      <p class="sub">교과서에 나오는 실습 데이터(CSV)와 실습 소스코드(주피터 노트북 .ipynb, 파이썬 .py)를 내려받을 수 있습니다. 모든 데이터는 수업용으로 만든 가상 데이터입니다.</p>
      <div class="card row" style="margin-bottom:16px"><div style="flex:1"><b>전체 실습 자료 한 번에 받기</b><div class="small muted">data/, data3/ 폴더의 CSV 17개와 프로젝트별 실습 노트북·파이썬 파일 20개</div></div>
        ${fileBtn("files/바다를읽는인공지능_실습자료_전체.zip", "전체 자료(zip)")}${fileBtn("files/zip/바다를읽는인공지능_학생용교과서.zip", "교과서 HWPX(zip)")}</div>
      ${T ? `<div class="card" style="margin-bottom:16px;border-color:#d9d0f3;background:#faf8ff"><b>교사 전용 자료</b><div class="small muted">예시 풀이 노트북(숨은 전처리 정답 포함), 교과서·지도서 HWPX</div><div class="row" id="tfiles" style="margin-top:10px"><span class="spin"></span></div></div>` : ""}
      <div class="grid g2">${App.order().map((k) => { const nm = P[k].name.replace(/ /g, ""); return `
        <div class="card" id="d-${k}" ${k === pid ? 'style="border-color:var(--teal);box-shadow:0 0 0 3px rgba(8,126,139,.15)"' : ""}>
          <div class="small muted">${P[k].unitNo} ${P[k].sec} · ${esc(P[k].algo)}</div><h3 style="margin:2px 0 10px">${esc(P[k].name)}</h3>
          ${P[k].data.map((d) => `<div class="row" style="padding:5px 0;border-bottom:1px dashed var(--line)"><span style="flex:1;font-size:14px">📄 ${esc(d.split("/")[1])}</span>
            <button class="btn sm" data-pv="${esc(d)}">미리보기</button>${fileBtn("files/" + d, "CSV")}</div>`).join("")}
          <div class="row" style="margin-top:10px">${App.artifact ? "" : fileBtn(`files/code/${k}_${nm}_실습.ipynb`, "노트북 .ipynb") + fileBtn(`files/code/${k}_${nm}_실습.py`, "파이썬 .py")}
            ${fileBtn(`files/zip/${k}_${nm}_실습자료.zip`, "프로젝트 묶음 zip")}<a class="btn sm" href="#lab/${k}">💻 바로 실습</a></div>
          <div class="pvbox"></div></div>`; }).join("")}</div>`);
    $$("[data-dl]", main).forEach((b) => (b.onclick = () => Files.download(b.dataset.dl.split("/").map((s, i) => (i ? encodeURIComponent(s) : s)).join("/"), b.dataset.dl.split("/").pop()).catch((e) => toast(e.message))));
    $$("[data-pv]", main).forEach((b) => (b.onclick = async () => {
      const box = $(".pvbox", b.closest(".card"));
      try {
        const t = await (await Files.blob("files/" + b.dataset.pv.split("/").map(encodeURIComponent).join("/"))).text();
        const lines = t.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean), rows = lines.slice(0, 9).map((l) => l.split(","));
        box.innerHTML = `<div class="small muted" style="margin-top:10px">${esc(b.dataset.pv)} · 전체 ${lines.length - 1}행 중 앞 8행</div><div class="twrap" style="margin-top:6px"><table class="t">${rows.map((r, i) => `<tr>${r.map((c) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join("")}</tr>`).join("")}</table></div>`;
      } catch (e) { box.textContent = e.message; }
    }));
    if (pid) setTimeout(() => $("#d-" + pid)?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
    if (T) Teacher.teacherFiles($("#tfiles", main));
  },
};
