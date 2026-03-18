// background.js — Service Worker für Script-Injection
// Alle Injections laufen hier, weil:
// 1. Content Scripts können chrome.scripting nicht nutzen
// 2. Popup schließt sich bevor async Injections fertig sind
// 3. CSP blockiert new Function() / eval auf YouTube

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'fetchVideoData') {
    // Video-Seite fetchen und Empfehlungen/Metadaten extrahieren
    const videoId = msg.videoId;
    if (!videoId) return;

    (async () => {
      try {
        const url = 'https://www.youtube.com/watch?v=' + encodeURIComponent(videoId);
        const resp = await fetch(url);
        const html = await resp.text();

        const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
        if (!match) {
          sendResponse({ ok: false });
          return;
        }

        const data = JSON.parse(match[1]);
        const result = { ok: true, recommendations: [], comments: [], metadata: null, channel: null, description: null };

        // Empfehlungen extrahieren
        function findRecommendations(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.compactVideoRenderer) {
            const vr = obj.compactVideoRenderer;
            result.recommendations.push({
              videoId: vr.videoId,
              title: vr.title?.simpleText || vr.title?.runs?.[0]?.text || 'Video',
              channelName: vr.longBylineText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || '',
              viewCount: vr.viewCountText?.simpleText || '',
              duration: vr.lengthText?.simpleText || '',
              thumbnailUrl: vr.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
              timeAgo: vr.publishedTimeText?.simpleText || ''
            });
          }
          // Neue YouTube-Struktur
          if (obj.videoRenderer) {
            const vr = obj.videoRenderer;
            result.recommendations.push({
              videoId: vr.videoId,
              title: vr.title?.runs?.[0]?.text || 'Video',
              channelName: vr.longBylineText?.runs?.[0]?.text || '',
              viewCount: vr.viewCountText?.simpleText || '',
              duration: vr.lengthText?.simpleText || '',
              thumbnailUrl: vr.thumbnail?.thumbnails?.pop()?.url || `https://i.ytimg.com/vi/${vr.videoId}/mqdefault.jpg`,
              timeAgo: vr.publishedTimeText?.simpleText || ''
            });
          }
          if (Array.isArray(obj)) obj.forEach(findRecommendations);
          else Object.values(obj).forEach(findRecommendations);
        }

        // Metadaten extrahieren
        function findMetadata(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.videoPrimaryInfoRenderer) {
            const vp = obj.videoPrimaryInfoRenderer;
            result.metadata = {
              title: vp.title?.runs?.[0]?.text || '',
              viewCount: vp.viewCount?.videoViewCountRenderer?.viewCount?.simpleText || '',
              uploadDate: vp.dateText?.simpleText || '',
              likes: vp.videoActions?.menuRenderer?.topLevelButtons?.[0]?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel?.defaultButtonViewModel?.buttonViewModel?.title || ''
            };
          }
          if (obj.videoSecondaryInfoRenderer) {
            const vs = obj.videoSecondaryInfoRenderer;
            result.channel = {
              channelName: vs.owner?.videoOwnerRenderer?.title?.runs?.[0]?.text || '',
              channelAvatarUrl: vs.owner?.videoOwnerRenderer?.thumbnail?.thumbnails?.pop()?.url || '',
              subscriberCount: vs.owner?.videoOwnerRenderer?.subscriberCountText?.simpleText || '',
              isVerified: false
            };
            result.description = {
              text: vs.attributedDescription?.content?.slice(0, 200) || '',
              isExpanded: false
            };
          }
          if (Array.isArray(obj)) obj.forEach(findMetadata);
          else Object.values(obj).forEach(findMetadata);
        }

        findRecommendations(data);
        findMetadata(data);

        console.log('[PT Background] fetchVideoData:', result.recommendations.length, 'recs');
        sendResponse(result);
      } catch (e) {
        console.error('[PT Background] fetchVideoData error:', e);
        sendResponse({ ok: false, error: e.message });
      }
    })();

    return true;
  }

  if (msg.action === 'searchYouTube') {
    // YouTube-Suche: HTML fetchen und Video-Daten extrahieren
    const query = msg.query;
    if (!query) return;

    (async () => {
      try {
        const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
        const resp = await fetch(url);
        const html = await resp.text();

        // ytInitialData aus dem HTML extrahieren
        const match = html.match(/var ytInitialData\s*=\s*(\{.+?\});\s*<\/script>/s);
        if (!match) {
          sendResponse({ ok: false, items: [] });
          return;
        }

        const data = JSON.parse(match[1]);
        const items = [];

        // Video-Ergebnisse aus der verschachtelten Struktur extrahieren
        function findVideos(obj) {
          if (!obj || typeof obj !== 'object') return;
          if (obj.videoRenderer) {
            const vr = obj.videoRenderer;
            const videoId = vr.videoId;
            const title = vr.title?.runs?.[0]?.text || 'Video';
            const channelName = vr.longBylineText?.runs?.[0]?.text ||
                                vr.shortBylineText?.runs?.[0]?.text || '';
            const viewCount = vr.viewCountText?.simpleText || vr.viewCountText?.runs?.[0]?.text || '';
            const duration = vr.lengthText?.simpleText || '';
            const thumbnailUrl = vr.thumbnail?.thumbnails?.pop()?.url ||
                                 `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

            if (videoId) {
              items.push({ videoId, title, channelName, viewCount, duration, thumbnailUrl, timeAgo: '' });
            }
          }
          if (Array.isArray(obj)) {
            obj.forEach(findVideos);
          } else {
            Object.values(obj).forEach(findVideos);
          }
        }

        findVideos(data);
        console.log('[PT Background] Suche:', query, '→', items.length, 'Ergebnisse');
        sendResponse({ ok: true, items: items.slice(0, 30) });
      } catch (e) {
        console.error('[PT Background] Search error:', e);
        sendResponse({ ok: false, items: [], error: e.message });
      }
    })();

    return true; // async sendResponse
  }

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
