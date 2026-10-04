// ページ側（MAIN world）で動く。プレイヤー API から動画情報を取り、content script に文字列で渡す
(() => {
  document.addEventListener('ytl:ask', () => {
    let d = null;
    try {
      const p = document.getElementById('movie_player');
      const v = p?.getVideoData?.();
      if (v?.video_id) d = { id: v.video_id, title: v.title || '', author: v.author || '', duration: p.getDuration?.() || 0 };
    } catch {}
    document.dispatchEvent(new CustomEvent('ytl:video', { detail: JSON.stringify(d) }));
  });
})();
