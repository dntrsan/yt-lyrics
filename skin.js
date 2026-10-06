// YouTube の見た目のカスタム：ロゴの流れるグラデーション、ボタンのリキッドグラス化、グッド／バッドの演出
// 設定は chrome.storage の skin（拡張機能のポップアップで切り替え）。見た目の大半は page.css 側
(() => {
  'use strict';
  const DEFAULT_SKIN = { logo: true, glass: true, like: true };
  // 赤 → 赤みのオレンジ → オレンジ → 山吹色（流すときは往復させて、つなぎ目を作らない）
  const PALETTE = ['#ff1e3c', '#ff5a26', '#ff9a24', '#ffc53d'];
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.documentElement;
  let skin = { ...DEFAULT_SKIN };

  const svgEl = (tag, attrs = {}, ...kids) => {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  };

  // ---------- 流れるグラデーション（ロゴと、グッドしたアイコンの塗り） ----------
  // userSpaceOnUse + repeat なので、文字ごとに切れずに 1 本のグラデーションとして流れる
  function gradient(id, period, dur) {
    const colors = [...PALETTE, ...PALETTE.slice(0, -1).reverse()];
    return svgEl('linearGradient', { id, gradientUnits: 'userSpaceOnUse', x1: '0', y1: '0', x2: String(period), y2: '0', spreadMethod: 'repeat' },
      ...colors.map((c, i) => svgEl('stop', { offset: String(i / (colors.length - 1)), 'stop-color': c })),
      svgEl('animateTransform', { attributeName: 'gradientTransform', type: 'translate', from: '0 0', to: `${period} 0`, dur, repeatCount: 'indefinite' }));
  }
  // display:none の SVG に置いたグラデーションは参照できないので、大きさ 0 で置いておく
  const defs = svgEl('svg', { 'aria-hidden': 'true', width: '0', height: '0', style: 'position:absolute;width:0;height:0;overflow:hidden' },
    svgEl('defs', {}, gradient('ytl-grad', 60, '5s'), gradient('ytl-grad-s', 24, '2.5s')));
  const ensureDefs = () => { if (!defs.isConnected && document.body) document.body.append(defs); };

  // ---------- グッド／バッドのアイコン（YouTube のアイコンを隠して、こちらを出す） ----------
  const THUMB = [
    'M3.5 10h3v10.5h-3a1 1 0 0 1-1-1V11a1 1 0 0 1 1-1z',
    'M6.5 10l3.8-6.6c.5-.9 1.9-.9 2.4 0 .3.5.3 1.1.1 1.6L11.6 9h6.9a2 2 0 0 1 2 2.4l-1.5 7.4a2.2 2.2 0 0 1-2.2 1.7H6.5z',
  ];
  const BUTTONS = 'like-button-view-model button, dislike-button-view-model button';
  const kindOf = (btn) => (btn.closest('dislike-button-view-model') ? 'dislike' : 'like');

  // 輪郭（.o）と、下から満ちていく塗り（.f）の 2 枚重ね。塗りの高さは clipPath の四角（.ytl-level）で決める
  let uid = 0;
  function thumbIcon(kind) {
    const id = 'ytl-level-' + ++uid;
    const shape = () => svgEl('g', kind === 'dislike' ? { transform: 'translate(0 24) scale(1 -1)' } : {}, ...THUMB.map((d) => svgEl('path', { d })));
    return svgEl('svg', { class: 'ytl-thumb ' + kind, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
      svgEl('defs', {}, svgEl('clipPath', { id }, svgEl('rect', { class: 'ytl-level', x: '-2', y: '-2', width: '28', height: '28' }))),
      svgEl('g', { class: 'o' }, shape()),
      svgEl('g', { class: 'f', 'clip-path': `url(#${id})` }, shape()));
  }

  // YouTube はボタンを作り直すことがあるので、定期的に付け直す
  function decorate() {
    for (const btn of document.querySelectorAll(BUTTONS)) {
      const box = btn.querySelector('.ytSpecButtonShapeNextIcon');
      if (box && !box.querySelector('.ytl-thumb')) box.append(thumbIcon(kindOf(btn)));
    }
  }

  // ---------- 押したときの演出 ----------
  const fx = document.createElement('div');
  fx.id = 'ytl-fx';
  const ensureFx = () => { if (!fx.isConnected && document.body) document.body.append(fx); };
  const rand = (a, b) => a + Math.random() * (b - a);

  function spawn(cx, cy, size, css) {
    const el = document.createElement('i');
    el.style.cssText = `left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;${css}`;
    fx.append(el);
    return el;
  }
  const fadeOut = (el, frames, opts) => el.animate(frames, { fill: 'forwards', ...opts }).finished.then(() => el.remove(), () => el.remove());

  // ばねの動きをキーフレームにする（行き過ぎてから小さく揺れて落ち着く。機械的な往復にしない）
  const frames = (n, f) => Array.from({ length: n + 1 }, (_, i) => ({ ...f(i / n), offset: i / n }));
  function likePop(t) {
    // 最初の 1 割で 0.82 倍まで沈み、そこから勢いよく戻って少しだけ大きくなり、揺れながら落ち着く
    if (t < 0.1) return { transform: `scale(${(1 - 0.18 * Math.sin((t / 0.1) * Math.PI / 2)).toFixed(4)})` };
    const u = (t - 0.1) / 0.9;
    const e = Math.exp(-5 * u);
    const s = 1 - 0.18 * e * Math.cos(11 * u) + 0.32 * e * Math.sin(11 * u);
    const r = -9 * e * Math.sin(11 * u);
    return { transform: `scale(${s.toFixed(4)}) rotate(${r.toFixed(2)}deg)` };
  }
  const settle = (t) => {
    const e = Math.exp(-6 * t);
    return { transform: `scale(${(1 - 0.12 * e * Math.cos(10 * t)).toFixed(4)})` };
  };

  // 4 本の光の筋を持つ小さな星
  const STAR = 'M12 0C12.8 7.2 16.8 11.2 24 12 16.8 12.8 12.8 16.8 12 24 11.2 16.8 7.2 12.8 0 12 7.2 11.2 11.2 7.2 12 0z';
  function spawnStar(cx, cy, size) {
    const el = spawn(cx, cy, size, 'filter:drop-shadow(0 0 3px rgba(255,190,90,.9))');
    el.append(svgEl('svg', { viewBox: '0 0 24 24', width: '100%', height: '100%', style: 'display:block' }, svgEl('path', { d: STAR, fill: '#fff4dc' })));
    return el;
  }

  function playLike(btn, icon, cx, cy) {
    // ボタン全体がわずかに押し込まれる
    btn.animate([{ transform: 'scale(1)' }, { transform: 'scale(.965)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)' });
    // アイコンはばねで弾む（塗りが下から満ちるのは CSS の transition）
    icon.animate(frames(48, likePop), { duration: 860, easing: 'linear' });
    // 温かい光がふわっとふくらむ（screen で重ねて、アイコンを隠さず明るくする）
    fadeOut(spawn(cx, cy, 46, 'border-radius:50%;mix-blend-mode:screen;background:radial-gradient(circle,rgba(255,160,70,.7),rgba(255,40,60,.28) 45%,transparent 70%)'),
      [{ transform: 'scale(.35)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 720, delay: 60, easing: 'cubic-bezier(.2,.7,.2,1)' });
    // 細い光の輪が 1 本だけ広がる
    fadeOut(spawn(cx, cy, 30, 'border-radius:50%;mix-blend-mode:screen;border:1.5px solid rgba(255,176,96,.95);box-shadow:0 0 10px rgba(255,90,40,.55)'),
      [{ transform: 'scale(.55)', opacity: 0.9 }, { transform: 'scale(1.65)', opacity: 0 }], { duration: 640, delay: 90, easing: 'cubic-bezier(.2,.7,.2,1)' });
    // 上のほうで小さな星がきらっと瞬く
    [-150, -108, -66, -24, 18].forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const d = rand(17, 23);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      fadeOut(spawnStar(cx, cy, rand(7, 10.5)),
        [
          { transform: `translate(${x * 0.7}px,${y * 0.7}px) scale(0) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${x}px,${y}px) scale(1) rotate(35deg)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${x * 1.12}px,${y * 1.12}px) scale(0) rotate(90deg)`, opacity: 0 },
        ],
        { duration: rand(520, 640), delay: 110 + i * 45, easing: 'cubic-bezier(.3,.6,.3,1)' });
    });
    // 高評価の数字がふわっとせり上がる
    btn.querySelector('.ytSpecButtonShapeNextButtonTextContent')?.animate(
      [{ transform: 'translateY(.5em)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 440, delay: 100, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  }

  function playDislike(icon, cx, cy) {
    // しょんぼり沈んで、ゆらゆら揺れる
    icon.animate([
      { transform: 'translateY(0) rotate(0)' },
      { transform: 'translateY(3px) scale(1.12,.86)', offset: 0.22 },
      { transform: 'translateY(1px) rotate(-12deg)', offset: 0.45 },
      { transform: 'rotate(9deg)', offset: 0.65 },
      { transform: 'rotate(-4deg)', offset: 0.82 },
      { transform: 'none' },
    ], { duration: 820, easing: 'ease-out' });
    // しずくがぽたぽた落ちる
    [-6, 1, 7].forEach((dx, i) => {
      fadeOut(spawn(cx + dx, cy + 8, 5, 'width:4px;border-radius:50% 50% 50% 50% / 60% 60% 40% 40%;background:#9fb4d6;box-shadow:0 0 4px rgba(159,180,214,.6)'),
        [{ transform: 'translateY(-4px) scale(.6)', opacity: 0 }, { transform: 'translateY(2px) scale(1)', opacity: 1, offset: 0.25 }, { transform: 'translateY(22px) scale(.8)', opacity: 0 }],
        { duration: 760, delay: 120 + i * 130, easing: 'cubic-bezier(.5,0,.8,.6)' });
    });
  }

  // 解除したときは小さく沈んで戻るだけ（塗りが下へ抜けるのは CSS）
  function playRelease(icon) {
    icon.animate(frames(30, settle), { duration: 420, easing: 'linear' });
  }

  function play(btn, pressed) {
    ensureFx();
    const icon = btn.querySelector('.ytl-thumb');
    if (!icon) return;
    const r = icon.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!pressed) playRelease(icon);
    else if (kindOf(btn) === 'like') playLike(btn, icon, cx, cy);
    else playDislike(icon, cx, cy);
  }

  // 押した後に、ボタンの押下状態（aria-pressed）が実際に変わったときだけ演出する。
  // ログインしていなくて状態が変わらないときや、ページを開いた時点で押されていた場合は何もしない
  document.addEventListener('click', (e) => {
    if (!skin.like) return;
    const btn = e.target.closest?.(BUTTONS);
    if (!btn) return;
    const vm = btn.closest('like-button-view-model, dislike-button-view-model');
    const before = btn.getAttribute('aria-pressed');
    const t0 = performance.now();
    const check = () => {
      const now = vm.querySelector('button');
      const after = now?.getAttribute('aria-pressed');
      if (now && after !== before) {
        decorate();
        play(now, after === 'true');
      } else if (performance.now() - t0 < 1000) requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, true);

  // ---------- リキッドグラス：マウスの位置に光を当てる ----------
  const GLASS = '.ytSpecButtonShapeNextTonal, .ytSpecButtonShapeNextFilled.ytSpecButtonShapeNextMono, .ytChipShapeChip, .ytSearchboxComponentSearchButton, .ytSearchboxComponentInputBox';
  document.addEventListener('pointermove', (e) => {
    if (!skin.glass) return;
    const el = e.target.closest?.(GLASS);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--ytl-mx', Math.round(e.clientX - r.left) + 'px');
    el.style.setProperty('--ytl-my', Math.round(e.clientY - r.top) + 'px');
  }, { passive: true });

  // ---------- 設定の反映 ----------
  function applySkin() {
    root.toggleAttribute('data-ytl-logo', !!skin.logo);
    root.toggleAttribute('data-ytl-glass', !!skin.glass);
    root.toggleAttribute('data-ytl-like', !!skin.like);
    ensureDefs();
    if (skin.like) decorate();
  }

  chrome.storage.local.get('skin').then((o) => {
    skin = { ...DEFAULT_SKIN, ...o.skin };
    applySkin();
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.skin) return;
    skin = { ...DEFAULT_SKIN, ...changes.skin.newValue };
    applySkin();
  });
  applySkin();
  setInterval(() => {
    ensureDefs();
    if (skin.like) decorate();
  }, 1000);
})();
