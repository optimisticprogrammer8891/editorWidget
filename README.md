# EditorWidget POC

A plug-and-play CodeMirror 5.51.0 widget that embeds a rich code editor, live console, debug helpers, and a resource palette inspired by legacy Expression Builder tooling. Drop the files in `dist/` onto any static server, include the CodeMirror CDN assets, and mount with a single global call.

## What’s Included

```
dist/
├── editor-widget.css          # Widget layout + console + resource rail styles
├── editor-widget.js           # UMD/IIFE bundle exposing window.EditorWidget
├── editor-widget.min.js       # Minified production build
├── index.html                 # Interactive demo + integration snippets
└── assets/                    # (reserved for vendored assets if required)
```

## Quick Start

1. Serve the `dist/` directory (or open `dist/index.html` via a simple static server).
2. Ensure CodeMirror 5.51.0 assets (see CDN list below) are reachable.
3. Open the page to explore the editor, console, resource snippets, lint toggle, and debug utilities.

### CDN References

Add the following tags to your host page (matching versions and integrity hashes):

```html
<!-- CodeMirror core + themes -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/codemirror.min.css" integrity="sha512-NiCbDi+p5VjnmWF8MVCXPKfQ2lbQnQ46x26TZR4eEbsJQToAZ6B9L4uGlEkM0OOSws0vanfSN6uOTxvfGy1rvA==" crossorigin="anonymous">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/theme/monokai.min.css" integrity="sha512-AFnefmepiD08LRzsO9/BDvHo6eFPAoHtuDbEpiTZhFHyLMwS8fwlBldZH1vsMPksPboUB14EzrbM83VUlTrt1A==" crossorigin="anonymous">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/lint/lint.css" integrity="sha512-z7aE7XmtPYClDx4hXdOWbhX8TDgnaras0MY7lFsqJjOCrau7mEU2hG4wOFNqrqjMld3bFpxcSV9V06E33T2M0Q==" crossorigin="anonymous">

<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/codemirror.min.js" integrity="sha512-SB4aoSBL6e1R9NqHzF8Bzo0fqxio/cQbVhPFiZljR8PjeO84WrpVysob7UjjeNpQgGX2rihxKO9TJQwWus4oXg==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/mode/javascript/javascript.min.js" integrity="sha512-E5zs5xsoqtm9PAtYORep6kTllcKITSiX9RtBukFXtYUbVlVaacNCNd4doe8XuqYl3mGunztorlRp0PMDAv1t4A==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/mode/htmlmixed/htmlmixed.min.js" integrity="sha512-LLYwDMFsIUifa0Z6zG6jVP6aqYmJSLn3xXIJz/0j9cbh5+i1vbPhzbh7Wrwd0fJkWIcV5Cj5nEQFS4TNSbVa0g==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/mode/css/css.min.js" integrity="sha512-M4tXmXAqsooswTXv2CIFSztpB9NYs9IZQo272S6xW6Cth0LuleBaSZqAtmiW/XsY0xj1ABL9RvXBn1MsRuoyKQ==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/mode/xml/xml.min.js" integrity="sha512-Ypx4OyiAbaOP4rbLoNPIy8/u83SH1t2kX7CdVwjBS5skSk5qxtIZF3u6iUcikX4SKvXdNL6so7Up9Qtx23pUxQ==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/edit/matchbrackets.min.js" integrity="sha512-Ps2+I2hn5XzAIa3UEavPN6Tx01kmN8i0RtzKE1rFprTu87eNfd2bVloSEI6bo246wHS+2U+JxC9NDEkGoVzJew==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/edit/closebrackets.min.js" integrity="sha512-DAIJy4jG4mmAg8yxjTDS/PilB7xOnDEolPBpY/m+bw8VFLjkGnYW03zha6t2aUPl+rh9VhZ3iEsM6v+hM5uPzg==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/selection/active-line.min.js" integrity="sha512-PqKfkOO1MJCkdBSIUWjSXz7KDT8NrWud5SJxNMRCGNpWaVpCXSIZORwxp2toYILw7TrQLCGNqPhMjKHxWdWbhA==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/fold/foldcode.min.js" integrity="sha512-TSbc/6Xtpk2HyBuJ2kxtXfW06yA6ph//h6kOC1/LltwWg1QaHBlGhkBZ6wCx703NPasb/On9Dy3npG3iNCg5qQ==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/fold/foldgutter.min.js" integrity="sha512-e/FJ6ztrIGyYip79ZoKJPabvIDYhkkutjuXTqZKfP+lUXLkRQ6YwjBO7NVYj14Et0+5q1nMwAns11vtAFaF2rQ==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/fold/brace-fold.min.js" integrity="sha512-mOPldogQkV/OI/Qcey+GPSQKTxgxyGQg26CWaNhmZ+uVIxxUxr6Bqf/8vmdj2gK6niCx3gae3BLGVM7OIvr0tA==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/search/searchcursor.min.js" integrity="sha512-Lj6yo60QpV8ZmndNkP83O9vCBe0WX4tiwCRFhpChYArFvaeqO5YnGAI6hiJOdfpbceGppQPreB3HtcSraYxbNg==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/search/search.min.js" integrity="sha512-I6dSpp39TYNMS3G/bt6EAPZbL6wibtRdk2yddcns3P2jXCf+F2hCqUcH6OZNHeIE2OkdajJcDjuiFqEJcvGrIA==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/comment/comment.min.js" integrity="sha512-S3PmHGN9bNtzgjJuQWAuaK4dQ/cKzbz0L4GjHeOP3SgAHxODPGNM/hfskpAGGe/ZcmxczEyA+DvIEgzqb++b4Q==" crossorigin="anonymous"></script>

<!-- Optional linting support -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jshint/2.13.6/jshint.min.js" integrity="sha512-MCUpdWtSMK1rm+4sWFpfFuz4UTpXEud5p236Otyw1Ea4kdVyNxy+eMHR76u7xfY5DlpDmOzgEhgDq1ZGLHqkCA==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/lint/lint.js" integrity="sha512-IfloIhlBiwZLt94/SKa/kWZM7SsJE8itmvL1Z2zBOXLgqi9SJUf2N/xnkmi7qrt6ilmvW4vQSLu8EbH/lwYseQ==" crossorigin="anonymous"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.51.0/addon/lint/javascript-lint.js" integrity="sha512-PYRRP6WtVY3B9bwaM1529Ftv83hS0PvWBjUt3Ppnd21yw9RzeMxGvdBbLfBNZOWibG7J5dtPKpQARR7badqA5Q==" crossorigin="anonymous"></script>
```

