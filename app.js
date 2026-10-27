/* =========================================================
   63 OFFICE LIFE with SOORI — 동작 코드
   평소에는 수정할 필요가 없습니다.
   · 문구 → content.js   · 파츠 → parts.json + parts 폴더
   · 로고/버튼 그림 → design 폴더   · 갤러리 연결 → firebase-config.js
   ========================================================= */
const T = window.CONTENT || {};
const $ = s => document.querySelector(s);
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const FB_VERSION = "10.12.2";

/* ---------- 방문 통계 (GA4) — 측정 ID는 analytics-config.js ---------- */
const GA_ID = String(window.GA_MEASUREMENT_ID || "").trim();
const NO_TRACK = new URLSearchParams(location.search).has("admin");   // 관리자 방문 제외
function initAnalytics() {
  if (!GA_ID || NO_TRACK) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID, { send_page_view: false });
  const s = document.createElement("script"); s.async = true;
  s.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(GA_ID);
  document.head.appendChild(s);
}
function track(name, params) { try { if (GA_ID && !NO_TRACK && window.gtag) window.gtag("event", name, params || {}); } catch {} }
const VIEW_TITLES = { intro1: "인트로1", intro2: "인트로2", intro3: "인트로3", main: "꾸미기", gallery: "갤러리" };

/* ---------- 문구 채우기 ---------- */
function applyContent() {
  document.querySelectorAll("[data-text]").forEach(el => { const v = T[el.dataset.text]; if (typeof v === "string") el.textContent = v; });
  document.querySelectorAll("[data-placeholder]").forEach(el => { const v = T[el.dataset.placeholder]; if (typeof v === "string") el.placeholder = v; });
  document.querySelectorAll("[data-lines]").forEach(el => {
    const v = T[el.dataset.lines], lines = Array.isArray(v) ? v : (typeof v === "string" ? [v] : []);
    el.replaceChildren(...lines.map(s => { const sp = document.createElement("span"); sp.textContent = s; return sp; }));
  });
}

/* ---------- 디자인 SVG 불러오기 (같은 파일을 여러 번 써도 충돌 없게 id 변경) ---------- */
const svgCache = {};
const getSvg = url => svgCache[url] || (svgCache[url] = fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.text(); }));
let svgSeq = 0;
async function inlineSvgs() {
  await Promise.all([...document.querySelectorAll("[data-svg]")].map(async el => {
    try {
      let s = await getSvg(el.dataset.svg), p = "s" + (++svgSeq) + "_";
      s = s.replace(/id="([^"]+)"/g, `id="${p}$1"`).replace(/url\(#([^)]+)\)/g, `url(#${p}$1)`);
      el.innerHTML = s;
    } catch { el.textContent = ""; }
  }));
}

