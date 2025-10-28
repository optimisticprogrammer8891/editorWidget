/*!
 * EditorWidget v1.0.0
 *
 * A plug-and-play CodeMirror 5.51.0 widget with an integrated console panel and debug utilities.
 *
 * Global API:
 *   window.EditorWidget = {
 *     mount: function(container, options) -> instance,
 *     unmount: function(instance),
 *     version: "1.0.0"
 *   }
 *
 * Instance API:
 *   instance.getValue()
 *   instance.setValue(code)
 *   instance.setMode(mode)
 *   instance.setTheme(theme)
 *   instance.setReadOnly(boolean)
 *   instance.setCaptureGlobalConsole(boolean)
 *   instance.getOption(name)
 *   instance.lint.enable()
 *   instance.lint.disable()
 *   instance.lint.toggle()
 *   instance.lint.isEnabled()
 *   instance.focus()
 *   instance.format()
 *   instance.dispose()
 *
 * Console controls:
 *   instance.console.clear()
 *   instance.console.copyToClipboard()
 *   instance.console.download(filename)
 *   instance.console.filter({ log:Boolean, info:Boolean, warn:Boolean, error:Boolean })
 *   instance.console.pause(Boolean)
 *   instance.console.setVisible(Boolean)
 *   instance.console.setCapture(Boolean)
 *
 * Debug toggles:
 *   instance.debug.enable()
 *   instance.debug.disable()
 *   instance.debug.mark(label)
 *   instance.debug.measure(labelStart, labelEnd)
 *   instance.debug.count(label)
 *   instance.debug.resetCounts()
 *   instance.debug.isEnabled()
 *
 * Mount Options (all optional):
 * {
 *   value: "\\n",
 *   mode: "javascript",
 *   readOnly: false,
 *   theme: "default",
 *   lineNumbers: true,
 *   lineWrapping: true,
 *   showConsole: true,
 *   wrapConsole: true,
 *   height: "400px",
 *   resizable: true,
 *   gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
 *   enableBasicAddons: true,
 *   enableFolding: true,
 *   enableSearch: true,
 *   captureGlobalConsole: true,
 *   debugEnabled: true,
 *   persist: false,
 *   persistKey: "default",
 *   persistEditorValue: true,
 *   showResourcePanel: true,
 *   resourcePanelWidth: '260px',
 *   resourcePanelTitle: 'Resources',
 *   resources: [{ label: 'Constants', items: [{ label: 'true', snippet: 'true' }] }],
 *   enableLint: false,
 *   lintOptions: null
 * }
 *
 * Resource configuration:
 *   resources: [{
 *     label: 'Category name',
 *     description: 'Optional helper text',
 *     items: [{ label: 'Snippet label', snippet: 'snippetToInsert();' }],
 *     groups: [{ label: 'Subgroup', items: [...] }]
 *   }]
 * Provide snippet text exactly as you would like it inserted into the editor.
 * Access the curated defaults via window.EditorWidget.defaults.resources.
 *
 * Linting (optional):
 *   Requires CodeMirror lint assets and JSHINT global.
 *   Include:
 *     <link rel="stylesheet" href=".../addon/lint/lint.css">
 *     <script src="https://cdnjs.cloudflare.com/ajax/libs/jshint/x.y.z/jshint.min.js"></script>
 *     <script src=".../addon/lint/lint.js"></script>
 *     <script src=".../addon/lint/javascript-lint.js"></script>
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(function () {
      return factory(root);
    });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(root);
  } else {
    root.EditorWidget = factory(root);
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var STORAGE_PREFIX = 'ew::';
  var MAX_CONSOLE_ENTRIES = 500;
  var DEFAULT_AI_SYSTEM_PROMPT = 'You are an assistant that writes JavaScript. Respond with runnable JavaScript code only, without explanations.';

  var DEFAULT_AI_PROVIDERS = {
    openai: {
      label: 'OpenAI',
      type: 'openai',
      enabled: true,
      baseUrl: 'https://api.openai.com/v1',
      endpoint: '/chat/completions',
      model: 'gpt-4.1-mini',
      maxTokens: 800,
      temperature: 0.2
    },
    anthropic: {
      label: 'Anthropic Claude',
      type: 'anthropic',
      enabled: true,
      baseUrl: 'https://api.anthropic.com/v1',
      endpoint: '/messages',
      model: 'claude-3-5-sonnet-20241022',
      anthropicVersion: '2023-06-01',
      maxTokens: 800,
      temperature: 0.2
    },
    grok: {
      label: 'Grok (xAI)',
      type: 'grok',
      enabled: true,
      baseUrl: 'https://api.x.ai/v1',
      endpoint: '/messages',
      model: 'grok-beta',
      maxTokens: 800,
      temperature: 0.2
    }
  };

  function humanizeId(id) {
    if (!id) {
      return 'Provider';
    }
    return String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, function (ch) {
      return ch.toUpperCase();
    });
  }

  function joinUrl(base, path) {
    if (!base) {
      return path || '';
    }
    var sanitizedBase = String(base).replace(/\/+$/, '');
    var sanitizedPath = path ? String(path) : '';
    if (!sanitizedPath) {
      return sanitizedBase;
    }
    if (sanitizedPath.charAt(0) !== '/') {
      sanitizedPath = '/' + sanitizedPath;
    }
    return sanitizedBase + sanitizedPath;
  }

  function firstEnabledProviderId(map) {
    if (!map) {
      return null;
    }
    for (var key in map) {
      if (map.hasOwnProperty(key) && map[key] && map[key].enabled !== false) {
        return key;
      }
    }
    return null;
  }

  function extractCodeSnippet(text) {
    if (!text) {
      return '';
    }
    var content = trimString(String(text));
    var fenceMatch = content.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)```/);
    if (fenceMatch && fenceMatch[1]) {
      return trimString(fenceMatch[1]);
    }
    return content;
  }

  function cloneAIProviders(map) {
    var result = {};
    if (!map) {
      return result;
    }
    for (var key in map) {
      if (map.hasOwnProperty(key)) {
        result[key] = cloneAIProvider(map[key], key);
      }
    }
    return result;
  }

  function cloneAIProvider(source, id) {
    var defaults = DEFAULT_AI_PROVIDERS[id] || (source && source.type ? DEFAULT_AI_PROVIDERS[source.type] : null) || {};
    var provider = {};
    extend(provider, defaults);
    if (source) {
      extend(provider, source);
    }
    provider.id = id;
    provider.label = provider.label || humanizeId(id);
    provider.type = provider.type || id;
    provider.enabled = provider.enabled !== false;
    provider.baseUrl = provider.baseUrl || '';
    provider.endpoint = provider.endpoint || (provider.type === 'anthropic' ? '/messages' : '/chat/completions');
    provider.model = provider.model || (defaults.model || 'gpt-4.1-mini');
    provider.maxTokens = typeof provider.maxTokens === 'number' ? provider.maxTokens : (defaults.maxTokens || 800);
    provider.temperature = typeof provider.temperature === 'number' ? provider.temperature : (defaults.temperature || 0.2);
    provider.systemPrompt = provider.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT;
    provider.instructions = provider.instructions || '';
    provider.apiKey = provider.apiKey || '';
    provider.anthropicVersion = provider.anthropicVersion || defaults.anthropicVersion || '2023-06-01';
    provider.organization = provider.organization || '';
    provider.insertMode = provider.insertMode === 'insert' ? 'insert' : 'replace';
    if (provider.extraHeaders && typeof provider.extraHeaders === 'object') {
      var headersCopy = {};
      for (var header in provider.extraHeaders) {
        if (provider.extraHeaders.hasOwnProperty(header)) {
          headersCopy[header] = provider.extraHeaders[header];
        }
      }
      provider.extraHeaders = headersCopy;
    } else {
      provider.extraHeaders = null;
    }
    return provider;
  }

  function getDefaultResources() {
    return [
      {
        label: 'Constants',
        description: 'Frequently used literal values.',
        items: [
          { label: 'true', snippet: 'true' },
          { label: 'false', snippet: 'false' },
          { label: 'null', snippet: 'null' },
          { label: 'undefined', snippet: 'undefined' }
        ]
      },
      {
        label: 'Functions',
        description: 'Reusable function templates.',
        items: [
          { label: 'function handler() {}', snippet: 'function handler(payload) {\n  // TODO\n}\n' },
          { label: 'try / catch', snippet: 'try {\n  \n} catch (error) {\n  console.error(error);\n}\n' }
        ]
      },
      {
        label: 'Operators',
        items: [
          { label: '===', snippet: ' === ' },
          { label: '!==', snippet: ' !== ' },
          { label: '&&', snippet: ' && ' },
          { label: '||', snippet: ' || ' }
        ]
      },
      {
        label: 'Parameters',
        description: 'Payload helper snippets.',
        items: [
          { label: 'payload.data', snippet: 'payload.data' },
          { label: 'payload.params', snippet: 'payload.params' },
          { label: 'payload.user', snippet: 'payload.user' }
        ]
      },
      {
        label: 'Javascript Functions',
        groups: [
          {
            label: 'Server',
            items: [
              { label: 'httpGet()', snippet: 'httpGet(url, headers);' },
              { label: 'httpPost()', snippet: 'httpPost(url, data, headers, enableCertCheck);' },
              { label: 'httpPut()', snippet: 'httpPut(url, data, headers);' },
              { label: 'httpDelete()', snippet: 'httpDelete(url, headers);' },
              { label: 'sendNotification()', snippet: 'sendNotification(channel, message);' },
              { label: 'sendTransaction()', snippet: 'sendTransaction(name, payload);' },
              { label: 'getJSONString()', snippet: 'JSON.stringify(object, null, 2);' }
            ]
          }
        ]
      }
    ];
  }

  var BASE_RESOURCES = getDefaultResources();

  var defaultOptions = {
    value: '',
    mode: 'javascript',
    readOnly: false,
    theme: 'default',
    lineNumbers: true,
    lineWrapping: true,
    showConsole: true,
    wrapConsole: true,
    height: '400px',
    resizable: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    enableBasicAddons: true,
    enableFolding: true,
    enableSearch: true,
    captureGlobalConsole: true,
    debugEnabled: true,
    persist: false,
    persistKey: 'default',
    persistEditorValue: true,
    showResourcePanel: true,
    resourcePanelWidth: '260px',
    resourcePanelTitle: 'Resources',
    resources: BASE_RESOURCES,
    enableLint: false,
    lintOptions: null,
    enableAI: false,
    aiProviders: cloneAIProviders(DEFAULT_AI_PROVIDERS),
    defaultAIProvider: 'openai',
    aiInsertMode: 'replace',
    aiRememberCredentials: false
  };

  var instanceIdCounter = 0;
  var instancesById = {};

  function extend(target, source) {
    var prop;
    for (prop in source) {
      if (source.hasOwnProperty(prop)) {
        target[prop] = source[prop];
      }
    }
    return target;
  }

  function mergeOptions(options) {
    var merged = {};
    extend(merged, defaultOptions);
    merged.resources = cloneResourceDefinitions(defaultOptions.resources);
    merged.aiProviders = cloneAIProviders(defaultOptions.aiProviders);
    if (options) {
      var userResources = options.resources;
      var userAIProviders = options.aiProviders;
      extend(merged, options);
      if (userResources) {
        merged.resources = cloneResourceDefinitions(userResources);
      }
      if (userAIProviders) {
        for (var providerName in userAIProviders) {
          if (userAIProviders.hasOwnProperty(providerName)) {
            merged.aiProviders[providerName] = cloneAIProvider(userAIProviders[providerName], providerName);
          }
        }
      }
    }
    if (!merged.resources || !merged.resources.length) {
      merged.resources = cloneResourceDefinitions(BASE_RESOURCES);
    }
    if (!merged.defaultAIProvider || !merged.aiProviders[merged.defaultAIProvider]) {
      merged.defaultAIProvider = firstEnabledProviderId(merged.aiProviders) || 'openai';
    }
    merged.aiInsertMode = merged.aiInsertMode === 'insert' ? 'insert' : 'replace';
    merged.aiRememberCredentials = !!merged.aiRememberCredentials;
    return merged;
  }

  function cloneResourceDefinitions(list) {
    if (!list || !list.length) {
      return [];
    }
    var copy = [];
    for (var i = 0; i < list.length; i++) {
      var source = list[i] || {};
      var category = {
        label: source.label || ('Category ' + (i + 1)),
        description: source.description || '',
        items: [],
        groups: []
      };
      if (source.items && source.items.length) {
        category.items = cloneResourceItems(source.items);
      }
      if (source.groups && source.groups.length) {
        category.groups = [];
        for (var g = 0; g < source.groups.length; g++) {
          var group = source.groups[g] || {};
          category.groups.push({
            label: group.label || ('Group ' + (g + 1)),
            description: group.description || '',
            collapsed: !!group.collapsed,
            items: cloneResourceItems(group.items)
          });
        }
      }
      copy.push(category);
    }
    return copy;
  }

  function cloneResourceItems(items) {
    if (!items || !items.length) {
      return [];
    }
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (typeof item === 'string') {
        list.push({ label: item, snippet: item });
      } else if (item && typeof item === 'object') {
        list.push({
          label: item.label || ('Item ' + (i + 1)),
          snippet: typeof item.snippet === 'string' ? item.snippet : (item.label || ''),
          description: item.description || ''
        });
      }
    }
    return list;
  }

  function storageAvailable() {
    try {
      var testKey = STORAGE_PREFIX + 'test';
      root.localStorage.setItem(testKey, '1');
      root.localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  var hasStorage = typeof root !== 'undefined' && root.localStorage && storageAvailable();

  function loadPersistedState(key) {
    if (!hasStorage) {
      return null;
    }
    try {
      var raw = root.localStorage.getItem(STORAGE_PREFIX + key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      return null;
    }
  }

  function updatePersistedState(key, patch) {
    if (!hasStorage) {
      return;
    }
    var state = loadPersistedState(key) || {};
    var prop;
    for (prop in patch) {
      if (patch.hasOwnProperty(prop)) {
        state[prop] = patch[prop];
      }
    }
    try {
      root.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(state));
    } catch (err) {
      /* ignore */
    }
  }

  function createElement(tagName, className, text) {
    var el = root.document.createElement(tagName);
    if (className) {
      el.className = className;
    }
    if (typeof text === 'string') {
      el.appendChild(root.document.createTextNode(text));
    }
    return el;
  }

  function addClass(el, className) {
    if (!el || !className) {
      return;
    }
    if (el.classList) {
      el.classList.add(className);
    } else if ((' ' + el.className + ' ').indexOf(' ' + className + ' ') === -1) {
      el.className += ' ' + className;
    }
  }

  function trimString(value) {
    if (value == null) {
      return '';
    }
    if (typeof value.trim === 'function') {
      return value.trim();
    }
    return String(value).replace(/^\\s+|\\s+$/g, '');
  }

  function removeClass(el, className) {
    if (!el || !className) {
      return;
    }
    if (el.classList) {
      el.classList.remove(className);
    } else {
      el.className = trimString((' ' + el.className + ' ').replace(' ' + className + ' ', ' '));
    }
  }

  function toggleClass(el, className, shouldHave) {
    if (shouldHave) {
      addClass(el, className);
    } else {
      removeClass(el, className);
    }
  }

  function formatTimestamp(date) {
    var pad = function (value) {
      return value < 10 ? '0' + value : String(value);
    };
    return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
  }

  function safeSerialize(value, seen) {
    if (seen === void 0) {
      seen = [];
    }
    if (value === null) {
      return 'null';
    }
    var type = typeof value;
    if (type === 'string') {
      return value;
    }
    if (type === 'number' || type === 'boolean') {
      return String(value);
    }
    if (type === 'undefined') {
      return 'undefined';
    }
    if (type === 'function') {
      return value.toString();
    }
    if (value instanceof Error) {
      return value.name + ': ' + value.message + (value.stack ? '\n' + value.stack : '');
    }
    if (seen.indexOf(value) !== -1) {
      return '[Circular]';
    }
    seen.push(value);
    try {
      return JSON.stringify(value, function (key, val) {
        if (typeof val === 'object' && val !== null) {
          if (seen.indexOf(val) !== -1) {
            return '[Circular]';
          }
          seen.push(val);
        }
        if (typeof val === 'function') {
          return val.toString();
        }
        if (val instanceof Error) {
          return val.name + ': ' + val.message;
        }
        return val;
      }, 2);
    } catch (err) {
      return Object.prototype.toString.call(value);
    } finally {
      seen.pop();
    }
  }

  function plainTextForEntry(entry) {
    return '[' + formatTimestamp(entry.timestamp) + '] ' + entry.level.toUpperCase() + ' ' + entry.args.join(' ');
  }

  function getPlainText(entries) {
    var lines = [];
    for (var i = 0; i < entries.length; i++) {
      lines.push(plainTextForEntry(entries[i]));
    }
    return lines.join('\n');
  }

  var ConsoleHook = (function () {
    var installed = false;
    var original = {};
    var listeners = [];
    var levels = ['log', 'info', 'warn', 'error'];

    function notify(entry) {
      for (var i = 0; i < listeners.length; i++) {
        if (listeners[i] && listeners[i].callback) {
          try {
            listeners[i].callback(entry);
          } catch (err) {
            /* ignore listener errors */
          }
        }
      }
    }

    function wrap(level) {
      return function () {
        var args = Array.prototype.slice.call(arguments);
        var entry = {
          level: level,
          args: args,
          timestamp: new Date()
        };
        notify(entry);
        if (typeof original[level] === 'function') {
          original[level].apply(root.console, args);
        }
      };
    }

    function install() {
      if (installed) {
        return;
      }
      if (!root.console) {
        root.console = {};
      }
      var i;
      for (i = 0; i < levels.length; i++) {
        var level = levels[i];
        original[level] = root.console[level] || function () { };
      }
      for (i = 0; i < levels.length; i++) {
        root.console[levels[i]] = wrap(levels[i]);
      }
      installed = true;
    }

    function uninstallIfIdle() {
      if (!installed) {
        return;
      }
      if (listeners.length > 0) {
        return;
      }
      for (var i = 0; i < levels.length; i++) {
        if (original[levels[i]]) {
          root.console[levels[i]] = original[levels[i]];
        }
      }
      installed = false;
    }

    return {
      addListener: function (callback) {
        if (typeof callback !== 'function') {
          return null;
        }
        install();
        var token = { callback: callback };
        listeners.push(token);
        return token;
      },
      removeListener: function (token) {
        if (!token) {
          return;
        }
        for (var i = 0; i < listeners.length; i++) {
          if (listeners[i] === token) {
            listeners.splice(i, 1);
            break;
          }
        }
        uninstallIfIdle();
      }
    };
  }());

  var ErrorObserver = (function () {
    var listeners = [];
    var initialized = false;
    var prevOnError = null;
    var prevOnUnhandled = null;

    function notify(type, payload) {
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i](type, payload);
        } catch (err) {
          /* ignore */
        }
      }
    }

    function onErrorEvent(event) {
      var message = event.message || (event.error && event.error.message) || 'Unknown error';
      var stack = event.error && event.error.stack ? event.error.stack : (event.filename ? (event.filename + ':' + event.lineno + ':' + event.colno) : '');
      notify('error', {
        message: message,
        stack: stack,
        error: event.error || null
      });
    }

    function onUnhandledRejection(event) {
      var reason = event.reason;
      var message = 'Unhandled Promise rejection';
      if (reason && reason.message) {
        message += ': ' + reason.message;
      } else if (typeof reason === 'string') {
        message += ': ' + reason;
      }
      var stack = reason && reason.stack ? reason.stack : '';
      notify('unhandledrejection', {
        message: message,
        stack: stack,
        error: reason || null
      });
    }

    function init() {
      if (initialized) {
        return;
      }
      initialized = true;
      if (root.addEventListener) {
        root.addEventListener('error', onErrorEvent, true);
        root.addEventListener('unhandledrejection', onUnhandledRejection, true);
      } else {
        prevOnError = root.onerror;
        root.onerror = function () {
          var args = Array.prototype.slice.call(arguments);
          var message = args[0];
          var url = args[1];
          var line = args[2];
          var col = args[3];
          var error = args[4];
          notify('error', {
            message: message || 'Unknown error',
            stack: url ? (url + ':' + line + ':' + col) : '',
            error: error || null
          });
          if (typeof prevOnError === 'function') {
            return prevOnError.apply(this, args);
          }
          return false;
        };
        prevOnUnhandled = root.onunhandledrejection;
        root.onunhandledrejection = function (event) {
          notify('unhandledrejection', {
            message: 'Unhandled Promise rejection',
            stack: '',
            error: event && event.reason ? event.reason : null
          });
          if (typeof prevOnUnhandled === 'function') {
            return prevOnUnhandled.apply(this, arguments);
          }
          return false;
        };
      }
    }

    return {
      addListener: function (handler) {
        if (typeof handler !== 'function') {
          return;
        }
        init();
        listeners.push(handler);
      },
      removeListener: function (handler) {
        for (var i = listeners.length - 1; i >= 0; i--) {
          if (listeners[i] === handler) {
            listeners.splice(i, 1);
          }
        }
      }
    };
  }());

  function EditorInstance(container, options) {
    if (!container || !container.ownerDocument) {
      throw new Error('EditorWidget.mount: container element is required');
    }
    this.id = 'ew-' + (++instanceIdCounter);
    this.options = options;
    this.container = container;
    this.document = container.ownerDocument;
    this.rootEl = null;
    this.editorWrap = null;
    this.consoleWrap = null;
    this.consoleEntriesEl = null;
    this.consoleState = {
      filters: { log: true, info: true, warn: true, error: true },
      paused: false,
      wrap: !!options.wrapConsole,
      visible: options.showConsole !== false
    };
    this.consoleEntries = [];
    this.consoleListenerToken = null;
    this.pauseButton = null;
    this.wrapButton = null;
    this.consoleVisibilityButton = null;
    this.cm = null;
    this.cmChangeHandler = null;
    this.cmKeyDownHandler = null;
    this.splitRatio = 0.7;
    this.isDragging = false;
    this.dragHandlers = null;
    this.keyHandlersBound = false;
    this.keydownHandler = null;
    this.persistKey = options.persist ? options.persistKey : null;
    this.debugEnabled = options.debugEnabled !== false;
    this.debugMarks = {};
    this.debugCounts = {};
    this.pausedBuffer = [];
    this.errorOverlayEl = null;
    this.countBadgeEl = null;
    this.searchPanel = null;
    this.searchInput = null;
    this.originalChildren = [];
    this.publicAPI = null;
    this.resources = cloneResourceDefinitions(this.options.resources);
    this.options.resources = this.resources;
    this.resourcePanel = null;
    this.resourceTabs = [];
    this.resourceListEl = null;
    this.activeResourceIndex = 0;
    this.lintAvailable = false;
    this.lintEnabled = false;
    this.lintButton = null;
    this.aiEnabled = !!options.enableAI;
    this.aiProviders = cloneAIProviders(options.aiProviders);
    this.aiState = {
      provider: options.defaultAIProvider,
      insertMode: options.aiInsertMode === 'insert' ? 'insert' : 'replace',
      rememberKey: !!options.aiRememberCredentials,
      busy: false
    };
    if (!this.aiState.provider || !this.aiProviders[this.aiState.provider] || this.aiProviders[this.aiState.provider].enabled === false) {
      this.aiState.provider = firstEnabledProviderId(this.aiProviders);
    }
    if (!this.aiState.provider) {
      this.aiEnabled = false;
    }
    this.aiButton = null;
    this.aiDialog = null;
    this.aiProviderSelect = null;
    this.aiApiKeyInput = null;
    this.aiBaseUrlInput = null;
    this.aiEndpointInput = null;
    this.aiModelInput = null;
    this.aiMaxTokensInput = null;
    this.aiTemperatureInput = null;
    this.aiSystemPromptInput = null;
    this.aiRememberCheckbox = null;
    this.aiInsertModeSelect = null;
    this.aiPromptInput = null;
    this.aiStatusEl = null;
    this.aiGenerateButton = null;
    this.aiFormInputs = [];
    this.aiStatusTimeout = null;

    this.init();
  }

  EditorInstance.prototype.init = function () {
    this.captureOriginalChildren();
    this.createLayout();
    this.initEditor();
    this.initConsole();
    this.initDebug();
    this.applyInitialPersistence();
    this.bindGlobalHandlers();
  };

  EditorInstance.prototype.captureOriginalChildren = function () {
    var child;
    while (this.container.firstChild) {
      child = this.container.removeChild(this.container.firstChild);
      this.originalChildren.push(child);
    }
  };

  EditorInstance.prototype.restoreOriginalChildren = function () {
    var i;
    for (i = 0; i < this.originalChildren.length; i++) {
      this.container.appendChild(this.originalChildren[i]);
    }
    this.originalChildren = [];
  };

  EditorInstance.prototype.createLayout = function () {
    var rootEl = createElement('div', 'ew-root');
    rootEl.setAttribute('data-ew-instance', this.id);
    rootEl.style.height = this.options.height;

    var layout = createElement('div', 'ew-layout');
    var mainColumn = createElement('div', 'ew-main');

    var editorWrap = createElement('div', 'ew-pane ew-editor-pane');
    var editorToolbar = createElement('div', 'ew-editor-toolbar');
    editorToolbar.setAttribute('role', 'toolbar');
    editorToolbar.setAttribute('aria-label', 'Editor controls');
    var searchButton = createElement('button', 'ew-btn ew-btn-link', 'Search');
    searchButton.type = 'button';
    searchButton.onclick = this.openSearchPanel.bind(this);
    if (this.options.enableSearch === false) {
      searchButton.disabled = true;
      addClass(searchButton, 'ew-disabled');
    }
    editorToolbar.appendChild(searchButton);
    var formatButton = createElement('button', 'ew-btn ew-btn-link', 'Format');
    formatButton.type = 'button';
    formatButton.onclick = this.format.bind(this);
    editorToolbar.appendChild(formatButton);
    var runButton = createElement('button', 'ew-btn ew-btn-primary', 'Run');
    runButton.type = 'button';
    runButton.onclick = this.runCode.bind(this);
    editorToolbar.appendChild(runButton);
    if (this.options.enableLint !== false) {
      var lintButton = createElement('button', 'ew-btn', 'Lint');
      lintButton.type = 'button';
      lintButton.setAttribute('aria-pressed', 'false');
      lintButton.disabled = true;
      lintButton.title = 'Linting assets not detected';
      lintButton.onclick = this.toggleLint.bind(this);
      editorToolbar.appendChild(lintButton);
      this.lintButton = lintButton;
    }
    if (this.aiEnabled) {
      this.buildAIControls(editorToolbar, rootEl);
    }
    editorWrap.appendChild(editorToolbar);
    var editorHost = createElement('div', 'ew-editor-host');
    editorWrap.appendChild(editorHost);

    var splitter = createElement('div', 'ew-splitter');
    splitter.setAttribute('role', 'separator');
    splitter.setAttribute('aria-orientation', 'horizontal');
    splitter.setAttribute('tabindex', '0');

    var consoleWrap = createElement('div', 'ew-pane ew-console-pane');
    this.buildConsoleToolbar(consoleWrap);
    var entries = createElement('div', 'ew-console-entries');
    entries.setAttribute('role', 'log');
    entries.setAttribute('aria-live', 'polite');
    if (this.consoleState.wrap) {
      addClass(entries, 'ew-wrap');
    }
    consoleWrap.appendChild(entries);

    mainColumn.appendChild(editorWrap);
    mainColumn.appendChild(splitter);
    mainColumn.appendChild(consoleWrap);
    layout.appendChild(mainColumn);

    if (this.options.showResourcePanel !== false && this.resources.length) {
      this.buildResourcePanel(layout);
    }

    rootEl.appendChild(layout);

    var searchPanel = createElement('div', 'ew-search-panel');
    addClass(searchPanel, 'ew-hidden');
    var searchLabel = createElement('label', 'ew-search-label', 'Find:');
    var searchInput = createElement('input', 'ew-search-input');
    searchInput.type = 'text';
    searchInput.setAttribute('placeholder', 'Ctrl/Cmd + F');
    searchLabel.appendChild(searchInput);
    var findNextBtn = createElement('button', 'ew-btn', 'Next');
    findNextBtn.type = 'button';
    findNextBtn.onclick = this.findNext.bind(this);
    var findPrevBtn = createElement('button', 'ew-btn', 'Prev');
    findPrevBtn.type = 'button';
    findPrevBtn.onclick = this.findPrevious.bind(this);
    var closeSearchBtn = createElement('button', 'ew-btn ew-btn-link', 'Close');
    closeSearchBtn.type = 'button';
    closeSearchBtn.onclick = this.closeSearchPanel.bind(this);

    searchPanel.appendChild(searchLabel);
    searchPanel.appendChild(findNextBtn);
    searchPanel.appendChild(findPrevBtn);
    searchPanel.appendChild(closeSearchBtn);
    rootEl.appendChild(searchPanel);

    var badge = createElement('div', 'ew-debug-counts');
    badge.style.display = 'none';
    rootEl.appendChild(badge);

    var overlay = createElement('div', 'ew-error-overlay ew-hidden');
    overlay.setAttribute('role', 'alert');
    var overlayBox = createElement('div', 'ew-error-box');
    var overlayTitle = createElement('div', 'ew-error-title', 'An error occurred');
    var overlayMessage = createElement('pre', 'ew-error-message');
    var overlayClose = createElement('button', 'ew-btn ew-btn-primary', 'Dismiss');
    overlayClose.type = 'button';
    overlayClose.onclick = this.hideErrorOverlay.bind(this);
    overlayBox.appendChild(overlayTitle);
    overlayBox.appendChild(overlayMessage);
    overlayBox.appendChild(overlayClose);
    overlay.appendChild(overlayBox);
    rootEl.appendChild(overlay);

    this.container.appendChild(rootEl);
    this.rootEl = rootEl;
    this.editorWrap = editorWrap;
    this.editorToolbar = editorToolbar;
    this.editorHost = editorHost;
    this.splitter = splitter;
    this.consoleWrap = consoleWrap;
    this.consoleEntriesEl = entries;
    this.errorOverlayEl = overlay;
    this.errorOverlayMessageEl = overlayMessage;
    this.countBadgeEl = badge;
    this.searchPanel = searchPanel;
    this.searchInput = searchInput;

    this.applySplitRatio(this.splitRatio);
    this.setupSplitter();
  };

  EditorInstance.prototype.buildAIControls = function (toolbar, rootEl) {
    if (!this.aiEnabled) {
      return;
    }
    var enabledProviders = [];
    var key;
    for (key in this.aiProviders) {
      if (this.aiProviders.hasOwnProperty(key)) {
        var provider = this.aiProviders[key];
        if (provider && provider.enabled !== false) {
          enabledProviders.push(key);
        }
      }
    }
    if (!enabledProviders.length) {
      this.aiEnabled = false;
      return;
    }
    if (!this.aiState.provider || enabledProviders.indexOf(this.aiState.provider) === -1) {
      this.aiState.provider = enabledProviders[0];
    }
    var self = this;
    this.aiFormInputs = [];
    var aiButton = createElement('button', 'ew-btn ew-btn-accent', 'AI Prompt');
    aiButton.type = 'button';
    aiButton.onclick = function () {
      self.toggleAIPanel();
    };
    toolbar.appendChild(aiButton);
    this.aiButton = aiButton;

    var dialog = createElement('div', 'ew-ai-dialog ew-hidden');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Generate JavaScript with AI');
    var card = createElement('div', 'ew-ai-card');
    var header = createElement('div', 'ew-ai-header');
    var title = createElement('div', 'ew-ai-title', 'Generate with AI');
    var closeBtn = createElement('button', 'ew-btn ew-btn-link ew-ai-close', 'Close');
    closeBtn.type = 'button';
    closeBtn.onclick = function () {
      self.closeAIPanel();
    };
    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    var helper = createElement('p', 'ew-ai-helper', 'Configure a provider, write a prompt, and insert the generated JavaScript directly into the editor.');
    card.appendChild(helper);

    var form = this.document.createElement('form');
    form.className = 'ew-ai-form';
    form.setAttribute('autocomplete', 'off');
    form.onsubmit = function (event) {
      event.preventDefault();
      self.handleAIGenerate();
    };

    var registerInput = function (input) {
      if (!input) {
        return;
      }
      self.aiFormInputs.push(input);
    };

    var providerField = createElement('label', 'ew-ai-field');
    providerField.appendChild(createElement('span', 'ew-ai-field-label', 'Provider'));
    var providerSelect = this.document.createElement('select');
    providerSelect.className = 'ew-ai-input';
    for (var i = 0; i < enabledProviders.length; i++) {
      var id = enabledProviders[i];
      var option = this.document.createElement('option');
      option.value = id;
      option.textContent = this.aiProviders[id].label || humanizeId(id);
      providerSelect.appendChild(option);
    }
    providerSelect.value = this.aiState.provider;
    providerSelect.onchange = function () {
      self.aiState.provider = providerSelect.value;
      self.populateAIForm();
      self.persistAIState();
    };
    providerField.appendChild(providerSelect);
    form.appendChild(providerField);
    this.aiProviderSelect = providerSelect;
    registerInput(providerSelect);

    var apiKeyField = createElement('label', 'ew-ai-field');
    apiKeyField.appendChild(createElement('span', 'ew-ai-field-label', 'API Key'));
    var apiKeyInput = this.document.createElement('input');
    apiKeyInput.type = 'password';
    apiKeyInput.autocomplete = 'off';
    apiKeyInput.placeholder = 'sk-...';
    apiKeyInput.className = 'ew-ai-input';
    apiKeyInput.oninput = function () {
      self.setActiveAIProviderField('apiKey', apiKeyInput.value, { persist: self.aiState.rememberKey });
      if (self.aiState.rememberKey) {
        self.persistAIState();
      }
    };
    apiKeyField.appendChild(apiKeyInput);
    form.appendChild(apiKeyField);
    this.aiApiKeyInput = apiKeyInput;
    registerInput(apiKeyInput);

    var baseField = createElement('label', 'ew-ai-field');
    baseField.appendChild(createElement('span', 'ew-ai-field-label', 'Base URL'));
    var baseInput = this.document.createElement('input');
    baseInput.type = 'text';
    baseInput.placeholder = 'https://api.openai.com/v1';
    baseInput.className = 'ew-ai-input';
    baseInput.oninput = function () {
      self.setActiveAIProviderField('baseUrl', trimString(baseInput.value));
    };
    baseField.appendChild(baseInput);
    form.appendChild(baseField);
    this.aiBaseUrlInput = baseInput;
    registerInput(baseInput);

    var endpointField = createElement('label', 'ew-ai-field');
    endpointField.appendChild(createElement('span', 'ew-ai-field-label', 'Endpoint'));
    var endpointInput = this.document.createElement('input');
    endpointInput.type = 'text';
    endpointInput.placeholder = '/chat/completions';
    endpointInput.className = 'ew-ai-input';
    endpointInput.oninput = function () {
      self.setActiveAIProviderField('endpoint', trimString(endpointInput.value));
    };
    endpointField.appendChild(endpointInput);
    form.appendChild(endpointField);
    this.aiEndpointInput = endpointInput;
    registerInput(endpointInput);

    var modelField = createElement('label', 'ew-ai-field');
    modelField.appendChild(createElement('span', 'ew-ai-field-label', 'Model'));
    var modelInput = this.document.createElement('input');
    modelInput.type = 'text';
    modelInput.placeholder = 'gpt-4.1-mini';
    modelInput.className = 'ew-ai-input';
    modelInput.oninput = function () {
      self.setActiveAIProviderField('model', trimString(modelInput.value));
    };
    modelField.appendChild(modelInput);
    form.appendChild(modelField);
    this.aiModelInput = modelInput;
    registerInput(modelInput);

    var row = createElement('div', 'ew-ai-row');
    var maxTokensField = createElement('label', 'ew-ai-field ew-ai-field--compact');
    maxTokensField.appendChild(createElement('span', 'ew-ai-field-label', 'Max tokens'));
    var maxTokensInput = this.document.createElement('input');
    maxTokensInput.type = 'number';
    maxTokensInput.min = '1';
    maxTokensInput.step = '1';
    maxTokensInput.className = 'ew-ai-input';
    maxTokensInput.oninput = function () {
      var parsed = parseInt(maxTokensInput.value, 10);
      if (!isFinite(parsed) || parsed <= 0) {
        parsed = '';
      }
      self.setActiveAIProviderField('maxTokens', parsed === '' ? null : parsed);
    };
    maxTokensField.appendChild(maxTokensInput);
    row.appendChild(maxTokensField);
    this.aiMaxTokensInput = maxTokensInput;
    registerInput(maxTokensInput);

    var tempField = createElement('label', 'ew-ai-field ew-ai-field--compact');
    tempField.appendChild(createElement('span', 'ew-ai-field-label', 'Temperature'));
    var tempInput = this.document.createElement('input');
    tempInput.type = 'number';
    tempInput.step = '0.1';
    tempInput.min = '0';
    tempInput.max = '2';
    tempInput.className = 'ew-ai-input';
    tempInput.oninput = function () {
      var parsed = parseFloat(tempInput.value);
      if (!isFinite(parsed)) {
        parsed = '';
      }
      self.setActiveAIProviderField('temperature', parsed === '' ? null : parsed);
    };
    tempField.appendChild(tempInput);
    row.appendChild(tempField);
    this.aiTemperatureInput = tempInput;
    registerInput(tempInput);

    form.appendChild(row);

    var systemField = createElement('label', 'ew-ai-field');
    systemField.appendChild(createElement('span', 'ew-ai-field-label', 'System prompt'));
    var systemInput = this.document.createElement('textarea');
    systemInput.className = 'ew-ai-input ew-ai-textarea';
    systemInput.rows = 3;
    systemInput.oninput = function () {
      self.setActiveAIProviderField('systemPrompt', systemInput.value);
    };
    systemField.appendChild(systemInput);
    form.appendChild(systemField);
    this.aiSystemPromptInput = systemInput;
    registerInput(systemInput);

    var rememberWrap = createElement('label', 'ew-ai-checkbox');
    var rememberInput = this.document.createElement('input');
    rememberInput.type = 'checkbox';
    rememberInput.checked = !!this.aiState.rememberKey;
    rememberInput.onchange = function () {
      self.aiState.rememberKey = rememberInput.checked;
      self.persistAIState();
    };
    rememberWrap.appendChild(rememberInput);
    rememberWrap.appendChild(createElement('span', 'ew-ai-checkbox-label', 'Remember API key (stored locally)'));
    form.appendChild(rememberWrap);
    this.aiRememberCheckbox = rememberInput;
    registerInput(rememberInput);

    var insertField = createElement('label', 'ew-ai-field');
    insertField.appendChild(createElement('span', 'ew-ai-field-label', 'Insert mode'));
    var insertSelect = this.document.createElement('select');
    insertSelect.className = 'ew-ai-input';
    var replaceOption = this.document.createElement('option');
    replaceOption.value = 'replace';
    replaceOption.textContent = 'Replace editor contents';
    insertSelect.appendChild(replaceOption);
    var insertOption = this.document.createElement('option');
    insertOption.value = 'insert';
    insertOption.textContent = 'Insert at cursor';
    insertSelect.appendChild(insertOption);
    insertSelect.onchange = function () {
      self.aiState.insertMode = insertSelect.value === 'insert' ? 'insert' : 'replace';
      self.persistAIState();
    };
    insertField.appendChild(insertSelect);
    form.appendChild(insertField);
    this.aiInsertModeSelect = insertSelect;
    registerInput(insertSelect);

    var promptField = createElement('label', 'ew-ai-field ew-ai-field--block');
    promptField.appendChild(createElement('span', 'ew-ai-field-label', 'Prompt'));
    var promptInput = this.document.createElement('textarea');
    promptInput.className = 'ew-ai-input ew-ai-textarea';
    promptInput.rows = 6;
    promptInput.placeholder = 'Describe the JavaScript you need...';
    promptField.appendChild(promptInput);
    form.appendChild(promptField);
    this.aiPromptInput = promptInput;
    registerInput(promptInput);

    var actions = createElement('div', 'ew-ai-actions');
    var generateBtn = createElement('button', 'ew-btn ew-btn-primary', 'Generate');
    generateBtn.type = 'submit';
    var clearBtn = createElement('button', 'ew-btn ew-btn-link', 'Clear prompt');
    clearBtn.type = 'button';
    clearBtn.onclick = function () {
      self.aiPromptInput.value = '';
      self.setAIStatus('');
      self.aiPromptInput.focus();
    };
    actions.appendChild(generateBtn);
    actions.appendChild(clearBtn);
    form.appendChild(actions);
    this.aiGenerateButton = generateBtn;

    var status = createElement('div', 'ew-ai-status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);
    this.aiStatusEl = status;

    card.appendChild(form);
    dialog.appendChild(card);
    rootEl.appendChild(dialog);
    this.aiDialog = dialog;

    this.populateAIForm();
  };

  EditorInstance.prototype.getActiveAIProvider = function () {
    if (!this.aiState.provider) {
      return null;
    }
    var provider = this.aiProviders[this.aiState.provider] || null;
    if (provider && provider.enabled !== false) {
      provider.id = this.aiState.provider;
      return provider;
    }
    var fallback = firstEnabledProviderId(this.aiProviders);
    if (fallback) {
      this.aiState.provider = fallback;
      return this.aiProviders[fallback] || null;
    }
    return null;
  };

  EditorInstance.prototype.populateAIForm = function () {
    if (!this.aiEnabled) {
      return;
    }
    var provider = this.getActiveAIProvider();
    if (!provider) {
      return;
    }
    if (this.aiProviderSelect) {
      this.aiProviderSelect.value = provider.id;
    }
    if (this.aiApiKeyInput) {
      this.aiApiKeyInput.value = provider.apiKey || '';
    }
    if (this.aiBaseUrlInput) {
      this.aiBaseUrlInput.value = provider.baseUrl || '';
    }
    if (this.aiEndpointInput) {
      this.aiEndpointInput.value = provider.endpoint || '';
    }
    if (this.aiModelInput) {
      this.aiModelInput.value = provider.model || '';
    }
    if (this.aiMaxTokensInput) {
      this.aiMaxTokensInput.value = typeof provider.maxTokens === 'number' ? String(provider.maxTokens) : '';
    }
    if (this.aiTemperatureInput) {
      this.aiTemperatureInput.value = typeof provider.temperature === 'number' ? String(provider.temperature) : '';
    }
    if (this.aiSystemPromptInput) {
      this.aiSystemPromptInput.value = provider.systemPrompt || '';
    }
    if (this.aiRememberCheckbox) {
      this.aiRememberCheckbox.checked = !!this.aiState.rememberKey;
    }
    if (this.aiInsertModeSelect) {
      this.aiInsertModeSelect.value = this.aiState.insertMode === 'insert' ? 'insert' : 'replace';
    }
  };

  EditorInstance.prototype.setActiveAIProviderField = function (field, value, options) {
    var provider = this.getActiveAIProvider();
    if (!provider) {
      return;
    }
    provider[field] = value;
    var persist = true;
    if (options && options.hasOwnProperty('persist')) {
      persist = !!options.persist;
    }
    if (field === 'apiKey' && !this.aiState.rememberKey) {
      persist = false;
    }
    if (persist) {
      this.persistAIState();
    }
  };

  EditorInstance.prototype.isAIPanelVisible = function () {
    if (!this.aiDialog) {
      return false;
    }
    if (this.aiDialog.classList) {
      return !this.aiDialog.classList.contains('ew-hidden');
    }
    return this.aiDialog.className.indexOf('ew-hidden') === -1;
  };

  EditorInstance.prototype.openAIPanel = function () {
    if (!this.aiDialog) {
      return;
    }
    removeClass(this.aiDialog, 'ew-hidden');
    if (this.rootEl) {
      addClass(this.rootEl, 'ew-ai-open');
    }
    this.populateAIForm();
    if (this.aiPromptInput) {
      this.aiPromptInput.focus();
    }
  };

  EditorInstance.prototype.closeAIPanel = function () {
    if (!this.aiDialog) {
      return;
    }
    addClass(this.aiDialog, 'ew-hidden');
    if (this.rootEl) {
      removeClass(this.rootEl, 'ew-ai-open');
    }
    this.setAIStatus('');
  };

  EditorInstance.prototype.toggleAIPanel = function () {
    if (!this.aiDialog) {
      return;
    }
    if (this.isAIPanelVisible()) {
      this.closeAIPanel();
    } else {
      this.openAIPanel();
    }
  };

  EditorInstance.prototype.setAIBusy = function (busy) {
    this.aiState.busy = !!busy;
    if (this.aiButton) {
      this.aiButton.disabled = !!busy;
    }
    if (this.aiGenerateButton) {
      this.aiGenerateButton.disabled = !!busy;
      this.aiGenerateButton.textContent = busy ? 'Generating…' : 'Generate';
    }
    for (var i = 0; i < this.aiFormInputs.length; i++) {
      var input = this.aiFormInputs[i];
      if (!input || input === this.aiGenerateButton) {
        continue;
      }
      if (input === this.aiPromptInput) {
        input.disabled = false;
      } else {
        input.disabled = !!busy;
      }
    }
    if (this.rootEl) {
      if (busy) {
        addClass(this.rootEl, 'ew-ai-busy');
      } else {
        removeClass(this.rootEl, 'ew-ai-busy');
      }
    }
  };

  EditorInstance.prototype.setAIStatus = function (message, isError) {
    if (!this.aiStatusEl) {
      return;
    }
    if (this.aiStatusTimeout) {
      root.clearTimeout(this.aiStatusTimeout);
      this.aiStatusTimeout = null;
    }
    if (!message) {
      this.aiStatusEl.textContent = '';
      removeClass(this.aiStatusEl, 'ew-ai-status--error');
      this.aiStatusEl.removeAttribute('role');
      return;
    }
    this.aiStatusEl.textContent = message;
    if (isError) {
      addClass(this.aiStatusEl, 'ew-ai-status--error');
      this.aiStatusEl.setAttribute('role', 'alert');
    } else {
      removeClass(this.aiStatusEl, 'ew-ai-status--error');
      this.aiStatusEl.setAttribute('role', 'status');
      var self = this;
      this.aiStatusTimeout = root.setTimeout(function () {
        self.aiStatusTimeout = null;
        self.setAIStatus('');
      }, 4000);
    }
  };

  EditorInstance.prototype.handleAIGenerate = function () {
    if (!this.aiEnabled) {
      return;
    }
    var provider = this.getActiveAIProvider();
    if (!provider) {
      this.setAIStatus('Select a provider to continue.', true);
      return;
    }
    var prompt = this.aiPromptInput ? trimString(this.aiPromptInput.value) : '';
    if (!prompt) {
      this.setAIStatus('Enter a prompt before requesting code.', true);
      if (this.aiPromptInput) {
        this.aiPromptInput.focus();
      }
      return;
    }
    provider.apiKey = trimString(provider.apiKey || '');
    provider.baseUrl = trimString(provider.baseUrl || '');
    provider.endpoint = trimString(provider.endpoint || '');
    provider.model = trimString(provider.model || '');
    if (!provider.apiKey) {
      this.setAIStatus('API key is required for ' + (provider.label || provider.id) + '.', true);
      if (this.aiApiKeyInput) {
        this.aiApiKeyInput.focus();
      }
      return;
    }
    if (!provider.baseUrl) {
      this.setAIStatus('Configure the base URL for ' + (provider.label || provider.id) + '.', true);
      if (this.aiBaseUrlInput) {
        this.aiBaseUrlInput.focus();
      }
      return;
    }
    if (!provider.model) {
      this.setAIStatus('Model name is required.', true);
      if (this.aiModelInput) {
        this.aiModelInput.focus();
      }
      return;
    }
    if (typeof provider.maxTokens !== 'number' || !isFinite(provider.maxTokens) || provider.maxTokens <= 0) {
      provider.maxTokens = 800;
    }
    if (typeof provider.temperature !== 'number' || !isFinite(provider.temperature)) {
      provider.temperature = 0.2;
    }
    if (!root.fetch || typeof root.fetch !== 'function') {
      this.setAIStatus('Fetch API is not available in this environment.', true);
      return;
    }
    var self = this;
    this.setAIBusy(true);
    this.setAIStatus('Contacting ' + (provider.label || provider.id) + '...', false);
    this.callAI(provider, prompt).then(function (code) {
      self.setAIBusy(false);
      if (!code) {
        self.setAIStatus('The model response did not include JavaScript output.', true);
        return;
      }
      self.applyAIOutput(provider, code);
      self.setAIStatus('Inserted code from ' + (provider.label || provider.id) + '.', false);
      self.persistAIState();
    }, function (error) {
      self.setAIBusy(false);
      var message = error && error.message ? error.message : 'Unable to generate code.';
      self.setAIStatus(message, true);
    });
  };

  EditorInstance.prototype.buildAIRequest = function (provider, promptText) {
    if (!provider || !promptText) {
      return null;
    }
    var type = provider.type || 'openai';
    var baseUrl = trimString(provider.baseUrl || '');
    var endpoint = trimString(provider.endpoint || '');
    if (!baseUrl) {
      return null;
    }
    var url = joinUrl(baseUrl, endpoint || (type === 'anthropic' ? '/messages' : '/chat/completions'));
    var headers = { 'Content-Type': 'application/json' };
    if (provider.extraHeaders) {
      for (var h in provider.extraHeaders) {
        if (provider.extraHeaders.hasOwnProperty(h)) {
          headers[h] = provider.extraHeaders[h];
        }
      }
    }
    var temperature = typeof provider.temperature === 'number' && isFinite(provider.temperature) ? provider.temperature : 0.2;
    var maxTokens = typeof provider.maxTokens === 'number' && isFinite(provider.maxTokens) ? provider.maxTokens : 800;
    var systemPrompt = provider.systemPrompt || DEFAULT_AI_SYSTEM_PROMPT;
    var instructions = provider.instructions ? trimString(provider.instructions) : '';
    var userPrompt = instructions ? (instructions + '\n\n' + promptText) : promptText;
    if (type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey;
      headers['anthropic-version'] = provider.anthropicVersion || '2023-06-01';
      var message = {
        model: provider.model,
        max_tokens: maxTokens,
        temperature: temperature,
        system: systemPrompt,
        messages: [
          { role: 'user', content: [{ type: 'text', text: userPrompt }] }
        ]
      };
      return {
        url: url,
        options: {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(message)
        },
        type: 'anthropic'
      };
    }
    headers.Authorization = 'Bearer ' + provider.apiKey;
    if (provider.organization) {
      headers['OpenAI-Organization'] = provider.organization;
    }
    var payload = {
      model: provider.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    };
    return {
      url: url,
      options: {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      },
      type: 'openai'
    };
  };

  EditorInstance.prototype.callAI = function (provider, promptText) {
    var self = this;
    var request = this.buildAIRequest(provider, promptText);
    if (!request) {
      return Promise.reject(new Error('Incomplete provider configuration.'));
    }
    return root.fetch(request.url, request.options).then(function (response) {
      if (!response.ok) {
        return response.text().then(function (text) {
          var message = 'Request failed (' + response.status + ')';
          if (text) {
            message += ': ' + text;
          }
          throw new Error(message);
        }, function () {
          throw new Error('Request failed (' + response.status + ')');
        });
      }
      return response.json();
    }).then(function (payload) {
      return self.extractAIResponse(provider, payload, request.type);
    }).catch(function (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(error ? String(error) : 'Unknown error');
    });
  };

  EditorInstance.prototype.extractAIResponse = function (provider, payload, requestType) {
    if (!payload) {
      return '';
    }
    var raw = '';
    if (requestType === 'anthropic') {
      if (payload.content && payload.content.length) {
        var parts = [];
        for (var i = 0; i < payload.content.length; i++) {
          var block = payload.content[i];
          if (!block) {
            continue;
          }
          if (typeof block === 'string') {
            parts.push(block);
          } else if (block.text) {
            parts.push(block.text);
          } else if (block.value) {
            parts.push(block.value);
          }
        }
        raw = parts.join('\n');
      } else if (typeof payload.output_text === 'string') {
        raw = payload.output_text;
      }
    } else {
      if (payload.output && typeof payload.output === 'string') {
        raw = payload.output;
      } else if (typeof payload.output_text === 'string') {
        raw = payload.output_text;
      } else if (payload.choices && payload.choices.length) {
        var choice = payload.choices[0];
        if (choice) {
          var message = choice.message && choice.message.content;
          if (Array.isArray(message)) {
            var messageParts = [];
            for (var j = 0; j < message.length; j++) {
              var piece = message[j];
              if (!piece) {
                continue;
              }
              if (typeof piece === 'string') {
                messageParts.push(piece);
              } else if (piece.text) {
                messageParts.push(piece.text);
              } else if (piece.value) {
                messageParts.push(piece.value);
              }
            }
            raw = messageParts.join('\n');
          } else if (typeof message === 'string') {
            raw = message;
          } else if (message && message.text) {
            raw = message.text;
          } else if (choice.text) {
            raw = choice.text;
          }
        }
      } else if (payload.data && payload.data.length) {
        var first = payload.data[0];
        if (first && typeof first.text === 'string') {
          raw = first.text;
        }
      }
    }
    if (Array.isArray(raw)) {
      var flattened = [];
      for (var k = 0; k < raw.length; k++) {
        if (!raw[k]) {
          continue;
        }
        if (typeof raw[k] === 'string') {
          flattened.push(raw[k]);
        } else if (raw[k].text) {
          flattened.push(raw[k].text);
        } else if (raw[k].value) {
          flattened.push(raw[k].value);
        }
      }
      raw = flattened.join('\n');
    }
    return extractCodeSnippet(raw || '');
  };

  EditorInstance.prototype.applyAIOutput = function (provider, code) {
    if (!this.cm || !code) {
      return;
    }
    var mode = this.aiState.insertMode === 'insert' ? 'insert' : 'replace';
    if (mode === 'insert') {
      this.cm.replaceSelection(code, 'around');
    } else {
      this.cm.setValue(code);
    }
    this.cm.focus();
    this.appendConsoleEntry('info', ['AI (' + (provider.label || provider.id || 'provider') + ') inserted code.']);
  };

  EditorInstance.prototype.persistAIState = function () {
    if (!this.aiEnabled || !this.persistKey || !this.options.persist) {
      return;
    }
    var snapshot = {
      provider: this.aiState.provider,
      rememberKey: !!this.aiState.rememberKey,
      insertMode: this.aiState.insertMode,
      providers: {}
    };
    for (var key in this.aiProviders) {
      if (!this.aiProviders.hasOwnProperty(key)) {
        continue;
      }
      var provider = this.aiProviders[key];
      if (!provider) {
        continue;
      }
      var stored = {
        enabled: provider.enabled !== false,
        baseUrl: trimString(provider.baseUrl || ''),
        endpoint: trimString(provider.endpoint || ''),
        model: trimString(provider.model || ''),
        maxTokens: provider.maxTokens,
        temperature: provider.temperature,
        systemPrompt: provider.systemPrompt || '',
        instructions: provider.instructions || '',
        anthropicVersion: trimString(provider.anthropicVersion || ''),
        organization: trimString(provider.organization || ''),
        insertMode: provider.insertMode
      };
      if (provider.extraHeaders) {
        stored.extraHeaders = provider.extraHeaders;
      }
      if (snapshot.rememberKey && provider.apiKey) {
        stored.apiKey = provider.apiKey;
      }
      snapshot.providers[key] = stored;
    }
    updatePersistedState(this.persistKey, { ai: snapshot });
  };

  EditorInstance.prototype.restoreAIState = function (snapshot) {
    if (!snapshot || !this.aiEnabled) {
      return;
    }
    if (snapshot.providers) {
      for (var key in snapshot.providers) {
        if (!snapshot.providers.hasOwnProperty(key)) {
          continue;
        }
        var stored = snapshot.providers[key] || {};
        var target = this.aiProviders[key];
        if (!target) {
          this.aiProviders[key] = cloneAIProvider(stored, key);
          target = this.aiProviders[key];
        } else {
          if (stored.baseUrl != null) { target.baseUrl = trimString(stored.baseUrl || ''); }
          if (stored.endpoint != null) { target.endpoint = trimString(stored.endpoint || ''); }
          if (stored.model != null) { target.model = trimString(stored.model || ''); }
          if (stored.maxTokens != null) {
            var restoredMax = typeof stored.maxTokens === 'number' ? stored.maxTokens : parseInt(stored.maxTokens, 10);
            if (isFinite(restoredMax)) {
              target.maxTokens = restoredMax;
            }
          }
          if (stored.temperature != null) {
            var restoredTemp = typeof stored.temperature === 'number' ? stored.temperature : parseFloat(stored.temperature);
            if (isFinite(restoredTemp)) {
              target.temperature = restoredTemp;
            }
          }
          if (stored.systemPrompt != null) { target.systemPrompt = stored.systemPrompt; }
          if (stored.instructions != null) { target.instructions = stored.instructions; }
          if (stored.anthropicVersion != null) { target.anthropicVersion = trimString(stored.anthropicVersion || ''); }
          if (stored.organization != null) { target.organization = trimString(stored.organization || ''); }
          if (stored.insertMode != null) { target.insertMode = stored.insertMode === 'insert' ? 'insert' : 'replace'; }
          if (stored.enabled != null) { target.enabled = stored.enabled !== false; }
          target.extraHeaders = stored.extraHeaders && typeof stored.extraHeaders === 'object' ? stored.extraHeaders : target.extraHeaders;
          if (stored.apiKey && snapshot.rememberKey) {
            target.apiKey = stored.apiKey;
          }
        }
      }
    }
    if (snapshot.hasOwnProperty('rememberKey')) {
      this.aiState.rememberKey = !!snapshot.rememberKey;
    }
    if (snapshot.insertMode === 'insert' || snapshot.insertMode === 'replace') {
      this.aiState.insertMode = snapshot.insertMode;
    }
    if (snapshot.provider && this.aiProviders[snapshot.provider] && this.aiProviders[snapshot.provider].enabled !== false) {
      this.aiState.provider = snapshot.provider;
    } else if (!this.aiProviders[this.aiState.provider] || this.aiProviders[this.aiState.provider].enabled === false) {
      this.aiState.provider = firstEnabledProviderId(this.aiProviders) || this.aiState.provider;
    }
    this.populateAIForm();
  };

  EditorInstance.prototype.buildConsoleToolbar = function (consoleWrap) {
    var toolbar = createElement('div', 'ew-console-toolbar');
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Console controls');
    var levels = ['log', 'info', 'warn', 'error'];
    var levelNames = { log: 'Log', info: 'Info', warn: 'Warn', error: 'Error' };
    var i;
    for (i = 0; i < levels.length; i++) {
      var level = levels[i];
      var btn = createElement('button', 'ew-btn ew-btn-toggle', levelNames[level]);
      btn.type = 'button';
      btn.setAttribute('data-level', level);
      btn.setAttribute('aria-label', 'Toggle ' + levelNames[level]);
      btn.setAttribute('aria-pressed', 'true');
      btn.onclick = this.handleFilterToggle.bind(this, level);
      toolbar.appendChild(btn);
    }
    var pauseBtn = createElement('button', 'ew-btn', 'Pause');
    pauseBtn.type = 'button';
    pauseBtn.setAttribute('aria-pressed', 'false');
    pauseBtn.onclick = this.togglePause.bind(this);
    pauseBtn.className += ' ew-btn-toggle';
    this.pauseButton = pauseBtn;
    toolbar.appendChild(pauseBtn);

    var wrapBtn = createElement('button', 'ew-btn', 'Wrap');
    wrapBtn.type = 'button';
    wrapBtn.setAttribute('aria-pressed', this.consoleState.wrap ? 'true' : 'false');
    wrapBtn.onclick = this.toggleWrap.bind(this);
    wrapBtn.className += ' ew-btn-toggle';
    this.wrapButton = wrapBtn;
    toggleClass(wrapBtn, 'ew-off', !this.consoleState.wrap);
    toolbar.appendChild(wrapBtn);

    var clearBtn = createElement('button', 'ew-btn', 'Clear');
    clearBtn.type = 'button';
    clearBtn.onclick = this.clearConsole.bind(this);
    toolbar.appendChild(clearBtn);

    var copyBtn = createElement('button', 'ew-btn', 'Copy');
    copyBtn.type = 'button';
    copyBtn.onclick = this.copyConsole.bind(this);
    toolbar.appendChild(copyBtn);

    var downloadBtn = createElement('button', 'ew-btn', 'Download');
    downloadBtn.type = 'button';
    downloadBtn.onclick = this.downloadConsole.bind(this);
    toolbar.appendChild(downloadBtn);

    var visibilityBtn = createElement('button', 'ew-btn', 'Toggle Console');
    visibilityBtn.type = 'button';
    visibilityBtn.onclick = this.toggleConsoleVisibility.bind(this);
    this.consoleVisibilityButton = visibilityBtn;
    visibilityBtn.setAttribute('aria-pressed', this.consoleState.visible ? 'true' : 'false');
    toggleClass(visibilityBtn, 'ew-off', !this.consoleState.visible);
    toolbar.appendChild(visibilityBtn);

    consoleWrap.appendChild(toolbar);
  };

  EditorInstance.prototype.buildResourcePanel = function (layout) {
    if (!this.resources || !this.resources.length) {
      return;
    }
    var panel = createElement('aside', 'ew-resource-panel');
    panel.setAttribute('role', 'complementary');
    panel.style.width = this.options.resourcePanelWidth || '260px';

    var panelTitle = typeof this.options.resourcePanelTitle === 'string' ? this.options.resourcePanelTitle : 'Resources';
    var header = createElement('div', 'ew-resource-header', panelTitle);
    panel.appendChild(header);

    var tabsWrap = createElement('div', 'ew-resource-tabs');
    tabsWrap.setAttribute('role', 'tablist');
    panel.appendChild(tabsWrap);

    var listWrap = createElement('div', 'ew-resource-list');
    listWrap.setAttribute('role', 'tabpanel');
    listWrap.id = this.id + '-resource-panel';
    panel.appendChild(listWrap);

    this.resourcePanel = panel;
    this.resourceTabs = [];
    this.resourceListEl = listWrap;

    var self = this;
    for (var i = 0; i < this.resources.length; i++) {
      (function (index) {
        var category = self.resources[index];
        var button = createElement('button', 'ew-resource-tab', category.label);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.id = self.id + '-resource-tab-' + index;
        button.setAttribute('aria-selected', 'false');
        button.setAttribute('aria-controls', listWrap.id);
        button.onclick = function () {
          self.setActiveResourceCategory(index);
        };
        tabsWrap.appendChild(button);
        self.resourceTabs.push(button);
      }(i));
    }

    layout.appendChild(panel);

    this.setActiveResourceCategory(this.activeResourceIndex);
  };

  EditorInstance.prototype.setActiveResourceCategory = function (index) {
    if (!this.resources || !this.resources.length) {
      return;
    }
    if (index < 0 || index >= this.resources.length) {
      index = 0;
    }
    this.activeResourceIndex = index;
    for (var i = 0; i < this.resourceTabs.length; i++) {
      var tabBtn = this.resourceTabs[i];
      var isActive = i === index;
      toggleClass(tabBtn, 'ew-active', isActive);
      tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
    if (this.resourceListEl && this.resourceTabs[index]) {
      this.resourceListEl.setAttribute('aria-labelledby', this.resourceTabs[index].id);
    }
    this.renderResourceCategory(this.resources[index]);
  };

  EditorInstance.prototype.renderResourceCategory = function (category) {
    if (!this.resourceListEl) {
      return;
    }
    while (this.resourceListEl.firstChild) {
      this.resourceListEl.removeChild(this.resourceListEl.firstChild);
    }
    if (!category) {
      this.resourceListEl.appendChild(createElement('div', 'ew-resource-empty', 'No resources configured.'));
      return;
    }
    if (category.description) {
      var desc = createElement('p', 'ew-resource-description', category.description);
      this.resourceListEl.appendChild(desc);
    }
    var groups = category.groups && category.groups.length ? category.groups : null;
    if (groups) {
      for (var i = 0; i < groups.length; i++) {
        this.renderResourceGroup(groups[i]);
      }
    } else {
      var list = createElement('div', 'ew-resource-items ew-resource-items--root');
      this.renderResourceItems(list, category.items);
      this.resourceListEl.appendChild(list);
    }
  };

  EditorInstance.prototype.renderResourceGroup = function (group) {
    var groupEl = createElement('div', 'ew-resource-group');
    var toggleBtn = createElement('button', 'ew-resource-group-toggle', group.label || 'Group');
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', group.collapsed ? 'false' : 'true');
    groupEl.appendChild(toggleBtn);
    var itemsWrap = createElement('div', 'ew-resource-items');
    groupEl.appendChild(itemsWrap);
    if (group.description) {
      var subDesc = createElement('p', 'ew-resource-group-desc', group.description);
      itemsWrap.appendChild(subDesc);
    }
    this.renderResourceItems(itemsWrap, group.items);
    if (group.collapsed) {
      toggleClass(groupEl, 'ew-collapsed', true);
    }
    var self = this;
    toggleBtn.onclick = function () {
      var isCollapsed = groupEl.className.indexOf('ew-collapsed') !== -1;
      isCollapsed = !isCollapsed;
      toggleClass(groupEl, 'ew-collapsed', isCollapsed);
      toggleBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    };
    this.resourceListEl.appendChild(groupEl);
  };

  EditorInstance.prototype.renderResourceItems = function (container, items) {
    if (!items || !items.length) {
      container.appendChild(createElement('div', 'ew-resource-empty', 'No snippets available.'));
      return;
    }
    var self = this;
    for (var i = 0; i < items.length; i++) {
      (function (item) {
        var label = item.label || item.snippet;
        var btn = createElement('button', 'ew-resource-item', label);
        btn.type = 'button';
        if (item.description) {
          btn.setAttribute('title', item.description);
        }
        btn.onclick = function () {
          self.insertResourceSnippet(item);
        };
        container.appendChild(btn);
      }(items[i]));
    }
  };

  EditorInstance.prototype.insertResourceSnippet = function (item) {
    if (!item) {
      return;
    }
    var snippet = typeof item.snippet === 'string' ? item.snippet : (item.label || '');
    if (!snippet) {
      return;
    }
    if (this.cm && typeof this.cm.replaceSelection === 'function') {
      this.cm.focus();
      if (this.cm.getDoc && typeof this.cm.getDoc === 'function') {
        this.cm.getDoc().replaceSelection(snippet);
      } else {
        this.cm.replaceSelection(snippet);
      }
    } else {
      var existing = this.options.value || '';
      this.options.value = existing + snippet;
    }
  };

  EditorInstance.prototype.setupSplitter = function () {
    if (!this.options.resizable) {
      addClass(this.splitter, 'ew-disabled');
      return;
    }
    var self = this;
    var onMouseMove = function (event) {
      if (!self.isDragging) {
        return;
      }
      var bounds = self.rootEl.getBoundingClientRect();
      var offset = event.clientY - bounds.top;
      var ratio = offset / bounds.height;
      if (ratio < 0.15) {
        ratio = 0.15;
      } else if (ratio > 0.85) {
        ratio = 0.85;
      }
      self.applySplitRatio(ratio);
      self.persistSplitRatio();
    };
    var onMouseUp = function () {
      if (!self.isDragging) {
        return;
      }
      self.isDragging = false;
      removeClass(self.rootEl, 'ew-resizing');
      self.document.removeEventListener('mousemove', onMouseMove);
      self.document.removeEventListener('mouseup', onMouseUp);
    };
    var onMouseDown = function (event) {
      event.preventDefault();
      self.isDragging = true;
      addClass(self.rootEl, 'ew-resizing');
      self.document.addEventListener('mousemove', onMouseMove);
      self.document.addEventListener('mouseup', onMouseUp);
    };
    this.splitter.addEventListener('mousedown', onMouseDown);
    this.dragHandlers = { onMouseDown: onMouseDown, onMouseMove: onMouseMove, onMouseUp: onMouseUp };
  };

  EditorInstance.prototype.applySplitRatio = function (ratio) {
    this.splitRatio = ratio;
    var editorHeight = Math.max(0.05, Math.min(0.95, ratio));
    var consoleHeight = 1 - editorHeight;
    this.editorWrap.style.flexBasis = (editorHeight * 100) + '%';
    this.consoleWrap.style.flexBasis = (consoleHeight * 100) + '%';
    if (this.cm) {
      this.cm.refresh();
    }
  };

  EditorInstance.prototype.persistSplitRatio = function () {
    if (this.persistKey) {
      updatePersistedState(this.persistKey, { splitRatio: this.splitRatio });
    }
  };

  EditorInstance.prototype.initEditor = function () {
    var CodeMirrorConstructor = root.CodeMirror;
    if (!CodeMirrorConstructor || typeof CodeMirrorConstructor !== 'function') {
      var warning = createElement('div', 'ew-warning', 'CodeMirror 5.51.0 is required.');
      this.editorHost.appendChild(warning);
      return;
    }
    var self = this;
    var cmOptions = {
      value: this.options.value || '',
      mode: this.options.mode || 'javascript',
      theme: this.options.theme || 'default',
      readOnly: !!this.options.readOnly,
      lineNumbers: this.options.lineNumbers !== false,
      lineWrapping: this.options.lineWrapping !== false,
      gutters: this.options.gutters || ['CodeMirror-linenumbers', 'CodeMirror-foldgutter']
    };
    if (this.options.enableBasicAddons) {
      cmOptions.matchBrackets = true;
      cmOptions.autoCloseBrackets = true;
      cmOptions.styleActiveLine = true;
    }
    if (this.options.enableFolding) {
      cmOptions.foldGutter = true;
    }
    this.cm = CodeMirrorConstructor(this.editorHost, cmOptions);
    this.cmChangeHandler = function () {
      if (self.persistKey && self.options.persist && self.options.persistEditorValue !== false) {
        updatePersistedState(self.persistKey, { editorValue: self.cm.getValue() });
      }
    };
    this.cm.on('change', this.cmChangeHandler);
    this.cmKeyDownHandler = this.handleEditorKeyDown.bind(this);
    this.cm.on('keydown', this.cmKeyDownHandler);
    this.initLint();
  };

  EditorInstance.prototype.initConsole = function () {
    this.setCaptureGlobalConsole(!!this.options.captureGlobalConsole);
    this.publicAPI = this.createPublicAPI();
    this.setConsoleVisible(this.consoleState.visible, true);
  };

  EditorInstance.prototype.initLint = function () {
    if (this.options.enableLint === false || !this.cm) {
      this.updateLintButton();
      return;
    }
    if (this.isLintEnvironmentReady()) {
      this.lintAvailable = true;
      this.setLintActive(true, true);
    } else {
      this.lintAvailable = false;
      this.setLintActive(false, true);
    }
    this.updateLintButton();
  };

  EditorInstance.prototype.isLintEnvironmentReady = function () {
    return !!(root.CodeMirror && root.CodeMirror.lint && root.CodeMirror.lint.javascript);
  };

  EditorInstance.prototype.toggleLint = function () {
    if (this.options.enableLint === false) {
      return;
    }
    if (!this.lintAvailable) {
      return;
    }
    this.setLintActive(!this.lintEnabled);
  };

  EditorInstance.prototype.setLintActive = function (state, suppressUpdate) {
    if (!this.cm || !this.lintAvailable) {
      this.lintEnabled = false;
      this.cm && this.cm.setOption('lint', false);
      if (!suppressUpdate) {
        this.updateLintButton();
      }
      return;
    }
    this.lintEnabled = !!state;
    if (this.lintEnabled) {
      this.ensureLintGutter();
      var lintOptions = this.options.lintOptions;
      if (!lintOptions) {
        lintOptions = { esversion: 6 };
      }
      this.cm.setOption('lint', lintOptions);
    } else {
      this.cm.setOption('lint', false);
    }
    if (!suppressUpdate) {
      this.updateLintButton();
    }
  };

  EditorInstance.prototype.ensureLintGutter = function () {
    if (!this.cm) {
      return;
    }
    var gutters = this.cm.getOption('gutters') || [];
    if (gutters.indexOf('CodeMirror-lint-markers') === -1) {
      gutters = gutters.concat(['CodeMirror-lint-markers']);
      this.cm.setOption('gutters', gutters);
    }
  };

  EditorInstance.prototype.updateLintButton = function () {
    if (!this.lintButton) {
      return;
    }
    if (!this.options.enableLint) {
      this.lintButton.disabled = true;
      this.lintButton.title = 'Linting disabled via configuration';
      this.lintButton.textContent = 'Lint';
      this.lintButton.setAttribute('aria-pressed', 'false');
      return;
    }
    if (!this.lintAvailable) {
      this.lintButton.disabled = true;
      this.lintButton.title = 'Load CodeMirror lint addons and JSHINT to enable linting';
      this.lintButton.setAttribute('aria-pressed', 'false');
      this.lintButton.textContent = 'Lint';
      return;
    }
    this.lintButton.disabled = false;
    this.lintButton.title = 'Toggle real-time syntax checking';
    this.lintButton.setAttribute('aria-pressed', this.lintEnabled ? 'true' : 'false');
    this.lintButton.textContent = this.lintEnabled ? 'Lint On' : 'Lint Off';
  };

  EditorInstance.prototype.initDebug = function () {
    var self = this;
    this.errorHandler = function (type, payload) {
      if (!self.debugEnabled) {
        return;
      }
      var level = type === 'error' ? 'error' : 'warn';
      self.appendConsoleEntry(level, [payload.message, payload.stack || '']);
      self.showErrorOverlay(payload.message, payload.stack);
    };
    ErrorObserver.addListener(this.errorHandler);
    this.updateDebugBadge();
  };

  EditorInstance.prototype.applyInitialPersistence = function () {
    if (!this.persistKey || !this.options.persist) {
      return;
    }
    var state = loadPersistedState(this.persistKey);
    if (!state) {
      return;
    }
    if (typeof state.splitRatio === 'number') {
      this.applySplitRatio(state.splitRatio);
    }
    if (typeof state.consoleVisible === 'boolean') {
      this.setConsoleVisible(state.consoleVisible, true);
    }
    if (state.theme && this.cm) {
      this.setTheme(state.theme);
    }
    if (state.hasOwnProperty('editorValue') && this.cm && this.options.persistEditorValue !== false) {
      this.cm.setValue(state.editorValue);
    }
    if (state.ai) {
      this.restoreAIState(state.ai);
    }
  };

  EditorInstance.prototype.bindGlobalHandlers = function () {
    var self = this;
    this.keydownHandler = function (event) {
      var isMac = /Mac|iPod|iPhone|iPad/.test(root.navigator && root.navigator.platform);
      var key = event.key || event.keyCode;
      if (key === 'Escape' || key === 'Esc' || key === 27) {
        if (self.isAIPanelVisible && self.isAIPanelVisible()) {
          event.preventDefault();
          self.closeAIPanel();
        }
        return;
      }
      var ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      if (!ctrlKey) {
        return;
      }
      if (key === '/' || key === 191) {
        event.preventDefault();
        self.toggleComment();
      } else if (key === 'b' || key === 'B' || key === 66) {
        event.preventDefault();
        self.toggleConsoleVisibility();
      } else if (key === 'Enter' || key === 13) {
        event.preventDefault();
        self.runCode();
      } else if (key === 'f' || key === 'F' || key === 70) {
        event.preventDefault();
        self.openSearchPanel();
      } else if ((key === 'g' || key === 'G' || key === 71) && event.shiftKey && self.aiEnabled) {
        event.preventDefault();
        self.toggleAIPanel();
      }
    };
    this.rootEl.addEventListener('keydown', this.keydownHandler);
    this.keyHandlersBound = true;
  };

  EditorInstance.prototype.handleEditorKeyDown = function (cm, event) {
    var isMac = /Mac|iPod|iPhone|iPad/.test(root.navigator && root.navigator.platform);
    var ctrlKey = isMac ? event.metaKey : event.ctrlKey;
    if (!ctrlKey) {
      return;
    }
    if (event.key === 'F' && event.shiftKey) {
      event.preventDefault();
      this.findPrevious();
    } else if (event.keyCode === 70 && event.shiftKey) {
      event.preventDefault();
      this.findPrevious();
    }
  };

  EditorInstance.prototype.toggleComment = function () {
    if (!this.cm) {
      return;
    }
    if (typeof this.cm.toggleComment === 'function') {
      this.cm.toggleComment();
    } else if (this.cm.execCommand) {
      try {
        this.cm.execCommand('toggleComment');
      } catch (err) {
        /* ignore if addon missing */
      }
    }
  };

  EditorInstance.prototype.openSearchPanel = function () {
    if (!this.options.enableSearch) {
      return;
    }
    removeClass(this.searchPanel, 'ew-hidden');
    this.searchInput.focus();
  };

  EditorInstance.prototype.closeSearchPanel = function () {
    addClass(this.searchPanel, 'ew-hidden');
    if (this.cm) {
      this.cm.focus();
    }
  };

  EditorInstance.prototype.findNext = function () {
    if (!this.cm || !this.searchInput) {
      return;
    }
    var query = this.searchInput.value;
    if (!query) {
      return;
    }
    if (typeof this.cm.execCommand === 'function' && this.cm.getSearchCursor) {
      try {
        var cursor = this.cm.getSearchCursor(query, this.cm.getCursor());
        if (!cursor.findNext()) {
          cursor = this.cm.getSearchCursor(query, { line: 0, ch: 0 });
          cursor.findNext();
        }
        this.cm.setSelection(cursor.from(), cursor.to());
        this.cm.scrollIntoView({ from: cursor.from(), to: cursor.to() });
      } catch (err) {
        /* ignore */
      }
    } else if (typeof this.cm.execCommand === 'function') {
      try {
        this.cm.execCommand('findNext');
      } catch (err) {
        /* ignore */
      }
    }
  };

  EditorInstance.prototype.findPrevious = function () {
    if (!this.cm || !this.searchInput) {
      return;
    }
    var query = this.searchInput.value;
    if (!query) {
      return;
    }
    if (typeof this.cm.execCommand === 'function' && this.cm.getSearchCursor) {
      try {
        var cursor = this.cm.getSearchCursor(query, this.cm.getCursor());
        if (!cursor.findPrevious()) {
          cursor = this.cm.getSearchCursor(query, { line: this.cm.lineCount() - 1, ch: 0 });
          cursor.findPrevious();
        }
        this.cm.setSelection(cursor.from(), cursor.to());
        this.cm.scrollIntoView({ from: cursor.from(), to: cursor.to() });
      } catch (err) {
        /* ignore */
      }
    } else if (typeof this.cm.execCommand === 'function') {
      try {
        this.cm.execCommand('findPrev');
      } catch (err) {
        /* ignore */
      }
    }
  };

  EditorInstance.prototype.runCode = function () {
    if (!this.cm) {
      return;
    }
    var code = this.cm.getValue();
    try {
      var result = new Function(code)();
      if (typeof result !== 'undefined') {
        this.appendConsoleEntry('info', ['Result:', safeSerialize(result)]);
      }
    } catch (err) {
      this.appendConsoleEntry('error', [err.message, err.stack || '']);
      this.showErrorOverlay(err.message, err.stack || '');
    }
  };

  EditorInstance.prototype.handleFilterToggle = function (level) {
    this.consoleState.filters[level] = !this.consoleState.filters[level];
    this.updateFilterButtons();
    this.applyFilters();
  };

  EditorInstance.prototype.togglePause = function () {
    this.consoleState.paused = !this.consoleState.paused;
    if (this.pauseButton) {
      this.pauseButton.setAttribute('aria-pressed', this.consoleState.paused ? 'true' : 'false');
      toggleClass(this.pauseButton, 'ew-off', this.consoleState.paused);
    }
    if (!this.consoleState.paused && this.pausedBuffer.length) {
      for (var i = 0; i < this.pausedBuffer.length; i++) {
        this.appendConsoleEntry(this.pausedBuffer[i].level, this.pausedBuffer[i].args, this.pausedBuffer[i].timestamp);
      }
      this.pausedBuffer = [];
    }
  };

  EditorInstance.prototype.toggleWrap = function () {
    this.consoleState.wrap = !this.consoleState.wrap;
    if (this.wrapButton) {
      this.wrapButton.setAttribute('aria-pressed', this.consoleState.wrap ? 'true' : 'false');
      toggleClass(this.wrapButton, 'ew-off', !this.consoleState.wrap);
    }
    toggleClass(this.consoleEntriesEl, 'ew-wrap', this.consoleState.wrap);
  };

  EditorInstance.prototype.clearConsole = function () {
    this.consoleEntries = [];
    this.pausedBuffer = [];
    while (this.consoleEntriesEl.firstChild) {
      this.consoleEntriesEl.removeChild(this.consoleEntriesEl.firstChild);
    }
  };

  EditorInstance.prototype.copyConsole = function () {
    var text = getPlainText(this.consoleEntries);
    if (!text) {
      return;
    }
    var nav = root.navigator;
    if (nav && nav.clipboard && nav.clipboard.writeText) {
      nav.clipboard.writeText(text);
      return;
    }
    var textarea = createElement('textarea', '');
    textarea.value = text;
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.position = 'absolute';
    textarea.style.left = '-10000px';
    this.rootEl.appendChild(textarea);
    textarea.select();
    try {
      this.document.execCommand('copy');
    } catch (err) {
      /* ignore */
    }
    this.rootEl.removeChild(textarea);
  };

  EditorInstance.prototype.downloadConsole = function () {
    this.downloadConsoleWithName('console-output.txt');
  };

  EditorInstance.prototype.setConsoleVisible = function (visible, skipPersist) {
    var next = typeof visible === 'boolean' ? visible : true;
    var changed = this.consoleState.visible !== next;
    this.consoleState.visible = next;
    if (this.consoleWrap) {
      toggleClass(this.consoleWrap, 'ew-hidden', !next);
    }
    if (this.splitter) {
      toggleClass(this.splitter, 'ew-hidden', !next);
    }
    if (this.consoleVisibilityButton) {
      this.consoleVisibilityButton.setAttribute('aria-pressed', next ? 'true' : 'false');
      toggleClass(this.consoleVisibilityButton, 'ew-off', !next);
    }
    if (changed && this.persistKey && !skipPersist) {
      updatePersistedState(this.persistKey, { consoleVisible: next });
    }
    if (next) {
      this.applySplitRatio(this.splitRatio);
    } else if (this.cm) {
      this.cm.refresh();
    }
  };

  EditorInstance.prototype.toggleConsoleVisibility = function () {
    this.setConsoleVisible(!this.consoleState.visible);
  };

  EditorInstance.prototype.updateFilterButtons = function () {
    var buttons = this.consoleWrap.querySelectorAll('button[data-level]');
    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var level = btn.getAttribute('data-level');
      var active = this.consoleState.filters[level];
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
      if (active) {
        removeClass(btn, 'ew-off');
      } else {
        addClass(btn, 'ew-off');
      }
    }
  };

  EditorInstance.prototype.applyFilters = function () {
    var children = this.consoleEntriesEl.children;
    for (var i = 0; i < children.length; i++) {
      var entryEl = children[i];
      var level = entryEl.getAttribute('data-level');
      var visible = !!this.consoleState.filters[level];
      toggleClass(entryEl, 'ew-hidden', !visible);
    }
  };

  EditorInstance.prototype.handleConsoleEntry = function (entry) {
    if (this.consoleState.paused) {
      this.pausedBuffer.push(entry);
      return;
    }
    this.appendConsoleEntry(entry.level, entry.args, entry.timestamp);
  };

  EditorInstance.prototype.appendConsoleEntry = function (level, args, timestamp) {
    if (!args) {
      args = [];
    }
    if (!timestamp || !(timestamp instanceof Date)) {
      timestamp = new Date();
    }
    var serialized = [];
    for (var i = 0; i < args.length; i++) {
      serialized.push(safeSerialize(args[i]));
    }
    var entry = { level: level, args: serialized, timestamp: timestamp };
    this.consoleEntries.push(entry);
    if (this.consoleEntries.length > MAX_CONSOLE_ENTRIES) {
      this.consoleEntries.shift();
      if (this.consoleEntriesEl.firstChild) {
        this.consoleEntriesEl.removeChild(this.consoleEntriesEl.firstChild);
      }
    }
    var entryEl = createElement('div', 'ew-console-entry');
    entryEl.setAttribute('data-level', level);
    addClass(entryEl, 'ew-level-' + level);
    var meta = createElement('div', 'ew-console-meta', '[' + formatTimestamp(timestamp) + '] ' + level.toUpperCase());
    var body = createElement('div', 'ew-console-body');
    if (this.consoleState.wrap) {
      addClass(body, 'ew-wrap');
    }
    for (var j = 0; j < serialized.length; j++) {
      var argEl = createElement('pre', 'ew-console-arg');
      argEl.textContent = serialized[j];
      body.appendChild(argEl);
    }
    entryEl.appendChild(meta);
    entryEl.appendChild(body);
    if (!this.consoleState.filters[level]) {
      addClass(entryEl, 'ew-hidden');
    }
    this.consoleEntriesEl.appendChild(entryEl);
    this.consoleEntriesEl.scrollTop = this.consoleEntriesEl.scrollHeight;
  };

  EditorInstance.prototype.createPublicAPI = function () {
    var self = this;
    var api = {
      getValue: function () {
        return self.cm ? self.cm.getValue() : '';
      },
      setValue: function (code) {
        if (self.cm) {
          self.cm.setValue(code == null ? '' : String(code));
        }
      },
      setMode: function (mode) {
        self.setMode(mode);
      },
      setTheme: function (theme) {
        self.setTheme(theme);
      },
      setReadOnly: function (value) {
        if (self.cm) {
          self.cm.setOption('readOnly', !!value);
        }
      },
      setCaptureGlobalConsole: function (value) {
        self.setCaptureGlobalConsole(value);
      },
      getOption: function (key) {
        if (!key) {
          return undefined;
        }
        return Object.prototype.hasOwnProperty.call(self.options, key) ? self.options[key] : undefined;
      },
      focus: function () {
        if (self.cm) {
          self.cm.focus();
        }
      },
      format: function () {
        self.format();
      },
      dispose: function () {
        self.dispose();
      },
      console: {
        clear: function () { self.clearConsole(); },
        copyToClipboard: function () { self.copyConsole(); },
        download: function (filename) {
          if (filename) {
            self.downloadConsoleWithName(filename);
          } else {
            self.downloadConsole();
          }
        },
        filter: function (filters) {
          self.setConsoleFilters(filters);
        },
        setVisible: function (value) {
          self.setConsoleVisible(value);
        },
        setCapture: function (value) {
          self.setCaptureGlobalConsole(value);
        },
        pause: function (value) {
          if (typeof value === 'boolean') {
            if (self.consoleState.paused !== value) {
              self.togglePause();
            }
          } else {
            self.togglePause();
          }
        }
      },
      debug: {
        enable: function () { self.setDebugEnabled(true); },
        disable: function () { self.setDebugEnabled(false); },
        mark: function (label) { return self.mark(label); },
        measure: function (start, end) { return self.measure(start, end); },
        count: function (label) { return self.count(label); },
        resetCounts: function () { self.resetCounts(); },
        isEnabled: function () { return !!self.debugEnabled; }
      },
      lint: {
        enable: function () {
          if (self.isLintEnvironmentReady()) {
            self.lintAvailable = true;
            self.setLintActive(true);
          }
        },
        disable: function () { self.setLintActive(false); },
        toggle: function () { self.toggleLint(); },
        isEnabled: function () { return !!self.lintEnabled && !!self.lintAvailable; }
      }
    };
    api.__instance = self;
    return api;
  };

  EditorInstance.prototype.format = function () {
    if (!this.cm) {
      return;
    }
    var cm = this.cm;
    cm.operation(function () {
      var lineCount = cm.lineCount();
      for (var i = 0; i < lineCount; i++) {
        cm.indentLine(i, 'smart');
      }
    });
  };

  EditorInstance.prototype.downloadConsoleWithName = function (filename) {
    var text = getPlainText(this.consoleEntries);
    if (!text) {
      return;
    }
    var targetName = filename || 'console-output.txt';
    if (root.Blob && root.URL && root.URL.createObjectURL) {
      var blob = new Blob([text], { type: 'text/plain' });
      var url = root.URL.createObjectURL(blob);
      var link = createElement('a', '');
      link.style.display = 'none';
      link.href = url;
      link.download = targetName;
      this.rootEl.appendChild(link);
      link.click();
      this.rootEl.removeChild(link);
      setTimeout(function () {
        root.URL.revokeObjectURL(url);
      }, 0);
      return;
    }
    var dataUri = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    var anchor = createElement('a', '');
    anchor.style.display = 'none';
    anchor.href = dataUri;
    anchor.download = targetName;
    this.rootEl.appendChild(anchor);
    anchor.click();
    this.rootEl.removeChild(anchor);
  };

  EditorInstance.prototype.setConsoleFilters = function (filters) {
    if (!filters) {
      return;
    }
    var hasChanges = false;
    for (var level in this.consoleState.filters) {
      if (this.consoleState.filters.hasOwnProperty(level)) {
        var newVal = typeof filters[level] === 'boolean' ? filters[level] : this.consoleState.filters[level];
        if (this.consoleState.filters[level] !== newVal) {
          hasChanges = true;
          this.consoleState.filters[level] = newVal;
        }
      }
    }
    if (hasChanges) {
      this.updateFilterButtons();
      this.applyFilters();
    }
  };

  EditorInstance.prototype.setCaptureGlobalConsole = function (enabled) {
    var desired = !!enabled;
    if (desired && !this.consoleListenerToken) {
      this.consoleListenerToken = ConsoleHook.addListener(this.handleConsoleEntry.bind(this));
    } else if (!desired && this.consoleListenerToken) {
      ConsoleHook.removeListener(this.consoleListenerToken);
      this.consoleListenerToken = null;
    }
    this.options.captureGlobalConsole = desired;
  };

  EditorInstance.prototype.setDebugEnabled = function (state) {
    this.debugEnabled = !!state;
    if (!this.debugEnabled) {
      this.hideErrorOverlay();
      this.countBadgeEl.textContent = '';
      this.countBadgeEl.style.display = 'none';
    } else {
      this.updateDebugBadge();
    }
  };

  EditorInstance.prototype.mark = function (label) {
    if (!label) {
      return;
    }
    var now = root.performance && root.performance.now ? root.performance.now() : new Date().getTime();
    this.debugMarks[label] = now;
    return now;
  };

  EditorInstance.prototype.measure = function (start, end) {
    if (!start || !end) {
      return null;
    }
    var startTime = this.debugMarks[start];
    var endTime = this.debugMarks[end];
    if (typeof startTime !== 'number' || typeof endTime !== 'number') {
      return null;
    }
    var delta = endTime - startTime;
    this.appendConsoleEntry('info', ['Measurement', start + ' -> ' + end + ': ' + delta.toFixed(2) + 'ms']);
    return delta;
  };

  EditorInstance.prototype.count = function (label) {
    if (!label) {
      return 0;
    }
    if (!this.debugCounts[label]) {
      this.debugCounts[label] = 0;
    }
    this.debugCounts[label] += 1;
    this.updateDebugBadge();
    return this.debugCounts[label];
  };

  EditorInstance.prototype.resetCounts = function () {
    this.debugCounts = {};
    this.updateDebugBadge();
  };

  EditorInstance.prototype.updateDebugBadge = function () {
    if (!this.debugEnabled) {
      this.countBadgeEl.textContent = '';
      this.countBadgeEl.style.display = 'none';
      return;
    }
    var parts = [];
    for (var label in this.debugCounts) {
      if (this.debugCounts.hasOwnProperty(label)) {
        parts.push(label + ': ' + this.debugCounts[label]);
      }
    }
    if (parts.length === 0) {
      this.countBadgeEl.textContent = '';
      this.countBadgeEl.style.display = 'none';
    } else {
      this.countBadgeEl.textContent = parts.join(' | ');
      this.countBadgeEl.style.display = 'block';
    }
  };

  EditorInstance.prototype.showErrorOverlay = function (message, stack) {
    if (!this.debugEnabled) {
      return;
    }
    if (!message) {
      message = 'Unknown error';
    }
    this.errorOverlayMessageEl.textContent = message + (stack ? '\n\n' + stack : '');
    removeClass(this.errorOverlayEl, 'ew-hidden');
  };

  EditorInstance.prototype.hideErrorOverlay = function () {
    addClass(this.errorOverlayEl, 'ew-hidden');
  };

  EditorInstance.prototype.getValue = function () {
    return this.cm ? this.cm.getValue() : '';
  };

  EditorInstance.prototype.setValue = function (value) {
    if (this.cm) {
      this.cm.setValue(value);
    }
    this.options.value = value;
  };

  EditorInstance.prototype.setTheme = function (theme) {
    if (!this.cm) {
      return;
    }
    var selected = theme || 'default';
    this.cm.setOption('theme', selected);
    this.options.theme = selected;
    if (this.persistKey) {
      updatePersistedState(this.persistKey, { theme: selected });
    }
  };

  EditorInstance.prototype.setMode = function (mode) {
    var selected = mode || 'javascript';
    if (this.cm) {
      this.cm.setOption('mode', selected);
    }
    this.options.mode = selected;
  };

  EditorInstance.prototype.dispose = function () {
    this.setLintActive(false, true);
    this.setCaptureGlobalConsole(false);
    if (this.aiStatusTimeout) {
      root.clearTimeout(this.aiStatusTimeout);
      this.aiStatusTimeout = null;
    }
    if (this.errorHandler) {
      ErrorObserver.removeListener(this.errorHandler);
      this.errorHandler = null;
    }
    if (this.cm) {
      if (this.cmChangeHandler && typeof this.cm.off === 'function') {
        this.cm.off('change', this.cmChangeHandler);
      }
      if (this.cmKeyDownHandler && typeof this.cm.off === 'function') {
        this.cm.off('keydown', this.cmKeyDownHandler);
      }
      var wrapper = this.cm.getWrapperElement ? this.cm.getWrapperElement() : null;
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      this.cm = null;
      this.cmChangeHandler = null;
      this.cmKeyDownHandler = null;
    }
    if (this.keyHandlersBound) {
      this.rootEl.removeEventListener('keydown', this.keydownHandler);
      this.keyHandlersBound = false;
    }
    if (this.dragHandlers && this.splitter) {
      this.splitter.removeEventListener('mousedown', this.dragHandlers.onMouseDown);
      this.document.removeEventListener('mousemove', this.dragHandlers.onMouseMove);
      this.document.removeEventListener('mouseup', this.dragHandlers.onMouseUp);
      this.dragHandlers = null;
    }
    if (this.rootEl && this.rootEl.parentNode) {
      this.rootEl.parentNode.removeChild(this.rootEl);
    }
    this.restoreOriginalChildren();
    delete instancesById[this.id];
    this.container.__editorWidget = null;
  };

  function mount(container, options) {
    var opts = mergeOptions(options);
    if (opts.persist) {
      if (!opts.persistKey || opts.persistKey === 'default') {
        if (container && container.getAttribute && container.getAttribute('data-ew-key')) {
          opts.persistKey = String(container.getAttribute('data-ew-key'));
        } else if (container && container.id) {
          opts.persistKey = 'element:' + container.id;
        } else {
          opts.persistKey = 'instance:' + (instanceIdCounter + 1);
        }
      }
    }
    var instance = new EditorInstance(container, opts);
    instancesById[instance.id] = instance;
    container.__editorWidget = instance;
    return instance.publicAPI;
  }

  function unmount(instanceApi) {
    if (!instanceApi) {
      return;
    }
    var instance = instanceApi.__instance || null;
    if (!instance) {
      return;
    }
    instance.dispose();
  }

  return {
    mount: mount,
    unmount: unmount,
    version: VERSION,
    defaults: {
      resources: cloneResourceDefinitions(BASE_RESOURCES),
      aiProviders: cloneAIProviders(DEFAULT_AI_PROVIDERS)
    }
  };
}));
