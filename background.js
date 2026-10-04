// LRCLIB への問い合わせ係。YouTube の CSP を避けるため content script からここ経由で取る
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'lrclib' || !/^\/api\/(search\?|get\/\d+$)/.test(msg.path)) return;
  fetch('https://lrclib.net' + msg.path, { headers: { 'Lrclib-Client': 'yt-lyrics/0.1 (personal use)' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
    .then(
      (data) => reply({ ok: true, data }),
      (e) => reply({ ok: false, error: String(e?.message || e) })
    );
  return true;
});
