/* 실습실: 브라우저 파이썬(Pyodide)으로 프로젝트 코드 단계별 실행 */
"use strict";
const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.2/full/";
const PY_HELPER = `
import matplotlib
matplotlib.use("Agg")
from matplotlib import font_manager
try:
    font_manager.fontManager.addfont("/home/pyodide/NanumGothic.ttf")
except Exception:
    pass
import matplotlib.pyplot as plt, io, base64, ast, sys, traceback, json, logging
logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
_FIGS = []
def _show(*a, **k):
    for n in plt.get_fignums():
        f = plt.figure(n); b = io.BytesIO()
        f.savefig(b, format="png", dpi=96, bbox_inches="tight")
        _FIGS.append(base64.b64encode(b.getvalue()).decode())
    plt.close("all")
plt.show = _show
_NS = {}
def _reset(setup):
    global _NS
    _NS = {"__name__": "__main__"}
    exec(setup, _NS)
    _NS["plt"].show = _show
def _run(code):
    global _FIGS
    _FIGS = []
    out = io.StringIO(); res = {"html": None, "text": None, "error": None}
    old = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    try:
        tree = ast.parse(code); last = None
        if tree.body and isinstance(tree.body[-1], ast.Expr):
            last = ast.Expression(tree.body.pop().value)
        exec(compile(tree, "<셀>", "exec"), _NS)
        if last is not None:
            v = eval(compile(last, "<셀>", "eval"), _NS)
            if v is not None:
                if hasattr(v, "to_frame") and hasattr(v, "name"):
                    v = v.to_frame()
                if hasattr(v, "to_html"):
                    res["html"] = v.to_html(max_rows=30, max_cols=20)
                else:
                    res["text"] = repr(v)
        _show()
    except Exception as e:
        tb = traceback.extract_tb(e.__traceback__)
        line = next((f.lineno for f in reversed(tb) if f.filename == "<셀>"), None)
        res["error"] = {"type": type(e).__name__, "msg": str(e), "line": line}
        plt.close("all")
    finally:
        sys.stdout, sys.stderr = old
    res["stdout"] = out.getvalue()[:60000]; res["figs"] = _FIGS
    return json.dumps(res)
`;
const ERR_HELP = {
  NameError: "아직 만들어지지 않은 변수를 사용했습니다. 위쪽 셀을 먼저 실행했는지 확인하세요. ('위 셀 모두 실행' 단추)",
  KeyError: "표에 없는 열 이름을 썼습니다. 열 이름의 철자와 띄어쓰기를 확인하세요.",
  SyntaxError: "문법 오류입니다. 괄호·따옴표·콜론(:)·들여쓰기를 확인하세요.",
  IndentationError: "들여쓰기 오류입니다. 같은 블록의 줄은 같은 칸만큼 들여 써야 합니다.",
  ValueError: "값의 형식이 맞지 않습니다. 숫자가 필요한 곳에 글자가 있거나 결측값이 남아 있는지 확인하세요.",
  TypeError: "자료형이 맞지 않습니다. 함수에 넘긴 값의 종류를 확인하세요.",
  FileNotFoundError: "파일을 찾지 못했습니다. 파일 경로(data/ 또는 data3/)를 확인하세요.",
  AttributeError: "그 객체에는 없는 기능을 불렀습니다. 이름의 철자를 확인하세요.",
};
const Lab = {
  py: null, loading: null, curPid: null, status: "idle", statusMsg: "파이썬 준비 전",
  setStatus(s, msg) { Lab.status = s; Lab.statusMsg = msg; const el = $("#pystatus"); if (el) { el.className = "pystatus " + s; el.textContent = msg; } },
  loadScript(src) { return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("스크립트를 불러오지 못했습니다: " + src)); document.head.appendChild(s); }); },
  async ensure() {
    if (Lab.py) return Lab.py;
    if (Lab.loading) return Lab.loading;
    Lab.loading = (async () => {
      try {
        Lab.setStatus("busy", "파이썬 엔진 내려받는 중… (처음 한 번 30초~1분)");
        if (!window.loadPyodide) await Lab.loadScript(PYODIDE_URL + "pyodide.js");
        const py = await loadPyodide({ indexURL: PYODIDE_URL });
        Lab.setStatus("busy", "pandas · scikit-learn · matplotlib 설치 중…");
        await py.loadPackage(["numpy", "pandas", "scikit-learn", "matplotlib"]);
        try { const f = await (await fetch("font/NanumGothic.ttf")).arrayBuffer(); py.FS.writeFile("/home/pyodide/NanumGothic.ttf", new Uint8Array(f)); } catch (e) {}
        py.runPython(PY_HELPER);
        Lab.py = py; Lab.setStatus("ready", "파이썬 준비 완료");
        return py;
      } catch (e) { Lab.loading = null; Lab.setStatus("fail", "파이썬을 불러오지 못했습니다. 인터넷 연결을 확인하세요."); throw e; }
    })();
    return Lab.loading;
  },
  async prepare(pid) {
    const py = await Lab.ensure();
    if (Lab.curPid === pid) return py;
    Lab.setStatus("busy", "실습 데이터 불러오는 중…");
    for (const d of ["data", "data3"]) { try { py.FS.mkdir("/home/pyodide/" + d); } catch (e) {} }
    for (const f of App.project(pid).data) {
      const buf = await (await Files.blob("files/" + f.split("/").map(encodeURIComponent).join("/"))).arrayBuffer();
      py.FS.writeFile("/home/pyodide/" + f, new Uint8Array(buf));
    }
    py.globals.get("_reset")(App.content.labs.setup);
    Lab.curPid = pid; Lab.setStatus("ready", "파이썬 준비 완료 · " + App.project(pid).name);
    return py;
  },
  key: (pid, i) => `code:${App.user.id}:${pid}:${i}`,
  index() {
    const P = App.content.labs.projects;
    App.shell("lab", `<h1 class="title">실습실</h1><p class="sub">프로젝트를 고르면 3단계(전처리)부터 6단계(공유)까지의 파이썬 코드를 브라우저에서 바로 실행할 수 있습니다. 설치할 프로그램은 없습니다.</p>
      <div class="grid g3">${App.order().map((k) => `<a class="card pcard" href="#lab/${k}" style="text-decoration:none;color:inherit">
        <div class="img" style="background-image:url(fig/${k.toLowerCase()}_story.png)"><span class="tag">${P[k].unitNo} ${P[k].sec}</span></div>
        <div class="body"><b>${esc(P[k].name)}</b><span class="q">${esc(P[k].algo)} · 셀 ${App.content.labs.labs[k].cells.length}개</span></div></a>`).join("")}</div>`);
  },
  async render(pid) {
    if (!pid || !App.project(pid)) return Lab.index();
    const P = App.project(pid), L = App.content.labs.labs[pid];
    const main = App.shell("lab", `
      <div class="crumb"><a href="#lab">실습실</a> › ${P.unitNo} ${P.sec}</div>
      <div class="lab-head"><h1 class="title" style="margin:0">💻 ${esc(P.name)} <span class="muted" style="font-size:17px;font-weight:500">· ${esc(P.algo)}</span></h1></div>
      <div class="lab-head"><span id="pystatus" class="pystatus ${Lab.status}">${esc(Lab.statusMsg)}</span>
        <button class="btn primary" id="runall">▶ 처음부터 모두 실행</button><button class="btn" id="resetall">↺ 처음 코드로 되돌리기</button>
        <a class="btn" href="#book/${P.page}/s3">📖 교과서 보기</a><a class="btn" href="#data/${pid}">🗂 데이터 받기</a>
        ${App.user.role === "student" ? `<a class="btn" href="#quiz/${pid}">📝 형성평가</a>` : ""}</div>
      <div class="card" style="padding:12px 16px;font-size:14px">실습 데이터: ${P.data.map((d) => `<code>${esc(d)}</code>`).join(" ")} <span class="muted">(수업용 가상 데이터)</span><br>
        <span class="muted">코드를 고쳐 실행해 보세요. 고친 코드는 이 기기에 자동 저장됩니다. Ctrl+Enter로 셀을 실행할 수 있습니다.</span></div>
      <div id="cells">${L.cells.map((c, i) => `
        <section class="cell" data-i="${i}">
          <div class="ch"><span class="st">${c.step}단계</span><b>${esc(c.title)}</b><span class="spacer"></span><span class="small muted">셀 ${i + 1}/${L.cells.length}</span></div>
          <div class="guide">${esc(c.guide)}</div>
          <textarea class="editor" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>
          <div class="bar"><button class="btn primary sm" data-run>▶ 실행</button><button class="btn sm" data-upto>위 셀 모두 실행</button><button class="btn sm" data-reset>원래 코드</button><span class="small muted" data-st></span></div>
          ${c.task ? `<div class="task">🤔 <b>생각해 보기</b> ${esc(c.task)}</div>` : ""}
          <div class="out"></div>
        </section>`).join("")}</div>`);
    $$(".cell", main).forEach((el) => {
      const i = +el.dataset.i, ta = $("textarea", el);
      ta.value = LS.get(Lab.key(pid, i), L.cells[i].code);
      const fit = () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight + 4, 640) + "px"; };
      ta.oninput = () => { LS.set(Lab.key(pid, i), ta.value); fit(); };
      ta.onkeydown = (e) => {
        if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); ta.oninput(); }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); Lab.run(pid, i); }
      };
      setTimeout(fit, 0);
      $("[data-run]", el).onclick = () => Lab.run(pid, i);
      $("[data-upto]", el).onclick = () => Lab.runUpTo(pid, i);
      $("[data-reset]", el).onclick = () => { ta.value = L.cells[i].code; LS.set(Lab.key(pid, i), ta.value); fit(); toast("원래 코드로 되돌렸습니다."); };
    });
    $("#runall").onclick = () => Lab.runUpTo(pid, L.cells.length - 1);
    $("#resetall").onclick = async () => { if (!(await confirmBox("이 프로젝트의 모든 셀을 원래 코드로 되돌릴까요?"))) return;
      L.cells.forEach((c, i) => LS.set(Lab.key(pid, i), c.code)); Lab.curPid = null; Lab.render(pid); };
    Lab.ensure().catch(() => {});
  },
  busy: false,
  async runUpTo(pid, last) {
    for (let i = 0; i <= last; i++) { const ok = await Lab.run(pid, i, true); if (!ok) break; }
  },
  async run(pid, i, quiet) {
    if (Lab.busy) { toast("다른 셀이 실행 중입니다."); return false; }
    const el = $(`.cell[data-i="${i}"]`); if (!el) return false;
    const out = $(".out", el), st = $("[data-st]", el), code = $("textarea", el).value;
    Lab.busy = true; st.innerHTML = '<span class="spin"></span> 실행 중…'; $$("[data-run],[data-upto],#runall").forEach((b) => (b.disabled = true));
    let ok = false;
    try {
      const py = await Lab.prepare(pid);
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      const res = JSON.parse(py.globals.get("_run")(code));
      const sec = ((performance.now() - t0) / 1000).toFixed(1);
      let h = "";
      if (res.stdout) h += `<pre>${esc(res.stdout)}</pre>`;
      if (res.html) h += `<div class="df">${res.html}</div>`;
      if (res.text) h += `<pre>${esc(res.text)}</pre>`;
      for (const f of res.figs) h += `<img alt="실행 결과 그래프" src="data:image/png;base64,${f}">`;
      if (res.error) {
        const e = res.error;
        h += `<pre class="e">${esc(e.type)}${e.line ? ` (${e.line}번째 줄)` : ""}: ${esc(e.msg)}</pre>${ERR_HELP[e.type] ? `<div class="hint">💡 ${ERR_HELP[e.type]}</div>` : ""}`;
        st.textContent = "오류"; ok = false;
      } else { st.textContent = `완료 (${sec}초)`; ok = true; }
      out.innerHTML = h || '<span class="small muted">(출력 없음)</span>'; out.classList.add("show");
      Activity.lab(pid, i, ok);
    } catch (e) {
      out.innerHTML = `<pre class="e">${esc(e.message || e)}</pre>`; out.classList.add("show"); st.textContent = "실패";
    } finally { Lab.busy = false; $$("[data-run],[data-upto],#runall").forEach((b) => (b.disabled = false)); }
    return ok;
  },
};
