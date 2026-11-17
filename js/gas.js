/* GitHub Pages판: 구글 Apps Script 백엔드 연결, 교사 자료 복호화 */
"use strict";
const GAS = {
  TK: "bada-token",
  token() { try { return localStorage.getItem(GAS.TK) || ""; } catch (e) { return GAS._t || ""; } },
  setToken(t) { GAS._t = t || ""; try { t ? localStorage.setItem(GAS.TK, t) : localStorage.removeItem(GAS.TK); } catch (e) {} },
  async send(payload) {
    const r = await fetch(window.BADA_CONFIG.apiUrl, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) });
    if (!r.ok) throw new Error("학습 기록 서버(구글 Apps Script) 응답 오류: " + r.status);
    return r.json();
  },
  async req(method, path, body) {
    const payload = { method, path, body: body || {}, token: GAS.token() };
    let j;
    try { j = await GAS.send(payload); }
    catch (e) {
      await new Promise((ok) => setTimeout(ok, 1500)); // 동시 접속이 몰릴 때 한 번 더 시도
      try { j = await GAS.send(payload); } catch (e2) { throw new Error("학습 기록 서버(구글 Apps Script)에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요."); }
    }
    if (j.error) {
      const e = new Error(j.error); e.status = j.status;
      if (j.status === 401) { GAS.setToken(null); if (App.user && path !== "/api/logout") Auth.expired(); }
      throw e;
    }
    if (j.token) GAS.setToken(j.token);
    if (path === "/api/logout") GAS.setToken(null);
    return j.data;
  },
};
const Crypt = {
  key: null,
  async getKey() {
    if (Crypt.key) return Crypt.key;
    const r = await API.get("/api/teacher/key");
    const raw = Uint8Array.from(atob(r.key), (c) => c.charCodeAt(0));
    return (Crypt.key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]));
  },
  async open(url) {
    const res = await fetch(url.split("/").map((s, i) => (i ? encodeURIComponent(s) : s)).join("/"));
    if (!res.ok) throw new Error("교사 자료를 찾지 못했습니다.");
    const buf = new Uint8Array(await res.arrayBuffer());
    try { return await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.slice(0, 12) }, await Crypt.getKey(), buf.slice(12)); }
    catch (e) { throw new Error("교사 자료를 열지 못했습니다. Apps Script 코드(Code.gs)가 이 웹앱과 같은 판인지 확인하세요."); }
  },
};