## Embedding the Widget

```html
<link rel="stylesheet" href="./dist/editor-widget.css">
<script src="./dist/editor-widget.js"></script>

<div id="my-editor" style="height:500px;"></div>
<script>
  var widget = window.EditorWidget.mount(document.getElementById('my-editor'), {
    value: 'console.log("Hello, world!")',
    mode: 'javascript',
    showConsole: true,
    captureGlobalConsole: true,
    enableLint: true,
    resources: [{ label: 'Constants', items: [{ label: 'true', snippet: 'true' }] }]
  });
</script>
```

Call `window.EditorWidget.unmount(widget)` (or `widget.dispose()`) when the host view is destroyed.

## Public API Summary

```js
widget.getValue();
widget.setValue(code);
widget.setMode('javascript');
widget.setTheme('monokai');
widget.setReadOnly(true);
widget.setCaptureGlobalConsole(false);
widget.getOption('theme');
widget.focus();
widget.format();
widget.dispose();

widget.console.filter({ warn: false });
widget.console.setVisible(false);
widget.console.setCapture(true);
widget.console.pause(true);

widget.debug.mark('phase-a');
widget.debug.measure('phase-a', 'phase-b');
widget.debug.count('saves');
widget.debug.resetCounts();
widget.debug.disable();

widget.lint.enable();
widget.lint.disable();
widget.lint.toggle();
```

## Marionette / Backbone Integration

```js
var EditorView = Marionette.ItemView.extend({
  template: _.template('<div class="editor-region" style="height:500px;"></div>'),
  onShow: function () {
    this._editor = window.EditorWidget.mount(this.$('.editor-region')[0], {
      value: '// Hello from Marionette',
      mode: 'javascript',
      showConsole: true,
      captureGlobalConsole: true,
      enableLint: true
    });
  },
  onBeforeDestroy: function () {
    if (this._editor) { this._editor.dispose(); }
  }
});
```

