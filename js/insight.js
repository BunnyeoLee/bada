/* 교사용 학생 진단: 취약점 분석 · 다음 교육과정 추천
 * 근거 데이터: 교과서 열람(진도), 실습실 셀 실행 결과, 형성평가 문항별 정오(개념 8영역), 단원별 성취, 보고서 AI 평가 6영역 */
"use strict";
const STEP6 = ["문제 정의", "데이터 수집", "전처리", "탐색적 분석", "모델링·평가", "공유·실행"];
const UNIT_OF = (pid) => App.project(pid).unit;
const Insight = {
  compute(d) {
    const L = App.content.labs, P = L.projects, order = L.order, M = App.content.insight;
    const act = d.activity || { pages: {}, labs: {} };
    const byP = {}; (d.quiz || []).forEach((q) => (byP[q.pid] = byP[q.pid] || []).push(q));
    Object.values(byP).forEach((a) => a.sort((x, y) => x.at - y.at));
    const latestRep = {}; (d.reports || []).filter((r) => !r.replaced).forEach((r) => (latestRep[r.pid] = r));
    // 프로젝트별 수행
    const proj = order.map((k) => {
      const nc = L.labs[k].cells.length, lab = (act.labs || {})[k], cells = lab ? Object.values(lab.cells) : [];
      const ok = cells.filter((c) => c === "ok").length, err = cells.filter((c) => c === "err").length;
      const tries = byP[k] || [], best = tries.length ? Math.max(...tries.map((q) => q.score)) : null;
      const read = !!(act.pages || {})[P[k].page], rep = latestRep[k] || null;
      const pct = Math.round(25 * (read ? 1 : 0) + 25 * (ok / nc) + 25 * ((best || 0) / 100) + 25 * (rep ? 1 : 0));
      return { k, name: P[k].name, sec: P[k].sec, unitNo: P[k].unitNo, unit: P[k].unit, read, nc, ok, err, runs: lab ? lab.runs : 0, tries: tries.length,
        first: tries.length ? tries[0].score : null, best, last: tries.length ? tries[tries.length - 1] : null, rep, pct, started: read || !!lab || tries.length > 0 || !!rep };
    });
    // 개념 8영역(각 프로젝트의 가장 최근 응시 기준)
    const tags = {}; Object.keys(M.tags).forEach((t) => (tags[t] = { id: t, ...M.tags[t], n: 0, right: 0, wrong: [] }));
    proj.forEach((p) => { if (!p.last || !p.last.correct) return;
      p.last.correct.forEach((c, i) => { const qid = `${p.k}-${i + 1}`, t = tags[M.qmap[qid]]; if (!t) return; t.n++; if (c) t.right++; else t.wrong.push(p.k); }); });
    Object.values(tags).forEach((t) => (t.acc = t.n ? t.right / t.n : null));
    // 단원
    const units = App.content.book.units.filter((u) => u.no).map((u) => {
      const ps = proj.filter((p) => p.unit === u.id), q = ps.filter((p) => p.best !== null);
      return { id: u.id, no: u.no, title: u.title, n: ps.length, quizAvg: q.length ? Math.round(q.reduce((a, p) => a + p.best, 0) / q.length) : null,
        done: ps.length ? Math.round(ps.reduce((a, p) => a + p.pct, 0) / ps.length) : 0, attempted: q.length };
    }).filter((u) => u.n);
    // 보고서 6단계(AI 평가 영역 점수 평균)
    const evs = Object.values(latestRep).filter((r) => r.evalScores && r.evalScores.length);
    const rep6 = STEP6.map((s, i) => { const v = evs.map((r) => r.evalScores[i]?.score).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; });
    const repTotal = evs.length ? Math.round(evs.reduce((a, r) => a + (r.eval?.total || 0), 0) / evs.length) : null;
    // 종합 지표
    const totalPages = App.pages.length, readPages = Object.keys(act.pages || {}).length;
    const totCells = proj.reduce((a, p) => a + p.nc, 0), okCells = proj.reduce((a, p) => a + p.ok, 0);
    const tagN = Object.values(tags).reduce((a, t) => a + t.n, 0), tagR = Object.values(tags).reduce((a, t) => a + t.right, 0);
    const dims = {
      progress: Math.round(proj.reduce((a, p) => a + p.pct, 0) / proj.length),
      concept: tagN ? Math.round(tagR / tagN * 100) : null,
      lab: Math.round(okCells / totCells * 100),
      report: repTotal,
    };
    const avail = Object.values(dims).filter((v) => v !== null);
    const composite = avail.length ? Math.round(avail.reduce((a, b) => a + b, 0) / avail.length) : 0;
    const level = composite >= 80 ? "심화" : composite >= 50 ? "발전" : "기초";
    const enough = proj.some((p) => p.started);
    const studyMin = Math.round((d.sessions || []).reduce((a, s) => a + s.durationMs, 0) / 60000);
    return { proj, tags, units, rep6, repTotal, evs: evs.length, dims, composite, level, enough, readPages, totalPages, okCells, totCells, tagN, studyMin, sessions: (d.sessions || []).length };
  },
  weaknesses(A) {
    const P = App.content.labs.projects, out = [];
    const link = (href, label) => ({ href, label });
    Object.values(A.tags).filter((t) => t.n >= 2 && t.acc < 0.6).sort((a, b) => a.acc - b.acc).forEach((t) => {
      const pid = t.wrong[0];
      out.push({ lv: t.acc < 0.4 ? "high" : "mid", cat: "개념 이해", title: t.name, ev: `형성평가 정답률 ${Math.round(t.acc * 100)}% (${t.right}/${t.n}문항) · 틀린 프로젝트: ${[...new Set(t.wrong)].map((k) => P[k].sec + " " + P[k].name).join(", ")}`,
        why: t.desc, act: link(`#book/${P[pid].page}/s${t.step}`, `${P[pid].sec} ${P[pid].name} ${t.step}단계 다시 읽기`) });
    });
    A.units.filter((u) => u.quizAvg !== null && u.quizAvg < 60).forEach((u) => out.push({ lv: u.quizAvg < 40 ? "high" : "mid", cat: "단원 성취", title: `${u.no}. ${u.title}`,
      ev: `단원 형성평가 평균 ${u.quizAvg}점(응시 ${u.attempted}/${u.n}개 프로젝트) · 단원 수행률 ${u.done}%`, why: "단원의 핵심 알고리즘 유형을 아직 안정적으로 이해하지 못했습니다.",
      act: link(`#book/${u.id}-intro`, `${u.no}단원 도입부터 다시 보기`) }));
    A.proj.filter((p) => p.started && p.ok < p.nc && (p.runs > 0 || p.tries > 0)).forEach((p) => out.push({ lv: p.err > 0 ? "mid" : "low", cat: "실습 수행", title: `${p.sec} ${p.name}`,
      ev: `실습 셀 ${p.ok}/${p.nc} 성공${p.err ? ` · 오류로 끝난 셀 ${p.err}개` : ""} · 실행 ${p.runs}회`, why: p.err ? "코드 실행 중 오류를 해결하지 못하고 멈췄습니다." : "실습을 끝까지 수행하지 않았습니다.",
      act: link(`#lab/${p.k}`, "실습실에서 이어서 실행") }));
    A.proj.filter((p) => p.read && p.runs === 0).forEach((p) => out.push({ lv: "low", cat: "실습 수행", title: `${p.sec} ${p.name}`, ev: "교과서는 읽었지만 실습을 한 번도 실행하지 않음",
      why: "개념을 코드로 확인하는 단계를 건너뛰었습니다.", act: link(`#lab/${p.k}`, "실습 시작하기") }));
    A.proj.filter((p) => p.best !== null && p.best < 60).forEach((p) => out.push({ lv: "mid", cat: "형성평가", title: `${p.sec} ${p.name}`,
      ev: `최고 ${p.best}점 (첫 응시 ${p.first}점 · ${p.tries}회 응시)`, why: "핵심 개념 확인 문항을 절반 넘게 틀렸습니다.", act: link(`#book/${App.project(p.k).page}`, "교과서 복습 후 재응시") }));
    A.rep6.forEach((v, i) => { if (v !== null && v <= 3) out.push({ lv: v <= 2 ? "high" : "mid", cat: "탐구 보고서", title: `${i + 1}단계 ${STEP6[i]}`,
      ev: `보고서 AI 평가 ${v.toFixed(1)}/5점(평가된 보고서 ${A.evs}편 평균)`, why: "보고서에서 이 단계의 근거와 설명이 부족했습니다.", act: link("#book/u4-5", "Ⅳ단원 '6단계로 프로젝트 수행하기' 보기") }); });
    if (A.enough && A.dims.progress < 30) out.push({ lv: "mid", cat: "학습 진도", title: "전체 진도", ev: `프로젝트 수행률 ${A.dims.progress}% · 교과서 ${A.readPages}/${A.totalPages}쪽 열람 · 학습 ${A.studyMin}분`,
      why: "학습량 자체가 적어 다른 진단의 근거도 부족합니다.", act: link("#book", "교과서 이어 읽기") });
    const rank = { high: 0, mid: 1, low: 2 };
    return out.sort((a, b) => rank[a.lv] - rank[b.lv]);
  },
  strengths(A) {
    const s = [];
    Object.values(A.tags).filter((t) => t.n >= 3 && t.acc >= 0.8).forEach((t) => s.push(`${t.name}: 정답률 ${Math.round(t.acc * 100)}% (${t.right}/${t.n})`));
    A.proj.filter((p) => p.nc && p.ok === p.nc).forEach((p) => s.push(`${p.sec} ${p.name}: 실습 ${p.ok}/${p.nc}셀 모두 성공`));
    A.proj.filter((p) => p.first !== null && p.best - p.first >= 40).forEach((p) => s.push(`${p.sec} ${p.name}: 재응시로 ${p.first}→${p.best}점 향상`));
    A.rep6.forEach((v, i) => v !== null && v >= 4.5 && s.push(`보고서 ${STEP6[i]}: ${v.toFixed(1)}/5점`));
    return s.slice(0, 8);
  },
  recommend(A) {
    const P = App.content.labs.projects, order = App.order(), rec = [];
    const W = Insight.weaknesses(A);
    // 1) 보충: 가장 약한 개념 2개
    W.filter((w) => w.cat === "개념 이해").slice(0, 2).forEach((w) => rec.push({ kind: "보충", title: `개념 다시 잡기 · ${w.title}`, why: w.ev, act: w.act }));
    // 2) 마무리: 시작했지만 끝내지 못한 프로젝트
    A.proj.filter((p) => p.started && p.pct < 100).sort((a, b) => b.pct - a.pct).slice(0, 3).forEach((p) => {
      const miss = [!p.read && "교과서 읽기", p.ok < p.nc && `실습 ${p.nc - p.ok}셀`, p.best === null ? "형성평가" : p.best < 80 && "형성평가 재응시(80점 목표)", !p.rep && "보고서 제출"].filter(Boolean);
      const lab = p.read && p.ok < p.nc;
      rec.push({ kind: "마무리", title: `${p.sec} ${p.name} 마무리 (현재 ${p.pct}%)`, why: "남은 활동: " + miss.join(", "), act: lab ? { href: `#lab/${p.k}`, label: "실습 자료 열기" } : { href: `#book/${P[p.k].page}`, label: "교과서 열기" } });
    });
    // 3) 다음 프로젝트: 교과서 순서상 시작하지 않은 첫 프로젝트(단원 성취를 보고 판단)
    const next = A.proj.find((p) => !p.started);
    if (next) {
      const ui = A.units.findIndex((u) => u.id === next.unit), prevUnit = ui > 0 ? A.units[ui - 1] : null;   // 바로 앞 단원
      let why = `교과서 순서상 다음 프로젝트입니다(${next.unitNo}단원 · ${P[next.k].algo}).`;
      if (prevUnit && prevUnit.quizAvg !== null) why += prevUnit.quizAvg >= 70 ? ` 앞 단원(${prevUnit.no}) 형성평가 평균 ${prevUnit.quizAvg}점으로 넘어갈 준비가 되었습니다.` : ` 다만 앞 단원(${prevUnit.no}) 평균이 ${prevUnit.quizAvg}점이므로 위의 보충을 먼저 하는 것을 권합니다.`;
      rec.push({ kind: "다음 학습", title: `${next.unitNo} ${next.sec} ${next.name} · ${P[next.k].algo}`, why, act: { href: `#book/${P[next.k].page}`, label: "교과서에서 시작" } });
    }
    // 4) 수준별 확장
    if (A.level === "심화" || A.proj.every((p) => p.pct >= 80)) {
      const done = A.proj.filter((p) => p.ok === p.nc);
      const lab = done.length ? App.content.labs.labs[done[done.length - 1].k].cells.find((c) => c.task) : null;
      if (lab) rec.push({ kind: "심화", title: "실습 도전 과제", why: `완료한 실습의 '생각해 보기' 과제: ${lab.task}`, act: { href: `#lab/${done[done.length - 1].k}`, label: "실습실에서 도전" } });
      rec.push({ kind: "심화", title: "실제 공공 데이터로 탐구 (2-3 부캉이 프로젝트)", why: "가상 데이터를 넘어 바다누리·KODC 실제 수온 자료를 [내 데이터 올리기]로 분석해 봅니다.", act: { href: "#lab/P11", label: "실습실 열기" } });
      rec.push({ kind: "심화", title: "Ⅳ단원 모둠 프로젝트 주도하기", why: "스스로 부산 바다 문제를 찾아 6단계 계획서를 쓰고 모둠을 이끌 수준입니다.", act: { href: "#book/" + (App.pages.find((p) => p.kind === "form") || {}).id, label: "계획서 쓰기" } });
      const career = App.pages.find((p) => /도전하는 사람들/.test(p.title));
      if (career) rec.push({ kind: "진로 연계", title: "데이터 과학 진로 탐색", why: "해양·기후 데이터를 다루는 직업 이야기를 읽고 관심 분야의 심화 탐구 주제를 정해 봅니다.", act: { href: `#book/${career.id}`, label: "진로 읽기" } });
    } else if (A.level === "기초") {
      const p = A.proj.find((x) => x.pct < 100) || A.proj[0];
      rec.push({ kind: "학습 방법", title: "한 프로젝트를 끝까지: 교과서 → 실습 → 형성평가", why: `여러 프로젝트를 조금씩 하기보다 ${p.sec} ${p.name} 하나를 교과서 6단계, 실습 셀 ${p.nc}개, 형성평가 순서로 끝까지 해 봅니다.`, act: { href: `#book/${App.project(p.k).page}`, label: "시작하기" } });
    }
    return rec;
  },
  /* ---------- 화면 ---------- */
  levelBadge(l) { return `<span class="lv lv-${{ 기초: "b", 발전: "m", 심화: "a" }[l]}">${l}</span>`; },
  render(tab, d, box, uid) {
    const A = Insight.compute(d), u = d.user;
    if (!A.enough) { box.innerHTML = `<div class="card empty">아직 분석할 학습 기록이 없습니다. 학생이 교과서·실습·형성평가를 시작하면 자동으로 분석됩니다.</div>`; return; }
    const dimCard = (k, label, v, sub) => `<div class="card stat"><div class="k">${label}</div><div class="v">${v === null ? "–" : v}<small>${v === null ? "기록 없음" : "점"}</small></div><div class="small muted">${sub}</div></div>`;
    const head = `<div class="grid g4" style="margin-bottom:16px">
        ${dimCard("progress", "학습 진도(프로젝트 수행률)", A.dims.progress, `교과서 ${A.readPages}/${A.totalPages}쪽 · 학습 ${fmtDur(A.studyMin * 60000)}`)}
        ${dimCard("concept", "개념 이해(형성평가 정답률)", A.dims.concept, `${A.tagN}문항 기준(프로젝트별 최근 응시)`)}
        ${dimCard("lab", "실습 수행(코딩 성공 셀)", A.dims.lab, `${A.okCells}/${A.totCells}셀 성공`)}
        ${dimCard("report", "탐구 보고서(AI 평가 평균)", A.dims.report, `평가된 보고서 ${A.evs}편`)}
      </div>`;
    if (tab === "weak") {
      const W = Insight.weaknesses(A), S = Insight.strengths(A);
      const lvTxt = { high: "높음", mid: "보통", low: "낮음" };
      box.innerHTML = head + `
        <div class="grid g2">
          <div class="card"><h3>개념 8영역 정답률</h3><div class="chartbox" style="height:300px"><canvas id="ins-radar"></canvas></div>
            <p class="small muted">형성평가 55문항을 데이터 분석 6단계와 연결된 8개 개념 영역으로 묶어, 프로젝트별 가장 최근 응시 결과로 계산합니다.</p></div>
          <div class="card"><h3>단원별 성취</h3><div class="chartbox" style="height:300px"><canvas id="ins-unit"></canvas></div>
            <p class="small muted">막대: 단원 형성평가 평균(응시한 프로젝트) · 선: 단원 수행률(교과서·실습·형성평가·보고서 종합)</p></div>
        </div>
        <div class="card" style="margin-top:16px"><div class="row"><h3 style="margin:0">🔎 취약점 분석</h3><span class="spacer"></span><span class="small muted">우선순위가 높은 순서</span></div>
          ${W.length ? `<div class="twrap" style="margin-top:10px"><table class="t"><tr><th>우선</th><th>영역</th><th>취약점</th><th>근거</th><th>지도 방안</th></tr>
            ${W.slice(0, 12).map((w) => `<tr><td><span class="pill ${w.lv === "high" ? "bad" : w.lv === "mid" ? "warn" : "gray"}">${lvTxt[w.lv]}</span></td><td class="small">${esc(w.cat)}</td>
              <td><b>${esc(w.title)}</b><div class="small muted">${esc(w.why)}</div></td><td class="small">${esc(w.ev)}</td><td><a class="btn sm" href="${w.act.href}">${esc(w.act.label)} →</a></td></tr>`).join("")}</table></div>`
            : '<div class="empty">뚜렷한 취약점이 발견되지 않았습니다. [다음 교육과정 추천]에서 심화 과정을 확인하세요.</div>'}
        </div>
        <div class="grid g2" style="margin-top:16px">
          <div class="card"><h3>💪 강점</h3>${S.length ? `<ul class="clean">${S.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : '<div class="muted">아직 두드러진 강점을 판단할 기록이 부족합니다.</div>'}</div>
          <div class="card"><h3>보고서 6단계 역량</h3>${A.evs ? A.rep6.map((v, i) => `<div class="sbar"><span>${i + 1}. ${STEP6[i]}</span><span class="track"><i style="width:${(v || 0) * 20}%"></i></span><b>${v === null ? "–" : v.toFixed(1)}</b></div>`).join("") : '<div class="muted">AI 평가를 받은 보고서가 없습니다. [보고서 평가]에서 평가하면 단계별 역량이 표시됩니다.</div>'}</div>
        </div>
        <div class="card" style="margin-top:16px" id="aibox"><div class="row"><h3 style="margin:0">✨ AI 종합 진단 의견</h3><span class="spacer"></span><button class="btn ai sm" id="aiins">AI 진단 의견 만들기</button></div>
          <p class="small muted" style="margin:6px 0 0">위 분석 결과(이름·연락처 제외)를 인공지능에 보내 교사용 진단 의견 초안을 만듭니다. 30초~1분 걸립니다.</p><div id="aiout"></div></div>
        <div class="caution">⚠ 이 분석은 디지털 교과서에 남은 학습 기록만으로 계산한 <b>참고 자료</b>입니다. 기록이 적을수록 정확도가 낮고, 수업 중 관찰이나 대화로 확인한 내용과 다를 수 있습니다. 학생 평가·기록에 활용할 때는 반드시 교사가 판단해 주세요.</div>`;
      mkChart($("#ins-radar"), { type: "radar", data: { labels: Object.values(A.tags).map((t) => { const m = t.name.match(/^(.+?[와과]) (.+)$/); return m ? [m[1], m[2]] : t.name; }),
        datasets: [{ label: "정답률(%)", data: Object.values(A.tags).map((t) => (t.acc === null ? 0 : Math.round(t.acc * 100))), backgroundColor: "rgba(8,126,139,.18)", borderColor: "#087e8b", pointBackgroundColor: Object.values(A.tags).map((t) => (t.acc === null ? "#c4ccd2" : t.acc < 0.6 ? "#d9534f" : "#087e8b")) }] },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { min: 0, max: 100, ticks: { stepSize: 25, backdropColor: "transparent" }, pointLabels: { font: { size: 11 } } } } } });
      mkChart($("#ins-unit"), { type: "bar", data: { labels: A.units.map((u) => u.no + " " + u.title.split("·")[0].trim()),
        datasets: [{ label: "형성평가 평균", data: A.units.map((u) => u.quizAvg ?? 0), backgroundColor: A.units.map((u) => (u.quizAvg !== null && u.quizAvg < 60 ? "#e8594f" : "#0fa3b1")), borderRadius: 4 },
          { label: "단원 수행률", type: "line", data: A.units.map((u) => u.done), borderColor: "#0b3954", backgroundColor: "#0b3954", tension: .3 }] },
        options: { maintainAspectRatio: false, scales: { y: { min: 0, max: 100 } } } });
      $("#aiins").onclick = () => Insight.ai(A, uid);
    } else {
      const R = Insight.recommend(A);
      const lvDesc = { 기초: "교과서와 실습을 한 프로젝트씩 끝까지 따라가며 기본 흐름을 익히는 단계", 발전: "기본 흐름은 익혔고, 약한 개념을 보충하며 다음 단원으로 넓혀 가는 단계", 심화: "기본 과정을 안정적으로 수행하며 실제 데이터와 스스로 정한 문제로 확장할 수 있는 단계" };
      box.innerHTML = head + `
        <div class="card row" style="gap:18px;margin-bottom:16px"><div style="font-size:15px">현재 수준 ${Insight.levelBadge(A.level)}</div>
          <div style="flex:1;min-width:260px"><b>종합 ${A.composite}점</b> · ${lvDesc[A.level]}<div class="small muted">종합 점수 = 위 네 지표 가운데 기록이 있는 지표의 평균 (80점 이상 심화, 50점 이상 발전, 그 미만 기초)</div></div></div>
        <div class="card"><h3>🧭 다음 교육과정 추천</h3>
          ${R.length ? `<ol class="path">${R.map((r) => `<li><span class="pill ${{ 보충: "bad", 마무리: "warn", "다음 학습": "ok", 심화: "", "진로 연계": "", "학습 방법": "warn" }[r.kind] ?? ""}">${esc(r.kind)}</span>
            <div class="pt"><b>${esc(r.title)}</b><div class="small muted">${esc(r.why)}</div></div><a class="btn sm" href="${r.act.href}">${esc(r.act.label)} →</a></li>`).join("")}</ol>` : '<div class="empty">모든 프로젝트를 마쳤습니다. Ⅳ단원 모둠 프로젝트로 확장해 보세요.</div>'}
        </div>
        <div class="card" style="margin-top:16px"><h3>프로젝트별 수행률</h3><div class="twrap"><table class="t"><tr><th>프로젝트</th><th>수행률</th><th>교과서</th><th>실습</th><th>형성평가(최고)</th><th>보고서</th></tr>
          ${A.proj.map((p) => `<tr><td><b>${p.unitNo} ${p.sec}</b> ${esc(p.name)}</td><td style="min-width:140px"><div class="sbar" style="grid-template-columns:1fr 40px;margin:0"><span class="track"><i style="width:${p.pct}%"></i></span><b>${p.pct}%</b></div></td>
            <td>${p.read ? "✔" : "–"}</td><td>${p.ok}/${p.nc}${p.err ? ` <span class="pill bad">오류 ${p.err}</span>` : ""}</td><td>${p.best ?? "–"}${p.tries > 1 ? ` <span class="small muted">(${p.tries}회)</span>` : ""}</td><td>${p.rep ? (p.rep.eval ? p.rep.eval.total + "점" : "제출") : "–"}</td></tr>`).join("")}</table></div></div>
        <div class="caution">⚠ 추천은 학습 기록과 교과서 순서(Ⅰ 회귀 → Ⅱ 분류 → Ⅲ 비지도 → Ⅳ 프로젝트)를 바탕으로 자동 생성됩니다. 학생과 상담하며 관심 분야와 진로를 함께 고려해 조정하세요.</div>`;
    }
  },
  async ai(A, uid) {
    const b = $("#aiins"), out = $("#aiout"); b.disabled = true; b.innerHTML = '<span class="spin"></span> 진단 의견을 만드는 중…';
    const P = App.content.labs.projects;
    const profile = { 수준: A.level, 종합점수: A.composite, 지표: A.dims, 학습시간_분: A.studyMin, 접속횟수: A.sessions,
      개념영역: Object.values(A.tags).map((t) => ({ 영역: t.name, 정답률: t.acc === null ? null : Math.round(t.acc * 100), 문항수: t.n })),
      단원: A.units.map((u) => ({ 단원: u.no + " " + u.title, 형성평가평균: u.quizAvg, 수행률: u.done })),
      프로젝트: A.proj.map((p) => ({ 프로젝트: `${p.sec} ${p.name}`, 알고리즘: P[p.k].algo, 수행률: p.pct, 교과서: p.read, 실습성공셀: `${p.ok}/${p.nc}`, 오류셀: p.err, 형성평가: { 첫응시: p.first, 최고: p.best, 응시횟수: p.tries }, 보고서점수: p.rep?.eval?.total ?? null })),
      보고서6단계: A.evs ? STEP6.map((s, i) => ({ 단계: s, 점수: A.rep6[i] })) : "평가된 보고서 없음",
      자동분석_취약점: Insight.weaknesses(A).slice(0, 8).map((w) => `${w.cat}: ${w.title} (${w.ev})`) };
    try {
      const r = await API.post("/api/teacher/insight", { profile });
      if (!out.isConnected) return;
      out.innerHTML = `<div class="ai-ins"><p><b>${esc(r.summary)}</b></p>
        ${r.strengths.length ? `<label class="f">강점</label><ul class="clean">${r.strengths.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${r.weaknesses.length ? `<label class="f">취약점과 예상 원인</label><ul class="clean">${r.weaknesses.map((w) => `<li><b>${esc(w.area || "")}</b> — ${esc(w.evidence || "")}${w.why ? ` <span class="muted">(${esc(w.why)})</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${r.plan.length ? `<label class="f">다음 2주 지도 계획</label><ol class="clean">${r.plan.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
        ${r.talk ? `<label class="f">면담 때 건넬 말</label><div class="fb-text">“${esc(r.talk)}”</div>` : ""}
        <div class="small muted" style="margin-top:8px">${fmtDT(r.at)} · ${esc(r.model || "")} · AI 초안이므로 교사가 검토해 활용하세요.</div></div>`;
      b.textContent = "다시 만들기"; b.disabled = false;
    } catch (e) { if (out.isConnected) { out.innerHTML = `<div class="err">${esc(/없는 주소/.test(e.message) ? "Code.gs를 새 판으로 바꿔 붙여 넣고 새 버전으로 배포해야 AI 진단을 쓸 수 있습니다." : e.message)}</div>`; b.textContent = "AI 진단 의견 만들기"; b.disabled = false; } }
  },
};
