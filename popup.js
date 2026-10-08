// ポップアップのスイッチ。変更は chrome.storage 経由で、開いている YouTube のタブにすぐ反映される
const DEFAULT_SKIN = { glass: true, like: true };

(async () => {
  const { prefs = {}, skin = {} } = await chrome.storage.local.get(['prefs', 'skin']);
  const state = { bg: prefs.bg !== false, ...DEFAULT_SKIN, ...skin };

  for (const input of document.querySelectorAll('input[data-key]')) {
    const key = input.dataset.key;
    input.checked = !!state[key];
    input.addEventListener('change', async () => {
      // 背景は歌詞パネル側の設定（prefs）と同じ場所に、それ以外は skin に書く。ほかの項目は消さない
      if (key === 'bg') {
        const { prefs: p = {} } = await chrome.storage.local.get('prefs');
        await chrome.storage.local.set({ prefs: { ...p, bg: input.checked } });
      } else {
        const { skin: s = {} } = await chrome.storage.local.get('skin');
        await chrome.storage.local.set({ skin: { ...DEFAULT_SKIN, ...s, [key]: input.checked } });
      }
    });
  }
})();