/* ---------- 파츠 불러오기 (그림 영역·클릭 판정은 자동 계산) ---------- */
let C = 513, FACE_RANK = 2, PARTS = [], DRAG = {}, ASSETS = {};
const imgCache = {};
const loadImg = src => imgCache[src] || (imgCache[src] = new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => { delete imgCache[src]; rej(new Error(src)); }; i.src = src; }));
async function loadParts() {
  const m = await (await fetch("parts.json", { cache: "no-cache" })).json();
  C = m.canvas || 513; FACE_RANK = m.faceLayer || 2;
  ASSETS.base = m.base;
  const cv = document.createElement("canvas"); cv.width = cv.height = C;
  const g = cv.getContext("2d", { willReadFrequently: true });
  for (const cat of m.categories) {
    PARTS.push({ key: cat.key, label: cat.label });
    if (!cat.fixed) DRAG[cat.key] = { rank: cat.layer || 4 };
    ASSETS[cat.key] = {};
    await Promise.all(cat.files.map(async f => {
      const src = `parts/${cat.key}/${f}`;
      try {
        const img = await loadImg(src);
        g.clearRect(0, 0, C, C); g.drawImage(img, 0, 0, C, C);
        const d = g.getImageData(0, 0, C, C).data, a = new Uint8Array(C * C);
        let x0 = C, y0 = C, x1 = 0, y1 = 0;
        for (let p = 0; p < C * C; p++) { const v = d[p * 4 + 3]; a[p] = v; if (v > 40) { const x = p % C, y = (p / C) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
        if (x1 < x0) { x0 = y0 = 0; x1 = y1 = C; }
        ASSETS[cat.key][f.replace(/\.[^.]+$/, "")] = { src, box: [x0, y0, x1 + 1, y1 + 1], mask: a };
      } catch { console.warn("파츠를 불러오지 못했어요:", src); }
    }));
    // parts.json에 적힌 순서대로 정렬
    const ordered = {};
    for (const f of cat.files) { const id = f.replace(/\.[^.]+$/, ""); if (ASSETS[cat.key][id]) ordered[id] = ASSETS[cat.key][id]; }
    ASSETS[cat.key] = ordered;
  }
}

/* ---------- 조합 데이터 ---------- */
const MAX_ITEMS = 30;
const rankOf = it => it.c === "face" ? FACE_RANK : DRAG[it.c].rank;
let uidSeq = 0; const newUid = () => "u" + (++uidSeq);
const firstKey = o => Object.keys(o)[0];
const defaultRecipe = () => ({ eyes: firstKey(ASSETS.eyes), mouth: firstKey(ASSETS.mouth), items: [{ c: "face", uid: "face" }] });
const clone = r => JSON.parse(JSON.stringify(r));
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function insertIndex(items, rank) { let idx = 0; items.forEach((it, i) => { if (rankOf(it) <= rank) idx = i + 1; }); return idx; }
function sanitize(r) {
  const out = defaultRecipe(); out.items = [];
  if (!r || typeof r !== "object") { out.items.push({ c: "face", uid: "face" }); return out; }
  if (typeof r.eyes === "string" && ASSETS.eyes[r.eyes]) out.eyes = r.eyes;
  if (typeof r.mouth === "string" && ASSETS.mouth[r.mouth]) out.mouth = r.mouth;
  let face = false;
  if (Array.isArray(r.items)) for (const it of r.items) {
    if (!it || typeof it !== "object" || out.items.length >= 40) continue;
    if (it.c === "face") { if (!face) { face = true; out.items.push({ c: "face", uid: "face" }); } continue; }
    if (!DRAG[it.c] || typeof it.k !== "string" || !ASSETS[it.c][it.k]) continue;   // 삭제된 파츠는 건너뜀
    const b = ASSETS[it.c][it.k].box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    out.items.push({ c: it.c, k: it.k, uid: newUid(), x: clampN(Number.isFinite(it.x) ? it.x : 0, -cx, C - cx), y: clampN(Number.isFinite(it.y) ? it.y : 0, -cy, C - cy) });
  }
  if (!face) out.items.splice(insertIndex(out.items, FACE_RANK), 0, { c: "face", uid: "face" });
  return out;
}
const serialize = r => ({ eyes: r.eyes, mouth: r.mouth,
  items: r.items.map(it => it.c === "face" ? { c: "face" } : { c: it.c, k: it.k, x: Math.round(it.x), y: Math.round(it.y) }) });

/* =========================================================
   갤러리 저장소 (Firebase Firestore). 설정이 비어 있으면 미리보기 모드
   ========================================================= */
const GalleryStore = {
  mode: "local", fb: null, db: null, uid: null, email: null, isAdmin: false, authMod: null, auth: null, cursor: null, hasMore: false, _local: [],
  async init() {
    const cfg = window.FIREBASE_CONFIG || {};
    if (!cfg.apiKey || !cfg.projectId) { this.uid = "local-me"; return "local"; }
    try {
      const base = `https://www.gstatic.com/firebasejs/${FB_VERSION}/`;
      const [app, auth, fs] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
      const a = app.initializeApp(cfg);
      this.fb = fs; this.db = fs.getFirestore(a);
      const au = auth.getAuth(a); this.authMod = auth; this.auth = au;
      await (au.authStateReady ? au.authStateReady() : Promise.resolve());
      if (!au.currentUser) await auth.signInAnonymously(au);   // 브라우저별 익명 ID (내 게시물 삭제용)
      this.setUser(au.currentUser); this.mode = "shared";
    } catch (e) { console.error("Firebase 연결 실패", e); this.uid = "local-me"; this.mode = "local"; }
    return this.mode;
  },
  setUser(u) {
    this.uid = u ? u.uid : null;
    this.email = u && !u.isAnonymous ? (u.email || "") : null;
    const admins = (window.ADMIN_EMAILS || []).map(e => String(e).trim().toLowerCase());
    this.isAdmin = !!(this.email && u.emailVerified && admins.includes(this.email.toLowerCase()));
  },
  /* 관리자 전용: 구글 계정 로그인 / 로그아웃 */
  async adminLogin() {
    const { GoogleAuthProvider, signInWithPopup } = this.authMod;
    const cred = await signInWithPopup(this.auth, new GoogleAuthProvider());
    this.setUser(cred.user);
  },
  async adminLogout() {
    await this.authMod.signOut(this.auth);
    const cred = await this.authMod.signInAnonymously(this.auth);
    this.setUser(cred.user);
  },
  async loadPage(reset) {
    const size = window.GALLERY_PAGE_SIZE || 30;
    if (this.mode === "local") { this.hasMore = false; return this._local.slice(); }
    const { collection, query, orderBy, limit, startAfter, getDocs } = this.fb;
    if (reset) this.cursor = null;
    const parts = [collection(this.db, "gallery"), orderBy("createdAt", "desc")];
    if (this.cursor) parts.push(startAfter(this.cursor));
    parts.push(limit(size));
    const snap = await getDocs(query(...parts));
    if (snap.docs.length) this.cursor = snap.docs[snap.docs.length - 1];
    this.hasMore = snap.docs.length === size;
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  /* 이 브라우저(익명 ID)로 올린 수리만 — 내 게시물 수만큼만 읽음 */
  async loadMine() {
    if (this.mode === "local") return this._local.filter(p => p.authorId === this.uid);
    const { collection, query, where, limit, getDocs } = this.fb;
    const snap = await getDocs(query(collection(this.db, "gallery"), where("authorId", "==", this.uid), limit(60)));
    const ms = v => (v && typeof v.toMillis === "function") ? v.toMillis() : (Date.parse(v) || 0);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  },
  /* 관리자 전용: 전체 게시물 (오래된 순, 500개씩 나눠 읽기 — 게시물 수만큼 읽기 발생) */
  async loadAll() {
    if (this.mode === "local") return this._local.slice().reverse();
    const { collection, query, orderBy, limit, startAfter, getDocs } = this.fb;
    let out = [], last = null;
    while (true) {
      const parts = [collection(this.db, "gallery"), orderBy("createdAt", "asc")];
      if (last) parts.push(startAfter(last));
      parts.push(limit(500));
      const snap = await getDocs(query(...parts));
      out = out.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (snap.docs.length < 500) break;
      last = snap.docs[snap.docs.length - 1];
    }
    return out;
  },
  async add(post) {
    if (this.mode === "local") { const p = { id: "local-" + Date.now(), ...post, createdAt: new Date() }; this._local.unshift(p); return p; }
    const { collection, addDoc, serverTimestamp } = this.fb;
    const ref = await addDoc(collection(this.db, "gallery"), { ...post, createdAt: serverTimestamp() });
    return { id: ref.id, ...post, createdAt: new Date() };
  },
  async remove(id) {
    if (this.mode === "local") { this._local = this._local.filter(p => p.id !== id); return; }
    const { doc, deleteDoc } = this.fb;
    await deleteDoc(doc(this.db, "gallery", id));
  },
};

/* =========================================================
   화면
   ========================================================= */
let recipe, selected = null, hist = [], fut = [], activeTab = "eyes", posts = [];

function layers(r) {
  const out = [{ src: ASSETS.base, x: 0, y: 0 }];
  for (const it of r.items) {
    if (it.c === "face") { out.push({ src: ASSETS.eyes[r.eyes].src, x: 0, y: 0 }); out.push({ src: ASSETS.mouth[r.mouth].src, x: 0, y: 0 }); }
    else out.push({ src: ASSETS[it.c][it.k].src, x: it.x, y: it.y, uid: it.uid });
  }
  return out;
}
function suriEl(r) {
  const w = document.createElement("div"); w.className = "suri";
  for (const l of layers(r)) {
    const i = new Image(); i.src = l.src; i.alt = ""; i.draggable = false;
    if (l.x || l.y) i.style.transform = `translate(${l.x / C * 100}%, ${l.y / C * 100}%)`;
    if (l.uid) i.dataset.uid = l.uid;
    w.appendChild(i);
  }
  return w;
}

/* ---------- 상태 변경 + 기록 ---------- */
function change(fn, pop = false) { hist.push(clone(recipe)); if (hist.length > 60) hist.shift(); fut = []; fn(); refresh(pop); }
function refresh(pop) { if (selected && !recipe.items.some(i => i.uid === selected)) selected = null; renderStage(pop); renderOptions(); updateTools(); }
const itemBy = uid => recipe.items.find(i => i.uid === uid);
function renderStage(pop) {
  const el = suriEl(recipe); $("#stageSuri").replaceChildren(el);
  if (pop && !reduceMotion()) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 300, easing: "ease-out" });
  renderSel();
}
function renderSel() {
  const box = $("#selBox"), it = selected && itemBy(selected);
  if (!it) { box.hidden = true; return; }
  const b = ASSETS[it.c][it.k].box, pad = 8; box.hidden = false;
  box.style.left = ((b[0] + it.x - pad) / C * 100) + "%"; box.style.top = ((b[1] + it.y - pad) / C * 100) + "%";
  box.style.width = ((b[2] - b[0] + pad * 2) / C * 100) + "%"; box.style.height = ((b[3] - b[1] + pad * 2) / C * 100) + "%";
}
function updateTools() {
  const idx = selected ? recipe.items.findIndex(i => i.uid === selected) : -1;
  $("#tUndo").disabled = !hist.length; $("#tRedo").disabled = !fut.length;
  $("#tDelete").disabled = idx < 0; $("#tFwd").disabled = idx < 0 || idx === recipe.items.length - 1; $("#tBack").disabled = idx <= 0;
}

/* ---------- 탭 / 파츠 ---------- */
function renderTabs() {
  const t = $("#tabs"); t.replaceChildren();
  t.style.gridTemplateColumns = `repeat(${PARTS.length},1fr)`;
  for (const p of PARTS) {
    const b = document.createElement("button"); b.className = "tab"; b.setAttribute("role", "tab"); b.textContent = p.label;
    b.setAttribute("aria-selected", String(p.key === activeTab));
    b.addEventListener("click", () => { activeTab = p.key; renderTabs(); renderOptions(); $("#options").scrollTop = 0; });
    t.appendChild(b);
  }
}
function partThumb(a) {
  const [x0, y0, x1, y1] = a.box, span = Math.max(x1 - x0, y1 - y0) / C, zoom = Math.min(0.72 / span, 4.5);
  const cx = (x0 + x1) / 2 / C, cy = (y0 + y1) / 2 / C;
  const img = new Image(); img.src = a.src; img.alt = ""; img.draggable = false; img.className = "part";
  img.style.width = img.style.height = (zoom * 100) + "%"; img.style.left = (50 - cx * zoom * 100) + "%"; img.style.top = (50 - cy * zoom * 100) + "%";
  return img;
}
function renderOptions() {
  const box = $("#options"); box.replaceChildren();
  const part = PARTS.find(p => p.key === activeTab), cfg = DRAG[part.key];
  box.setAttribute("aria-label", part.label + " 고르기");
  if (cfg) {
    const has = recipe.items.some(i => i.c === part.key);
    const n = document.createElement("button"); n.className = "opt none"; n.textContent = "없음";
    n.setAttribute("aria-label", part.label + " 모두 빼기"); n.setAttribute("aria-pressed", String(!has));
    n.addEventListener("click", () => { if (has) change(() => { recipe.items = recipe.items.filter(i => i.c !== part.key); }); });
    box.appendChild(n);
  }
  Object.entries(ASSETS[part.key]).forEach(([id, a], i) => {
    const b = document.createElement("button"); b.className = "opt";
    const n = cfg ? recipe.items.filter(it => it.c === part.key && it.k === id).length : (recipe[part.key] === id ? 1 : 0);
    b.setAttribute("aria-label", part.label + " " + (i + 1) + (n > 1 ? ", " + n + "개 추가됨" : ""));
    b.setAttribute("aria-pressed", String(n > 0)); b.appendChild(partThumb(a));
    if (n > 1) { const cnt = document.createElement("span"); cnt.className = "cnt"; cnt.textContent = n; b.appendChild(cnt); }
    b.addEventListener("click", () => {
      track(cfg ? "part_add" : "part_select", { category: part.key, part: id });
      cfg ? addItem(part.key, id) : (recipe[part.key] !== id && change(() => { recipe[part.key] = id; }, true));
    });
    box.appendChild(b);
  });
}
function addItem(c, k) {
  if (recipe.items.filter(i => i.c !== "face").length >= MAX_ITEMS) { toast(T.toast_limit); return; }
  change(() => {
    const dup = recipe.items.filter(i => i.c === c && i.k === k).length;
    const it = { c, k, x: dup * 18, y: dup * 18, uid: newUid() }; clampItem(it);
    recipe.items.splice(insertIndex(recipe.items, DRAG[c].rank), 0, it); selected = it.uid;
  }, true);
}

/* ---------- 편집 도구 ---------- */
function undo() { if (!hist.length) return; fut.push(clone(recipe)); recipe = hist.pop(); refresh(false); }
function redo() { if (!fut.length) return; hist.push(clone(recipe)); recipe = fut.pop(); refresh(false); }
function resetAll() {
  const d = defaultRecipe();
  if (recipe.items.length === 1 && recipe.eyes === d.eyes && recipe.mouth === d.mouth) return;
  change(() => { recipe = defaultRecipe(); selected = null; }); toast(T.toast_reset);
}
function delSel() { if (!selected) return; change(() => { recipe.items = recipe.items.filter(i => i.uid !== selected); selected = null; }); }
function move(dir) {
  const i = recipe.items.findIndex(x => x.uid === selected), j = i + dir;
  if (i < 0 || j < 0 || j >= recipe.items.length) return;
  change(() => { const a = recipe.items; [a[i], a[j]] = [a[j], a[i]]; });
}

/* ---------- 캔버스 선택·드래그 ---------- */
function hitsItem(it, px, py, pad) {
  const a = ASSETS[it.c][it.k], b = a.box, lx = px - it.x, ly = py - it.y;
  if (lx < b[0] - pad || lx > b[2] + pad || ly < b[1] - pad || ly > b[3] + pad) return false;
  for (let dy = -pad; dy <= pad; dy += 4) for (let dx = -pad; dx <= pad; dx += 4) {
    const x = Math.round(lx + dx), y = Math.round(ly + dy);
    if (x >= 0 && y >= 0 && x < C && y < C && a.mask[y * C + x] > 40) return true;
  }
  return false;
}
function hitTest(px, py) {
  const cur = selected && itemBy(selected);
  if (cur) { const b = ASSETS[cur.c][cur.k].box, lx = px - cur.x, ly = py - cur.y;
    if (lx >= b[0] - 14 && lx <= b[2] + 14 && ly >= b[1] - 14 && ly <= b[3] + 14) return cur; }
  for (let i = recipe.items.length - 1; i >= 0; i--) { const it = recipe.items[i]; if (it.c !== "face" && hitsItem(it, px, py, 12)) return it; }
  return null;
}
function toCanvas(e) { const r = $("#stage").getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * C, y: (e.clientY - r.top) / r.height * C }; }
function setItemTransform(it) { const img = $("#stageSuri").querySelector(`img[data-uid="${it.uid}"]`); if (img) img.style.transform = `translate(${it.x / C * 100}%, ${it.y / C * 100}%)`; renderSel(); }
function clampItem(it) { const b = ASSETS[it.c][it.k].box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2; it.x = clampN(it.x, -cx, C - cx); it.y = clampN(it.y, -cy, C - cy); }
let drag = null, lastNudge = 0;
function bindStage() {
  const stage = $("#stage");
  stage.addEventListener("pointerdown", e => {
    if (e.button !== undefined && e.button !== 0) return;
    const p = toCanvas(e), it = hitTest(p.x, p.y);
    if (!it) { selected = null; renderSel(); updateTools(); return; }
    selected = it.uid; drag = { it, sx: p.x, sy: p.y, ox: it.x, oy: it.y, moved: false, snap: clone(recipe), id: e.pointerId };
    stage.setPointerCapture(e.pointerId); renderSel(); updateTools();
  });
  stage.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    const p = toCanvas(e), dx = p.x - drag.sx, dy = p.y - drag.sy;
    if (!drag.moved) { if (Math.hypot(dx, dy) < 4) return; drag.moved = true; hist.push(drag.snap); if (hist.length > 60) hist.shift(); fut = []; stage.classList.add("dragging"); }
    drag.it.x = drag.ox + dx; drag.it.y = drag.oy + dy; clampItem(drag.it); setItemTransform(drag.it);
  });
  const endDrag = e => { if (!drag || (e && e.pointerId !== drag.id)) return; drag = null; stage.classList.remove("dragging"); updateTools(); };
  stage.addEventListener("pointerup", endDrag); stage.addEventListener("pointercancel", endDrag);
  stage.addEventListener("keydown", e => {
    const it = selected && itemBy(selected);
    if (e.key === "Escape") { selected = null; renderSel(); updateTools(); return; }
    if (!it) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); delSel(); return; }
    const step = e.shiftKey ? 16 : 4, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return; e.preventDefault();
    if (Date.now() - lastNudge > 700) { hist.push(clone(recipe)); fut = []; } lastNudge = Date.now();
    it.x += d[0]; it.y += d[1]; clampItem(it); setItemTransform(it); updateTools();
  });
}

