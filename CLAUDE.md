# PageTweaker v3 — CLAUDE.md

## Vision
Eine Chrome Extension, die jede Webseite in einen visuellen Page Builder verwandelt.
Der User sieht eine **weiße Leinwand** (links) und eine **Palette** aller erkannten Seitenelemente (rechts).
Elemente werden per **Drag & Drop** auf die Leinwand gezogen und **frei positioniert** (wie Figma/PowerPoint).

**Entscheidend:** Die Elemente auf der Leinwand sind **realistische Mockups** — keine leeren weißen Boxen.
- Ein Video zeigt sein Thumbnail-Bild mit Play-Button-Overlay
- Thumbnails zeigen echte Vorschaubilder mit Titel und Kanal-Name
- Kommentare zeigen Avatar-Platzhalter und Textzeilen
- Die Seite ist **rein visuell** — nichts ist funktional (Video spielt nicht, Links gehen nicht)

**Proof of Concept: YouTube Watch-Page** (`youtube.com/watch?v=...`)

---

## Architektur

```
page-tweaker/
├── manifest.json          # Manifest V3
├── icons/                 # Extension icons (16, 48, 128)
├── src/
│   ├── restorer.js        # Content Script (document_end): Lädt gespeichertes Layout
│   ├── scanner.js         # Injected: Scannt YouTube DOM, extrahiert Daten
│   ├── mockup-renderer.js # Erzeugt realistische HTML-Mockups aus Scanner-Daten
│   ├── builder.js         # Hauptlogik: Canvas + Palette + Drag & Drop + Resize
│   ├── popup.html         # Extension Popup
│   └── popup.js           # Popup-Logik
```

## Entwicklungs-Reihenfolge

1. **Scanner** — YouTube Watch-Page scannen, Daten extrahieren
2. **Mockup Renderer** — Jedes Element als standalone Mockup rendern
3. **Builder UI** — Canvas + Palette, Drag & Drop, Resize
4. **Speicherung** — chrome.storage.local, Layout laden/speichern
5. **Restorer** — Gespeichertes Layout bei Seitenbesuch anwenden
6. **Polish** — Tooltips, Animationen, Error States, Edge Cases

## Technische Hinweise

- Python: nicht relevant (reines JS-Projekt)
- Manifest V3 Chrome Extension
- Keine externen Dependencies
- YouTube Custom Elements (ytd-*) als stabile Selektoren nutzen
- Thumbnail URLs: `https://i.ytimg.com/vi/{videoId}/maxresdefault.jpg` mit Fallbacks
- Alle CSS-Klassen mit `pt-` Prefix
- Dark/Light Mode Support
