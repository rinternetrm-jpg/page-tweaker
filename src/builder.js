// builder.js — Hauptlogik: Canvas + Palette + Drag & Drop + Resize
(function () {
  if (window.__ptBuilderActive && document.querySelector('.pt-builder-root')) return;

  const scanResult = window.__ptScanResult;
  const renderer = window.__ptMockupRenderer;

  console.log('[PT Builder] scanResult:', !!scanResult, 'renderer:', !!renderer);

  if (!scanResult || !renderer) {
    alert('PageTweaker: Seite konnte nicht analysiert werden. Bitte lade die Seite neu und versuche es erneut.');
    return;
  }

  window.__ptBuilderActive = true;

  // === State ===
  let canvasWidth = 1200;
  let canvasBg = '#ffffff';
  let theme = 'light';
  let placedItems = [];
  let selectedItem = null;
  let nextId = 1;

  // === Original-Seite verstecken (nicht zerstören!) ===
  const origApp = document.querySelector('ytd-app') || document.querySelector('body > *:not(.pt-builder-root)');
  if (origApp) {
    origApp.style.cssText = 'visibility:hidden !important; pointer-events:none !important;';
    origApp.dataset.ptOriginal = 'true';
  }

  const originalPlayer = document.querySelector('#movie_player');

  const styleEl = document.createElement('style');
  styleEl.id = 'pt-builder-style';
  styleEl.textContent = getBuilderCSS();
  document.head.appendChild(styleEl);

  document.body.classList.add('pt-builder-body');

  // === Layout erstellen ===
  const root = document.createElement('div');
  root.className = 'pt-builder-root';

  // Canvas-Bereich (links)
  const canvasArea = document.createElement('div');
  canvasArea.className = 'pt-canvas-area';

  const canvas = document.createElement('div');
  canvas.className = 'pt-canvas';
  canvas.style.width = canvasWidth + 'px';
  canvas.style.background = canvasBg;
  canvasArea.appendChild(canvas);

  // Drop-Indikator
  const dropIndicator = document.createElement('div');
  dropIndicator.className = 'pt-drop-indicator';
  dropIndicator.style.display = 'none';
  canvas.appendChild(dropIndicator);

  // Palette (rechts)
  const palette = document.createElement('div');
  palette.className = 'pt-palette';
  palette.innerHTML = buildPaletteHTML();

  root.appendChild(canvasArea);
  root.appendChild(palette);
  document.body.appendChild(root);

  // === Palette Event Handlers ===
  setupPaletteEvents();
  setupCanvasEvents();
  setupKeyboardShortcuts();

  // === Gespeichertes Layout laden (Edit-Modus) ===
  if (window.__ptEditLayout) {
    const editLayout = window.__ptEditLayout;
    delete window.__ptEditLayout;

    // Canvas-Einstellungen übernehmen
    if (editLayout.canvasWidth) {
      canvasWidth = editLayout.canvasWidth;
      canvas.style.width = canvasWidth + 'px';
      const widthSelect = document.getElementById('ptCanvasWidth');
      if (widthSelect) {
        const opt = Array.from(widthSelect.options).find(o => o.value === String(canvasWidth));
        if (opt) opt.selected = true;
      }
    }
    if (editLayout.bgColor) {
      canvasBg = editLayout.bgColor;
      canvas.style.background = canvasBg;
      if (canvasBg === '#0f0f0f') {
        theme = 'dark';
        renderer.setTheme(theme);
      }
    }

    // Items wiederherstellen
    for (const savedItem of (editLayout.items || [])) {
      const comp = scanResult.components.find(c => c.type === savedItem.type);
      if (!comp && savedItem.type !== 'custom-text') continue;

      const item = {
        id: nextId++,
        type: savedItem.type,
        data: comp ? comp.data : {},
        x: savedItem.x,
        y: savedItem.y,
        w: savedItem.w,
        h: savedItem.h,
        options: { ...getDefaultOptions(savedItem.type), ...(savedItem.options || {}) },
      };

      placedItems.push(item);
      renderItem(item);
    }
    updatePaletteStatus();
    console.log('[PT Builder] Layout geladen:', placedItems.length, 'Items');
  }

  // === Palette aufbauen ===
  function buildPaletteHTML() {
    const typeLabels = {
      'video-player': { icon: '🎬', label: 'Video Player' },
      'video-metadata': { icon: '📝', label: 'Titel & Metadaten' },
      'channel-info': { icon: '👤', label: 'Kanal-Info' },
      'description': { icon: '📄', label: 'Beschreibung' },
      'comments': { icon: '💬', label: 'Kommentare' },
      'recommendations': { icon: '📸', label: 'Empfehlungen' },
      'playlist': { icon: '📋', label: 'Playlist' },
      'chat': { icon: '💭', label: 'Live Chat' },
      'masthead': { icon: '🔍', label: 'Logo & Suche' },
      'custom-text': { icon: '✏️', label: 'Textblock' },
    };

    let itemsHtml = '';
    for (const comp of scanResult.components) {
      const info = typeLabels[comp.type] || { icon: '📦', label: comp.type };
      itemsHtml += `
        <div class="pt-palette-item" data-type="${comp.type}" draggable="true">
          <div class="pt-palette-item-header">
            <span class="pt-palette-icon">${info.icon}</span>
            <span class="pt-palette-label">${info.label}</span>
            <span class="pt-palette-status" data-status-for="${comp.type}"></span>
          </div>
        </div>
      `;
    }

    // Extras (nicht aus Scanner)
    const extras = [
      { type: 'custom-text', icon: '✏️', label: 'Textblock' }
    ];
    let extrasHtml = '';
    for (const ext of extras) {
      extrasHtml += `
        <div class="pt-palette-item" data-type="${ext.type}" draggable="true">
          <div class="pt-palette-item-header">
            <span class="pt-palette-icon">${ext.icon}</span>
            <span class="pt-palette-label">${ext.label}</span>
            <span class="pt-palette-status" data-status-for="${ext.type}"></span>
          </div>
        </div>
      `;
    }

    return `
      <div class="pt-palette-header">
        <div class="pt-palette-title">PageTweaker</div>
        <div class="pt-palette-subtitle">${new URL(scanResult.url).hostname}</div>
      </div>

      <div class="pt-palette-section">
        <div class="pt-palette-section-title">Elemente</div>
        ${itemsHtml}
      </div>

      <div class="pt-palette-section">
        <div class="pt-palette-section-title">Extras</div>
        ${extrasHtml}
      </div>

      <div class="pt-palette-section pt-config-panel" id="ptConfigPanel" style="display:none;">
        <div class="pt-palette-section-title">Konfiguration</div>
        <div id="ptConfigContent"></div>
      </div>

      <div class="pt-palette-section">
        <div class="pt-palette-section-title">Canvas</div>
        <div class="pt-config-row">
          <label>Breite</label>
          <select id="ptCanvasWidth">
            <option value="375">375px (Mobile)</option>
            <option value="768">768px (Tablet)</option>
            <option value="1200" selected>1200px</option>
            <option value="1400">1400px</option>
            <option value="1920">1920px (Full HD)</option>
            <option value="full">Vollbild</option>
          </select>
        </div>
        <div class="pt-config-row">
          <label>Hintergrund</label>
          <select id="ptCanvasBg">
            <option value="#ffffff">Weiß</option>
            <option value="#f9f9f9">Hellgrau</option>
            <option value="#0f0f0f">Dunkel</option>
          </select>
        </div>
      </div>

      <div class="pt-palette-actions">
        <button class="pt-btn pt-btn-save" id="ptBtnSave">Speichern</button>
        <div class="pt-palette-actions-row">
          <button class="pt-btn pt-btn-clear" id="ptBtnClear">Clear</button>
          <button class="pt-btn pt-btn-exit" id="ptBtnExit">Exit</button>
        </div>
      </div>
    `;
  }

  // === Palette Events ===
  function setupPaletteEvents() {
    // Drag from palette
    palette.querySelectorAll('.pt-palette-item').forEach(item => {
      item.addEventListener('dragstart', (e) => {
        const type = item.dataset.type;
        e.dataTransfer.setData('text/plain', type);
        e.dataTransfer.effectAllowed = 'copy';
        item.classList.add('pt-dragging');
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('pt-dragging');
        dropIndicator.style.display = 'none';
      });

      // Click to add
      item.addEventListener('dblclick', () => {
        const type = item.dataset.type;
        addItemToCanvas(type, 50, 50 + placedItems.length * 30);
      });
    });

    // Canvas width
    document.getElementById('ptCanvasWidth').addEventListener('change', (e) => {
      if (e.target.value === 'full') {
        canvasWidth = window.innerWidth - 300; // minus palette width
      } else {
        canvasWidth = parseInt(e.target.value);
      }
      canvas.style.width = canvasWidth + 'px';
    });

    // Canvas bg
    document.getElementById('ptCanvasBg').addEventListener('change', (e) => {
      canvasBg = e.target.value;
      canvas.style.background = canvasBg;
      theme = canvasBg === '#0f0f0f' ? 'dark' : 'light';
      renderer.setTheme(theme);
      refreshAllItems();
    });

    // Save
    document.getElementById('ptBtnSave').addEventListener('click', saveLayout);

    // Clear
    document.getElementById('ptBtnClear').addEventListener('click', () => {
      if (confirm('Alle Elemente von der Canvas entfernen?')) {
        placedItems = [];
        selectedItem = null;
        renderCanvas();
        hideConfigPanel();
      }
    });

    // Exit
    document.getElementById('ptBtnExit').addEventListener('click', exitBuilder);
  }

  // === Canvas Events ===
  function setupCanvasEvents() {
    canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      dropIndicator.style.display = 'block';
      dropIndicator.style.left = x + 'px';
      dropIndicator.style.top = y + 'px';
    });

    canvas.addEventListener('dragleave', () => {
      dropIndicator.style.display = 'none';
    });

    canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      dropIndicator.style.display = 'none';
      const type = e.dataTransfer.getData('text/plain');
      if (!type) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, e.clientX - rect.left - 50);
      const y = Math.max(0, e.clientY - rect.top - 30);
      addItemToCanvas(type, x, y);
    });

    // Click on canvas background -> deselect
    canvas.addEventListener('mousedown', (e) => {
      if (e.target === canvas) {
        selectItem(null);
      }
    });
  }

  // === Keyboard ===
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' && selectedItem) {
        removeItem(selectedItem);
      }
      if (e.key === 'Escape') {
        if (selectedItem) selectItem(null);
        else exitBuilder();
      }
    });
  }

  // === Item Management ===
  function addItemToCanvas(type, x, y) {
    const comp = scanResult.components.find(c => c.type === type);
    // Custom elements don't need scanner data
    if (!comp && type !== 'custom-text') return;

    const defaults = getDefaultSize(type);
    const item = {
      id: nextId++,
      type,
      data: comp ? comp.data : {},
      x, y,
      w: defaults.w,
      h: defaults.h,
      options: getDefaultOptions(type),
    };

    placedItems.push(item);
    renderItem(item);
    selectItem(item);
    updatePaletteStatus();
  }

  function removeItem(item) {
    const idx = placedItems.indexOf(item);
    if (idx === -1) return;
    placedItems.splice(idx, 1);
    const el = canvas.querySelector(`[data-item-id="${item.id}"]`);
    if (el) el.remove();
    if (selectedItem === item) {
      selectedItem = null;
      hideConfigPanel();
    }
    updatePaletteStatus();
  }

  function selectItem(item) {
    selectedItem = item;
    canvas.querySelectorAll('.pt-canvas-item').forEach(el => {
      el.classList.toggle('pt-selected', item && el.dataset.itemId == item.id);
    });
    if (item) {
      showConfigPanel(item);
    } else {
      hideConfigPanel();
    }
  }

  function getDefaultSize(type) {
    const sizes = {
      'video-player': { w: 640, h: 360 },
      'video-metadata': { w: 640, h: 120 },
      'channel-info': { w: 640, h: 70 },
      'description': { w: 640, h: 120 },
      'comments': { w: 640, h: 400 },
      'recommendations': { w: 340, h: 600 },
      'playlist': { w: 340, h: 400 },
      'chat': { w: 340, h: 500 },
      'masthead': { w: 1200, h: 56 },
      'custom-text': { w: 400, h: 100 },
    };
    return sizes[type] || { w: 400, h: 300 };
  }

  function getDefaultOptions(type) {
    const opts = {
      'recommendations': { columns: 1, thumbnailWidth: 168, maxItems: 10, offset: 0, showTitle: true, showMeta: true },
      'comments': { count: 5 },
      'video-player': { useRealPlayer: false },
      'custom-text': { text: 'Text hier eingeben...', fontSize: 16, color: '#0f0f0f' },
    };
    const o = JSON.parse(JSON.stringify(opts[type] || {}));
    if (type === 'video-player') {
      const hasReal = placedItems.some(i => i.type === 'video-player' && i.options.useRealPlayer);
      o.useRealPlayer = !hasReal;
    }
    return o;
  }

  // === Rendering ===
  function renderItem(item) {
    // Wrapper erstellen
    const wrapper = document.createElement('div');
    wrapper.className = 'pt-canvas-item';
    wrapper.dataset.itemId = item.id;
    wrapper.style.cssText = `
      position: absolute; left: ${item.x}px; top: ${item.y}px;
      width: ${item.w}px;
    `;

    // Header
    const header = document.createElement('div');
    header.className = 'pt-item-header';
    const typeLabels = {
      'video-player': '🎬 Video',
      'video-metadata': '📝 Titel',
      'channel-info': '👤 Kanal',
      'description': '📄 Beschreibung',
      'comments': '💬 Kommentare',
      'recommendations': '📸 Empfehlungen',
      'playlist': '📋 Playlist',
      'chat': '💭 Chat',
      'masthead': '🔍 Logo & Suche',
      'custom-text': '✏️ Textblock',
    };
    header.innerHTML = `
      <span>${typeLabels[item.type] || item.type}</span>
      <button class="pt-item-close" title="Entfernen">✕</button>
    `;

    header.querySelector('.pt-item-close').addEventListener('click', (e) => {
      e.stopPropagation();
      removeItem(item);
    });

    // Mockup Content
    const content = document.createElement('div');
    content.className = 'pt-item-content';
    content.appendChild(renderMockup(item));

    // Resize Handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'pt-resize-handle';

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    wrapper.appendChild(resizeHandle);
    canvas.appendChild(wrapper);

    // Drag to move
    setupItemDrag(wrapper, item, header);
    // Resize
    setupItemResize(wrapper, item, resizeHandle);
    // Select on click
    wrapper.addEventListener('mousedown', (e) => {
      if (!e.target.closest('.pt-item-close')) {
        selectItem(item);
      }
    });
  }

  function renderMockup(item) {
    switch (item.type) {
      case 'video-player':
        return renderer.renderVideoPlayer(item.data, item.w, item.h);
      case 'video-metadata':
        return renderer.renderMetadata(item.data);
      case 'channel-info':
        return renderer.renderChannelInfo(item.data);
      case 'description':
        return renderer.renderDescription(item.data);
      case 'comments':
        return renderer.renderComments(item.data, item.options);
      case 'recommendations':
        return renderer.renderRecommendations(item.data, item.options);
      case 'playlist':
        return renderer.renderPlaylist(item.data);
      case 'masthead':
        return renderer.renderMasthead(item.data);
      case 'custom-text': {
        const textBlock = document.createElement('div');
        textBlock.className = 'pt-mockup pt-mockup-custom-text';
        textBlock.contentEditable = 'true';
        textBlock.textContent = item.options.text || 'Text hier eingeben...';
        textBlock.style.cssText = `
          padding: 12px; font-family: system-ui, sans-serif;
          font-size: ${item.options.fontSize || 16}px;
          color: ${item.options.color || '#0f0f0f'};
          line-height: 1.5; min-height: 40px; outline: none;
          border: 1px dashed #ccc; border-radius: 8px;
        `;
        textBlock.addEventListener('input', () => {
          item.options.text = textBlock.textContent;
        });
        return textBlock;
      }
      default: {
        const placeholder = document.createElement('div');
        placeholder.textContent = item.type;
        placeholder.style.cssText = 'padding:20px;text-align:center;color:#999;';
        return placeholder;
      }
    }
  }

  function refreshAllItems() {
    for (const item of placedItems) {
      const wrapper = canvas.querySelector(`[data-item-id="${item.id}"]`);
      if (!wrapper) continue;
      const content = wrapper.querySelector('.pt-item-content');
      content.innerHTML = '';
      content.appendChild(renderMockup(item));
    }
  }

  function renderCanvas() {
    // Alle Items entfernen
    canvas.querySelectorAll('.pt-canvas-item').forEach(el => el.remove());
    // Neu rendern
    for (const item of placedItems) {
      renderItem(item);
    }
  }

  // === Drag (Move) ===
  function setupItemDrag(wrapper, item, handle) {
    let startX, startY, startItemX, startItemY;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('.pt-item-close')) return;
      e.preventDefault();
      startX = e.clientX;
      startY = e.clientY;
      startItemX = item.x;
      startItemY = item.y;
      wrapper.classList.add('pt-moving');

      const onMove = (e) => {
        item.x = Math.max(0, startItemX + (e.clientX - startX));
        item.y = Math.max(0, startItemY + (e.clientY - startY));
        wrapper.style.left = item.x + 'px';
        wrapper.style.top = item.y + 'px';
      };

      const onUp = () => {
        wrapper.classList.remove('pt-moving');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        updateConfigValues(item);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // === Resize ===
  function setupItemResize(wrapper, item, handle) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = item.w;
      const startH = item.h;

      const onMove = (e) => {
        item.w = Math.max(200, startW + (e.clientX - startX));
        item.h = Math.max(100, startH + (e.clientY - startY));
        wrapper.style.width = item.w + 'px';
        const mockupEl = wrapper.querySelector('.pt-mockup-video-player');
        if (mockupEl) {
          mockupEl.style.width = item.w + 'px';
          mockupEl.style.height = item.h + 'px';
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        updateConfigValues(item);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // === Config Panel ===
  function showConfigPanel(item) {
    const panel = document.getElementById('ptConfigPanel');
    const content = document.getElementById('ptConfigContent');
    panel.style.display = 'block';

    let html = `
      <div class="pt-config-row">
        <label>X</label>
        <input type="number" id="ptCfgX" value="${Math.round(item.x)}" min="0" step="1">
      </div>
      <div class="pt-config-row">
        <label>Y</label>
        <input type="number" id="ptCfgY" value="${Math.round(item.y)}" min="0" step="1">
      </div>
      <div class="pt-config-row">
        <label>Breite</label>
        <input type="number" id="ptCfgW" value="${Math.round(item.w)}" min="100" step="10">
      </div>
      <div class="pt-config-row">
        <label>Höhe</label>
        <input type="number" id="ptCfgH" value="${Math.round(item.h)}" min="50" step="10">
      </div>
    `;

    // Typ-spezifische Optionen
    if (item.type === 'recommendations') {
      html += `
        <div class="pt-config-row">
          <label>Spalten</label>
          <input type="range" id="ptCfgCols" min="1" max="6" value="${item.options.columns || 1}">
          <span id="ptCfgColsVal">${item.options.columns || 1}</span>
        </div>
        <div class="pt-config-row">
          <label>Max. Anzahl</label>
          <input type="range" id="ptCfgMaxItems" min="1" max="30" value="${item.options.maxItems || 10}">
          <span id="ptCfgMaxItemsVal">${item.options.maxItems || 10}</span>
        </div>
        <div class="pt-config-row">
          <label>Offset</label>
          <input type="range" id="ptCfgOffset" min="0" max="20" value="${item.options.offset || 0}">
          <span id="ptCfgOffsetVal">${item.options.offset || 0}</span>
        </div>
        <div class="pt-config-row">
          <label>Titel</label>
          <input type="checkbox" id="ptCfgShowTitle" ${item.options.showTitle !== false ? 'checked' : ''}>
        </div>
        <div class="pt-config-row">
          <label>Kanal/Views</label>
          <input type="checkbox" id="ptCfgShowMeta" ${item.options.showMeta !== false ? 'checked' : ''}>
        </div>
      `;
    }

    if (item.type === 'comments') {
      html += `
        <div class="pt-config-row">
          <label>Kommentare</label>
          <input type="range" id="ptCfgCount" min="1" max="20" value="${item.options.count || 5}">
          <span id="ptCfgCountVal">${item.options.count || 5}</span>
        </div>
      `;
    }

    if (item.type === 'video-player') {
      html += `
        <div class="pt-config-row">
          <label>Echter Player</label>
          <input type="checkbox" id="ptCfgRealPlayer" ${item.options.useRealPlayer ? 'checked' : ''}>
        </div>
      `;
    }

    if (item.type === 'custom-text') {
      html += `
        <div class="pt-config-row">
          <label>Schriftgröße</label>
          <input type="range" id="ptCfgFontSize" min="10" max="48" value="${item.options.fontSize || 16}">
          <span id="ptCfgFontSizeVal">${item.options.fontSize || 16}px</span>
        </div>
        <div class="pt-config-row">
          <label>Farbe</label>
          <input type="color" id="ptCfgTextColor" value="${item.options.color || '#0f0f0f'}">
        </div>
      `;
    }

    html += `
      <button class="pt-btn pt-btn-delete" id="ptCfgDelete" style="margin-top:8px;">Element entfernen</button>
    `;

    content.innerHTML = html;

    // Position/Size Inputs
    const bindInput = (id, prop, updateFn) => {
      const input = document.getElementById(id);
      if (!input) return;
      input.addEventListener('input', () => {
        const val = parseInt(input.value);
        if (isNaN(val)) return;
        item[prop] = val;
        updateFn();
      });
    };

    bindInput('ptCfgX', 'x', () => {
      canvas.querySelector(`[data-item-id="${item.id}"]`).style.left = item.x + 'px';
    });
    bindInput('ptCfgY', 'y', () => {
      canvas.querySelector(`[data-item-id="${item.id}"]`).style.top = item.y + 'px';
    });
    bindInput('ptCfgW', 'w', () => {
      const wrapper = canvas.querySelector(`[data-item-id="${item.id}"]`);
      wrapper.style.width = item.w + 'px';
      refreshItem(item);
    });
    bindInput('ptCfgH', 'h', () => {
      refreshItem(item);
    });

    // Recommendations options
    const colsSlider = document.getElementById('ptCfgCols');
    if (colsSlider) {
      colsSlider.addEventListener('input', () => {
        item.options.columns = parseInt(colsSlider.value);
        document.getElementById('ptCfgColsVal').textContent = colsSlider.value;
        refreshItem(item);
      });
    }

    const maxItemsSlider = document.getElementById('ptCfgMaxItems');
    if (maxItemsSlider) {
      maxItemsSlider.addEventListener('input', () => {
        item.options.maxItems = parseInt(maxItemsSlider.value);
        document.getElementById('ptCfgMaxItemsVal').textContent = maxItemsSlider.value;
        refreshItem(item);
      });
    }

    // Recommendations offset
    const offsetSlider = document.getElementById('ptCfgOffset');
    if (offsetSlider) {
      offsetSlider.addEventListener('input', () => {
        item.options.offset = parseInt(offsetSlider.value);
        document.getElementById('ptCfgOffsetVal').textContent = offsetSlider.value;
        refreshItem(item);
      });
    }

    const showTitleCb = document.getElementById('ptCfgShowTitle');
    if (showTitleCb) {
      showTitleCb.addEventListener('change', () => {
        item.options.showTitle = showTitleCb.checked;
        refreshItem(item);
      });
    }

    const showMetaCb = document.getElementById('ptCfgShowMeta');
    if (showMetaCb) {
      showMetaCb.addEventListener('change', () => {
        item.options.showMeta = showMetaCb.checked;
        refreshItem(item);
      });
    }

    // Comments count
    const countSlider = document.getElementById('ptCfgCount');
    if (countSlider) {
      countSlider.addEventListener('input', () => {
        item.options.count = parseInt(countSlider.value);
        document.getElementById('ptCfgCountVal').textContent = countSlider.value;
        refreshItem(item);
      });
    }

    // Video player real player toggle
    const realPlayerCb = document.getElementById('ptCfgRealPlayer');
    if (realPlayerCb) {
      realPlayerCb.addEventListener('change', () => {
        if (realPlayerCb.checked) {
          placedItems.filter(i => i.type === 'video-player' && i !== item).forEach(i => {
            i.options.useRealPlayer = false;
          });
        }
        item.options.useRealPlayer = realPlayerCb.checked;
      });
    }

    // Custom text font size
    const fontSizeSlider = document.getElementById('ptCfgFontSize');
    if (fontSizeSlider) {
      fontSizeSlider.addEventListener('input', () => {
        item.options.fontSize = parseInt(fontSizeSlider.value);
        document.getElementById('ptCfgFontSizeVal').textContent = fontSizeSlider.value + 'px';
        refreshItem(item);
      });
    }

    // Custom text color
    const textColorInput = document.getElementById('ptCfgTextColor');
    if (textColorInput) {
      textColorInput.addEventListener('input', () => {
        item.options.color = textColorInput.value;
        refreshItem(item);
      });
    }

    // Delete
    document.getElementById('ptCfgDelete').addEventListener('click', () => {
      removeItem(item);
    });
  }

  function hideConfigPanel() {
    document.getElementById('ptConfigPanel').style.display = 'none';
  }

  function updateConfigValues(item) {
    const xInput = document.getElementById('ptCfgX');
    const yInput = document.getElementById('ptCfgY');
    const wInput = document.getElementById('ptCfgW');
    const hInput = document.getElementById('ptCfgH');
    if (xInput && selectedItem === item) {
      xInput.value = Math.round(item.x);
      yInput.value = Math.round(item.y);
      wInput.value = Math.round(item.w);
      hInput.value = Math.round(item.h);
    }
  }

  function refreshItem(item) {
    const wrapper = canvas.querySelector(`[data-item-id="${item.id}"]`);
    if (!wrapper) return;
    const content = wrapper.querySelector('.pt-item-content');
    content.innerHTML = '';
    content.appendChild(renderMockup(item));
  }

  function updatePaletteStatus() {
    palette.querySelectorAll('[data-status-for]').forEach(el => {
      const count = placedItems.filter(i => i.type === el.dataset.statusFor).length;
      el.textContent = count === 0 ? '' : count === 1 ? '✓' : `×${count}`;
    });
  }

  // === Save / Load ===
  async function saveLayout() {
    const domain = new URL(scanResult.url).hostname;
    const layout = {
      canvasWidth,
      bgColor: canvasBg,
      savedAt: new Date().toISOString(),
      items: placedItems.map(item => ({
        type: item.type,
        x: Math.round(item.x),
        y: Math.round(item.y),
        w: Math.round(item.w),
        h: Math.round(item.h),
        options: { ...item.options },
      }))
    };

    const storageKey = 'pt_layouts_v3';
    const stored = await chrome.storage.local.get(storageKey);
    const layouts = stored[storageKey] || {};
    layouts[domain] = layout;
    await chrome.storage.local.set({ [storageKey]: layouts });

    // Feedback
    const btn = document.getElementById('ptBtnSave');
    btn.textContent = 'Gespeichert!';
    btn.style.background = '#22c55e';
    setTimeout(() => {
      btn.textContent = 'Speichern';
      btn.style.background = '';
    }, 2000);
  }

  function exitBuilder() {
    window.__ptBuilderActive = false;
    if (originalPlayer) originalPlayer.style.cssText = '';
    const root = document.querySelector('.pt-builder-root');
    if (root) root.remove();
    const style = document.getElementById('pt-builder-style');
    if (style) style.remove();
    document.body.classList.remove('pt-builder-body');
    document.querySelectorAll('[data-pt-original]').forEach(el => {
      el.style.cssText = '';
      delete el.dataset.ptOriginal;
    });
  }

  // === CSS ===
  function getBuilderCSS() {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }

      .pt-builder-body {
        font-family: system-ui, -apple-system, sans-serif;
        background: #1a1a2e;
        color: #e0e0e0;
        overflow: hidden;
        height: 100vh;
        width: 100vw;
      }

      .pt-builder-root {
        display: flex;
        height: 100vh;
        width: 100vw;
        position: fixed;
        top: 0;
        left: 0;
        z-index: 999999;
      }

      /* === Canvas Area === */
      .pt-canvas-area {
        flex: 1;
        overflow: auto;
        padding: 40px;
        display: flex;
        justify-content: center;
        background: #12122a;
        background-image:
          radial-gradient(circle at 1px 1px, rgba(255,255,255,0.03) 1px, transparent 0);
        background-size: 24px 24px;
      }

      .pt-canvas {
        position: relative;
        min-height: 800px;
        background: #ffffff;
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
        flex-shrink: 0;
      }

      .pt-drop-indicator {
        position: absolute;
        width: 200px;
        height: 100px;
        border: 2px dashed #667eea;
        border-radius: 8px;
        background: rgba(102, 126, 234, 0.1);
        pointer-events: none;
        transform: translate(-50%, -50%);
        z-index: 9999;
      }

      /* === Canvas Items === */
      .pt-canvas-item {
        position: absolute;
        border: 2px solid transparent;
        border-radius: 8px;
        transition: border-color 0.15s;
        cursor: default;
      }

      .pt-canvas-item:hover {
        border-color: rgba(102, 126, 234, 0.4);
      }

      .pt-canvas-item.pt-selected {
        border-color: #667eea;
        box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
      }

      .pt-canvas-item.pt-moving {
        opacity: 0.85;
        z-index: 1000;
      }

      .pt-item-header {
        display: none;
        align-items: center;
        justify-content: space-between;
        padding: 4px 8px;
        background: rgba(102, 126, 234, 0.9);
        color: #fff;
        font-size: 11px;
        font-weight: 600;
        border-radius: 6px 6px 0 0;
        cursor: move;
        user-select: none;
      }

      .pt-canvas-item:hover .pt-item-header,
      .pt-canvas-item.pt-selected .pt-item-header {
        display: flex;
      }

      .pt-item-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 14px;
        cursor: pointer;
        padding: 0 4px;
        opacity: 0.7;
      }
      .pt-item-close:hover { opacity: 1; }

      .pt-item-content {
        overflow: hidden;
        border-radius: 0 0 6px 6px;
      }

      .pt-resize-handle {
        display: none;
        position: absolute;
        bottom: -4px;
        right: -4px;
        width: 14px;
        height: 14px;
        background: #667eea;
        border-radius: 2px;
        cursor: nwse-resize;
        z-index: 10;
      }

      .pt-canvas-item:hover .pt-resize-handle,
      .pt-canvas-item.pt-selected .pt-resize-handle {
        display: block;
      }

      /* === Palette === */
      .pt-palette {
        width: 300px;
        background: #16213e;
        border-left: 1px solid #2a2a5a;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }

      .pt-palette-header {
        padding: 16px;
        border-bottom: 1px solid #2a2a5a;
      }

      .pt-palette-title {
        font-size: 18px;
        font-weight: 700;
        color: #fff;
      }

      .pt-palette-subtitle {
        font-size: 12px;
        color: #888;
        margin-top: 2px;
      }

      .pt-palette-section {
        padding: 12px 16px;
        border-bottom: 1px solid #2a2a5a;
      }

      .pt-palette-section-title {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #888;
        margin-bottom: 8px;
      }

      .pt-palette-item {
        padding: 10px;
        border-radius: 8px;
        margin-bottom: 4px;
        cursor: grab;
        transition: background 0.15s;
        user-select: none;
      }

      .pt-palette-item:hover { background: rgba(102, 126, 234, 0.15); }
      .pt-palette-item.pt-dragging { opacity: 0.5; }

      .pt-palette-item-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .pt-palette-icon { font-size: 16px; }
      .pt-palette-label { font-size: 13px; font-weight: 500; flex: 1; }
      .pt-palette-status { font-size: 12px; color: #4ade80; }

      /* === Config === */
      .pt-config-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 12px;
      }

      .pt-config-row label {
        width: 70px;
        flex-shrink: 0;
        color: #aaa;
      }

      .pt-config-row input[type="number"],
      .pt-config-row select {
        flex: 1;
        background: #1a1a3e;
        border: 1px solid #3a3a6a;
        color: #e0e0e0;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
      }

      .pt-config-row input[type="range"] {
        flex: 1;
        accent-color: #667eea;
      }

      .pt-config-row input[type="checkbox"] {
        accent-color: #667eea;
        width: 18px;
        height: 18px;
        cursor: pointer;
      }

      .pt-config-row input[type="color"] {
        width: 40px;
        height: 28px;
        border: 1px solid #3a3a6a;
        border-radius: 4px;
        background: #1a1a3e;
        cursor: pointer;
        padding: 2px;
      }

      .pt-config-row span {
        width: 24px;
        text-align: center;
        color: #ccc;
        font-weight: 600;
      }

      /* === Buttons === */
      .pt-palette-actions {
        padding: 16px;
        margin-top: auto;
      }

      .pt-palette-actions-row {
        display: flex;
        gap: 8px;
        margin-top: 8px;
      }

      .pt-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        width: 100%;
      }

      .pt-btn-save {
        background: linear-gradient(135deg, #667eea, #764ba2);
        color: #fff;
      }
      .pt-btn-save:hover { opacity: 0.9; }

      .pt-btn-clear {
        background: #2a2a4a;
        color: #ccc;
      }
      .pt-btn-clear:hover { background: #3a3a5a; }

      .pt-btn-exit {
        background: #4a1a1a;
        color: #f88;
      }
      .pt-btn-exit:hover { background: #5a2a2a; }

      .pt-btn-delete {
        background: #4a1a1a;
        color: #f88;
      }
      .pt-btn-delete:hover { background: #5a2a2a; }

      .pt-config-panel {
        background: rgba(0,0,0,0.1);
      }
    `;
  }
})();