/* ---------- 인트로 (3장면) ----------
   인트로1: 대화창 등장 → 타자 효과 / 인트로2: 카드 5장 등장 → 대화창 타자 / 인트로3: 사원증이 떨어지고 수리·버튼 등장
   화면을 누르면: 진행 중이면 바로 완성, 다 나왔으면 다음 장면으로 */
const TYPE_MODE = "jamo";      // "jamo" = 자모 조합(ㅇ→어→얼), "char" = 한 글자씩
const TYPE_SPEED = 32;         // 타자 한 단계 간격 (ms) — 숫자가 작을수록 빠름
const INTRO_HOLD = 1800;       // 문장이 다 나온 뒤 다음 장면으로 넘어가기 전 기다리는 시간 (ms)
let introTimers = [], introAnims = [];
const clearIntro = () => { introTimers.forEach(clearTimeout); introTimers = []; introAnims.forEach(a => { try { a.finish(); } catch {} }); introAnims = []; };
const later = (fn, ms) => introTimers.push(setTimeout(fn, ms));
function fitFrames() {
  const W = Math.min(window.innerWidth, 430), H = window.innerHeight;
  /* 인트로(그림이 고정된 화면): 390×844가 화면 안에 다 들어오게 */
  const sFit = Math.min(W / 390, H / 844, 1.2);
  ["#intro1", "#intro2", "#intro3"].forEach(q => { const f = document.querySelector(q + " .frame"); if (f) f.style.transform = `scale(${sFit})`; });
  /* 꾸미기·발급 화면: 가로를 화면 폭에 꽉 채우고, 세로는 화면 높이에 맞춰 배치 */
  const sW = Math.min(W / 390, 1.2), Hd = H / sW;
  ["#main", "#issuePage"].forEach(q => { const f = document.querySelector(q + " .frame"); if (f) { f.style.transform = `scale(${sW})`; f.style.height = Hd + "px"; } });
  layoutMain(Hd); layoutIssue(Hd);
}
/* 꾸미기: 위·아래 고정 요소는 그대로, 수리 크기와 파츠 판 높이로 남는 공간을 나눠 간격 16px 유지 */
function layoutMain(Hd) {
  const G = 16, FIX = 68 + G + G + 70 + G + G + 58 + 24;
  const S = Math.round(Math.max(150, Math.min(230, Hd - FIX - 270)));
  const P = Math.max(190, Hd - FIX - S);
  const st = $("#stage"); if (!st) return;
  let y = 68 + G;
  Object.assign(st.style, { top: y + "px", left: ((390 - S) / 2) + "px", width: S + "px", height: S + "px" }); y += S + G;
  $("#toolPanel").style.top = y + "px";
  ["tUndo", "tReset", "tRedo", "tFwd", "tBack", "tDelete"].forEach(id => { $("#" + id).style.top = (y + 11.9) + "px"; }); y += 70 + G;
  Object.assign($("#mPanel").style, { top: y + "px", height: P + "px" });
  $("#tabs").style.top = (y + 16) + "px";
  Object.assign($("#options").style, { top: (y + 56) + "px", height: (P - 72) + "px" }); y += P + G;
  $("#finish").style.top = y + "px";
  renderSel();
}
/* 발급: 버튼은 다른 화면과 같은 아래 위치, 제목~사원증 묶음은 남는 공간 가운데 */
function layoutIssue(Hd) {
  const btn = $("#post"); if (!btn) return;
  const bt = Hd - 24 - 60; btn.style.top = bt + "px";
  const blockTop = Math.max(76, 68 + (bt - 16 - 68 - 467) / 2), dy = blockTop - 36;
  $("#issueTitle").style.top = (36 + dy) + "px";
  $("#issueGlow").style.top = (86 + dy) + "px";
  $("#issueSlot").style.top = (95 + dy) + "px";
  $("#issueLamp").style.top = (75 + dy) + "px";
  $("#issueClip").style.top = (120.7 + dy) + "px";
  [230, 300, 440, 170].forEach((t, i) => { const sp = document.querySelectorAll("#issuePage .spark")[i]; if (sp) sp.style.top = (t + dy) + "px"; });
}
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function typeSteps(ch) {
  if (TYPE_MODE !== "jamo") return [ch];
  const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return [ch];
  const L = Math.floor(c / 588), V = Math.floor((c % 588) / 28), T2 = c % 28;
  const st = [CHO[L], String.fromCharCode(0xAC00 + (L * 21 + V) * 28)]; if (T2) st.push(ch); return st;
}
function dialogLines(p) { const v = T[p.dataset.type]; return Array.isArray(v) ? v : (typeof v === "string" ? [v] : []); }
function fillDialog(p, full) {
  const lines = dialogLines(p);
  p.setAttribute("aria-label", lines.join(" "));
  p.replaceChildren(...lines.map(l => { const sp = document.createElement("span"); sp.setAttribute("aria-hidden", "true"); sp.textContent = full ? l : ""; return sp; }));
}
/* 타자 효과 — 끝나면 onDone */
function typeDialog(p, onDone) {
  const lines = dialogLines(p); fillDialog(p, false);
  const spans = [...p.children], q = [];
  lines.forEach((l, li) => { let done = ""; for (const ch of l) { for (const st of typeSteps(ch)) q.push([li, done + st]); done += ch; if (/[.,?!]/.test(ch)) q.push([li, done, 180]); } q.push([li, done, 120]); });
  const cur = document.createElement("i"); cur.className = "cur";
  let i = 0;
  const step = () => {
    if (i >= q.length) { cur.remove(); p.dataset.typed = "1"; onDone && onDone(); return; }
    const [li, txt, pause] = q[i++]; spans[li].textContent = txt; spans[li].appendChild(cur);
    later(step, pause || TYPE_SPEED);
  };
  p.dataset.typed = ""; step();
}
const anim = (el, kf, opt) => { const a = el.animate(kf, Object.assign({ fill: "backwards" }, opt)); introAnims.push(a); return a; };
function playIntro(which) {
  clearIntro();
  const view = $("#" + which); view.dataset.done = "";
  const finish = () => { view.dataset.done = "1"; if (which === "intro1") later(() => nextIntro(which), INTRO_HOLD); };
  const p = view.querySelector(".dlg-text");
  if (reduceMotion()) {
    view.querySelectorAll(".dlg-text").forEach(q => fillDialog(q, true)); view.dataset.done = "1";
    if (which === "intro2") startRail();
    if (which === "intro1") later(() => nextIntro(which), INTRO_HOLD + 1200);
    return;
  }
  /* 대화창: 아래에서 제자리로 올라오며 나타남 → 타자 */
  const riseDialog = delay => {
    const dlg = view.querySelector(".dialog");
    anim(dlg, [{ opacity: 0, transform: "translateY(40px)" }, { opacity: 1, transform: "none" }], { duration: 600, delay, easing: "cubic-bezier(.2,.8,.2,1)" });
    later(() => typeDialog(p, finish), delay + 450);
  };
  if (p) fillDialog(p, false);
  if (which === "intro1") riseDialog(250);
  if (which === "intro2") {
    /* 카드 줄이 오른쪽에서 들어온 뒤, 계속 천천히 흘러감 (손으로 잡아 넘길 수도 있음) */
    startRail();
    riseDialog(500);
  }
  if (which === "intro3") {
    const b = $("#i3Badge"), su = $("#i3Suri"), bu = $("#i3Bubble"), btn = $("#startBtn");
    /* 빠르게 떨어졌다가 내려앉으며 느려지고, 아주 살짝만 튕김 */
    anim(b, [{ transform: "translateY(-720px)" }, { transform: "translateY(6px)", offset: .78, easing: "ease-in-out" }, { transform: "translateY(0)" }], { duration: 1100, delay: 100, easing: "cubic-bezier(.12,.75,.3,1)" });
    /* 카드가 내려앉은 뒤 수리 → 말풍선 순서 */
    anim(su, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 820, easing: "ease-out" });
    anim(bu, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 1000, easing: "ease-out" });
    anim(btn, [{ opacity: 0 }, { opacity: 1 }], { duration: 320, delay: 1250, easing: "ease-out" });
    later(() => { view.dataset.done = "1"; startPulse(); }, 1600);
  }
}
/* 인트로2 카드 롤링: 카드 5장을 3번 이어 붙여 끊김 없이 왼쪽으로 흐르게 */
const RAIL_CARDS = ["힙스터 수리", "우승했 수리", "보험왕 수리", "홈런왕 수리", "락스타 수리"];
const RAIL_W = [132.9, 132.6, 133.5, 134.4, 135.2], RAIL_GAP = 137.2, RAIL_SPEED = 22;   // 카드 간격(px), 흐르는 속도(px/초)
let railX = -146, railRaf = 0, railLast = 0, railDrag = null, railBuilt = false;
function startRail() {
  const tr = $("#railTrack"), loop = RAIL_GAP * RAIL_CARDS.length;
  if (!railBuilt) {
    railBuilt = true;
    for (let c = 0; c < 3; c++) RAIL_CARDS.forEach((n, j) => {
      const im = new Image(); const src = `design/intro/card-${j + 1}.png`; im.src = (window.__IMG && window.__IMG[src]) || src;
      im.alt = c === 0 ? n : ""; if (c) im.setAttribute("aria-hidden", "true");
      im.className = "rcard"; im.style.left = ((c * RAIL_CARDS.length + j) * RAIL_GAP) + "px"; im.style.width = RAIL_W[j] + "px";
      tr.appendChild(im);
    });
    const r = $("#rail");
    r.addEventListener("pointerdown", e => { railDrag = { x: e.clientX, s: railX, k: r.getBoundingClientRect().width / 390 }; r.classList.add("grab"); r.setPointerCapture(e.pointerId); });
    r.addEventListener("pointermove", e => { if (railDrag) railX = railDrag.s + (e.clientX - railDrag.x) / railDrag.k; });
    const up = () => { railDrag = null; r.classList.remove("grab"); };
    r.addEventListener("pointerup", up); r.addEventListener("pointercancel", up);
  }
  cancelAnimationFrame(railRaf); railLast = 0;
  const tick = t => {
    const dt = railLast ? Math.min(64, t - railLast) / 1000 : 0; railLast = t;
    if (!railDrag && !reduceMotion()) railX -= RAIL_SPEED * dt;
    while (railX < -146 - loop) railX += loop;
    while (railX > -146) railX -= loop;
    tr.style.transform = `translateX(${railX}px)`;
    if (!$("#intro2").hidden) railRaf = requestAnimationFrame(tick);
  };
  railRaf = requestAnimationFrame(tick);
}
function setupRail() {}

