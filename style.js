// オーバーレイの見た目（Shadow DOM に adoptedStyleSheets で入れる）
globalThis.YTL_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
[hidden] { display: none !important; }

.ov {
  --dim: .32;
  --fg2: rgba(255,255,255,.62);
  --fg3: rgba(255,255,255,.42);
  --ease: cubic-bezier(.2, .9, .25, 1);
  position: absolute; inset: 0;
  overflow: clip; /* hidden だと focus() などで横にスクロールされて左端が切れる */
  display: grid; grid-template-columns: minmax(320px, 40%) minmax(0, 1fr);
  background: #101012; color: #fff;
  font-family: "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Meiryo UI", "Malgun Gothic", system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

/* ---- 背景：動画の色を大きくにじませて、ゆっくり流す ---- */
.bgw { position: absolute; inset: 0; overflow: clip; }
.blob { position: absolute; width: 110vmax; height: 110vmax; border-radius: 50%; filter: blur(70px) saturate(1.8); opacity: .9; will-change: transform; }
.b1 { left: -35vmax; top: -45vmax; animation: drift1 34s ease-in-out infinite alternate; }
.b2 { right: -40vmax; bottom: -50vmax; animation: drift2 42s ease-in-out infinite alternate; }
.b3 { left: 15vmax; top: 10vmax; width: 70vmax; height: 70vmax; opacity: .7; animation: drift3 26s linear infinite; }
@keyframes drift1 { to { transform: rotate(140deg) scale(1.2) translate(6vmax, 4vmax); } }
@keyframes drift2 { from { transform: scale(1.1); } to { transform: rotate(-120deg) scale(.95) translate(-5vmax, -6vmax); } }
@keyframes drift3 { from { transform: rotate(0deg) translate(8vmax) rotate(0deg); } to { transform: rotate(360deg) translate(8vmax) rotate(-360deg); } }
.shade { position: absolute; inset: 0; background: rgba(0,0,0,.34); }

/* ---- ボタン共通 ---- */
button {
  font: inherit; color: #fff; border: 0; background: none; padding: 0; cursor: pointer;
}
button.icon { display: inline-grid; place-items: center; border-radius: 50%; transition: background .15s, transform .12s, opacity .15s; }
button.icon svg { display: block; width: 100%; height: 100%; }
button.icon:active { transform: scale(.9); }
.btn { font-size: 12.5px; padding: 6px 11px; border-radius: 999px; background: rgba(255,255,255,.12); white-space: nowrap; transition: background .15s; }
.btn:hover { background: rgba(255,255,255,.22); }
.circ { width: 34px; height: 34px; padding: 8px; background: rgba(255,255,255,.14); }
.circ:hover { background: rgba(255,255,255,.24); }

/* ---- 左：映像・曲情報・再生操作 ---- */
.left { position: relative; z-index: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; padding: 6vh 3vw 6vh 5vw; }
.col { width: 100%; max-width: 520px; margin: 0 auto; }
.art {
  width: 100%; aspect-ratio: 16 / 9; border-radius: 12px; overflow: clip; background: #000;
  box-shadow: 0 24px 60px rgba(0,0,0,.45);
  transition: transform .55s cubic-bezier(.3, 1.35, .5, 1);
}
.ov.paused .art { transform: scale(.88); }
.mirror { display: block; width: 100%; height: 100%; }

.info { display: flex; align-items: center; gap: 12px; margin-top: 28px; }
.meta { flex: 1; min-width: 0; }
.meta .t, .meta .a { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25; }
.meta .t { font-size: 20px; font-weight: 700; }
.meta .a { font-size: 20px; color: var(--fg2); }
.meta .src { font-size: 11px; color: var(--fg3); margin-top: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.more { width: 30px; height: 30px; padding: 5px; background: rgba(255,255,255,.14); flex: none; }
.more:hover { background: rgba(255,255,255,.24); }

.scrub { margin-top: 16px; }
.prog { height: 18px; display: flex; align-items: center; cursor: pointer; }
.bar { flex: 1; height: 6px; border-radius: 3px; background: rgba(255,255,255,.22); overflow: clip; transition: height .15s; }
.prog:hover .bar { height: 10px; border-radius: 5px; }
.fill { height: 100%; width: 0; background: rgba(255,255,255,.78); }
.tl { display: flex; justify-content: space-between; margin-top: 2px; font-size: 11.5px; font-weight: 600; color: var(--fg3); font-variant-numeric: tabular-nums; }

.transport { display: grid; grid-template-columns: 1fr auto auto auto 1fr; align-items: center; gap: 18px; margin-top: 12px; }
.tbtn { width: 46px; height: 46px; padding: 9px; }
.tbtn:hover { background: rgba(255,255,255,.1); }
.tbtn.play { width: 64px; height: 64px; padding: 14px; }
.repeat { justify-self: start; width: 36px; height: 36px; padding: 7px; border-radius: 9px; opacity: .45; }
.repeat:hover { opacity: .75; background: rgba(255,255,255,.08); }
.repeat.on { opacity: 1; background: rgba(255,255,255,.18); }
.pill {
  justify-self: end; padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.12);
  font-size: 12px; font-weight: 600; color: var(--fg2); font-variant-numeric: tabular-nums; transition: background .15s;
}
.pill:hover { background: rgba(255,255,255,.22); }
.pill.changed { color: #fff; background: rgba(255,255,255,.24); }

/* ---- 右：歌詞 ---- */
.right {
  position: relative; z-index: 1; overflow: clip;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 80%, transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 14%, #000 80%, transparent 100%);
}
.lyrics { position: absolute; inset: 0; }
.track { position: relative; padding: 0 7vw 0 2vw; }

.line {
  --s: .965;
  font-size: clamp(28px, 2.9vw, 50px); font-weight: 700; line-height: 1.2; letter-spacing: -.012em;
  font-feature-settings: "palt";
  padding: .32em .45em; margin: 0 -.45em; border-radius: .35em;
  transform-origin: left center;
  opacity: var(--dim);
  filter: blur(var(--blur, 0px));
  transform: translate3d(0, var(--y, 0px), 0) scale(var(--s));
  transition: transform .8s var(--ease) var(--delay, 0ms), opacity .6s ease, filter .6s ease;
  will-change: transform;
  cursor: pointer;
}
.line:hover { background: rgba(255,255,255,.07); }
.line.active { --s: 1; opacity: 1; filter: none; transition: transform .8s var(--ease) var(--delay, 0ms), opacity 0s, filter .25s ease; }
.line.gap { margin-top: .7em; }

/* 灰色→白の塗り。位置 0% で白、100% で灰色。非アクティブ行は白のまま行ごと暗くする */
.u {
  position: relative; top: 0;
  background-image: linear-gradient(90deg, #fff 45%, rgba(255,255,255,var(--dim)) 55%);
  background-size: 225% 100%; background-repeat: no-repeat; background-position: 0% 0;
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  transition: top .7s cubic-bezier(.2, .8, .3, 1), filter .7s ease;
}
/* 歌われた文字は少し浮かび上がって、うっすら光る */
.line.active .u.on { top: -.07em; filter: drop-shadow(0 0 .16em rgba(255,255,255,.3)); }

/* 間奏の「• • •」。非アクティブ時は見えない空き（節の区切り）になる */
.line.interlude { height: 1.3em; display: flex; align-items: center; opacity: 0; cursor: default; }
.line.interlude:hover { background: none; }
.line.interlude.active { opacity: 1; }
.dots { display: inline-flex; gap: .3em; transform-origin: .5em 50%; }
.dots i { display: block; width: .34em; height: .34em; border-radius: 50%; background: #fff; opacity: var(--dim); }
.interlude.active .dots { animation: breathe 2.6s ease-in-out infinite; }
@keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }

.ov.instant .line { transition: none !important; }
.ov.browsing .line { filter: none; transition: transform .35s var(--ease), opacity .3s, filter .3s; }
.ov.browsing .line:not(.active):not(.interlude) { opacity: .5; }
.ov.plain .line { opacity: .85; filter: none; cursor: default; --s: 1; }
.ov.plain .line:hover { background: none; }

.status { position: absolute; left: 2vw; right: 7vw; top: 32%; font-size: 20px; line-height: 1.6; color: var(--fg2); }

/* ---- 右上 ---- */
.top { position: absolute; top: 18px; right: 20px; z-index: 4; display: flex; gap: 10px; }

/* ---- 再生オプション（⋯ / 速度表示から開く） ---- */
.sheet, .drawer {
  background: rgba(28,28,32,.78); backdrop-filter: blur(30px) saturate(1.6);
  box-shadow: 0 20px 60px rgba(0,0,0,.45), inset 0 0 0 .5px rgba(255,255,255,.14);
}
.sheet {
  position: absolute; z-index: 5; left: max(16px, calc(20vw - 200px)); bottom: 28px;
  width: min(400px, calc(100vw - 32px)); max-height: calc(100% - 56px); overflow: auto;
  padding: 14px 16px 16px; border-radius: 18px;
  opacity: 0; transform: translateY(10px) scale(.98); pointer-events: none;
  transition: opacity .2s, transform .25s var(--ease);
}
.sheet.open { opacity: 1; transform: none; pointer-events: auto; }
.shead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.shead b { font-size: 15px; font-weight: 700; }
.x { width: 28px; height: 28px; padding: 7px; background: rgba(255,255,255,.12); }
.x:hover { background: rgba(255,255,255,.22); }
.sec { display: flex; flex-direction: column; gap: 8px; padding: 12px 0; border-top: .5px solid rgba(255,255,255,.12); }
.shead + .sec { border-top: 0; }
.head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; font-weight: 600; }
.head small { margin-left: 6px; font-size: 11.5px; font-weight: 400; color: var(--fg3); }
.val { font-size: 12.5px; font-weight: 500; color: var(--fg2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.row { display: flex; align-items: center; gap: 6px; }
.hint { font-size: 11px; line-height: 1.5; color: var(--fg3); }
.wide { width: 100%; padding: 9px; border-radius: 10px; background: rgba(255,255,255,.12); font-size: 13px; font-weight: 600; }
.wide:hover { background: rgba(255,255,255,.22); }

input[type=range] {
  -webkit-appearance: none; appearance: none; flex: 1; min-width: 60px; height: 18px; margin: 0;
  background: transparent; cursor: pointer;
  --a: 50%; --b: 50%;
}
input[type=range]::-webkit-slider-runnable-track {
  height: 5px; border-radius: 3px;
  background: linear-gradient(to right, rgba(255,255,255,.22) var(--a), rgba(255,255,255,.85) var(--a), rgba(255,255,255,.85) var(--b), rgba(255,255,255,.22) var(--b));
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; width: 15px; height: 15px; margin-top: -5px; border-radius: 50%;
  background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35);
}

/* ---- 歌詞の選び直し ---- */
.drawer {
  position: absolute; top: 0; right: 0; bottom: 0; z-index: 6; width: min(440px, 92vw);
  display: flex; flex-direction: column; gap: 12px; padding: 18px;
  transform: translateX(100%); visibility: hidden;
  transition: transform .3s var(--ease), visibility 0s .3s;
}
.drawer.open { transform: none; visibility: visible; transition: transform .3s var(--ease); }
.drawer .row input {
  flex: 1; min-width: 0; font: inherit; font-size: 14px; color: #fff; outline: none; user-select: text;
  background: rgba(255,255,255,.1); border: 1px solid rgba(255,255,255,.16); border-radius: 10px; padding: 9px 12px;
}
.drawer .row input:focus { border-color: rgba(255,255,255,.45); }
.drawer .note { font-size: 12px; color: var(--fg2); }
.results { flex: 1; overflow: auto; overscroll-behavior: contain; display: flex; flex-direction: column; gap: 4px; }
.res { text-align: left; border-radius: 10px; padding: 9px 12px; background: rgba(255,255,255,.05); display: flex; flex-direction: column; gap: 2px; }
.res:hover { background: rgba(255,255,255,.12); }
.res b { font-size: 14px; font-weight: 600; }
.res span { font-size: 12px; color: var(--fg2); }
.res.cur { box-shadow: inset 0 0 0 1px rgba(255,255,255,.5); }

@media (max-width: 900px) {
  .ov { grid-template-columns: 1fr; grid-template-rows: auto minmax(0, 1fr); }
  .left { padding: 64px 20px 6px; }
  .col { max-width: none; }
  .art, .hint { display: none; }
  .info { margin-top: 0; }
  .line { font-size: 26px; }
  .sheet { left: 16px; }
}
`;
