/* 교과서·지도서 뷰어 */
"use strict";
const STEP_NAMES = { 1: "문제 정의", 2: "데이터 수집", 3: "전처리", 4: "탐색적 분석", 5: "모델링·평가", 6: "공유·실행" };
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
const Book = {
  visited: new Set(),
  async loadProgress() {
    if (App.user.role !== "student") return null;
    try { const p = await API.get("/api/progress"); Book.visited = new Set(p.pages); App.progress = p; return p; } catch (e) { return null; }
  },
  toc(pages, cur, base) {
    let html = "", lastU = null;
    for (const p of pages) {
      if (p.unit.id !== lastU) { lastU = p.unit.id; html += `<div class="u">${p.unit.no ? `<span>${p.unit.no}</span>` : ""}${esc(p.unit.title)}</div>`; }
      const isP = p.kind === "project";
      html += `<a href="#${base}/${p.id}" class="${p.id === cur ? "on" : ""} ${isP ? "proj" : ""}">${isP ? "🧭" : ""}<span>${esc(p.title)}</span>${Book.visited.has(p.id) ? '<span class="ck">✔</span>' : ""}</a>`;
    }
    return html;
  },
  async render(pageId, tab) {
    const pages = App.pages;
    let idx = pages.findIndex((p) => p.id === pageId);
    if (idx < 0) {
      const last = LS.get("lastPage:" + App.user.id, null);
      idx = Math.max(0, pages.findIndex((p) => p.id === last));
      return App.go("book/" + pages[idx].id);
    }
    LS.set("lastPage:" + App.user.id, pageId);
    await Book.loadProgress();
    const p = pages[idx];
    const main = App.shell("book", `<div class="book"><aside class="toc">${Book.toc(pages, p.id, "book")}</aside><article class="reader" id="reader"></article></div>`, { bare: true });
    const R = $("#reader", main);
    const crumb = `<div class="crumb">${p.unit.no ? p.unit.no + ". " : ""}${esc(p.unit.title)}</div>`;
    const prev = pages[idx - 1], next = pages[idx + 1];
    const pager = (left, right) => `<div class="pager">${left || "<span></span>"}${right || "<span></span>"}</div>`;
    const pl = (pg, label) => pg ? `<a class="btn" href="#book/${pg.id}">${label} ${esc(pg.title.slice(0, 22))}</a>` : "";
    if (p.kind === "project") {
      const P = App.project(p.pid);
      const tabs = p.tabs; let ti = Math.max(0, tabs.findIndex((t) => t.id === tab));
      const t = tabs[ti];
      R.innerHTML = `${crumb}
        <div class="proj-head"><div><span class="algo">${esc(P.algo)}</span><h1>${esc(p.title.replace(/^\d-\d\s+/, "").split("·")[0])}</h1><div style="opacity:.9">${esc(P.story)}</div></div></div>
        <div class="steps">${tabs.map((x, i) => `<button data-t="${x.id}" class="${i === ti ? "on" : ""} ${i < ti ? "done" : ""}"><b>${x.step || "★"}</b>${x.step ? STEP_NAMES[x.step] : "도입"}</button>`).join("")}</div>
        <div class="content" id="ct">${t.step ? `<h4 style="margin-top:0">${t.step}단계 · ${esc(t.title)}</h4>` : ""}${t.html}</div>
        ${t.step >= 3 && t.step <= 6 ? `<div class="hint">💻 이 단계의 코드를 직접 실행해 보려면 <a href="#lab/${p.pid}">실습실 · ${esc(P.name)}</a>을 열어 보자.</div>` : ""}
        ${ti === tabs.length - 1 ? `<div class="next-actions">
            <a href="#lab/${p.pid}"><b>💻 실습실</b><span class="small muted">3~6단계 코드를 브라우저에서 실행</span></a>
            ${App.user.role === "student" ? `<a href="#quiz/${p.pid}"><b>📝 형성평가</b><span class="small muted">5문항으로 이해도 점검</span></a>
            <a href="#report/${p.pid}"><b>📤 보고서 제출</b><span class="small muted">빅데이터 분석 결과보고서 올리기</span></a>` : `<a href="#t-guide"><b>📘 지도서</b><span class="small muted">이 소단원의 지도 방안</span></a>`}
            <a href="#data/${p.pid}"><b>🗂 데이터 자료실</b><span class="small muted">실습 데이터·코드 내려받기</span></a></div>` : ""}
        ${pager(ti > 0 ? `<a class="btn" href="#book/${p.id}/${tabs[ti - 1].id}">← ${tabs[ti - 1].step ? STEP_NAMES[tabs[ti - 1].step] : "도입"}</a>` : pl(prev, "←"),
                ti < tabs.length - 1 ? `<a class="btn primary" href="#book/${p.id}/${tabs[ti + 1].id}">다음: ${tabs[ti + 1].step}단계 ${STEP_NAMES[tabs[ti + 1].step]} →</a>` : pl(next, "다음 →"))}`;
      $$(".steps button", R).forEach((b) => (b.onclick = () => App.go(`book/${p.id}/${b.dataset.t}`)));
    } else {
      R.innerHTML = `${crumb}<h1>${esc(p.title)}</h1><div class="content" id="ct">${p.html}</div>
        ${p.kind === "form" ? `<div class="row" style="margin-top:14px"><button class="btn primary" id="saveplan">계획서 저장</button><span class="small muted" id="planat"></span></div>` : ""}
        ${pager(pl(prev, "←"), pl(next, "다음 →"))}`;
      if (p.kind === "form") Book.bindPlan(R);
    }
    Book.enhance(R, p.id);
    const tocOn = $(".toc a.on"); tocOn && tocOn.scrollIntoView({ block: "center" });
  },
  enhance(R, pid) {
    $$("pre.code", R).forEach((pre) => {
      const b = document.createElement("button"); b.className = "btn sm"; b.textContent = "복사";
      b.style.cssText = "position:absolute;right:8px;top:8px;background:#20394b;color:#fff;border-color:#35556b";
      b.onclick = () => navigator.clipboard.writeText(pre.innerText.replace(/복사$/, "")).then(() => toast("코드를 복사했습니다."), () => toast("복사하지 못했습니다. 직접 선택해 복사하세요."));
      pre.appendChild(b);
    });
    const uid = App.user.id;
    $$("textarea.note-input", R).forEach((ta, i) => {
      const k = `note:${uid}:${pid}:${i}`; ta.value = LS.get(k, "");
      ta.oninput = () => LS.set(k, ta.value);
    });
    $$("input.selfcheck", R).forEach((cb, i) => {
      const k = `chk:${uid}:${pid}:${i}`; cb.dataset.k = k; cb.checked = LS.get(k, false);
      cb.onchange = () => {
        if (cb.checked) { const row = cb.closest("tr"); row && $$("input.selfcheck", row).forEach((o) => { if (o !== cb && o.checked) { o.checked = false; LS.set(o.dataset.k, false); } }); }
        LS.set(k, cb.checked);
      };
    });
  },
  async bindPlan(R) {
    const cells = $$("textarea.form-cell", R);
    if (App.user.role !== "student") { $("#saveplan").remove(); cells.forEach((c) => (c.disabled = true)); return; }
    try { const r = await API.get("/api/plan"); if (r.plan) { cells.forEach((c) => (c.value = r.plan.data[c.dataset.key] || "")); $("#planat").textContent = "마지막 저장 " + fmtDT(r.plan.at); } } catch (e) {}
    $("#saveplan").onclick = async () => {
      const data = {}; cells.forEach((c) => (data[c.dataset.key] = c.value));
      try { const r = await API.put("/api/plan", { data }); $("#planat").textContent = "마지막 저장 " + fmtDT(r.at); toast("계획서를 저장했습니다. 선생님이 확인할 수 있습니다."); } catch (e) { toast(e.message); }
    };
  },
  /* 지도서(교사 전용) */
  guide: null,
  async renderGuide(pageId) {
    if (!Book.guide) {
      try { Book.guide = App.mode === "demo" ? await Local.guide() : App.mode === "gas" ? JSON.parse(new TextDecoder().decode(await Crypt.open("content/guide.enc"))) : await API.get("/api/teacher/guide"); } catch (e) { App.shell("t-guide", `<div class="empty">${esc(e.message)}</div>`); return; }
    }
    const pages = []; Book.guide.units.forEach((u) => u.pages.forEach((p) => pages.push({ ...p, unit: u })));
    let idx = Math.max(0, pages.findIndex((p) => p.id === pageId)); const p = pages[idx];
    const main = App.shell("t-guide", `<div class="book"><aside class="toc">${Book.toc(pages, p.id, "t-guide")}</aside><article class="reader" id="reader"></article></div>`, { bare: true });
    const R = $("#reader", main);
    const prev = pages[idx - 1], next = pages[idx + 1];
    R.innerHTML = `<div class="crumb">교사용 지도서 · ${p.unit.no ? p.unit.no + ". " : ""}${esc(p.unit.title)}</div><h1>${esc(p.title)}</h1><div class="content">${p.html}</div>
      <div class="pager">${prev ? `<a class="btn" href="#t-guide/${prev.id}">← ${esc(prev.title.slice(0, 22))}</a>` : "<span></span>"}${next ? `<a class="btn" href="#t-guide/${next.id}">다음 → ${esc(next.title.slice(0, 22))}</a>` : ""}</div>`;
    Book.enhance(R, p.id);
  },
};