/* "수리와 출근하기" 버튼: 작게 커졌다 작아졌다 반복 */
let pulseAnim = null;
function startPulse() {
  if (pulseAnim || reduceMotion()) return;
  pulseAnim = $("#startBtn").animate([{ scale: "1" }, { scale: "1.02" }, { scale: "1" }], { duration: 1400, iterations: Infinity, easing: "ease-in-out" });
}
/* 인트로1 → 2: 배경이 같으므로 장면은 그대로 두고, 1의 말풍선만 사라진 뒤 2의 요소가 나타남 */
let advancing = false;
function nextIntro(which) {
  if (which === "intro3" || advancing) return;
  if (which === "intro2") { go("intro3"); return; }
  advancing = true; clearIntro();
  const dlg = $("#dlg1");
  const done = () => { advancing = false; go("intro2"); dlg.getAnimations().forEach(a => a.cancel()); };
  if (reduceMotion()) { done(); return; }
  dlg.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(-6px) scale(.97)" }], { duration: 260, easing: "ease-in", fill: "forwards" }).finished.then(done, done);
}
function tapIntro(which) {
  const view = $("#" + which);
  if (!view.dataset.done) {
    clearIntro(); view.querySelectorAll(".dlg-text").forEach(p => fillDialog(p, true)); view.dataset.done = "1";
    if (which === "intro3") startPulse();
    if (which === "intro1") later(() => nextIntro(which), INTRO_HOLD);
    return;
  }
  nextIntro(which);
}

