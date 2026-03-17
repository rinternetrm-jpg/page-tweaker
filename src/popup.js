// popup.js — PageTweaker Extension Popup

(async function () {
  const btnOpen = document.getElementById('btnOpen');
  const btnClear = document.getElementById('btnClear');
  const currentUrlEl = document.getElementById('currentUrl');
  const pageTypeEl = document.getElementById('pageType');
  const savedInfoEl = document.getElementById('savedInfo');

  // Aktiven Tab holen
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    currentUrlEl.textContent = 'Kein Tab verfügbar';
    return;
  }

  const url = new URL(tab.url);
  currentUrlEl.textContent = url.hostname + url.pathname.slice(0, 40);

  // Seitentyp erkennen
  const isYouTubeWatch = url.hostname.includes('youtube.com') && url.pathname === '/watch' && url.searchParams.has('v');

  if (isYouTubeWatch) {
    pageTypeEl.textContent = 'YouTube Watch Page';
    pageTypeEl.classList.add('supported');
    btnOpen.disabled = false;
  } else if (url.hostname.includes('youtube.com')) {
    pageTypeEl.textContent = 'YouTube (noch nicht unterstützt)';
    pageTypeEl.classList.add('unsupported');
  } else {
    pageTypeEl.textContent = 'Nicht unterstützt';
    pageTypeEl.classList.add('unsupported');
  }

  // Prüfen ob ein gespeichertes Layout existiert
  const storageKey = 'pt_layouts_v3';
  const stored = await chrome.storage.local.get(storageKey);
  const layouts = stored[storageKey] || {};
  const domain = url.hostname;

  if (layouts[domain]) {
    savedInfoEl.style.display = 'block';
    btnClear.style.display = 'block';
  }

  // Page Builder öffnen
  btnOpen.addEventListener('click', () => {
    if (!isYouTubeWatch) return;

    // Alles an den Background Service Worker delegieren.
    // Der läuft weiter auch wenn das Popup sich schließt.
    chrome.runtime.sendMessage({
      action: 'launchBuilder',
      tabId: tab.id
    });

    // Popup sofort schließen
    window.close();
  });

  // Layout löschen
  btnClear.addEventListener('click', async () => {
    delete layouts[domain];
    await chrome.storage.local.set({ [storageKey]: layouts });
    savedInfoEl.style.display = 'none';
    btnClear.style.display = 'none';
  });
})();
