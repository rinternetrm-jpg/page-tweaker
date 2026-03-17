// scanner.js — Scannt YouTube Watch-Page und extrahiert strukturierte Daten
(function () {
  // Erlaubt Re-Scan wenn Ergebnis explizit auf null gesetzt wurde
  if (window.__ptScanResult && window.__ptScanResult.url === window.location.href) return;

  // === Utility Funktionen ===

  function safeQuery(selectors) {
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch (e) { /* Selektor ungültig, weiter */ }
    }
    return null;
  }

  function safeQueryAll(selectors) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) return Array.from(els);
      } catch (e) { /* weiter */ }
    }
    return [];
  }

  function safeText(selectors) {
    const el = safeQuery(selectors);
    return el ? el.textContent.trim() : null;
  }

  function safeImgSrc(selectors) {
    const el = safeQuery(selectors);
    if (!el) return null;
    return el.src || el.getAttribute('src') || null;
  }

  function getVideoIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('v');
  }

  // === Extraktor-Funktionen ===

  function extractVideoPlayer() {
    try {
      const videoId = getVideoIdFromUrl();
      if (!videoId) return null;

      const duration = safeText([
        '.ytp-time-duration',
        '.ytp-time-display span:last-child'
      ]);

      const title = safeText([
        'h1.ytd-watch-metadata yt-formatted-string',
        'ytd-watch-metadata #title yt-formatted-string',
        'ytd-watch-metadata h1',
        '#title h1 yt-formatted-string',
        'h1.title'
      ]);

      return {
        videoId,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        thumbnailFallbacks: [
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
        ],
        duration: duration || '0:00',
        title: title || 'Video'
      };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Video Player Fehler', e);
      return null;
    }
  }

  function extractMetadata() {
    try {
      const title = safeText([
        'h1.ytd-watch-metadata yt-formatted-string',
        'ytd-watch-metadata #title yt-formatted-string',
        '#title h1 yt-formatted-string'
      ]);

      if (!title) return null;

      const viewCount = safeText([
        'ytd-watch-info-text span',
        '#info span.view-count',
        'ytd-video-view-count-renderer span',
        '#count .view-count'
      ]);

      const uploadDate = safeText([
        '#info-strings yt-formatted-string',
        'ytd-watch-info-text .bold:nth-child(3)',
        '#info-strings span'
      ]);

      // Likes extrahieren
      const likesEl = safeQuery([
        'like-button-view-model button',
        '#top-level-buttons-computed ytd-toggle-button-renderer:first-child',
        'ytd-menu-renderer .top-level-buttons button:first-child'
      ]);
      const likes = likesEl ? likesEl.getAttribute('aria-label') || likesEl.textContent.trim() : null;

      return { title, viewCount, uploadDate, likes };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Metadata Fehler', e);
      return null;
    }
  }

  function extractChannel() {
    try {
      const channelName = safeText([
        'ytd-watch-metadata #owner ytd-channel-name yt-formatted-string a',
        'ytd-watch-metadata #channel-name yt-formatted-string a',
        'ytd-video-owner-renderer #channel-name a',
        '#owner-name a'
      ]);

      if (!channelName) return null;

      const channelAvatarUrl = safeImgSrc([
        'ytd-watch-metadata #owner #avatar img',
        'ytd-video-owner-renderer #avatar img',
        '#owner #avatar img'
      ]);

      const subscriberCount = safeText([
        '#owner-sub-count',
        'ytd-video-owner-renderer #owner-sub-count',
        '#subscriber-count'
      ]);

      const isVerified = !!safeQuery([
        'ytd-watch-metadata #owner ytd-badge-supported-renderer',
        '#owner .badge-style-type-verified'
      ]);

      return { channelName, channelAvatarUrl, subscriberCount, isVerified };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Channel Fehler', e);
      return null;
    }
  }

  function extractDescription() {
    try {
      const descEl = safeQuery([
        'ytd-watch-metadata #description yt-formatted-string',
        '#description-inline-expander yt-formatted-string',
        '#description yt-attributed-string',
        'ytd-text-inline-expander #snippet-text'
      ]);

      if (!descEl) return null;

      const text = descEl.textContent.trim().slice(0, 200);
      const isExpanded = !!safeQuery([
        '#description-inline-expander[is-expanded]',
        '#description.ytd-watch-metadata[is-expanded]'
      ]);

      return { text, isExpanded };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Description Fehler', e);
      return null;
    }
  }

  function extractComments() {
    try {
      const commentCount = safeText([
        '#comments #count .count-text span',
        'ytd-comments-header-renderer #count span',
        '#comments #count yt-formatted-string span'
      ]);

      const commentEls = safeQueryAll([
        'ytd-comment-thread-renderer',
        '#comments ytd-comment-renderer'
      ]);

      if (commentEls.length === 0 && !commentCount) return null;

      const topComments = commentEls.slice(0, 10).map(el => {
        try {
          const author = el.querySelector('#author-text')?.textContent?.trim() ||
                         el.querySelector('#header-author #author-text span')?.textContent?.trim() || 'User';
          const avatarUrl = el.querySelector('#author-thumbnail img')?.src || null;
          const text = (el.querySelector('#content-text')?.textContent?.trim() || '').slice(0, 150);
          const likes = el.querySelector('#vote-count-middle')?.textContent?.trim() || '0';
          const timeAgo = el.querySelector('.published-time-text a')?.textContent?.trim() ||
                          el.querySelector('.published-time-text')?.textContent?.trim() || '';
          return { author, avatarUrl, text, likes, timeAgo };
        } catch {
          return null;
        }
      }).filter(Boolean);

      return { commentCount: commentCount || `${topComments.length}`, topComments };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Comments Fehler', e);
      return null;
    }
  }

  function extractRecommendations() {
    try {
      // Neue YouTube-Version: yt-lockup-view-model
      let items = safeQueryAll([
        'ytd-item-section-renderer #contents > yt-lockup-view-model',
        'ytd-watch-next-secondary-results-renderer yt-lockup-view-model',
        '#secondary yt-lockup-view-model',
      ]);

      // Fallback: alte Versionen
      if (items.length === 0) {
        items = safeQueryAll([
          'ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer',
          '#secondary ytd-compact-video-renderer',
          '#secondary ytd-rich-item-renderer',
        ]);
      }

      if (items.length === 0) return null;

      const recommendations = items.slice(0, 30).map(el => {
        try {
          // Video-Link und ID
          const link = el.querySelector('a[href*="/watch?v="]') ||
                       el.querySelector('a#thumbnail') ||
                       el.querySelector('a');
          let videoId = null;
          if (link?.href) {
            try {
              const u = new URL(link.href, location.origin);
              videoId = u.searchParams.get('v');
            } catch { /* ignore */ }
          }

          // Titel
          const title = el.querySelector('h3')?.textContent?.trim() ||
                        el.querySelector('#video-title')?.textContent?.trim() ||
                        el.querySelector('[class*="title"]')?.textContent?.trim() || 'Video';

          // Thumbnail
          const thumbnailImg = el.querySelector('yt-thumbnail-view-model img') ||
                               el.querySelector('ytd-thumbnail img') ||
                               el.querySelector('img.yt-core-image') ||
                               el.querySelector('img');
          let thumbnailUrl = thumbnailImg?.src || null;
          // Fallback: aus videoId generieren
          if ((!thumbnailUrl || thumbnailUrl.startsWith('data:')) && videoId) {
            thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
          }

          // Kanal
          const channelName = el.querySelector('ytd-channel-name yt-formatted-string')?.textContent?.trim() ||
                              el.querySelector('[class*="channel"]')?.textContent?.trim() ||
                              el.querySelector('.ytd-channel-name')?.textContent?.trim() || '';

          // Metadaten (Views, Alter)
          const metaTexts = Array.from(el.querySelectorAll('span, [class*="metadata"], [class*="meta"]'))
            .map(s => s.textContent?.trim())
            .filter(t => t && (t.includes('Aufrufe') || t.includes('views') || t.includes('Std.') ||
                               t.includes('Tag') || t.includes('Woche') || t.includes('Monat') ||
                               t.includes('Jahr') || t.includes('ago') || t.includes('hr') ||
                               t.includes('day') || t.includes('week')));
          const viewCount = metaTexts[0] || '';
          const timeAgo = metaTexts[1] || '';

          // Duration
          const duration = el.querySelector('[class*="time-status"] [class*="text"]')?.textContent?.trim() ||
                           el.querySelector('ytd-thumbnail-overlay-time-status-renderer #text')?.textContent?.trim() ||
                           el.querySelector('badge-shape [class*="badge"]')?.textContent?.trim() || '';

          if (!videoId && !title) return null;

          return { title, thumbnailUrl, channelName, viewCount, timeAgo, duration, videoId };
        } catch {
          return null;
        }
      }).filter(Boolean);

      if (recommendations.length === 0) return null;
      return { items: recommendations };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Recommendations Fehler', e);
      return null;
    }
  }

  function extractPlaylist() {
    try {
      const playlistEl = safeQuery(['ytd-playlist-panel-renderer']);
      if (!playlistEl) return null;

      const playlistTitle = playlistEl.querySelector('#title')?.textContent?.trim() || 'Playlist';
      const publisher = playlistEl.querySelector('#publisher')?.textContent?.trim() || '';

      const playlistItems = Array.from(playlistEl.querySelectorAll('ytd-playlist-panel-video-renderer')).slice(0, 20);

      const items = playlistItems.map(el => {
        try {
          return {
            title: el.querySelector('#video-title')?.textContent?.trim() || 'Video',
            thumbnailUrl: el.querySelector('img')?.src || null,
            duration: el.querySelector('.duration')?.textContent?.trim() ||
                      el.querySelector('#duration')?.textContent?.trim() || ''
          };
        } catch { return null; }
      }).filter(Boolean);

      const currentIndex = playlistEl.querySelector('#publisher')?.closest('#container')
        ?.querySelector('#index')?.textContent?.trim() || '1';

      return {
        playlistTitle,
        publisher,
        itemCount: items.length,
        currentIndex: parseInt(currentIndex) || 1,
        items
      };
    } catch (e) {
      console.warn('[PageTweaker] Scanner: Playlist Fehler', e);
      return null;
    }
  }

  function extractChat() {
    try {
      const chatEl = safeQuery(['ytd-live-chat-frame', '#chat-container', '#chat']);
      if (!chatEl) return null;

      return {
        isLive: true,
        chatMessages: [] // Chat ist in einem iframe, Zugriff limitiert
      };
    } catch (e) {
      return null;
    }
  }

  // === Scan ausführen ===
  // Erst sofort scannen, dann ggf. nachladen wenn Empfehlungen fehlen

  function runScan() {
    return {
      pageType: 'youtube-watch',
      url: window.location.href,
      scannedAt: Date.now(),
      components: [
        { type: 'video-player', data: extractVideoPlayer() },
        { type: 'video-metadata', data: extractMetadata() },
        { type: 'channel-info', data: extractChannel() },
        { type: 'description', data: extractDescription() },
        { type: 'comments', data: extractComments() },
        { type: 'recommendations', data: extractRecommendations() },
        { type: 'playlist', data: extractPlaylist() },
        { type: 'chat', data: extractChat() }
      ].filter(c => c.data !== null)
    };
  }

  const startTime = performance.now();
  window.__ptScanResult = runScan();

  const hasRecs = window.__ptScanResult.components.some(c => c.type === 'recommendations');

  if (!hasRecs) {
    // Empfehlungen laden bei YouTube oft verzögert — bis zu 3x nachscannen
    let retries = 0;
    const retryScan = () => {
      retries++;
      const recs = extractRecommendations();
      if (recs) {
        window.__ptScanResult.components.push({ type: 'recommendations', data: recs });
        console.log(`[PageTweaker] Empfehlungen nachgeladen nach ${retries}. Versuch (${recs.items.length} Items)`);
      } else if (retries < 5) {
        setTimeout(retryScan, 1000);
      } else {
        console.log('[PageTweaker] Keine Empfehlungen gefunden nach 5 Versuchen');
      }
    };
    setTimeout(retryScan, 1500);
  }

  const scanTime = Math.round(performance.now() - startTime);
  console.log(`[PageTweaker] Scan abgeschlossen in ${scanTime}ms`, window.__ptScanResult);
  console.log(`[PageTweaker] ${window.__ptScanResult.components.length} Elemente erkannt:`,
    window.__ptScanResult.components.map(c => c.type).join(', '));
})();