/* ---------- 갤러리 ---------- */
let justPosted = null, galleryLoaded = false, galleryMode = "all", minePosts = null;
const cleanName = s => (typeof s === "string" && s.trim()) ? s.trim().slice(0, 15) : (T.card_empty_suri || "이름 없는 수리");
const cleanNick = s => (typeof s === "string" && s.trim()) ? s.trim().slice(0, 10) : (T.card_empty_nick || "익명");
function renderGallery() {
  const grid = $("#grid"); grid.replaceChildren();
  const mine = galleryMode === "mine", list = mine ? (minePosts || []) : posts;
  $("#gAll").setAttribute("aria-selected", String(!mine)); $("#gMine").setAttribute("aria-selected", String(mine));
  $("#gMineNote").hidden = !mine;
  for (const p of list) {
    const b = document.createElement("button");
    b.className = "tile" + (p.id === justPosted ? " new" : "");
    const name = cleanName(p.caption);
    b.setAttribute("aria-label", name + (p.authorId === GalleryStore.uid ? " (내 수리)" : "") + " 크게 보기");
    b.appendChild(suriEl(sanitize(p.recipe)));
    b.addEventListener("click", () => openCard({ recipe: sanitize(p.recipe), name, nick: cleanNick(p.nickname), post: p }));
    grid.appendChild(b);
  }
  const total = Math.max(mine ? 3 : 12, Math.ceil(list.length / 3) * 3);
  for (let i = list.length; i < total; i++) { const e = document.createElement("div"); e.className = "tile empty"; e.setAttribute("aria-hidden", "true"); grid.appendChild(e); }
  const loaded = mine ? minePosts !== null : galleryLoaded;
  $("#gState").textContent = list.length ? "" : (loaded ? (mine ? T.gallery_mine_empty : T.gallery_empty) : T.gallery_loading);
  $("#more").hidden = mine || !GalleryStore.hasMore;
}
async function setGalleryMode(m) {
  if (m === "mine") track("gallery_mine");
  galleryMode = m; renderGallery();
  if (m === "mine" && minePosts === null) {
    try { minePosts = await GalleryStore.loadMine(); } catch (e) { console.error(e); minePosts = []; $("#gState").textContent = T.gallery_error; return; }
    renderGallery();
  }
}
async function loadGallery(reset) {
  try {
    const page = await GalleryStore.loadPage(reset);
    if (reset) posts = page; else { const ids = new Set(posts.map(p => p.id)); posts = posts.concat(page.filter(p => !ids.has(p.id))); }
    galleryLoaded = true; renderGallery();
  } catch (e) { console.error(e); $("#gState").textContent = T.gallery_error; }
}

let toastTimer;
function toast(msg) { if (!msg) return; const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2600); }

/* ---------- 페이지 전환 ---------- */
const VIEWS = ["intro1", "intro2", "intro3", "main", "issuePage", "gallery"];
function go(next, push = true) {
  VIEWS.forEach(v => { $("#" + v).hidden = v !== next; });
  if (!next.startsWith("intro")) clearIntro();
  if (next !== "intro3" && pulseAnim) { pulseAnim.cancel(); pulseAnim = null; }
  const hash = { intro1: "#", intro2: "#intro2", intro3: "#intro3", main: "#make", issuePage: "#make", gallery: "#gallery" }[next];
  if (push) { try { history.pushState({ view: next }, "", hash); } catch {} }
  window.scrollTo(0, 0);
  track("page_view", { page_title: VIEW_TITLES[next], page_location: location.origin + location.pathname + "#" + next });
  if (next.startsWith("intro")) { fitFrames(); playIntro(next); }
  if (next === "issuePage" || next === "main") fitFrames();
  if (next === "gallery") { renderGallery(); if (!galleryLoaded) loadGallery(true); $("#gTitle").focus({ preventScroll: true }); }
}
const viewFromHash = () => ({ "#gallery": "gallery", "#make": "main", "#intro": "intro2", "#intro2": "intro2", "#intro3": "intro3" })[location.hash] || "intro1";

