// restorer.js — Content Script: Lädt gespeichertes Layout bei Seitenbesuch
(function () {
  if (window.__ptRestorerActive) return;
  window.__ptRestorerActive = true;

  const STORAGE_KEY = 'pt_layouts_v3';
  let lastUrl = location.href;
  let isRestored = false;

  // === YouTube wieder sichtbar machen (early-hide.css überschreiben) ===
  function showYouTube() {
    const app = document.querySelector('ytd-app');
    if (app) app.style.setProperty('visibility', 'visible', 'important');
    // Flash-hide Style entfernen falls vorhanden
    const hideFlash = document.getElementById('pt-hide-flash');
    if (hideFlash) hideFlash.remove();
  }

  // === Hauptfunktion ===
  async function checkAndApplyLayout() {
    const domain = location.hostname;

    // Layout aus Storage laden
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const layouts = stored[STORAGE_KEY] || {};
    const layout = layouts[domain];

    if (!layout || !layout.items || layout.items.length === 0) {
      // Kein Layout gespeichert — YouTube wieder anzeigen (CSS wurde per Manifest versteckt)
      showYouTube();
      removeFloatingButtons();
      return;
    }

    // Warten bis Seite bereit ist (YouTube ist eine SPA, DOM braucht Zeit)
    await waitForPageReady();

    // Wenn pt_auto_apply gesetzt ist (Thumbnail-Klick), Layout automatisch anwenden
    const autoApply = await chrome.storage.local.get('pt_auto_apply');
    if (autoApply.pt_auto_apply) {
      await chrome.storage.local.remove('pt_auto_apply');
      applyLayout(layout);
    } else {
      // YouTube wieder anzeigen und Floating-Buttons zeigen
      showYouTube();
      showFloatingButtons(layout);
    }
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
    btnEdit.addEventListener('click', () => openBuilder(layout));

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

    // Scanner + Renderer injizieren
    await injectViaBackground(['src/scanner.js']);
    await new Promise(r => setTimeout(r, 600));
    await injectViaBackground(['src/mockup-renderer.js']);

    const scanResult = window.__ptScanResult;
    const renderer = window.__ptMockupRenderer;

    if (!scanResult || !renderer) {
      alert('PageTweaker: Seite konnte nicht gescannt werden.');
      return;
    }

    if (layout.bgColor === '#0f0f0f') {
      renderer.setTheme('dark');
    }

    // === Original-Seite VERSTECKEN, nicht zerstören ===
    const origApp = document.querySelector('ytd-app');
    if (origApp) {
      origApp.style.cssText = 'visibility:hidden !important; pointer-events:none !important;';
      origApp.dataset.ptOriginal = 'true';
    }

    // Echten YouTube-Player merken
    const playerContainer = document.querySelector('#player-container-inner') ||
                            document.querySelector('#player-container') ||
                            document.querySelector('ytd-player');
    const moviePlayer = document.querySelector('#movie_player');

    // Canvas erstellen
    const canvas = document.createElement('div');
    canvas.id = 'pt-restored-canvas';
    canvas.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      overflow: auto; z-index: 99999;
      background: ${layout.bgColor || '#ffffff'};
    `;

    const inner = document.createElement('div');
    inner.style.cssText = `
      width: 100%; max-width: 100%; min-height: 100vh;
      padding: 0; box-sizing: border-box;
    `;

    const baseWidth = layout.canvasWidth || 1200;

    // Variablen für Video-Player Position
    let videoWrapper = null;

    // === Flow-Layout: Items nach Y sortieren und in Zeilen gruppieren ===
    const sortedItems = [...layout.items].sort((a, b) => a.y - b.y);

    // Zeilen erkennen: Items mit ähnlichem Y (±30px) gehören in eine Zeile
    const rows = [];
    let currentRow = null;
    for (const item of sortedItems) {
      if (!currentRow || Math.abs(item.y - currentRow.y) > 30) {
        currentRow = { y: item.y, items: [] };
        rows.push(currentRow);
      }
      currentRow.items.push(item);
    }

    // Zeilen rendern
    for (const row of rows) {
      // Zeile = Flex-Container
      const rowDiv = document.createElement('div');
      rowDiv.style.cssText = `
        display: flex; flex-wrap: wrap; gap: 8px; padding: 4px 0;
        align-items: flex-start; justify-content: center;
        max-width: 1400px; margin: 0 auto;
      `;

      for (const item of row.items.sort((a, b) => a.x - b.x)) {
        const comp = scanResult.components.find(c => c.type === item.type);
        if (!comp && item.type !== 'custom-text') continue;

        const widthPct = Math.min(100, (item.w / baseWidth * 100)).toFixed(2);

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          width: ${widthPct}%; min-width: 200px; overflow: hidden;
          flex-shrink: 1; flex-grow: 0; box-sizing: border-box;
        `;

      let mockup;
      switch (item.type) {
        case 'video-player':
          mockup = renderer.renderVideoPlayer(comp.data, item.w, item.h);
          mockup.style.width = '100%';
          mockup.style.height = '0';
          mockup.style.paddingBottom = '56.25%';
          mockup.style.position = 'relative';
          if (!item.options || item.options.useRealPlayer !== false) {
            if (!videoWrapper) videoWrapper = wrapper;
          }
          if (item.options && item.options.useRealPlayer) {
            videoWrapper = wrapper;
          }
          break;
        case 'video-metadata':
          mockup = renderer.renderMetadata(comp.data);
          // Buttons funktional machen (Like, Share etc.)
          addFunctionalButtons(mockup);
          break;
        case 'channel-info':
          mockup = renderer.renderChannelInfo(comp.data);
          // Abonnieren-Button funktional machen
          addSubscribeAction(mockup);
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
        case 'masthead': {
          // Platzhalter für die Position
          mockup = document.createElement('div');
          mockup.className = 'pt-mockup pt-mockup-masthead-placeholder';
          mockup.style.cssText = 'width:100%;height:56px;';
          break;
        }
        case 'custom-text': {
          // Custom-Text braucht keine Scanner-Daten
          const tb = document.createElement('div');
          tb.className = 'pt-mockup pt-mockup-custom-text';
          tb.textContent = item.options?.text || '';
          tb.style.cssText = `
            padding: 12px; font-family: system-ui, sans-serif;
            font-size: ${item.options?.fontSize || 16}px;
            color: ${item.options?.color || '#0f0f0f'};
            line-height: 1.5;
          `;
          mockup = tb;
          break;
        }
        default:
          continue;
      }

        wrapper.appendChild(mockup);
        rowDiv.appendChild(wrapper);
      }

      inner.appendChild(rowDiv);
    }

    canvas.appendChild(inner);
    document.body.appendChild(canvas);
    isRestored = true;

    // Flash-Hide entfernen (Seite ist jetzt im PageTweaker-Layout)
    const hideFlash = document.getElementById('pt-hide-flash');
    if (hideFlash) hideFlash.remove();

    // === Video wechseln (ohne Seiten-Reload) ===
    function switchVideo(videoId) {
      if (!videoId) return;
      console.log('[PageTweaker] Video wechseln zu:', videoId);

      // 1. Video sofort im Player wechseln (MAIN world)
      chrome.runtime.sendMessage({ action: 'loadVideo', videoId });

      // 2. URL aktualisieren ohne Navigation
      history.pushState({}, '', '/watch?v=' + videoId);

      // 3. Neue Video-Daten im Hintergrund fetchen
      chrome.runtime.sendMessage({ action: 'fetchVideoData', videoId }, (resp) => {
        if (!resp || !resp.ok) {
          console.warn('[PageTweaker] Keine Daten für Video:', videoId);
          return;
        }

        console.log('[PageTweaker] fetchVideoData:', resp.recommendations?.length, 'recs,',
          'meta:', !!resp.metadata, 'channel:', !!resp.channel);

        // Empfehlungen aktualisieren
        if (resp.recommendations && resp.recommendations.length > 0) {
          updateRecommendationBlocks({ items: resp.recommendations });
        } else {
          console.warn('[PageTweaker] Keine Empfehlungen vom Fetch erhalten');
        }

        // Metadaten aktualisieren
        if (resp.metadata) {
          const metaMockup = document.querySelector('.pt-mockup-metadata');
          if (metaMockup) {
            const parent = metaMockup.parentElement;
            const newMeta = renderer.renderMetadata(resp.metadata);
            parent.replaceChild(newMeta, metaMockup);
          }
        }

        // Kanal-Info aktualisieren
        if (resp.channel) {
          const chanMockup = document.querySelector('.pt-mockup-channel');
          if (chanMockup) {
            const parent = chanMockup.parentElement;
            const newChan = renderer.renderChannelInfo(resp.channel);
            parent.replaceChild(newChan, chanMockup);
          }
        }

        // Beschreibung aktualisieren
        if (resp.description) {
          const descMockup = document.querySelector('.pt-mockup-description');
          if (descMockup) {
            const parent = descMockup.parentElement;
            const newDesc = renderer.renderDescription(resp.description);
            parent.replaceChild(newDesc, descMockup);
          }
        }

        console.log('[PageTweaker] Alle Mockups aktualisiert für:', videoId);
      });
    }

    // Empfehlungs-Blöcke aktualisieren (gemeinsam genutzt von Video-Wechsel + Suche)
    function updateRecommendationBlocks(data) {
      const recWrappers = document.querySelectorAll('.pt-mockup-recommendations');
      const recItems = layout.items.filter(i => i.type === 'recommendations');

      recWrappers.forEach((oldRec, idx) => {
        try {
          const opts = recItems[idx]?.options || {};
          const offset = opts.offset || 0;
          const maxItems = opts.maxItems || 10;
          const sliced = data.items.slice(offset, offset + maxItems);
          const renderOpts = { ...opts, offset: 0 };
          const newMockup = renderer.renderRecommendations({ items: sliced }, renderOpts);

          oldRec.innerHTML = newMockup.innerHTML;
          oldRec.style.cssText = newMockup.style.cssText;

          // Neue Thumbnails klickbar machen
          makeThumbsClickable(oldRec);
        } catch (err) {
          console.error('[PageTweaker] Block', idx, 'Fehler:', err);
        }
      });
    }

    // === Funktionale Buttons — data-pt-action Elemente verdrahten ===
    const actionMap = {
      'like': 'like-button-view-model button, #top-level-buttons-computed ytd-toggle-button-renderer:first-child button, button[aria-label*="Mag ich"]',
      'dislike': 'dislike-button-view-model button, #top-level-buttons-computed ytd-toggle-button-renderer:nth-child(2) button',
      'share': 'button[aria-label*="Teilen"], button[aria-label*="Share"]',
      'save': 'button[aria-label*="Speichern"], button[aria-label*="Save"]',
      'clip': 'button[aria-label*="Clip"]',
      'subscribe': '#subscribe-button button, ytd-subscribe-button-renderer button',
      'profile': '#avatar-btn, button[aria-label*="Konto"], button[aria-label*="Account"]',
      'create': 'button[aria-label*="Erstellen"], button[aria-label*="Create"]',
    };

    // Alle Buttons mit data-pt-action verdrahten
    canvas.querySelectorAll('[data-pt-action]').forEach(btn => {
      const action = btn.dataset.ptAction;

      if (action === 'notifications') {
        btn.addEventListener('click', () => window.open('https://www.youtube.com/feed/notifications', '_blank'));
        return;
      }

      const selector = actionMap[action];
      if (selector) {
        btn.addEventListener('click', () => {
          chrome.runtime.sendMessage({ action: 'clickElement', selector });
        });
      }
    });

    function addFunctionalButtons() {}
    function addSubscribeAction() {}
    function addMastheadActions() {}

    // Thumbnails klickbar machen
    function makeThumbsClickable(container) {
      container.querySelectorAll('[data-video-id]').forEach(thumb => {
        thumb.style.cursor = 'pointer';
        thumb.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          switchVideo(thumb.dataset.videoId);
        });
      });
    }

    // Initiale Thumbnails klickbar machen
    canvas.querySelectorAll('.pt-mockup-recommendations').forEach(rec => makeThumbsClickable(rec));

    // === Suche: Ergebnisse in Empfehlungs-Blöcke laden ===
    window.__ptSearchHandler = (query) => {
      if (!query) return;
      console.log('[PageTweaker] Suche:', query);

      chrome.runtime.sendMessage({ action: 'searchYouTube', query }, (resp) => {
        if (!resp || !resp.ok || !resp.items.length) {
          console.warn('[PageTweaker] Keine Suchergebnisse');
          return;
        }
        console.log('[PageTweaker] Suchergebnisse:', resp.items.length);
        updateRecommendationBlocks({ items: resp.items });
      });
    };

    // === Echte YouTube-Masthead über den Platzhalter legen ===
    const mastheadPlaceholder = canvas.querySelector('.pt-mockup-masthead-placeholder');
    const realMasthead = document.querySelector('ytd-masthead');
    if (mastheadPlaceholder && realMasthead) {
      document.body.appendChild(realMasthead);
      realMasthead.style.cssText = `
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100% !important;
        z-index: 100001 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      `;
      // Canvas etwas Padding oben geben damit Inhalt nicht unter der Masthead verschwindet
      inner.style.paddingTop = '56px';
    }

    // === Echten YouTube-Player über die Video-Position legen ===
    if (videoWrapper && moviePlayer) {
      // Platzhalter-Bild entfernen
      const mockupEl = videoWrapper.querySelector('.pt-mockup-video-player');
      if (mockupEl) {
        mockupEl.innerHTML = '';
        mockupEl.style.background = '#000';
      }

      // Player aus ytd-app herausnehmen und direkt in body hängen.
      document.body.appendChild(moviePlayer);

      // CSS-Overrides für alle internen Player-Elemente
      const playerStyle = document.createElement('style');
      playerStyle.id = 'pt-player-overrides';
      playerStyle.textContent = `
        #movie_player.pt-repositioned {
          position: fixed !important;
          z-index: 100000 !important;
          pointer-events: auto !important;
          overflow: hidden !important;
          border-radius: 12px !important;
        }
        #movie_player.pt-repositioned .html5-video-container,
        #movie_player.pt-repositioned .html5-video-container video {
          width: 100% !important;
          height: 100% !important;
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          object-fit: cover !important;
        }
        #movie_player.pt-repositioned .ytp-chrome-bottom {
          width: 100% !important;
          left: 0 !important;
          box-sizing: border-box !important;
          padding: 0 12px !important;
        }
        #movie_player.pt-repositioned .ytp-progress-bar-container {
          width: 100% !important;
        }
      `;
      document.head.appendChild(playerStyle);
      moviePlayer.classList.add('pt-repositioned');

      const updatePlayerPos = () => {
        // Responsive: Größe vom Mockup-Element übernehmen (skaliert mit Fenster)
        const target = mockupEl || videoWrapper;
        const rect = target.getBoundingClientRect();
        moviePlayer.style.left = rect.left + 'px';
        moviePlayer.style.top = rect.top + 'px';
        moviePlayer.style.width = rect.width + 'px';
        moviePlayer.style.height = rect.height + 'px';
      };

      // Initial positionieren + kurz warten bis DOM stabil
      updatePlayerPos();
      setTimeout(updatePlayerPos, 300);
      setTimeout(() => {
        updatePlayerPos();
        window.dispatchEvent(new Event('resize'));
      }, 600);

      // Bei Scroll aktualisieren
      canvas.addEventListener('scroll', updatePlayerPos);
      window.addEventListener('resize', updatePlayerPos);
    }

    // Buttons unten rechts
    const btnContainer = document.createElement('div');
    btnContainer.id = 'pt-restore-buttons';
    btnContainer.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 200000;
      display: flex; gap: 8px; font-family: system-ui, -apple-system, sans-serif;
    `;

    const btnEdit = document.createElement('button');
    btnEdit.textContent = 'Layout bearbeiten';
    btnEdit.style.cssText = `
      background: linear-gradient(135deg, #667eea, #764ba2); color: #fff; border: none;
      border-radius: 8px; padding: 10px 16px; font-size: 13px; font-weight: 600;
      cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    btnEdit.addEventListener('click', () => {
      // Restored-Canvas entfernen
      canvas.remove();
      btnContainer.remove();
      const hideFlash = document.getElementById('pt-hide-flash');
      if (hideFlash) hideFlash.remove();
      if (moviePlayer) moviePlayer.style.cssText = '';
      isRestored = false;
      openBuilder(layout);
    });

    const btnOriginal = document.createElement('button');
    btnOriginal.textContent = 'Original anzeigen';
    btnOriginal.style.cssText = `
      background: rgba(0,0,0,0.7); color: #fff; border: none; border-radius: 8px;
      padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    btnOriginal.addEventListener('click', () => {
      isRestored = false;
      window.location.reload();
    });

    btnContainer.appendChild(btnEdit);
    btnContainer.appendChild(btnOriginal);
    document.body.appendChild(btnContainer);
  }

  // === Builder öffnen ===
  async function openBuilder(existingLayout) {
    removeFloatingButtons();

    // Gespeichertes Layout ans Builder-Window übergeben
    if (existingLayout) {
      window.__ptEditLayout = existingLayout;
    }

    await injectViaBackground(['src/scanner.js']);
    await new Promise(r => setTimeout(r, 600));
    await injectViaBackground(['src/mockup-renderer.js', 'src/builder.js']);
  }

  // === Scripts über Background Service Worker injizieren ===
  // Content Scripts können weder chrome.scripting nutzen noch new Function()
  // (wird von YouTube's CSP blockiert). Daher bitten wir den Service Worker
  // die Scripts per chrome.scripting.executeScript zu injizieren.
  function injectViaBackground(files) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: 'injectScripts', files }, (resp) => {
        if (chrome.runtime.lastError) {
          console.warn('[PageTweaker] Background injection error:', chrome.runtime.lastError);
        }
        resolve(resp);
      });
    });
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
