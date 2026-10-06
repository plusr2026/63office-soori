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
const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(src)); i.src = src; });
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
    b.addEventListener("click", () => cfg ? addItem(part.key, id) : (recipe[part.key] !== id && change(() => { recipe[part.key] = id; }, true)));
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

/* ---------- 인트로 (data-step 순서대로 나타남) ---------- */
const STEP_GAP = 800, INTRO1_HOLD = 1200;   // 단계 간격, 인트로1 마지막 문단 후 머무는 시간 (ms)
let introTimers = [];
const clearIntro = () => { introTimers.forEach(clearTimeout); introTimers = []; };
function fitFrames() {
  const w = Math.min(window.innerWidth, 430), h = window.innerHeight, s = Math.min(w / 390, h / 844, 1.2);
  document.querySelectorAll(".frame").forEach(f => { f.style.transform = `scale(${s})`; });
}
function playIntro(which) {
  clearIntro();
  const view = $("#" + which), els = [...view.querySelectorAll("[data-step]")];
  els.forEach(e => e.classList.remove("on"));
  const steps = [...new Set(els.map(e => +e.dataset.step))].sort((a, b) => a - b);
  view.dataset.done = "";
  steps.forEach((s, i) => introTimers.push(setTimeout(() => {
    els.filter(e => +e.dataset.step === s).forEach(e => e.classList.add("on"));
    if (i === steps.length - 1) { view.dataset.done = "1"; if (which === "intro1") introTimers.push(setTimeout(() => go("intro2"), INTRO1_HOLD + 600)); }
  }, 200 + i * STEP_GAP)));
}
function tapIntro(which) {
  const view = $("#" + which);
  if (!view.dataset.done) { clearIntro(); view.querySelectorAll("[data-step]").forEach(e => e.classList.add("on")); view.dataset.done = "1";
    if (which === "intro1") introTimers.push(setTimeout(() => go("intro2"), INTRO1_HOLD)); return; }
  if (which === "intro1") go("intro2");
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
const VIEWS = ["intro1", "intro2", "main", "gallery"];
function go(next, push = true) {
  VIEWS.forEach(v => { $("#" + v).hidden = v !== next; });
  if (!next.startsWith("intro")) clearIntro();
  const hash = { intro1: "#", intro2: "#intro", main: "#make", gallery: "#gallery" }[next];
  if (push) { try { history.pushState({ view: next }, "", hash); } catch {} }
  window.scrollTo(0, 0);
  if (next.startsWith("intro")) { fitFrames(); playIntro(next); }
  if (next === "gallery") { renderGallery(); if (!galleryLoaded) loadGallery(true); $("#gTitle").focus({ preventScroll: true }); }
}
const viewFromHash = () => ({ "#gallery": "gallery", "#make": "main", "#intro": "intro2" })[location.hash] || "intro1";

/* ---------- 완성 팝업 ---------- */
const NICK_KEY = "suri-maker-nick";
function openDone() {
  selected = null; renderSel(); updateTools();
  $("#donePreview").replaceChildren(suriEl(recipe));
  try { if (!$("#nick").value) $("#nick").value = localStorage.getItem(NICK_KEY) || ""; } catch {}
  updateCounts(); $("#done").showModal();
}
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
    $("#caption").value = ""; updateCounts(); $("#done").close(); go("gallery"); toast(T.toast_posted);
    if (GalleryStore.mode === "shared" && !galleryLoaded) loadGallery(true);
    setTimeout(() => { justPosted = null; }, 1500);
  } catch (e) { console.error(e); toast(T.toast_post_fail); }
  finally { posting = false; btn.disabled = false; }
}