/* ---------- 완성 팝업 ---------- */
const NICK_KEY = "suri-maker-nick";
function openDone() {
  track("finish_open", { items: recipe.items.length - 1 });
  selected = null; renderSel(); updateTools();
  try { if (!$("#nick").value) $("#nick").value = localStorage.getItem(NICK_KEY) || ""; } catch {}
  updateCounts();
  const box = $("#namepop"), sc = Math.min(1, (window.innerWidth - 16) / 360);
  box.style.transformOrigin = "0 0"; box.style.transform = sc < 1 ? `scale(${sc})` : "";
  $("#done").style.width = (360 * sc) + "px"; $("#done").style.height = (365 * sc) + "px";
  $("#done").showModal(); placeDone();
  const q = $("#doneQ");
  if (reduceMotion()) { fillDialog(q, true); return; }
  fillDialog(q, false);
  /* 픽셀 창처럼: 가로줄이 생긴 뒤 위아래로 뚝뚝 열림 */
  box.animate([{ clipPath: "inset(49% 50% 49% 50%)" }, { clipPath: "inset(49% 0 49% 0)", offset: .45 }, { clipPath: "inset(0 0 0 0)" }], { duration: 480, easing: "steps(8,end)" })
    .finished.then(() => typeDialog(q, null));
}
/* 세모(▼)나 바깥을 누르면 픽셀 창이 닫히듯 사라짐 */
let doneClosing = false;
function closeDone() {
  const d = $("#done"); if (!d.open || doneClosing) return; doneClosing = true; clearIntro();
  const fin = () => { d.close(); doneClosing = false; };
  if (reduceMotion()) { fin(); return; }
  $("#namepop").animate([{ clipPath: "inset(0 0 0 0)" }, { clipPath: "inset(49% 0 49% 0)", offset: .55 }, { clipPath: "inset(49% 50% 49% 50%)" }], { duration: 420, easing: "steps(7,end)", fill: "forwards" })
    .finished.then(() => { fin(); $("#namepop").getAnimations().forEach(x => x.cancel()); });
}
/* 키보드가 올라오면 팝업이 보이는 영역 안으로 올라가도록 */
function placeDone() {
  const d = $("#done"); if (!d.open) return;
  const vv = window.visualViewport, vh = vv ? vv.height : window.innerHeight, top = vv ? vv.offsetTop : 0;
  const bh = d.getBoundingClientRect().height || 365;
  d.style.margin = "0"; d.style.position = "fixed"; d.style.left = "50%"; d.style.transform = "translateX(-50%)";
  d.style.top = Math.max(8, top + (vh - bh) / 2) + "px";
}
if (window.visualViewport) { visualViewport.addEventListener("resize", placeDone); visualViewport.addEventListener("scroll", placeDone); }
window.addEventListener("resize", placeDone);
function updateCounts() { $("#count").textContent = $("#caption").value.length + "/15"; $("#nickCount").textContent = $("#nick").value.length + "/10"; }
let posting = false;
async function post() {
  if (posting) return; posting = true; const btn = $("#post"); btn.disabled = true;
  const nickname = $("#nick").value.trim().slice(0, 10);
  try {
    const p = await GalleryStore.add({ recipe: serialize(recipe), caption: $("#caption").value.trim().slice(0, 15), nickname, authorId: GalleryStore.uid, v: 2 });
    try { localStorage.setItem(NICK_KEY, nickname); } catch {}
    posts = [p, ...posts.filter(x => x.id !== p.id)]; justPosted = p.id; galleryMode = "all";
    if (minePosts !== null) minePosts = [p, ...minePosts.filter(x => x.id !== p.id)]; galleryLoaded = galleryLoaded || GalleryStore.mode === "local";
    track("gallery_post", { items: recipe.items.length - 1 });
    $("#caption").value = ""; updateCounts(); $("#done").close();
    await celebrate();
    if (GalleryStore.mode === "shared" && !galleryLoaded) loadGallery(true);
    setTimeout(() => { justPosted = null; }, 1500);
  } catch (e) { console.error(e); toast(T.toast_post_fail); }
  finally { posting = false; btn.disabled = false; }
}

