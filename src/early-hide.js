// early-hide.js — Läuft bei document_start, versteckt Seite sofort wenn auto_apply aktiv
// Verhindert den Flash des originalen YouTube-Layouts
(async function() {
  try {
    const result = await chrome.storage.local.get('pt_auto_apply');
    if (result.pt_auto_apply) {
      const style = document.createElement('style');
      style.id = 'pt-hide-flash';
      style.textContent = 'ytd-app { visibility: hidden !important; }';
      (document.head || document.documentElement).appendChild(style);
    }
  } catch(e) {}
})();
