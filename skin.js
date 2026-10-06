// YouTube の見た目のカスタム：ロゴの流れるグラデーション、ボタンのリキッドグラス化、グッド／バッドの演出
// 設定は chrome.storage の skin（拡張機能のポップアップで切り替え）。見た目の大半は page.css 側
(() => {
  'use strict';
  const DEFAULT_SKIN = { logo: true, glass: true, like: true };
  const PALETTE = ['#ff4e8a', '#ffb84d', '#7cf0ff', '#a77bff'];
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
    const colors = [...PALETTE, PALETTE[0]];
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

  function thumbIcon(kind) {
    const g = svgEl('g', kind === 'dislike' ? { transform: 'translate(0 24) scale(1 -1)' } : {}, ...THUMB.map((d) => svgEl('path', { d })));
    return svgEl('svg', { class: 'ytl-thumb ' + kind, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, g);
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

  function playLike(icon, cx, cy) {
    // 一度縮んでから、弾むように大きくなって戻る
    icon.animate([
      { transform: 'scale(1) rotate(0)' },
      { transform: 'scale(.72) rotate(-6deg)', offset: 0.2 },
      { transform: 'scale(1.38) rotate(-16deg)', offset: 0.5 },
      { transform: 'scale(.94) rotate(5deg)', offset: 0.75 },
      { transform: 'scale(1) rotate(0)' },
    ], { duration: 720, easing: 'cubic-bezier(.3,.7,.3,1)' });
    // ふわっと光る
    fadeOut(spawn(cx, cy, 36, 'border-radius:50%;background:radial-gradient(circle,rgba(255,140,190,.75),rgba(167,123,255,.25) 55%,transparent 70%)'),
      [{ transform: 'scale(.3)', opacity: 1 }, { transform: 'scale(1.8)', opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)' });
    // 光の輪
    fadeOut(spawn(cx, cy, 30, 'border-radius:50%;border:2px solid rgba(255,255,255,.95);box-shadow:0 0 10px #ff7ab0,inset 0 0 6px #7cf0ff'),
      [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.9)', opacity: 0 }], { duration: 600, delay: 60, easing: 'cubic-bezier(.15,.8,.3,1)' });
    // 粒が飛び散る
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + rand(-0.2, 0.2);
      const d = rand(26, 44);
      const s = rand(3.5, 7);
      const color = PALETTE[i % PALETTE.length];
      fadeOut(spawn(cx, cy, s, `border-radius:50%;background:${color};box-shadow:0 0 6px ${color}`),
        [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d}px) scale(.2)`, opacity: 0 }],
        { duration: rand(560, 780), delay: rand(40, 110), easing: 'cubic-bezier(.15,.8,.3,1)' });
    }
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

  function playRelease(icon) {
    icon.animate([{ transform: 'scale(1)' }, { transform: 'scale(.82)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }

  function play(btn, pressed) {
    ensureFx();
    const icon = btn.querySelector('.ytl-thumb');
    if (!icon) return;
    const r = icon.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (!pressed) playRelease(icon);
    else if (kindOf(btn) === 'like') playLike(icon, cx, cy);
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