/* ---------- 사원증 발급: 배출구에서 카드가 나온 뒤 "시작하기" ---------- */
let issueBusy = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 암전: 검은 화면 + 선택 문구(점이 늘어나는 효과) */
let dotsTimer = 0;
async function blackIn(label) {
  const b = $("#blackout"), t = $("#blackoutText"); b.classList.add("on"); t.textContent = "";
  await b.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 280, easing: "ease-in", fill: "forwards" }).finished;
  if (label) { let n = 0; t.textContent = label; clearInterval(dotsTimer); dotsTimer = setInterval(() => { n = (n + 1) % 4; t.textContent = label + ".".repeat(n); }, 140); }
}
async function blackOut(to = 0) {
  const b = $("#blackout"); clearInterval(dotsTimer); $("#blackoutText").textContent = "";
  await b.animate([{ opacity: 1 }, { opacity: to }], { duration: 380, easing: "ease-out", fill: "forwards" }).finished;
  if (!to) { b.classList.remove("on"); b.getAnimations().forEach(a => a.cancel()); b.style.opacity = 0; }
}
async function openIssue() {
  if (issueBusy) return; issueBusy = true;
  const name = cleanName($("#caption").value), nick = cleanNick($("#nick").value);
  track("card_issue");
  try {
    const cardP = makeCard(recipe, name, nick);
    const img = $("#issueCard");
    ["#post", "#issueTitle", "#issueGlow"].forEach(q => { const e = $(q); e.getAnimations().forEach(a => a.cancel()); e.style.opacity = 0; });
    $("#post").style.pointerEvents = "none"; img.getAnimations().forEach(a => a.cancel()); img.style.transform = "translateY(-100%)";
    const rm = reduceMotion();
    if (!rm) await blackIn(T.issue_loading || "사원증 발급 중");
    const cv = await cardP; img.src = cv.toDataURL("image/png"); img.alt = name + " 사원증";
    $("#done").close(); go("issuePage");
    if (!rm) { await sleep(1800); await blackOut(); }
    if (!rm) {
      /* 배출구 램프 깜빡 + 빛 번짐 + 덜컹 */
      $("#issueLamp").animate([{ filter: "brightness(.45)" }, { filter: "brightness(1.4)" }, { filter: "brightness(.45)" }, { filter: "brightness(1.4)" }, { filter: "none" }], { duration: 600 });
      $("#issueGlow").animate([{ opacity: 0 }, { opacity: .85 }, { opacity: .35 }], { duration: 650, fill: "forwards" });
      await document.querySelector("#issuePage .frame2").animate([{ translate: "0 0" }, { translate: "-2px 1px" }, { translate: "2px -1px" }, { translate: "-1px 0" }, { translate: "0 0" }], { duration: 260 }).finished;
      await img.animate([
        { transform: "translateY(-100%)" },
        { transform: "translateY(-72%)", offset: .22 }, { transform: "translateY(-72%)", offset: .3 },
        { transform: "translateY(-40%)", offset: .55 }, { transform: "translateY(-40%)", offset: .62 },
        { transform: "translateY(1.5%)", offset: .9 }, { transform: "translateY(0)" }
      ], { duration: 1700, easing: "ease-out" }).finished;
    }
    img.style.transform = "none";
    $("#issueTitle").animate([{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 350, fill: "forwards" });
    if (!rm) document.querySelectorAll("#issuePage .spark").forEach((sp, i) => sp.animate([{ opacity: 0, transform: "scale(.2) rotate(0)" }, { opacity: 1, transform: "scale(1.2) rotate(45deg)", offset: .5 }, { opacity: 0, transform: "scale(.6) rotate(90deg)" }], { duration: 900, delay: i * 110, iterations: 2 }));
    await $("#post").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 350, delay: rm ? 0 : 300, fill: "forwards" }).finished;
    $("#post").style.pointerEvents = "auto";
  } catch (e) { console.error(e); toast("사원증을 만들지 못했어요."); await blackOut(); }
  finally { issueBusy = false; }
}
/* 시작하기 → 암전 → 출입 게이트에 사원증 태그(삑! 입주 승인) → 갤러리 위로 "입주 완료" + 폭죽 */
async function gateScene() {
  const host = $("#blackout"), sc = Math.min(Math.min(window.innerWidth, 430) / 390, window.innerHeight / 844, 1.2);
  const g = document.createElement("div"); g.className = "gate";
  g.style.transform = `translate(-50%,-50%) scale(${sc})`;
  g.innerHTML = `
    <div class="gate-ok" id="gateOk">${T.gate_ok || "삑! 입주 승인"}</div>
    <div class="gate-reader px-dk"><i class="gate-led" id="gateLed"></i><div class="gate-pad"><span></span><span></span><span></span></div><b>63 OFFICE</b></div>
    <img class="gate-card" id="gateCard" alt="" src="${$("#issueCard").src}">`;
  host.appendChild(g);
  const card = g.querySelector("#gateCard");
  await sleep(150);
  await card.animate([{ transform: "translateY(0) rotate(0deg)" }, { transform: "translateY(-362px) rotate(-6deg)", offset: .85 }, { transform: "translateY(-356px) rotate(-6deg)" }], { duration: 750, easing: "cubic-bezier(.3,.8,.3,1)", fill: "forwards" }).finished;
  g.querySelector("#gateLed").classList.add("on");
  const ok = g.querySelector("#gateOk"); ok.classList.add("on");
  ok.animate([{ transform: "scale(.7)", opacity: 0 }, { transform: "scale(1.08)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 300, fill: "forwards" });
  g.querySelector(".gate-reader").animate([{ translate: "0 0" }, { translate: "0 2px" }, { translate: "0 0" }], { duration: 160 });
  await sleep(1100);
  await g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: "forwards" }).finished;
  g.remove();
}
async function celebrate() {
  const rm = reduceMotion();
  if (!rm) { await blackIn(""); await gateScene(); }
  go("gallery");
  if (!rm) await blackOut();
  toast(T.toast_posted);
}
/* 폭죽: Figma에 넣은 반짝이(spark-1, spark-2)를 여러 개 띄워 터뜨림 */
function confetti() {
  const host = $("#celebrate"), r = host.getBoundingClientRect();
  const bursts = [[0.5, 0.42, 0], [0.22, 0.62, 260], [0.78, 0.62, 520], [0.5, 0.7, 780]];
  bursts.forEach(([bx, by, delay]) => {
    for (let i = 0; i < 9; i++) {
      const im = new Image(); const src = i % 3 === 0 ? "design/spark-2.svg" : "design/spark-1.svg";
      im.src = (window.__IMG && window.__IMG[src]) || src; im.alt = ""; im.className = "fw";
      const w = 18 + Math.random() * 22; im.style.width = w + "px";
      im.style.left = (r.width * bx - w / 2) + "px"; im.style.top = (r.height * by - w) + "px";
      host.appendChild(im);
      const a = (Math.PI * 2) * (i / 9) + Math.random() * .5, d = 90 + Math.random() * 120, rot = (Math.random() - .5) * 240;
      im.animate([
        { transform: "translate(0,0) scale(.2) rotate(0deg)", opacity: 0 },
        { transform: `translate(${Math.cos(a) * d * .6}px,${Math.sin(a) * d * .6}px) scale(1.1) rotate(${rot * .5}deg)`, opacity: 1, offset: .35 },
        { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 40}px) scale(.7) rotate(${rot}deg)`, opacity: 0 }
      ], { duration: 1300, delay, easing: "cubic-bezier(.2,.7,.3,1)", fill: "both" }).finished.then(() => im.remove());
    }
  });
}

/* ---------- 사원증 카드 (3배 해상도 PNG) ---------- */
const svgUrl = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
async function makeCard(r, name, nick) {
  const W = 294, H = 444, K = 3, cv = document.createElement("canvas"); cv.width = W * K; cv.height = H * K;
  const g = cv.getContext("2d"); g.scale(K, K);
  try { await Promise.all([document.fonts.load('700 23px "Maplestory"', name), document.fonts.load('300 17px "Maplestory"', nick)]); } catch {}
  g.drawImage(await loadImg(svgUrl(await getSvg("design/card-bg.svg"))), 0, 0, W, H);
  const S = 198, k = S / C;
  for (const l of layers(r)) g.drawImage(await loadImg(l.src), 48 + l.x * k, 68 + l.y * k, S, S);
  g.fillStyle = "#000"; g.textAlign = "center"; g.textBaseline = "middle";
  if ("letterSpacing" in g) g.letterSpacing = "-0.9px";
  let fs = 22.7;
  do { g.font = `700 ${fs}px "Maplestory", sans-serif`; } while (g.measureText(name).width > W - 44 && (fs -= 1) > 14);
  g.fillText(name, W / 2, 324.5);
  if ("letterSpacing" in g) g.letterSpacing = "-0.7px";
  g.font = '300 17.5px "Maplestory", sans-serif'; g.fillText(nick, W / 2, 352);
  g.drawImage(await loadImg(svgUrl(await getSvg("design/plus-logo.svg"))), 101, 391.4, 91.4, 19.2);
  return cv;
}
let cardCanvas = null, cardName = "", cardPost = null, cardCanSave = false, cardRecipe = null;
async function openCard({ recipe: r, name, nick, post: p }) {
  try {
    cardCanvas = await makeCard(r, name, nick); cardName = name; cardPost = p || null; cardRecipe = r;
    $("#cardImg").src = cardCanvas.toDataURL("image/png"); $("#cardImg").alt = name + " 사원증 이미지";
    $("#cardDel").hidden = !(p && (p.authorId === GalleryStore.uid || GalleryStore.isAdmin));
    /* 저장은 내 수리(또는 방금 만든 수리)만 가능 — 남의 카드는 보기만 */
    const own = !p || p.authorId === GalleryStore.uid;
    cardCanSave = own || GalleryStore.isAdmin;
    track("card_view", { from: p ? "gallery" : "popup", own });
    $("#cardSaves").hidden = !cardCanSave;
    $("#cardImg").classList.toggle("locked", !cardCanSave);
    const cp = document.querySelector("#cardDlg .card-pop"), cs = Math.min(1, (window.innerWidth - 16) / 350, (window.innerHeight - 16) / 660);
    cp.style.transformOrigin = "0 0"; cp.style.transform = cs < 1 ? `scale(${cs})` : "";
    $("#cardDlg").style.width = (350 * cs) + "px"; $("#cardDlg").style.height = "auto";
    $("#cardDlg").showModal();
    $("#cardDlg").style.height = (cp.offsetHeight * cs) + "px";
  } catch (e) { console.error(e); }
}
/* type: "card" = 사원증 그대로, "suri" = 수리만 (정사각형 투명 배경) */
async function saveCard(type) {
  if (!cardCanvas || !cardCanSave) return;
  track("card_save", { from: cardPost ? "gallery" : "popup", type });
  const cv = type === "suri" ? await makeSquare(cardRecipe) : cardCanvas;
  const blob = await new Promise(res => cv.toBlob(res, "image/png"));
  const filename = "63officelife-" + (type === "suri" ? "수리-" : "사원증-") + cardName.replace(/[\\/:*?"<>|\s]+/g, "_") + ".png";
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function confirmBox(msg) {
  return new Promise(res => {
    const d = $("#confirmDlg"); $("#confirmMsg").textContent = msg;
    const done = v => { d.close(); $("#confirmYes").onclick = $("#confirmNo").onclick = d.oncancel = null; res(v); };
    $("#confirmYes").onclick = () => done(true); $("#confirmNo").onclick = () => done(false);
    d.oncancel = e => { e.preventDefault(); done(false); };
    d.showModal(); $("#confirmNo").focus();
  });
}
async function deleteCardPost() {
  if (!cardPost || !(await confirmBox(T.confirm_delete))) return;
  const b = $("#cardDel"); b.disabled = true;
  try { await GalleryStore.remove(cardPost.id); posts = posts.filter(p => p.id !== cardPost.id); if (minePosts) minePosts = minePosts.filter(p => p.id !== cardPost.id); $("#cardDlg").close(); renderGallery(); toast(T.toast_deleted); }
  catch (e) { console.error(e); toast(T.toast_post_fail); }
  finally { b.disabled = false; }
}

/* ---------- 관리자 모드 (주소에 ?admin 을 붙였을 때만) ---------- */
const ADMIN_MODE = new URLSearchParams(location.search).has("admin");
function renderAdmin() {
  const bar = $("#adminBar"); if (!ADMIN_MODE) { bar.hidden = true; return; }
  bar.hidden = false;
  const s = GalleryStore;
  if (s.mode !== "shared") { $("#adminInfo").textContent = "관리자 모드는 Firebase 연결 후 사용할 수 있어요."; $("#adminLogin").hidden = $("#adminLogout").hidden = true; return; }
  $("#adminLogin").hidden = !!s.email; $("#adminLogout").hidden = !s.email; $("#adminExport").hidden = !s.isAdmin; $("#adminImages").hidden = !s.isAdmin;
  $("#adminInfo").textContent = !s.email ? "관리자 모드" : (s.isAdmin ? "관리자: " + s.email + " · 모든 카드를 삭제할 수 있어요" : s.email + " 은(는) 관리자로 등록되지 않았어요");
}
/* 참여 목록을 엑셀용 CSV로 내려받기 */
function fileNameFor(p, i) {
  const safe = s => String(s || "").trim().replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 20) || "이름없음";
  return String(i + 1).padStart(3, "0") + "_" + safe(cleanName(p.caption)) + "_" + safe(cleanNick(p.nickname)) + "_" + String(p.id).slice(0, 6);
}
function buildCsv(list) {
    const toDate = v => (v && typeof v.toDate === "function") ? v.toDate() : (v ? new Date(v) : null);
    const fmt = d => d ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d) : "";
    const count = {}, nth = {};
    list.forEach(p => { count[p.authorId] = (count[p.authorId] || 0) + 1; });
    const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [["번호", "올린 시각(한국)", "수리 닉네임", "내 닉네임", "작성자 구분(같은 브라우저)", "작성자의 몇 번째 게시물", "작성자 게시물 수", "게시물 ID", "이미지 파일 이름"]];
    list.forEach((p, i) => {
      nth[p.authorId] = (nth[p.authorId] || 0) + 1;
      rows.push([i + 1, fmt(toDate(p.createdAt)), p.caption || "", p.nickname || "", String(p.authorId || "").slice(0, 8), nth[p.authorId], count[p.authorId], p.id, fileNameFor(p, i) + ".png"]);
    });
    return "\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\r\n");
}
const dateStamp = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0"); };
function downloadBlob(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
async function exportList() {
  const btn = $("#adminExport"); btn.disabled = true; const label = btn.textContent; btn.textContent = "불러오는 중…";
  try {
    const list = await GalleryStore.loadAll();
    const csv = buildCsv(list);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, `63officelife-참여목록-${dateStamp()}.csv`);
    toast(list.length + "건을 내려받았어요");
  } catch (e) { console.error(e); toast("목록을 불러오지 못했어요."); }
  finally { btn.disabled = false; btn.textContent = label; }
}
/* 수리만 있는 정사각형 투명 배경 PNG (1026×1026) */
async function makeSquare(r) {
  const S = C * 2, k = S / C, cv = document.createElement("canvas"); cv.width = cv.height = S;
  const g = cv.getContext("2d");
  for (const l of layers(r)) g.drawImage(await loadImg(l.src), l.x * k, l.y * k, S, S);
  return cv;
}
const toBlob = cv => new Promise(res => cv.toBlob(res, "image/png"));
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
}
/* 관리자 전용: 전체 이미지(사원증 + 수리 정사각형) + 참여 목록을 압축 파일 하나로 */
async function exportImages() {
  const btn = $("#adminImages"); btn.disabled = true; const label = btn.textContent; btn.textContent = "불러오는 중…";
  try {
    if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
    const list = await GalleryStore.loadAll();
    if (!list.length) { toast("내려받을 게시물이 없어요."); return; }
    const zip = new window.JSZip(), cardDir = zip.folder("사원증"), sqDir = zip.folder("수리_정사각형_투명배경");
    for (let i = 0; i < list.length; i++) {
      btn.textContent = `이미지 만드는 중 ${i + 1}/${list.length}`;
      const p = list[i], r = sanitize(p.recipe), name = fileNameFor(p, i) + ".png";
      cardDir.file(name, await toBlob(await makeCard(r, cleanName(p.caption), cleanNick(p.nickname))));
      sqDir.file(name, await toBlob(await makeSquare(r)));
    }
    zip.file("참여목록.csv", buildCsv(list));
    btn.textContent = "압축하는 중…";
    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    downloadBlob(blob, `63officelife-이미지-${dateStamp()}.zip`);
    toast(list.length + "건의 이미지를 내려받았어요");
  } catch (e) { console.error(e); toast("이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요."); }
  finally { btn.disabled = false; btn.textContent = label; }
}
async function adminAction(fn) {
  try { await fn(); minePosts = null; if (galleryMode === "mine") setGalleryMode("mine"); }
  catch (e) { console.error(e); if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast("로그인하지 못했어요. 팝업 차단을 확인해 주세요."); }
  renderAdmin();
}

/* ---------- 시작 ---------- */
async function start() {
  initAnalytics();
  applyContent();
  await Promise.all([inlineSvgs(), loadParts()]);
  recipe = defaultRecipe();
  $("#loading").remove(); $("#app").hidden = false;
  renderTabs(); refresh(false); bindStage(); fitFrames();
  $("#tUndo").addEventListener("click", undo); $("#tRedo").addEventListener("click", redo); $("#tReset").addEventListener("click", resetAll);
  $("#tDelete").addEventListener("click", delSel); $("#tFwd").addEventListener("click", () => move(1)); $("#tBack").addEventListener("click", () => move(-1));
  $("#finish").addEventListener("click", openDone);
  $("#toGallery").addEventListener("click", () => go("gallery"));
  $("#backToMain").addEventListener("click", () => go("main"));
  $("#more").addEventListener("click", () => { track("gallery_more"); loadGallery(false); });
  $("#adminLogin").addEventListener("click", () => adminAction(() => GalleryStore.adminLogin()));
  $("#adminLogout").addEventListener("click", () => adminAction(() => GalleryStore.adminLogout()));
  $("#adminExport").addEventListener("click", () => { if (GalleryStore.isAdmin) exportList(); });
  $("#adminImages").addEventListener("click", () => { if (GalleryStore.isAdmin) exportImages(); });
  $("#gAll").addEventListener("click", () => setGalleryMode("all"));
  $("#gMine").addEventListener("click", () => setGalleryMode("mine"));
  $("#caption").addEventListener("input", updateCounts); $("#nick").addEventListener("input", updateCounts);
  $("#post").addEventListener("click", post);
  $("#issue").addEventListener("click", openIssue);
  $("#issueClose").addEventListener("click", () => go("main"));
  $("#mainBack").addEventListener("click", () => go("intro3"));
  $("#done").addEventListener("click", e => { if (e.target === e.currentTarget) closeDone(); });
  $("#doneClose").addEventListener("click", closeDone);
  $("#done").addEventListener("cancel", e => { e.preventDefault(); closeDone(); });
  $("#cardClose").addEventListener("click", () => $("#cardDlg").close());
  $("#cardSave").addEventListener("click", () => saveCard("card"));
  $("#cardSaveSuri").addEventListener("click", () => saveCard("suri"));
  $("#cardImg").addEventListener("contextmenu", e => { if (!cardCanSave) e.preventDefault(); });
  $("#cardImg").addEventListener("dragstart", e => { if (!cardCanSave) e.preventDefault(); });
  $("#cardDel").addEventListener("click", deleteCardPost);
  $("#cardDlg").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("#intro1").addEventListener("click", e => { if (!e.target.closest("[data-skip]")) tapIntro("intro1"); });
  $("#intro2").addEventListener("click", e => { if (!e.target.closest("[data-skip],#rail")) tapIntro("intro2"); });
  $("#intro3").addEventListener("click", e => { if (!e.target.closest("#startBtn")) tapIntro("intro3"); });
  document.querySelectorAll("[data-skip]").forEach(b => b.addEventListener("click", () => { track("intro_skip", { from: b.closest(".intro").id }); go("main"); }));
  $("#startBtn").addEventListener("click", () => { track("intro_complete"); go("main"); });
  window.addEventListener("popstate", () => go(viewFromHash(), false));
  window.addEventListener("resize", fitFrames);
  document.addEventListener("keydown", e => {
    if ($("#done").open || $("#cardDlg").open || $("#main").hidden) return;
    if ((e.target.tagName || "").toLowerCase() === "input") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  go(viewFromHash(), false);
  const mode = await GalleryStore.init();
  renderAdmin();
  if (!$("#gallery").hidden) loadGallery(true);
}
start().catch(e => { console.error(e); const l = $("#loading"); if (l) l.textContent = "사이트를 불러오지 못했어요. 새로고침해 주세요."; });