/* ---------- 사원증 카드 (350×500, 3배 해상도 PNG) ---------- */
const svgUrl = s => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
async function makeCard(r, name, nick) {
  const W = 350, H = 500, K = 3, cv = document.createElement("canvas"); cv.width = W * K; cv.height = H * K;
  const g = cv.getContext("2d"); g.scale(K, K);
  try { await Promise.all([document.fonts.load('700 40px "LIFEPLUS"', name), document.fonts.load('500 20px "Noto Sans KR"', nick)]); } catch {}
  g.fillStyle = "#FFCC00"; g.fillRect(0, 0, W, H);
  g.drawImage(await loadImg(svgUrl(await getSvg("design/card-title.svg"))), 20, 30, 144, 40);
  if ("letterSpacing" in g) g.letterSpacing = "-1.6px";
  let fs = 40; g.fillStyle = "#000"; g.textBaseline = "alphabetic";
  do { g.font = `700 ${fs}px "LIFEPLUS", "Noto Sans KR", sans-serif`; } while (g.measureText(name).width > W - 48 && --fs > 22);
  g.fillText(name, 24, 131);
  if ("letterSpacing" in g) g.letterSpacing = "-0.8px";
  g.font = '500 20px "Noto Sans KR", sans-serif'; g.fillText(nick, 24, 166);
  const S = 251, k = S / C;
  for (const l of layers(r)) g.drawImage(await loadImg(l.src), 91 + l.x * k, 188 + l.y * k, S, S);
  g.fillStyle = "#FFFFFF"; g.fillRect(0, 454, W, 46);
  g.drawImage(await loadImg(svgUrl(await getSvg("design/plus-logo.svg"))), 123, 466, 104, 22);
  return cv;
}
let cardCanvas = null, cardName = "", cardPost = null, cardCanSave = false;
async function openCard({ recipe: r, name, nick, post: p }) {
  try {
    cardCanvas = await makeCard(r, name, nick); cardName = name; cardPost = p || null;
    $("#cardImg").src = cardCanvas.toDataURL("image/png"); $("#cardImg").alt = name + " 사원증 이미지";
    $("#cardDel").hidden = !(p && (p.authorId === GalleryStore.uid || GalleryStore.isAdmin));
    /* 저장은 내 수리(또는 방금 만든 수리)만 가능 — 남의 카드는 보기만 */
    const own = !p || p.authorId === GalleryStore.uid;
    cardCanSave = own || GalleryStore.isAdmin;
    $("#cardSave").hidden = !cardCanSave; $("#cardHint").hidden = !cardCanSave;
    $("#cardImg").classList.toggle("locked", !cardCanSave);
    $("#cardDlg").showModal();
  } catch (e) { console.error(e); }
}
async function saveCard() {
  if (!cardCanvas || !cardCanSave) return;
  const blob = await new Promise(res => cardCanvas.toBlob(res, "image/png"));
  const filename = "63officelife-" + cardName.replace(/[\\/:*?"<>|\s]+/g, "_") + ".png";
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
  $("#adminLogin").hidden = !!s.email; $("#adminLogout").hidden = !s.email; $("#adminExport").hidden = !s.isAdmin;
  $("#adminInfo").textContent = !s.email ? "관리자 모드" : (s.isAdmin ? "관리자: " + s.email + " · 모든 카드를 삭제할 수 있어요" : s.email + " 은(는) 관리자로 등록되지 않았어요");
}
/* 참여 목록을 엑셀용 CSV로 내려받기 */
async function exportList() {
  const btn = $("#adminExport"); btn.disabled = true; const label = btn.textContent; btn.textContent = "불러오는 중…";
  try {
    const list = await GalleryStore.loadAll();
    const toDate = v => (v && typeof v.toDate === "function") ? v.toDate() : (v ? new Date(v) : null);
    const fmt = d => d ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d) : "";
    const count = {}, nth = {};
    list.forEach(p => { count[p.authorId] = (count[p.authorId] || 0) + 1; });
    const cell = v => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const rows = [["번호", "올린 시각(한국)", "수리 닉네임", "내 닉네임", "작성자 구분(같은 브라우저)", "작성자의 몇 번째 게시물", "작성자 게시물 수", "게시물 ID"]];
    list.forEach((p, i) => {
      nth[p.authorId] = (nth[p.authorId] || 0) + 1;
      rows.push([i + 1, fmt(toDate(p.createdAt)), p.caption || "", p.nickname || "", String(p.authorId || "").slice(0, 8), nth[p.authorId], count[p.authorId], p.id]);
    });
    const csv = "\uFEFF" + rows.map(r => r.map(cell).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const d = new Date(), stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `63officelife-참여목록-${stamp}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(list.length + "건을 내려받았어요");
  } catch (e) { console.error(e); toast("목록을 불러오지 못했어요."); }
  finally { btn.disabled = false; btn.textContent = label; }
}
async function adminAction(fn) {
  try { await fn(); minePosts = null; if (galleryMode === "mine") setGalleryMode("mine"); }
  catch (e) { console.error(e); if (e && e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") toast("로그인하지 못했어요. 팝업 차단을 확인해 주세요."); }
  renderAdmin();
}

/* ---------- 시작 ---------- */
async function start() {
  applyContent();
  await Promise.all([inlineSvgs(), loadParts()]);
  recipe = defaultRecipe();
  $("#loading").remove(); $("#app").hidden = false;
  renderTabs(); refresh(false); bindStage();
  $("#tUndo").addEventListener("click", undo); $("#tRedo").addEventListener("click", redo); $("#tReset").addEventListener("click", resetAll);
  $("#tDelete").addEventListener("click", delSel); $("#tFwd").addEventListener("click", () => move(1)); $("#tBack").addEventListener("click", () => move(-1));
  $("#finish").addEventListener("click", openDone);
  $("#toGallery").addEventListener("click", () => go("gallery"));
  $("#backToMain").addEventListener("click", () => go("main"));
  $("#more").addEventListener("click", () => loadGallery(false));
  $("#adminLogin").addEventListener("click", () => adminAction(() => GalleryStore.adminLogin()));
  $("#adminLogout").addEventListener("click", () => adminAction(() => GalleryStore.adminLogout()));
  $("#adminExport").addEventListener("click", () => { if (GalleryStore.isAdmin) exportList(); });
  $("#gAll").addEventListener("click", () => setGalleryMode("all"));
  $("#gMine").addEventListener("click", () => setGalleryMode("mine"));
  $("#caption").addEventListener("input", updateCounts); $("#nick").addEventListener("input", updateCounts);
  $("#post").addEventListener("click", post);
  $("#save").addEventListener("click", () => openCard({ recipe, name: cleanName($("#caption").value), nick: cleanNick($("#nick").value) }));
  $("#doneClose").addEventListener("click", () => $("#done").close());
  $("#done").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("#cardClose").addEventListener("click", () => $("#cardDlg").close());
  $("#cardSave").addEventListener("click", saveCard);
  $("#cardImg").addEventListener("contextmenu", e => { if (!cardCanSave) e.preventDefault(); });
  $("#cardImg").addEventListener("dragstart", e => { if (!cardCanSave) e.preventDefault(); });
  $("#cardDel").addEventListener("click", deleteCardPost);
  $("#cardDlg").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.close(); });
  $("#intro1").addEventListener("click", e => { if (!e.target.closest("[data-skip]")) tapIntro("intro1"); });
  $("#intro2").addEventListener("click", e => { if (!e.target.closest("[data-skip],#startBtn")) tapIntro("intro2"); });
  document.querySelectorAll("[data-skip]").forEach(b => b.addEventListener("click", () => go("main")));
  $("#startBtn").addEventListener("click", () => go("main"));
  window.addEventListener("popstate", () => go(viewFromHash(), false));
  window.addEventListener("resize", fitFrames);
  document.addEventListener("keydown", e => {
    if ($("#done").open || $("#cardDlg").open || $("#main").hidden) return;
    if ((e.target.tagName || "").toLowerCase() === "input") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  });
  go(viewFromHash(), false);
  const mode = await GalleryStore.init();
  if (mode === "local") { const n = $("#modeNote"); n.hidden = false; n.textContent = T.local_mode_note; }
  renderAdmin();
  if (!$("#gallery").hidden) loadGallery(true);
}
start().catch(e => { console.error(e); const l = $("#loading"); if (l) l.textContent = "사이트를 불러오지 못했어요. 새로고침해 주세요."; });
