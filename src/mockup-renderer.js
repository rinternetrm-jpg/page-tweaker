// mockup-renderer.js — Erzeugt realistische HTML-Mockups aus Scanner-Daten
(function () {
  if (window.__ptMockupRenderer) return;

  // === Shared Styles ===
  const COLORS = {
    light: {
      bg: '#ffffff',
      textPrimary: '#0f0f0f',
      textSecondary: '#606060',
      border: '#e5e5e5',
      overlay: 'rgba(0,0,0,0.6)',
      hoverBg: '#f2f2f2',
      chipBg: '#f2f2f2',
    },
    dark: {
      bg: '#0f0f0f',
      textPrimary: '#f1f1f1',
      textSecondary: '#aaaaaa',
      border: '#3f3f3f',
      overlay: 'rgba(0,0,0,0.8)',
      hoverBg: '#272727',
      chipBg: '#272727',
    }
  };

  class MockupRenderer {
    constructor() {
      this.theme = 'light';
    }

    get c() { return COLORS[this.theme]; }

    setTheme(theme) {
      this.theme = theme === 'dark' ? 'dark' : 'light';
    }

    // === Video Player — Thumbnail als Platzhalter im Builder ===
    renderVideoPlayer(data, width = 640, height = 360) {
      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-video-player';
      el.style.cssText = `
        width: ${width}px; height: ${height}px; position: relative;
        background: #000; border-radius: 12px; overflow: hidden; cursor: default;
        font-family: system-ui, -apple-system, sans-serif;
      `;

      // Thumbnail als <img> (robuster als CSS background)
      const thumbUrl = data.thumbnailUrl || '';
      const fallback1 = (data.thumbnailFallbacks && data.thumbnailFallbacks[0]) || '';
      const fallback2 = (data.thumbnailFallbacks && data.thumbnailFallbacks[1]) || '';

      el.innerHTML = `
        <img src="${this._esc(thumbUrl)}"
             onerror="this.src='${this._esc(fallback1)}'; this.onerror=function(){this.src='${this._esc(fallback2)}';this.onerror=null;}"
             style="width:100%;height:100%;object-fit:cover;display:block;">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <div style="width:68px;height:48px;background:rgba(0,0,0,0.7);border-radius:12px;
                      display:flex;align-items:center;justify-content:center;">
            <div style="width:0;height:0;border-left:20px solid #fff;border-top:12px solid transparent;
                        border-bottom:12px solid transparent;margin-left:4px;"></div>
          </div>
        </div>
        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.8);color:#fff;
                    font-size:12px;padding:2px 6px;border-radius:3px;font-weight:500;">
          ${data.duration || '0:00'}
        </div>
      `;

      return el;
    }

    // === Video Metadata Mockup ===
    renderMetadata(data) {
      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-metadata';
      el.style.cssText = `
        padding: 12px 0; font-family: system-ui, -apple-system, sans-serif;
        color: ${this.c.textPrimary};
      `;
      el.innerHTML = `
        <h3 style="font-size:18px;font-weight:600;line-height:1.3;margin:0 0 8px 0;
                   color:${this.c.textPrimary};">${this._esc(data.title)}</h3>
        <div style="display:flex;align-items:center;gap:8px;font-size:13px;color:${this.c.textSecondary};">
          ${data.viewCount ? `<span>${this._esc(data.viewCount)}</span>` : ''}
          ${data.viewCount && data.uploadDate ? '<span>·</span>' : ''}
          ${data.uploadDate ? `<span>${this._esc(data.uploadDate)}</span>` : ''}
        </div>
        ${data.likes ? `
        <div style="display:flex;gap:8px;margin-top:10px;">
          <div style="display:flex;align-items:center;gap:6px;background:${this.c.chipBg};
                      border-radius:18px;padding:6px 14px;font-size:13px;font-weight:500;
                      color:${this.c.textPrimary};">
            <span>👍</span> <span>${this._esc(data.likes)}</span>
            <span style="margin:0 4px;color:${this.c.border};">|</span>
            <span>👎</span>
          </div>
          <div style="background:${this.c.chipBg};border-radius:18px;padding:6px 14px;
                      font-size:13px;color:${this.c.textPrimary};">Teilen</div>
          <div style="background:${this.c.chipBg};border-radius:18px;padding:6px 14px;
                      font-size:13px;color:${this.c.textPrimary};">···</div>
        </div>` : ''}
      `;
      return el;
    }

    // === Channel Info Mockup ===
    renderChannelInfo(data) {
      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-channel';
      el.style.cssText = `
        display: flex; align-items: center; gap: 12px; padding: 12px 0;
        font-family: system-ui, -apple-system, sans-serif; color: ${this.c.textPrimary};
      `;

      const avatarHtml = data.channelAvatarUrl
        ? `<img src="${this._esc(data.channelAvatarUrl)}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);
                      display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;">
             ${this._esc((data.channelName || 'C')[0])}
           </div>`;

      el.innerHTML = `
        ${avatarHtml}
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:600;color:${this.c.textPrimary};display:flex;align-items:center;gap:4px;">
            ${this._esc(data.channelName)}
            ${data.isVerified ? '<span style="font-size:12px;">✓</span>' : ''}
          </div>
          ${data.subscriberCount ? `<div style="font-size:12px;color:${this.c.textSecondary};">${this._esc(data.subscriberCount)}</div>` : ''}
        </div>
        <div style="background:#cc0000;color:#fff;border-radius:18px;padding:8px 16px;
                    font-size:14px;font-weight:500;white-space:nowrap;">Abonnieren</div>
      `;
      return el;
    }

    // === Description Mockup ===
    renderDescription(data) {
      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-description';
      el.style.cssText = `
        background: ${this.c.chipBg}; border-radius: 12px; padding: 12px 14px;
        font-family: system-ui, -apple-system, sans-serif; color: ${this.c.textPrimary};
        font-size: 14px; line-height: 1.5;
      `;
      el.innerHTML = `
        <div style="white-space:pre-wrap;overflow:hidden;max-height:80px;">
          ${this._esc(data.text)}
        </div>
        <div style="margin-top:8px;font-weight:600;font-size:13px;color:${this.c.textPrimary};cursor:default;">
          Mehr anzeigen
        </div>
      `;
      return el;
    }

    // === Comments Mockup ===
    renderComments(data, options = { count: 5 }) {
      const count = Math.min(options.count || 5, (data.topComments || []).length);
      const comments = (data.topComments || []).slice(0, count);

      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-comments';
      el.style.cssText = `
        font-family: system-ui, -apple-system, sans-serif; color: ${this.c.textPrimary};
        padding: 16px 0;
      `;

      let html = `
        <div style="font-size:16px;font-weight:600;margin-bottom:16px;color:${this.c.textPrimary};">
          ${this._esc(data.commentCount || '0')} Kommentare
        </div>
      `;

      for (const comment of comments) {
        const avatarHtml = comment.avatarUrl
          ? `<img src="${this._esc(comment.avatarUrl)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
          : `<div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#764ba2,#667eea);
                        flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-weight:600;">
               ${this._esc((comment.author || 'U')[0])}
             </div>`;

        html += `
          <div style="display:flex;gap:12px;margin-bottom:16px;">
            ${avatarHtml}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;color:${this.c.textPrimary};">${this._esc(comment.author)}</span>
                <span style="font-size:12px;color:${this.c.textSecondary};">${this._esc(comment.timeAgo)}</span>
              </div>
              <div style="font-size:14px;line-height:1.4;color:${this.c.textPrimary};">
                ${this._esc(comment.text)}
              </div>
              <div style="display:flex;align-items:center;gap:12px;margin-top:6px;font-size:12px;color:${this.c.textSecondary};">
                <span>👍 ${this._esc(comment.likes)}</span>
                <span>👎</span>
                <span>Antworten</span>
              </div>
            </div>
          </div>
        `;
      }

      el.innerHTML = html;
      return el;
    }

    // === Recommendations / Thumbnail Grid Mockup ===
    renderRecommendations(data, options = { columns: 1, thumbnailWidth: 168, maxItems: 10, showTitle: true, showMeta: true }) {
      const cols = options.columns || 1;
      const thumbW = options.thumbnailWidth || 168;
      const maxItems = options.maxItems || 10;
      const showTitle = options.showTitle !== false;
      const showMeta = options.showMeta !== false;
      const items = (data.items || []).slice(0, maxItems);

      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-recommendations';
      el.style.cssText = `
        font-family: system-ui, -apple-system, sans-serif; color: ${this.c.textPrimary};
        display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: ${cols > 1 ? '16px' : '8px'};
      `;

      let html = '';
      for (const item of items) {
        const thumbH = Math.round(thumbW * 9 / 16);
        const isVertical = cols > 1;

        const thumbSrc = item.thumbnailUrl || (item.videoId
          ? `https://i.ytimg.com/vi/${item.videoId}/mqdefault.jpg`
          : '');

        const thumbStyle = isVertical
          ? `width:100%;aspect-ratio:16/9;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;background:#1a1a2e;`
          : `width:${thumbW}px;height:${thumbH}px;border-radius:8px;overflow:hidden;position:relative;flex-shrink:0;background:#1a1a2e;`;

        const containerStyle = isVertical
          ? 'display:flex;flex-direction:column;gap:8px;'
          : 'display:flex;gap:8px;';

        const videoIdAttr = item.videoId ? `data-video-id="${this._esc(item.videoId)}"` : '';
        const hoverStyle = item.videoId ? 'cursor:pointer;' : '';

        html += `
          <div style="${containerStyle}${hoverStyle}" ${videoIdAttr}
               onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
            <div style="${thumbStyle}">
              ${thumbSrc ? `<img src="${this._esc(thumbSrc)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">` : ''}
              ${item.duration ? `<div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.8);
                color:#fff;font-size:11px;padding:1px 4px;border-radius:3px;font-weight:500;">
                ${this._esc(item.duration)}</div>` : ''}
            </div>
            ${(showTitle || showMeta) ? `<div style="flex:1;min-width:0;">
              ${showTitle ? `<div style="font-size:13px;font-weight:500;line-height:1.3;color:${this.c.textPrimary};
                          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${this._esc(item.title)}</div>` : ''}
              ${showMeta ? `<div style="font-size:12px;color:${this.c.textSecondary};margin-top:3px;">
                ${this._esc(item.channelName)}</div>
              <div style="font-size:12px;color:${this.c.textSecondary};">
                ${this._esc(item.viewCount)}${item.timeAgo ? ' · ' + this._esc(item.timeAgo) : ''}</div>` : ''}
            </div>` : ''}
          </div>
        `;
      }

      el.innerHTML = html;
      return el;
    }

    // === Playlist Mockup ===
    renderPlaylist(data) {
      const el = document.createElement('div');
      el.className = 'pt-mockup pt-mockup-playlist';
      el.style.cssText = `
        background: ${this.c.chipBg}; border-radius: 12px; overflow: hidden;
        font-family: system-ui, -apple-system, sans-serif; color: ${this.c.textPrimary};
      `;

      let itemsHtml = '';
      for (const item of (data.items || []).slice(0, 10)) {
        itemsHtml += `
          <div style="display:flex;gap:8px;padding:4px 12px;align-items:center;">
            <div style="width:100px;height:56px;border-radius:6px;overflow:hidden;flex-shrink:0;background:#1a1a2e;">
              ${item.thumbnailUrl ? `<img src="${this._esc(item.thumbnailUrl)}" style="width:100%;height:100%;object-fit:cover;">` : ''}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:500;line-height:1.3;
                          display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">
                ${this._esc(item.title)}</div>
              ${item.duration ? `<div style="font-size:11px;color:${this.c.textSecondary};margin-top:2px;">${this._esc(item.duration)}</div>` : ''}
            </div>
          </div>
        `;
      }

      el.innerHTML = `
        <div style="padding:16px;background:${this.theme === 'dark' ? '#272727' : '#e8e8e8'};">
          <div style="font-size:14px;font-weight:600;">${this._esc(data.playlistTitle)}</div>
          <div style="font-size:12px;color:${this.c.textSecondary};margin-top:4px;">
            ${this._esc(data.publisher || '')} · ${data.currentIndex}/${data.itemCount}
          </div>
        </div>
        <div style="padding:8px 0;">${itemsHtml}</div>
      `;
      return el;
    }

    // === Utility ===
    _esc(str) {
      if (!str) return '';
      const div = document.createElement('div');
      div.textContent = String(str);
      return div.innerHTML;
    }

    _escUrl(url) {
      if (!url) return '';
      // Entferne Zeichen die CSS url() oder HTML-Attribute brechen könnten
      return String(url).replace(/['"\\()]/g, '');
    }
  }

  window.__ptMockupRenderer = new MockupRenderer();
  console.log('[PageTweaker] MockupRenderer bereit');
})();
