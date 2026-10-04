// YouTube 上に Apple Music 風の同期歌詞を重ね、キー固定なしの速度変更・slowed / sped up 対応・リピートを付ける
(() => {
  'use strict';
  const Y = globalThis.YTL;
  const DIM = 0.32;
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const fmt = (s) => (isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '0:00');
  const semis = (r) => 12 * Math.log2(r);
  const fmtSemi = (r) => {
    const s = semis(r);
    return Math.abs(s) < 0.05 ? '±0' : (s > 0 ? '+' : '−') + Math.abs(s).toFixed(1);
  };

  // innerHTML は YouTube の Trusted Types に弾かれるので、要素は全部これで組む
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    el.append(...kids.filter((k) => k != null));
    return el;
  }

  // ---------- アイコン（24×24） ----------
  const NS = 'http://www.w3.org/2000/svg';
  const dot = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const ICON = {
    play: { d: ['M7.5 5.2v13.6L19 12z'] },
    pause: { d: ['M6.5 5h3.6v14H6.5zM13.9 5h3.6v14h-3.6z'] },
    prev: { d: ['M21 6.5v11L13.2 12zM11.5 6.5v11L3.7 12z'] },
    next: { d: ['M3 6.5v11l7.8-5.5zM12.5 6.5v11l7.8-5.5z'] },
    more: { d: [dot(6.5, 12, 1.7), dot(12, 12, 1.7), dot(17.5, 12, 1.7)], plain: true },
    repeat: { d: ['M17 3.5l3 3-3 3', 'M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20', 'M7 20.5l-3-3 3-3', 'M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4'], stroke: true },
    repeat1: { d: ['M17 3.5l3 3-3 3', 'M4 11.5V10a3.5 3.5 0 0 1 3.5-3.5H20', 'M7 20.5l-3-3 3-3', 'M20 12.5V14a3.5 3.5 0 0 1-3.5 3.5H4', 'M11 10.6l1.4-1v4.9'], stroke: true },
    close: { d: ['M6.5 6.5l11 11M17.5 6.5l-11 11'], stroke: true, w: 2.2 },
    search: { d: ['M10.5 4.5a6 6 0 1 0 0 12a6 6 0 1 0 0-12z', 'M15 15l4.5 4.5'], stroke: true, w: 2.1 },
    lyrics: { d: ['M5 5.5h14a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-6.5L8 20.5V17H5a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z', 'M7.5 9.5h9M7.5 13h6'], stroke: true, w: 1.8 },
  };
  function icon(name) {
    const spec = ICON[name];
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of spec.d) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      if (spec.stroke) {
        p.setAttribute('fill', 'none');
        p.setAttribute('stroke', 'currentColor');
        p.setAttribute('stroke-width', String(spec.w || 1.9));
        p.setAttribute('stroke-linecap', 'round');
      } else {
        p.setAttribute('fill', 'currentColor');
        // 塗りの図形も角を少し丸める
        if (!spec.plain) { p.setAttribute('stroke', 'currentColor'); p.setAttribute('stroke-width', '1.6'); }
      }
      p.setAttribute('stroke-linejoin', 'round');
      svg.append(p);
    }
    return svg;
  }
  const iconButton = (name, cls, title, onclick) => h('button', { class: 'icon ' + cls, title, 'aria-label': title, onclick }, icon(name));

  const S = {
    id: null, info: null, video: null, player: null,
    items: [], els: [], synced: false, record: null, guess: null, candidates: [],
    offset: 0, scale: 1, scaleAuto: false, repeat: false,
    active: -2, open: false, raf: 0, tick: 0, blobTick: -99, lastDrawn: -1, wasPaused: null,
    browsing: false, browseShift: 0, browseTimer: 0, loading: null, loadedId: null,
  };

  // ---------- 外部とのやりとり ----------
  async function lrclib(path) {
    const res = await chrome.runtime.sendMessage({ type: 'lrclib', path });
    if (!res?.ok) throw new Error(res?.error || '通信できませんでした');
    return res.data;
  }

  function pageData() {
    return new Promise((resolve) => {
      const on = (e) => { done(); try { resolve(JSON.parse(e.detail)); } catch { resolve(null); } };
      const done = () => document.removeEventListener('ytl:video', on);
      document.addEventListener('ytl:video', on);
      document.dispatchEvent(new CustomEvent('ytl:ask'));
      setTimeout(() => { done(); resolve(null); }, 300);
    });
  }

  const storeKey = (id) => 'v:' + id;
  function save() {
    if (!S.id) return;
    chrome.storage.local.set({ [storeKey(S.id)]: { lrclibId: S.record?.id ?? null, offset: S.offset, scale: S.scale, scaleAuto: S.scaleAuto } });
  }

  // ---------- 画面 ----------
  const host = h('div', { id: 'ytl-host' });
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(globalThis.YTL_CSS);
  shadow.adoptedStyleSheets = [sheet];

  const blobs = ['b1', 'b2', 'b3'].map((c) => h('canvas', { class: 'blob ' + c, width: '16', height: '16' }));
  const blobCtx = blobs.map((c) => c.getContext('2d'));
  const mirror = h('canvas', { class: 'mirror' });
  const titleEl = h('div', { class: 't' });
  const artistEl = h('div', { class: 'a' });
  const srcEl = h('div', { class: 'src' });
  const fillEl = h('div', { class: 'fill' });
  const timeL = h('span'), timeR = h('span');
  const repeatBtn = h('button', { class: 'icon repeat', onclick: toggleRepeat });
  const playBtn = h('button', { class: 'icon tbtn play', title: '再生 / 一時停止', 'aria-label': '再生 / 一時停止', onclick: playPause }, icon('play'));
  const pill = h('button', { class: 'pill', title: '再生オプション', onclick: () => toggleSheet() });

  // 再生オプション
  const rateVal = h('span', { class: 'val' });
  // 動かし終えたらフォーカスを外し、外からの速度変更もスライダーに反映されるようにする
  const rateRange = h('input', { type: 'range', min: '-12', max: '12', step: '0.1', value: '0', oninput: (e) => setRate(2 ** (+e.target.value / 12)), onchange: (e) => e.target.blur() });
  const scaleVal = h('span', { class: 'val' });
  const scaleHint = h('div', { class: 'hint' });
  const scaleRange = h('input', { type: 'range', min: '-6', max: '6', step: '0.05', value: '0', oninput: (e) => setScale(2 ** (+e.target.value / 12), false), onchange: (e) => e.target.blur() });
  const offVal = h('span', { class: 'val' });
  const btn = (label, onclick, title) => h('button', { class: 'btn', onclick, ...(title ? { title } : {}) }, label);
  const sec = (label, sub, val, ...rest) =>
    h('div', { class: 'sec' }, h('div', { class: 'head' }, h('span', {}, label, sub ? h('small', {}, sub) : null), val), ...rest);

  const optSheet = h('div', { class: 'sheet' },
    h('div', { class: 'shead' }, h('b', {}, '再生オプション'), iconButton('close', 'x', '閉じる', () => closeSheet())),
    sec('再生速度', 'キー固定なし', rateVal,
      h('div', { class: 'row' }, btn('−半音', () => stepSemitone(-1)), rateRange, btn('＋半音', () => stepSemitone(1)), btn('1x', () => setRate(1)))),
    sec('動画の速さ', 'slowed / sped up', scaleVal,
      h('div', { class: 'row' }, scaleRange, btn('自動', autoScale, '歌詞データと動画の長さの比から推定'), btn('1x', () => setScale(1, false))),
      scaleHint),
    sec('歌詞のタイミング', '', offVal,
      h('div', { class: 'row' },
        btn('−0.5', () => setOffset(S.offset - 0.5)), btn('−0.1', () => setOffset(S.offset - 0.1)), btn('0', () => setOffset(0)),
        btn('+0.1', () => setOffset(S.offset + 0.1)), btn('+0.5', () => setOffset(S.offset + 0.5))),
      h('div', { class: 'hint' }, '歌詞が遅れて見えるなら＋。今歌っている行を Ctrl+クリックすると一発で合います')),
    h('button', { class: 'wide', onclick: () => { closeSheet(); openDrawer(); } }, '歌詞を選び直す'));

  // 歌詞の選び直し
  const qInput = h('input', { type: 'search', placeholder: '曲名 アーティスト' });
  const results = h('div', { class: 'results' });
  const drawerNote = h('div', { class: 'note' });
  const drawer = h('div', { class: 'drawer' },
    h('div', { class: 'shead' }, h('b', {}, '歌詞を選ぶ'), iconButton('close', 'x', '閉じる', () => closeDrawer())),
    h('div', { class: 'row' }, qInput, btn('検索', () => manualSearch())),
    drawerNote, results);

  const track = h('div', { class: 'track' });
  const lyricsBox = h('div', { class: 'lyrics' }, track);
  const status = h('div', { class: 'status' });
  const rightCol = h('div', { class: 'right' }, lyricsBox, status);

  const ov = h('div', { class: 'ov' },
    h('div', { class: 'bgw' }, ...blobs), h('div', { class: 'shade' }),
    h('div', { class: 'left' },
      h('div', { class: 'col' },
        h('div', { class: 'art' }, mirror),
        h('div', { class: 'info' },
          h('div', { class: 'meta' }, titleEl, artistEl, srcEl),
          iconButton('more', 'more', '再生オプション', () => toggleSheet())),
        h('div', { class: 'scrub' },
          h('div', { class: 'prog', onclick: seekBar }, h('div', { class: 'bar' }, fillEl)),
          h('div', { class: 'tl' }, timeL, timeR)),
        h('div', { class: 'transport' },
          repeatBtn,
          iconButton('prev', 'tbtn', '最初から / 前の動画', prev),
          playBtn,
          iconButton('next', 'tbtn', '次の動画', next),
          pill))),
    rightCol,
    h('div', { class: 'top' },
      iconButton('search', 'circ', '歌詞を選ぶ', () => toggleDrawer()),
      iconButton('close', 'circ', '閉じる (Esc)', () => close())),
    optSheet, drawer);
  shadow.append(ov);
  document.documentElement.append(host);

  const mctx = mirror.getContext('2d');

  // ---------- スライダーの塗り（0 を中心に、今の値までを白くする） ----------
  function paintRange(input) {
    const min = +input.min, max = +input.max;
    const p = ((+input.value - min) / (max - min)) * 100;
    const zero = ((0 - min) / (max - min)) * 100;
    input.style.setProperty('--a', Math.min(p, zero) + '%');
    input.style.setProperty('--b', Math.max(p, zero) + '%');
  }
  function setRangeValue(input, v) {
    if (shadow.activeElement !== input) input.value = String(v);
    paintRange(input);
  }

  // ---------- 再生速度（キー固定なし） ----------
  function unlockPitch(v) {
    if (v && v.preservesPitch !== false) v.preservesPitch = false;
  }

  function setRate(r) {
    const v = S.video;
    if (!v) return;
    unlockPitch(v);
    v.playbackRate = clamp(r, 0.5, 2);
    showRate();
  }

  function stepSemitone(dir) {
    const now = Math.round(semis(S.video?.playbackRate || 1));
    setRate(2 ** ((now + dir) / 12));
  }

  function showRate() {
    const r = S.video?.playbackRate || 1;
    rateVal.textContent = `${r.toFixed(2)}x · ${fmtSemi(r)} 半音`;
    setRangeValue(rateRange, semis(r).toFixed(1));
    pill.textContent = `${r.toFixed(2)}x`;
    pill.classList.toggle('changed', Math.abs(r - 1) > 0.001);
  }

  // ---------- 動画の速さ（slowed / sped up）：歌詞の時刻 = 動画の時刻 × scale + offset ----------
  const lyricTime = (v) => v.currentTime * S.scale + S.offset;

  function setScale(x, auto) {
    S.scale = clamp(Math.round(x * 1000) / 1000, 0.6, 1.6);
    S.scaleAuto = !!auto;
    scaleHint.textContent = '';
    showScale();
    save();
  }

  function autoScale() {
    const k = Y.estimateScale(S.record?.duration, S.video?.duration || S.info?.duration);
    if (k) setScale(k, true);
    else scaleHint.textContent = '推定できませんでした（歌詞データの長さが不明か、比が大きすぎます）';
  }

  // slowed / sped up 版らしい動画（または前回自動だった動画）だけ、長さの比から自動で合わせる
  function maybeAutoScale() {
    if (!(S.guess?.variant || S.scaleAuto)) return;
    const k = Y.estimateScale(S.record?.duration, S.video?.duration || S.info?.duration);
    S.scale = k || 1;
    S.scaleAuto = !!k;
  }

  function showScale() {
    const k = S.scale;
    scaleVal.textContent = `原曲比 ${k.toFixed(3)}x · ${fmtSemi(k)} 半音` + (S.scaleAuto ? '（自動）' : '');
    setRangeValue(scaleRange, semis(k).toFixed(2));
    showSrc();
  }

  function showSrc() {
    const rec = S.record;
    let s = rec ? `LRCLIB #${rec.id}` + (S.synced ? '' : ' · タイミングなし') : '';
    if (rec && Math.abs(S.scale - 1) > 0.001) s += ` · ${S.scale > 1 ? 'sped up' : 'slowed'} ${S.scale.toFixed(2)}x で同期`;
    srcEl.textContent = s;
  }

  // ---------- 歌詞のタイミング ----------
  function setOffset(x) {
    S.offset = Math.round(x * 20) / 20;
    showOffset();
    save();
  }
  function showOffset() {
    offVal.textContent = (S.offset >= 0 ? '+' : '−') + Math.abs(S.offset).toFixed(2) + ' 秒';
  }

  // ---------- 再生操作 ----------
  function playPause() {
    const v = S.video;
    if (v) v.paused ? v.play() : v.pause();
  }

  function prev() {
    const v = S.video;
    if (!v) return;
    const pb = S.player?.querySelector('.ytp-prev-button');
    if (v.currentTime < 3 && pb && getComputedStyle(pb).display !== 'none') pb.click();
    else v.currentTime = 0;
  }

  function next() {
    S.player?.querySelector('.ytp-next-button')?.click();
  }

  function toggleRepeat() {
    S.repeat = !S.repeat;
    if (S.video) S.video.loop = S.repeat;
    showRepeat();
    chrome.storage.local.set({ prefs: { repeat: S.repeat } });
  }
  function showRepeat() {
    repeatBtn.replaceChildren(icon(S.repeat ? 'repeat1' : 'repeat'));
    repeatBtn.classList.toggle('on', S.repeat);
    repeatBtn.title = S.repeat ? 'リピート中（クリックで解除）' : 'リピート（この動画をくり返す）';
    repeatBtn.setAttribute('aria-pressed', String(S.repeat));
  }

  // ---------- 動画 ----------
  const attached = new WeakSet();
  function attachVideo(v) {
    S.video = v;
    if (!v || attached.has(v)) return;
    attached.add(v);
    unlockPitch(v);
    for (const ev of ['loadedmetadata', 'play', 'ratechange']) {
      v.addEventListener(ev, () => {
        unlockPitch(v);
        if (S.repeat) v.loop = true;
        showRate();
      });
    }
    if (S.repeat) v.loop = true;
    showRate();
  }

  function seekBar(e) {
    const v = S.video;
    if (!v || !isFinite(v.duration)) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = clamp((e.clientX - r.left) / r.width, 0, 1) * v.duration;
  }

  function drawVideo(v) {
    if (v.readyState < 2 || !v.videoWidth) return;
    if (v.paused && v.currentTime === S.lastDrawn) return;
    S.lastDrawn = v.currentTime;
    const vw = v.videoWidth, vh = v.videoHeight;
    const w = Math.round(mirror.clientWidth * devicePixelRatio);
    const ht = Math.round(mirror.clientHeight * devicePixelRatio);
    if (w && ht) {
      if (mirror.width !== w || mirror.height !== ht) { mirror.width = w; mirror.height = ht; }
      const k = Math.min(w / vw, ht / vh);
      const dw = vw * k, dh = vh * k;
      mctx.fillStyle = '#000';
      mctx.fillRect(0, 0, w, ht);
      mctx.drawImage(v, (w - dw) / 2, (ht - dh) / 2, dw, dh);
    }
    // 背景の 3 つのにじみには映像の別々の部分を使い、色に変化をつける
    if (v.paused || S.tick - S.blobTick >= 10) {
      S.blobTick = S.tick;
      blobCtx[0].drawImage(v, 0, 0, vw, vh, 0, 0, 16, 16);
      blobCtx[1].drawImage(v, 0, 0, vw / 2, vh, 0, 0, 16, 16);
      blobCtx[2].drawImage(v, vw / 2, vh / 3, vw / 2, (vh * 2) / 3, 0, 0, 16, 16);
    }
  }

  function updateTime(v) {
    const d = v.duration;
    fillEl.style.width = isFinite(d) && d > 0 ? (v.currentTime / d) * 100 + '%' : '0';
    timeL.textContent = fmt(v.currentTime);
    timeR.textContent = '−' + fmt(Math.max(0, (d || 0) - v.currentTime));
    if (S.wasPaused !== v.paused) {
      S.wasPaused = v.paused;
      playBtn.replaceChildren(icon(v.paused ? 'play' : 'pause'));
      ov.classList.toggle('paused', v.paused);
    }
  }

  // ---------- 歌詞の描画とスクロール ----------
  function showStatus(msg) {
    status.textContent = msg || '';
    status.hidden = !msg;
  }

  function resetLyrics(msg) {
    S.items = [];
    S.els = [];
    S.synced = false;
    S.record = null;
    S.active = -2;
    track.textContent = '';
    srcEl.textContent = '';
    showStatus(msg);
  }

  function renderLyrics() {
    track.textContent = '';
    S.active = -2;
    S.browsing = false;
    S.browseShift = 0;
    ov.classList.remove('browsing');
    ov.classList.toggle('plain', !S.synced);
    S.els = S.items.map((it, i) => {
      if (it.kind === 'interlude') {
        it.dots = [h('i'), h('i'), h('i')];
        return track.appendChild(h('div', { class: 'line interlude' }, h('span', { class: 'dots' }, ...it.dots)));
      }
      it.unitEls = (it.units || [{ text: it.text }]).map((u) => h('span', { class: 'u' }, u.text));
      it.pos = null;
      it.on = null;
      const el = h('div', { class: 'line' + (it.gapBefore ? ' gap' : ''), onclick: (e) => onLineClick(e, i) }, ...it.unitEls);
      return track.appendChild(el);
    });
    requestAnimationFrame(() => layout(true));
  }

  const topOf = (i) => S.els[clamp(i, 0, S.els.length - 1)]?.offsetTop || 0;

  function layout(instant) {
    const els = S.els;
    if (!els.length || !S.open) return;
    const ref = Math.max(0, S.active);
    const anchor = S.synced ? lyricsBox.clientHeight * 0.32 : 48;
    const y = anchor - topOf(ref) + S.browseShift + 'px';
    const free = instant || S.browsing;
    if (instant) ov.classList.add('instant');
    els.forEach((el, j) => {
      const d = j - ref;
      el.style.setProperty('--y', y);
      // 上の行から順に少しずつ遅れて動かし、Apple Music のような波打つスクロールにする
      el.style.setProperty('--delay', free ? '0ms' : clamp(d + 1, 0, 10) * 40 + 'ms');
      el.style.setProperty('--blur', S.browsing || !S.synced ? '0px' : Math.min(Math.abs(d), 5) * 0.55 + 'px');
    });
    if (instant) {
      void track.offsetHeight;
      requestAnimationFrame(() => ov.classList.remove('instant'));
    }
  }

  function browse(dy) {
    if (!S.els.length) return;
    S.browsing = true;
    if (S.synced) ov.classList.add('browsing');
    const top0 = topOf(S.active);
    const last = topOf(S.els.length - 1);
    S.browseShift = clamp(S.browseShift - dy, top0 - last, top0);
    layout();
    clearTimeout(S.browseTimer);
    if (S.synced) S.browseTimer = setTimeout(endBrowse, 3000);
  }

  function endBrowse() {
    clearTimeout(S.browseTimer);
    if (!S.browsing) return;
    S.browsing = false;
    S.browseShift = 0;
    ov.classList.remove('browsing');
    layout();
  }

  function onLineClick(e, i) {
    const it = S.items[i], v = S.video;
    if (!S.synced || !v) return;
    if (e.ctrlKey || e.altKey) {
      // クリックまでの反応の遅れぶん（0.2 秒）だけ、行頭より先に進んでいたとみなす
      setOffset(it.start + 0.2 * S.scale - v.currentTime * S.scale);
    } else {
      v.currentTime = Math.max(0, (it.start - S.offset) / S.scale);
    }
    endBrowse();
  }

  function setActive(idx) {
    const prev = S.active;
    if (prev >= 0 && S.items[prev]) {
      const it = S.items[prev];
      S.els[prev].classList.remove('active');
      it.unitEls?.forEach((u) => { u.style.backgroundPositionX = ''; u.classList.remove('on'); });
      it.dots?.forEach((d) => (d.style.opacity = ''));
      it.pos = it.on = null;
    }
    if (S.browsing) S.browseShift += topOf(idx) - topOf(prev);
    S.active = idx;
    if (idx >= 0) {
      S.els[idx].classList.add('active');
      const it = S.items[idx];
      if (it.unitEls) {
        it.pos = it.unitEls.map(() => -1);
        it.on = it.unitEls.map(() => false);
      }
    }
    layout();
  }

  function paint(idx, t) {
    const it = S.items[idx];
    if (it.kind === 'interlude') {
      const f = (t - it.start) / (it.end - it.start);
      it.dots.forEach((d, k) => (d.style.opacity = String(DIM + (1 - DIM) * clamp(f * 3 - k, 0, 1))));
      return;
    }
    it.units.forEach((u, k) => {
      const f = clamp((t - u.t0) / (u.t1 - u.t0 || 1e-3), 0, 1);
      const pos = Math.round((1 - f) * 1000) / 10;
      const el = it.unitEls[k];
      if (it.pos[k] !== pos) {
        it.pos[k] = pos;
        el.style.backgroundPositionX = pos + '%';
      }
      // 歌い始めた文字から浮かび上がらせる
      const on = f > 0;
      if (it.on[k] !== on) {
        it.on[k] = on;
        el.classList.toggle('on', on);
      }
    });
  }

  function frame() {
    S.raf = requestAnimationFrame(frame);
    const v = S.video;
    if (!v) return;
    S.tick++;
    drawVideo(v);
    if (S.tick % 4 === 0) updateTime(v);
    if (!S.synced || !S.items.length || S.player?.classList.contains('ad-showing')) return;
    // currentTime は動画内の時刻なので、再生速度を変えても歌詞はそのまま追従する
    const t = lyricTime(v);
    const idx = Y.findActive(S.items, t);
    if (idx !== S.active) setActive(idx);
    if (idx >= 0) paint(idx, t);
  }

  // ---------- 歌詞の検索 ----------
  async function autoSearch(info) {
    const g = S.guess;
    const dur = S.video?.duration || info.duration;
    const queries = [];
    if (g.track && g.artist) queries.push({ track_name: g.track, artist_name: g.artist });
    queries.push({ q: [g.track, g.artist].filter(Boolean).join(' ') });
    if (g.track) queries.push({ track_name: g.track });
    const seen = new Map();
    let ranked = [];
    for (const q of queries) {
      const list = await lrclib('/api/search?' + new URLSearchParams(q)).catch(() => []);
      for (const r of list) if (!seen.has(r.id)) seen.set(r.id, r);
      ranked = Y.rank([...seen.values()], g, dur);
      if (ranked[0]?.s >= 4) break;
    }
    return ranked.map((x) => x.r);
  }

  async function load(id) {
    const token = (S.loading = {});
    S.loadedId = id;
    resetLyrics('歌詞を探しています…');
    const info = S.info;
    S.guess = Y.guessFromTitle(info?.title, info?.author);
    titleEl.textContent = S.guess.track || info?.title || '';
    artistEl.textContent = S.guess.artist || '';
    const saved = (await chrome.storage.local.get(storeKey(id)))[storeKey(id)] || {};
    if (S.loading !== token) return;
    S.offset = saved.offset || 0;
    S.scale = saved.scale || 1;
    S.scaleAuto = !!saved.scaleAuto;
    scaleHint.textContent = '';
    showOffset();
    showScale();

    let rec = null;
    if (saved.lrclibId) rec = await lrclib('/api/get/' + saved.lrclibId).catch(() => null);
    if (!rec) {
      try {
        const list = await autoSearch(info);
        if (S.loading !== token) return;
        S.candidates = list;
        rec = list[0] || null;
      } catch (e) {
        if (S.loading === token) showStatus('検索に失敗しました：' + e.message);
        return;
      }
    }
    if (S.loading !== token) return;
    applyRecord(rec, !saved.scale);
  }

  function applyRecord(rec, rescale) {
    S.record = rec;
    if (rescale) maybeAutoScale();
    titleEl.textContent = rec?.trackName || S.guess?.track || S.info?.title || '';
    artistEl.textContent = rec?.artistName || S.guess?.artist || '';
    S.synced = !!rec?.syncedLyrics;
    if (S.synced) S.items = Y.buildTimeline(Y.parseLRC(rec.syncedLyrics), (S.video?.duration || 0) * S.scale);
    else S.items = rec?.plainLyrics ? Y.plainItems(rec.plainLyrics) : [];
    showScale();
    if (!rec) showStatus('歌詞が見つかりませんでした。右上の 🔍 から検索できます');
    else if (!S.items.length) showStatus(rec.instrumental ? 'インストゥルメンタルの曲です' : 'この候補には歌詞がありません');
    else showStatus('');
    renderLyrics();
  }

  // ---------- パネル開閉 ----------
  function toggleSheet(force) {
    const open = optSheet.classList.toggle('open', force);
    if (open) closeDrawer();
  }
  const closeSheet = () => optSheet.classList.remove('open');

  function openDrawer() {
    closeSheet();
    drawer.classList.add('open');
    if (!qInput.value) qInput.value = [S.guess?.track, S.guess?.artist].filter(Boolean).join(' ');
    showResults(S.candidates, S.candidates.length ? '自動検索の候補' : '');
    // スクロールさせずにフォーカスする（させると画面全体が横にずれる）
    qInput.focus({ preventScroll: true });
  }
  const closeDrawer = () => drawer.classList.remove('open');
  const toggleDrawer = () => (drawer.classList.contains('open') ? closeDrawer() : openDrawer());

  function showResults(list, note) {
    drawerNote.textContent = note || '';
    results.textContent = '';
    for (const r of list.slice(0, 30)) {
      const kind = r.syncedLyrics ? '同期あり' : r.plainLyrics ? '同期なし' : '歌詞なし';
      results.append(h('button', { class: 'res' + (r.id === S.record?.id ? ' cur' : ''), onclick: () => choose(r) },
        h('b', {}, r.trackName || '?'),
        h('span', {}, `${r.artistName || '?'} · ${r.albumName || '-'} · ${r.duration ? fmt(r.duration) : '?:??'} · ${kind}`)));
    }
  }

  async function manualSearch() {
    const q = qInput.value.trim();
    if (!q) return;
    drawerNote.textContent = '検索中…';
    try {
      const list = await lrclib('/api/search?' + new URLSearchParams({ q }));
      const dur = S.video?.duration || 0;
      const variant = S.guess?.variant;
      list.sort((a, b) => !!b.syncedLyrics - !!a.syncedLyrics || Y.durationPenalty(a, dur, variant) - Y.durationPenalty(b, dur, variant));
      showResults(list, list.length ? `${list.length} 件（同期あり・長さが近い順）` : '見つかりませんでした');
    } catch (e) {
      drawerNote.textContent = '検索に失敗しました：' + e.message;
    }
  }

  function choose(r) {
    applyRecord(r, true);
    save();
    closeDrawer();
  }

  // ---------- 開閉 ----------
  function open() {
    if (S.open) return;
    S.open = true;
    host.style.display = 'block';
    if (!S.id) resetLyrics('動画を再生すると歌詞を探します');
    else if (S.loadedId !== S.id) load(S.id);
    S.wasPaused = null;
    S.lastDrawn = -1;
    cancelAnimationFrame(S.raf);
    S.raf = requestAnimationFrame(frame);
    requestAnimationFrame(() => layout(true));
  }
  function close() {
    S.open = false;
    host.style.display = 'none';
    closeSheet();
    closeDrawer();
    cancelAnimationFrame(S.raf);
  }
  const toggle = () => (S.open ? close() : open());

  // ---------- 入力 ----------
  ov.addEventListener('wheel', (e) => {
    if (results.contains(e.target) || optSheet.contains(e.target)) return;
    e.preventDefault();
    if (rightCol.contains(e.target)) browse(e.deltaY);
  }, { passive: false });

  // ボタンにフォーカスを残さない（残るとスペースキーでボタンまで押されてしまう）
  ov.addEventListener('mousedown', (e) => {
    if (e.target.closest?.('button')) e.preventDefault();
  });
  // オプション画面の外を押したら閉じる
  ov.addEventListener('pointerdown', (e) => {
    if (optSheet.classList.contains('open') && !optSheet.contains(e.target) && !e.target.closest?.('.more, .pill')) closeSheet();
  });

  new ResizeObserver(() => layout(true)).observe(lyricsBox);

  // 先に window の capture で受けて、YouTube のショートカットより優先する
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, (e) => {
      const path = e.composedPath();
      const tgt = path[0];
      const typing = tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName));
      const inOverlay = path.includes(host);
      if (type === 'keydown') {
        if (e.key === 'Escape' && S.open) {
          e.stopImmediatePropagation();
          if (optSheet.classList.contains('open')) closeSheet();
          else if (drawer.classList.contains('open')) closeDrawer();
          else close();
          return;
        }
        if (e.code === 'KeyL' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && !typing) {
          e.preventDefault();
          e.stopImmediatePropagation();
          toggle();
          return;
        }
        if (inOverlay && tgt === qInput && e.key === 'Enter') manualSearch();
      }
      // 検索欄やスライダーでの入力を YouTube に渡さない（k で一時停止…等を防ぐ）
      if (inOverlay && typing) e.stopImmediatePropagation();
    }, true);
  }

  // フルスクリーン中はその要素の中にいないと見えない
  document.addEventListener('fullscreenchange', () => {
    (document.fullscreenElement || document.documentElement).append(host);
    if (S.open) requestAnimationFrame(() => layout(true));
  });

  // ---------- プレイヤーへのボタン追加 ----------
  function ensureButton() {
    const rc = document.querySelector('#movie_player .ytp-right-controls');
    if (!rc || rc.querySelector('.ytl-btn')) return;
    const svg = icon('lyrics');
    svg.setAttribute('viewBox', '-6 -6 36 36');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.style.color = '#fff';
    rc.prepend(h('button', { class: 'ytp-button ytl-btn', title: '歌詞 (Shift+L)', 'aria-label': '歌詞', onclick: toggle }, svg));
  }

  // ---------- 動画の切り替わり監視（YouTube は SPA なので URL 遷移では再読込されない） ----------
  async function poll() {
    S.player = document.getElementById('movie_player');
    const v = S.player?.querySelector('video') || null;
    if (v !== S.video) attachVideo(v);
    else unlockPitch(v);
    if (v && S.repeat && !v.loop) v.loop = true;
    ensureButton();
    // 広告中は広告の動画情報が返るので見ない
    if (S.player?.classList.contains('ad-showing')) return;
    const d = await pageData();
    if (!d?.id || !d.title) return;
    if (d.id !== S.id) {
      S.id = d.id;
      S.info = d;
      S.candidates = [];
      S.guess = null;
      qInput.value = '';
      closeDrawer();
      resetLyrics('');
      titleEl.textContent = d.title;
      artistEl.textContent = '';
      if (S.open) load(d.id);
    }
  }

  chrome.storage.local.get('prefs').then((o) => {
    S.repeat = !!o.prefs?.repeat;
    if (S.repeat && S.video) S.video.loop = true;
    showRepeat();
  });
  showRepeat();
  showOffset();
  showScale();
  setInterval(poll, 1000);
  document.addEventListener('yt-navigate-finish', () => setTimeout(poll, 300));
  poll();
})();
