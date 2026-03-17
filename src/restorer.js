// restorer.js — Content Script: Lädt gespeichertes Layout bei Seitenbesuch
(function () {
  if (window.__ptRestorerActive) return;
  window.__ptRestorerActive = true;

  const STORAGE_KEY = 'pt_layouts_v3';
  let lastUrl = location.href;
  let isRestored = false;

  // === Hauptfunktion ===
  async function checkAndApplyLayout() {
    const domain = location.hostname;

    // Layout aus Storage laden
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const layouts = stored[STORAGE_KEY] || {};
    const layout = layouts[domain];

    if (!layout || !layout.items || layout.items.length === 0) {
      // Kein Layout gespeichert — Floating-Buttons entfernen falls vorhanden
      removeFloatingButtons();
      return;
    }

    // Warten bis Seite bereit ist (YouTube ist eine SPA, DOM braucht Zeit)
    await waitForPageReady();

    // Floating-Buttons anzeigen (nicht automatisch restoren)
    showFloatingButtons(layout);
  }

  // === Auf YouTube-Seitenlade warten ===
  function waitForPageReady() {
    return new Promise((resolve) => {
      // YouTube: Warten bis der Haupt-Content da ist
      if (location.hostname.includes('youtube.com')) {
        let attempts = 0;
        const maxAttempts = 25; // Max 5 Sekunden (25 * 200ms)
        const check = () => {
          const player = document.querySelector('ytd-watch-flexy, ytd-browse');
          if (player || attempts >= maxAttempts) {
            resolve();
          } else {
            attempts++;
            setTimeout(check, 200);
          }
        };
        // Etwas warten damit YouTube seinen DOM aufbauen kann
        setTimeout(check, 500);
      } else {
        // Andere Seiten: sofort
        setTimeout(resolve, 100);
      }
    });
  }

  // === Floating Buttons (unten rechts) ===
  function showFloatingButtons(layout) {
    removeFloatingButtons();

    const container = document.createElement('div');
    container.id = 'pt-floating-controls';
    container.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      display: flex; gap: 8px; font-family: system-ui, -apple-system, sans-serif;
    `;

    // "Layout anwenden" Button
    const btnApply = document.createElement('button');
    btnApply.textContent = 'PageTweaker Layout anwenden';
    btnApply.style.cssText = `
      background: linear-gradient(135deg, #667eea, #764ba2); color: #fff;
      border: none; border-radius: 8px; padding: 10px 16px; font-size: 13px;
      font-weight: 600; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: all 0.2s;
    `;
    btnApply.addEventListener('mouseenter', () => { btnApply.style.transform = 'translateY(-2px)'; });
    btnApply.addEventListener('mouseleave', () => { btnApply.style.transform = ''; });
    btnApply.addEventListener('click', () => applyLayout(layout));

    // "Bearbeiten" Button
    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Bearbeiten';
    btnEdit.style.cssText = `
      background: #2a2a4a; color: #ccc; border: none; border-radius: 8px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3); transition: all 0.2s;
    `;
    btnEdit.addEventListener('click', () => openBuilder());

    container.appendChild(btnApply);
    container.appendChild(btnEdit);
    document.body.appendChild(container);
  }

  function removeFloatingButtons() {
    const existing = document.getElementById('pt-floating-controls');
    if (existing) existing.remove();

    const origBtn = document.getElementById('pt-show-original');
    if (origBtn) origBtn.remove();
  }

  // === Layout anwenden (View-Modus) ===
  async function applyLayout(layout) {
    removeFloatingButtons();

    // Scanner + Renderer im ISOLATED world via chrome.runtime.sendMessage
    // Da wir ein Content Script sind, nutzen wir executeScript über den Background
    // Alternative: Direkt die Skripte im Content Script world importieren
    await executeInCurrentWorld('src/scanner.js');
    await new Promise(r => setTimeout(r, 300));
    await executeInCurrentWorld('src/mockup-renderer.js');
    await new Promise(r => setTimeout(r, 100));

    const scanResult = window.__ptScanResult;
    const renderer = window.__ptMockupRenderer;

    if (!scanResult || !renderer) {
      alert('PageTweaker: Seite konnte nicht gescannt werden.');
      return;
    }

    // Theme setzen
    if (layout.bgColor === '#0f0f0f') {
      renderer.setTheme('dark');
    }

    // Original-Body ersetzen
    document.body.innerHTML = '';
    document.body.style.cssText = `
      margin: 0; padding: 0; background: ${layout.bgColor || '#ffffff'};
      min-height: 100vh; position: relative;
    `;

    const canvas = document.createElement('div');
    canvas.style.cssText = `
      width: ${layout.canvasWidth || 1200}px;
      margin: 0 auto; position: relative; min-height: 100vh;
    `;

    // Items platzieren
    for (const item of layout.items) {
      const comp = scanResult.components.find(c => c.type === item.type);
      if (!comp) continue;

      const wrapper = document.createElement('div');
      wrapper.style.cssText = `
        position: absolute; left: ${item.x}px; top: ${item.y}px;
        width: ${item.w}px; overflow: hidden;
      `;

      let mockup;
      switch (item.type) {
        case 'video-player':
          mockup = renderer.renderVideoPlayer(comp.data, item.w, item.h);
          break;
        case 'video-metadata':
          mockup = renderer.renderMetadata(comp.data);
          break;
        case 'channel-info':
          mockup = renderer.renderChannelInfo(comp.data);
          break;
        case 'description':
          mockup = renderer.renderDescription(comp.data);
          break;
        case 'comments':
          mockup = renderer.renderComments(comp.data, item.options || {});
          break;
        case 'recommendations':
          mockup = renderer.renderRecommendations(comp.data, item.options || {});
          break;
        case 'playlist':
          mockup = renderer.renderPlaylist(comp.data);
          break;
        default:
          continue;
      }

      wrapper.appendChild(mockup);
      canvas.appendChild(wrapper);
    }

    document.body.appendChild(canvas);
    isRestored = true;

    // "Original anzeigen" Button
    const btnOriginal = document.createElement('button');
    btnOriginal.id = 'pt-show-original';
    btnOriginal.textContent = 'Original anzeigen';
    btnOriginal.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 999999;
      background: rgba(0,0,0,0.7); color: #fff; border: none; border-radius: 8px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
      font-family: system-ui, -apple-system, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    btnOriginal.addEventListener('click', () => {
      isRestored = false;
      window.location.reload();
    });
    document.body.appendChild(btnOriginal);
  }

  // === Builder öffnen ===
  async function openBuilder() {
    removeFloatingButtons();

    await executeInCurrentWorld('src/scanner.js');
    await new Promise(r => setTimeout(r, 400));
    await executeInCurrentWorld('src/mockup-renderer.js');
    await new Promise(r => setTimeout(r, 100));
    await executeInCurrentWorld('src/builder.js');
  }

  // === Script im gleichen (ISOLATED) World ausführen ===
  // Content Scripts laufen im ISOLATED world. Um Scanner/Renderer/Builder
  // im gleichen World zu haben (damit window.__pt* geteilt wird),
  // laden wir die Dateien per fetch + eval statt per <script> Tag.
  async function executeInCurrentWorld(path) {
    try {
      const url = chrome.runtime.getURL(path);
      const response = await fetch(url);
      const code = await response.text();
      // Ausführung im ISOLATED world (gleicher Kontext wie dieses Script)
      const fn = new Function(code);
      fn();
    } catch (e) {
      console.warn('[PageTweaker] Fehler beim Laden von', path, e);
    }
  }

  // === YouTube SPA-Navigation ===
  if (location.hostname.includes('youtube.com')) {
    // yt-navigate-finish Event (offizielles YouTube SPA Event)
    document.addEventListener('yt-navigate-finish', () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        // Scan-Result zurücksetzen bei Navigation
        window.__ptScanResult = null;
        if (!isRestored) {
          checkAndApplyLayout();
        }
      }
    });

    // Fallback: Intervall-Check für URL-Änderungen
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        window.__ptScanResult = null;
        if (!isRestored) {
          checkAndApplyLayout();
        }
      }
    }, 1000);
  }

  // === Initial Check ===
  checkAndApplyLayout();
})();
