// background.js — Service Worker für Script-Injection
// Alle Injections laufen hier, weil:
// 1. Content Scripts können chrome.scripting nicht nutzen
// 2. Popup schließt sich bevor async Injections fertig sind
// 3. CSP blockiert new Function() / eval auf YouTube

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'loadVideo') {
    // Video wechseln: YouTube SPA-Navigation triggern im MAIN world
    // So werden Empfehlungen, Kommentare etc. auch aktualisiert
    const tabId = sender.tab?.id;
    if (!tabId) return;

    chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (videoId) => {
        console.log('[PageTweaker] Triggere YouTube-Navigation zu:', videoId);

        // Methode 1: YouTube's interne Navigation
        const url = '/watch?v=' + videoId;
        try {
          // ytd-app hat eine navigate-Methode
          const app = document.querySelector('ytd-app');
          if (app && typeof app.navigate === 'function') {
            app.navigate(url);
            console.log('[PageTweaker] app.navigate() erfolgreich');
            return;
          }
        } catch(e) {}

        try {
          // yt-navigate Custom Event
          document.dispatchEvent(new CustomEvent('yt-navigate', {
            detail: { endpoint: { watchEndpoint: { videoId } } }
          }));
          console.log('[PageTweaker] yt-navigate Event dispatched');
        } catch(e) {}

        // Methode 2: Fallback - loadVideoById für sofortige Wiedergabe
        try {
          const player = document.querySelector('#movie_player');
          if (player && typeof player.loadVideoById === 'function') {
            player.loadVideoById(videoId);
          }
        } catch(e) {}
      },
      args: [msg.videoId]
    }).catch(e => console.error('[PT Background] loadVideo error:', e));

    return false;
  }

  if (msg.action === 'injectScripts') {
    // Von restorer.js (Content Script): sender.tab ist verfügbar
    const tabId = sender.tab?.id;
    if (!tabId) return;

    injectSequentially(tabId, msg.files || [])
      .then(() => sendResponse({ ok: true }))
      .catch(e => {
        console.error('[PT Background] Injection error:', e);
        sendResponse({ ok: false, error: e.message });
      });

    return true; // async sendResponse
  }

  if (msg.action === 'launchBuilder') {
    // Von popup.js: tabId wird explizit mitgeschickt
    const tabId = msg.tabId;
    if (!tabId) return;

    console.log('[PT Background] Launching builder for tab', tabId);

    (async () => {
      try {
        // Scanner injizieren
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/scanner.js']
        });
        console.log('[PT Background] Scanner injected');

        // Warten bis YouTube DOM + Sidebar bereit ist
        await sleep(3000);

        // Renderer injizieren
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/mockup-renderer.js']
        });
        console.log('[PT Background] Renderer injected');

        await sleep(200);

        // Builder injizieren
        const builderResult = await chrome.scripting.executeScript({
          target: { tabId },
          files: ['src/builder.js']
        });
        console.log('[PT Background] Builder injected, result:', builderResult);

        // Debug: Prüfen was auf der Seite los ist
        const debugResult = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const keys = Object.keys(window).filter(k => k.startsWith('__pt'));
            const info = {
              keys,
              hasScan: !!window.__ptScanResult,
              hasRenderer: !!window.__ptMockupRenderer,
              hasBuilder: !!window.__ptBuilderActive,
              builderRoot: !!document.querySelector('.pt-builder-root')
            };
            console.log('[PT Debug on page]', info);
            return info;
          }
        });
        console.log('[PT Background] Page state:', debugResult[0]?.result);
      } catch (e) {
        console.error('[PT Background] Launch error:', e);
        // Fehler auch auf der Seite sichtbar machen
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: (errMsg) => {
              alert('PageTweaker Background Error: ' + errMsg);
            },
            args: [e.message]
          });
        } catch (_) {}
      }
    })();

    // Popup kann sofort schließen
    return false;
  }
});

async function injectSequentially(tabId, files) {
  for (const file of files) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [file]
    });
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
