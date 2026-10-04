// 歌詞と曲名まわりの純粋ロジック（DOM に触らない。node からも読める）
(function (root) {
  'use strict';

  // ---------- LRC ----------
  const STAMP = /^\s*\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
  const WORD_TAG = /^<(\d+):(\d{1,2})(?:[.:](\d{1,3}))?>$/;
  const toSec = (m, s, f) => +m * 60 + +s + (f ? +('0.' + f) : 0);

  function parseLRC(text) {
    let shift = 0;
    const rows = [];
    for (let raw of String(text || '').split(/\r?\n/)) {
      const off = raw.match(/^\[offset:\s*([+-]?\d+)\s*\]/i);
      if (off) { shift = +off[1] / 1000; continue; }
      const stamps = [];
      let m;
      while ((m = raw.match(STAMP))) { stamps.push(toSec(m[1], m[2], m[3])); raw = raw.slice(m[0].length); }
      if (!stamps.length) continue;

      // 拡張 LRC（<mm:ss.xx> の単語タイミング）があれば使う
      let words = null;
      let body = raw;
      if (/<\d+:\d+/.test(raw)) {
        words = [];
        body = '';
        let t = null;
        for (const part of raw.split(/(<\d+:\d{1,2}(?:[.:]\d{1,3})?>)/)) {
          const w = part.match(WORD_TAG);
          if (w) { t = toSec(w[1], w[2], w[3]); continue; }
          if (!part) continue;
          body += part;
          if (t == null || !part.trim()) { if (words.length) words[words.length - 1].text += part; continue; }
          words.push({ t, text: part });
        }
        if (!words.length) words = null;
      }
      body = body.trim();
      stamps.forEach((t, k) => rows.push({
        t: t - shift,
        text: body,
        words: k === 0 && words ? words.map((w) => ({ t: w.t - shift, text: w.text })) : null,
      }));
    }
    return rows.sort((a, b) => a.t - b.t);
  }

  // ---------- 1 行を塗りの単位に分ける ----------
  const CJK_CHARS = '\\u3005\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uac00-\\ud7af\\uff66-\\uff9f';
  const CJK = new RegExp(`[${CJK_CHARS}]`);
  const KANJI = /[々㐀-䶿一-鿿豈-﫿]/;
  const SMALL_KANA = /[ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮ]/;
  const TOKEN = new RegExp(`[${CJK_CHARS}]|[^\\s${CJK_CHARS}]+|\\s+`, 'gu');

  // 歌うのにかかる時間の目安（拍の重み）
  function weight(tok) {
    if (!tok.trim()) return 0;
    if (tok === '・') return 0.15;
    if (SMALL_KANA.test(tok)) return 0.35;
    if (KANJI.test(tok)) return 1.7;
    if (CJK.test(tok)) return 1;
    if (/^[\p{P}\p{S}]+$/u.test(tok)) return 0.15;
    const syllables = (tok.match(/[aeiouyàáâäèéêëìíîïòóôöùúûü]+/gi) || []).length;
    const digits = (tok.match(/\d/g) || []).length;
    return Math.max(1, syllables + digits) * 0.9;
  }

  function splitUnits(text) {
    const units = [];
    for (const tok of String(text).match(TOKEN) || []) {
      const w = weight(tok);
      if (!w && units.length) units[units.length - 1].text += tok;
      else units.push({ text: tok, w });
    }
    return units;
  }

  // ---------- タイムライン ----------
  const INTERLUDE_MIN = 4;    // 空白行がこれ以上続くなら「• • •」
  const SYNTH_INTERLUDE = 8;  // 空白行がなくても、歌い終わりから次の行までこれ以上なら「• • •」
  const PAUSE_GAP = 2;        // 歌い終わりから次の行までこれ以上空いたら節の切れ目
  const SEC_PER_WEIGHT = 0.42;

  function buildTimeline(rows, duration) {
    const items = [];
    let breakNext = false;
    const firstText = rows.find((r) => r.text);
    if (firstText && rows[0].text && rows[0].t >= INTERLUDE_MIN) {
      items.push({ kind: 'interlude', start: 0, end: rows[0].t });
    }
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasNext = i + 1 < rows.length;
      const next = hasNext ? rows[i + 1].t : Math.max(r.t + 4, duration || 0);
      if (!r.text) {
        if (hasNext && next - r.t >= INTERLUDE_MIN) items.push({ kind: 'interlude', start: r.t, end: next });
        else breakNext = items.length > 0;
        continue;
      }

      let units, fillEnd;
      if (r.words) {
        units = r.words.map((w, k) => ({ text: w.text, t0: w.t, t1: k + 1 < r.words.length ? r.words[k + 1].t : 0 }));
        const last = units[units.length - 1];
        last.t1 = Math.min(next, last.t0 + Math.max(0.5, weight(last.text.trim()) * SEC_PER_WEIGHT));
        fillEnd = last.t1;
      } else {
        // 行単位のタイミングしかないので、拍の重みで行内を按分する
        units = splitUnits(r.text);
        const total = units.reduce((s, u) => s + u.w, 0) || 1;
        const span = Math.max(0.3, Math.min(next - r.t - 0.1, Math.max(1.2, total * SEC_PER_WEIGHT)));
        let acc = 0;
        for (const u of units) {
          u.t0 = r.t + (acc / total) * span;
          acc += u.w;
          u.t1 = r.t + (acc / total) * span;
        }
        fillEnd = r.t + span;
      }

      const prev = items[items.length - 1];
      const gapBefore = breakNext || (prev?.kind === 'line' && r.t - prev.fillEnd >= PAUSE_GAP);
      items.push({ kind: 'line', start: r.t, end: next, fillEnd, text: r.text, units, gapBefore });
      breakNext = false;

      if (hasNext && rows[i + 1].text && next - fillEnd >= SYNTH_INTERLUDE) {
        items.push({ kind: 'interlude', start: fillEnd + 1.5, end: next });
      }
    }
    return items;
  }

  function plainItems(text) {
    const items = [];
    let gap = false;
    for (const line of String(text || '').split(/\r?\n/)) {
      const s = line.trim();
      if (!s) { gap = items.length > 0; continue; }
      items.push({ kind: 'line', text: s, units: null, gapBefore: gap });
      gap = false;
    }
    return items;
  }

  // start <= t を満たす最後の項目
  function findActive(items, t) {
    let lo = 0, hi = items.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (items[mid].start <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }

  // ---------- 動画タイトルから曲名・アーティストを推定 ----------
  const TAG_WORDS = /official|music|video|audio|lyric|\bmv\b|m\/v|\bpv\b|ver\.?|version|full|size|\bhd\b|4k|live|cover|remaster|visualizer|anime|from|feat\.?|ft\.|prod\.?|\bop\b|\bed\b|\bcm\b|sped|speed\s*up|slowed|reverb|nightcore|\b8d\b|歌詞|公式|映像|ライブ|カバー|歌ってみた|アニメ|主題歌|オープニング|エンディング|テーマ|サイズ|ドラマ|映画|ナイトコア|倍速|早回し/i;
  const NOISE = /\b(official\s+(music\s+)?(video|audio|mv|lyric\s+video|visualizer)|music\s+(video|clip)|lyric\s+video|official|mv|pv|m\/v|sped\s*up(\s+version)?|speed\s*up|slowed(\s*(\+|&|and)\s*reverb(ed)?)?|reverb|nightcore)\b|ナイトコア/gi;
  // 原曲の速さ（とキー）を変えた再アップロード
  const VARIANT = /sped\s*up|speed\s*up|slowed|nightcore|ナイトコア|倍速|早回し/i;
  const SEP_CHARS = '\\s\\-–—―~〜/|:・,.、';
  const trimSep = (x) => String(x || '').replace(new RegExp(`^[${SEP_CHARS}]+|[${SEP_CHARS}]+$`, 'g'), '').trim();

  function cleanAuthor(a) {
    return trimSep(String(a || '')
      .replace(NOISE, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s*-\s*topic$/i, '')
      .replace(/vevo$/i, '')
      .replace(/(official\s*)?(youtube\s*)?(channel|チャンネル)$/i, '')
      .replace(/\s*(official|公式|オフィシャル)\s*$/i, ''));
  }

  function guessFromTitle(title, author) {
    const raw = String(title || '');
    const auth = cleanAuthor(author);
    let s = raw.normalize('NFKC')
      .replace(/【[^】]*】/g, ' ')
      .replace(/[(\[〔]([^()\[\]〔〕]*)[)\]〕]/g, (m, inner) => (TAG_WORDS.test(inner) ? ' ' : m))
      .replace(NOISE, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let track = '', artist = '', m;
    if ((m = s.match(/^(.*?)[「『]([^」』]+)[」』]/))) {
      track = m[2];
      artist = trimSep(m[1]) || trimSep(s.slice(m[0].length));
    } else {
      if ((m = s.match(/^(.+?)\s+[-–—―~〜]\s+(.+)$/))) [artist, track] = [m[1], m[2]];
      else if ((m = s.match(/^(.+?)\s*[/|]\s*(.+)$/))) [track, artist] = [m[1], m[2]];
      else if ((m = s.match(/^(.+?)\s*:\s*(.+)$/)) && sim(m[1], auth) > 0.5) [artist, track] = [m[1], m[2]];
      else track = s;
      if (artist && auth && sim(track, auth) > sim(artist, auth) + 0.2) [track, artist] = [artist, track];
    }
    track = trimSep(track.replace(/\s*\b(feat|ft)\.?\s.*$/i, ''));
    artist = trimSep(artist) || auth;
    return { title: raw, author: auth, track, artist, variant: VARIANT.test(raw) };
  }

  // slowed / sped up 版は全体が同じ割合で伸び縮みしているので、長さの比がそのまま速さの比になる
  function estimateScale(lyricsDuration, videoDuration) {
    if (!(lyricsDuration > 0 && videoDuration > 0)) return null;
    const k = lyricsDuration / videoDuration;
    return k >= 0.6 && k <= 1.6 ? Math.round(k * 1000) / 1000 : null;
  }

  // ---------- 候補の採点 ----------
  const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');

  function sim(a, b) {
    a = norm(a); b = norm(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.6 + (0.4 * Math.min(a.length, b.length)) / Math.max(a.length, b.length);
    if (a.length < 2 || b.length < 2) return 0;
    const grams = (s) => {
      const g = new Map();
      for (let i = 0; i < s.length - 1; i++) g.set(s.slice(i, i + 2), (g.get(s.slice(i, i + 2)) || 0) + 1);
      return g;
    };
    const A = grams(a), B = grams(b);
    let hit = 0;
    for (const [g, n] of A) hit += Math.min(n, B.get(g) || 0);
    return (2 * hit) / (a.length + b.length - 2);
  }

  // MV はイントロ等で長くなりがちなので、動画が長い側のズレには甘く、短い側には厳しく
  function durationPenalty(r, dur, variant) {
    if (!(dur > 0)) return 0;
    if (!(r.duration > 0)) return 0.6; // 長さ不明の登録は少しだけ後回し
    if (variant) return estimateScale(r.duration, dur) ? 0 : 3; // 速さが変わっているので長さは比で見る
    const d = dur - r.duration;
    return d >= -2 ? Math.max(0, d - 2) / 45 : (-d - 2) / 10;
  }

  function score(r, g, dur) {
    const title = norm(g.title);
    const tn = norm(r.trackName), an = norm(r.artistName);
    let s = 3 * Math.max(sim(g.track, r.trackName), tn.length >= 2 && title.includes(tn) ? 0.9 : 0);
    s += 2 * Math.max(sim(g.artist, r.artistName), sim(g.author, r.artistName), an.length >= 2 && title.includes(an) ? 0.9 : 0);
    if (!r.syncedLyrics) s -= 3;
    if (r.instrumental) s -= 5;
    return s - durationPenalty(r, dur, g.variant);
  }

  function rank(list, g, dur) {
    return list
      .filter((r) => r.syncedLyrics || r.plainLyrics)
      .map((r) => ({ r, s: score(r, g, dur) }))
      .sort((a, b) => b.s - a.s);
  }

  const api = { parseLRC, splitUnits, buildTimeline, plainItems, findActive, guessFromTitle, cleanAuthor, sim, score, rank, durationPenalty, estimateScale };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.YTL = api;
})(globalThis);