```js
var BackboneEditorView = Backbone.View.extend({
  className: 'editor-region',
  initialize: function () {
    this.$el.css('height', '500px');
  },
  render: function () {
    this._editor = window.EditorWidget.mount(this.el, {
      value: '<!-- Hello from Backbone -->',
      mode: 'htmlmixed',
      showConsole: true,
      enableLint: true
    });
    return this;
  },
  remove: function () {
    if (this._editor) { this._editor.dispose(); }
    Backbone.View.prototype.remove.call(this);
  }
});
```

## AI Prompt Panel

Set `enableAI: true` to surface an AI workspace in the editor toolbar. The panel lets authors describe the JavaScript they need and stream the generated code into CodeMirror without leaving the page.

```js
window.EditorWidget.mount(targetEl, {
  enableAI: true,
  defaultAIProvider: 'openai',
  aiRememberCredentials: false, // pre-check the "Remember API key" toggle when true
  aiProviders: {
    openai:   { model: 'gpt-4.1-mini' },
    anthropic: {
      baseUrl: 'https://api.anthropic.com/v1',
      endpoint: '/messages',
      model: 'claude-3-5-sonnet-20241022'
    },
    grok:     { model: 'grok-beta' }
  }
});
```

- Each provider definition can override `baseUrl`, `endpoint`, `model`, `maxTokens`, `temperature`, and `systemPrompt`. Defaults ship for OpenAI, Anthropic Claude, and xAI Grok.
- Press `Ctrl/Cmd + Shift + G` (or use the new toolbar button) to toggle the panel. Generated code can replace the editor contents or be inserted at the current cursor.
- API keys stay in memory unless the user ticks “Remember API key”, in which case they are persisted alongside other `persistKey` state.
- Requests are issued with `fetch` directly from the browser; enable CORS or proxy through your backend when necessary.

## Debug & Profiling Helpers

- `debug.mark(label)` and `debug.measure(start, end)` capture and report elapsed time.
- `debug.count(label)` increments named counters displayed in the blue badge.
- `debug.enable()/disable()` toggle overlays, error capture, and counters.

Breakpoint workflows still rely on your browser’s DevTools (`debugger;` statements or UI breakpoints).

## Persistence

When `persist: true` the widget stores the following in `localStorage` (per `persistKey`):
- Split ratio (editor vs console)
- Console visibility
- Theme
- AI provider configuration (API keys only when “Remember API key” is enabled)
- Editor contents (when `persistEditorValue !== false`)

## Optional Linting

Enable linting by including the lint CSS/JS and JSHINT (see CDN list) and setting `enableLint: true`. The toolbar button toggles lint markers on and off, and `widget.lint.*` offers programmatic control.

## Keyboard Shortcuts

- `Ctrl/Cmd + /` — toggle line comment (requires comment addon)
- `Ctrl/Cmd + F` / `Shift + F` — find next/previous
- `Ctrl/Cmd + B` — toggle console visibility
- `Ctrl/Cmd + Enter` — run code in sandbox (results/Errors appear in console panel)
- `Ctrl/Cmd + Shift + G` — open or close the AI prompt panel

## Licensing

- **CodeMirror 5.51.0** — MIT License (see <https://codemirror.net/>).
- **JSHINT** — MIT License (if linting enabled, see <https://github.com/jshint/jshint/blob/main/LICENSE>).
- Copyright (c) 2025 Aditya Joshi

## Known Limitations

- Sandbox execution uses `new Function`; run only trusted code.
- CDN availability required unless assets are vendored locally.
- No build step; ship the `dist/` artifacts as-is.
- Linting defaults to JSHINT (ES5/ES6). Swap `lintOptions` to match your rule-set.
- AI integrations call provider APIs from the browser; configure CORS or a secure proxy before using production credentials.

## Next Steps

- Vendor assets if the client needs offline hosting.
- Expand resource palette with client-specific snippets via the `resources` option.
- Integrate with existing Marionette/Backbone view lifecycle for mount/unmount and persistence.
- Pre-populate `aiProviders` with approved models, proxy URLs, or guardrails before rolling out AI-assisted code generation.
