/**
 * LEAP Color Separator file logger → ~/Documents/LEAP Settings/Logs/LEAP_Seps/<YYYY-MM-DD>.log
 * One file per LOCAL day (the date is re-evaluated on every write, so the file rolls at midnight
 * without a restart). Replaces the single ever-growing leap_seps.log.
 * API: window.leapSepsWrite(level, category, message, detail?)
 *       window.installLeapSepsFileLogger()
 */
(function (global) {
 if (global.__LEAP_SEPS_FILE_LOGGER__) {
  return;
 }
 global.__LEAP_SEPS_FILE_LOGGER__ = true;

 var installed = false;
 var installAttempts = 0;
 var MAX_INSTALL_ATTEMPTS = 100;
 var LOG_SUBFOLDER = 'LEAP_Seps';
 var pendingLines = [];

 /* Local calendar date as YYYY-MM-DD — local, not UTC, so a file's name matches the day the user
    actually worked (an evening session must not land in "tomorrow's" file). */
 function padRight(text, width) {
  var t = String(text == null ? '' : text);
  while (t.length < width) t += ' ';
  return t;
 }

 function localTimeStamp() {
  var d = new Date();
  var hh = String(d.getHours()), mi = String(d.getMinutes()), ss = String(d.getSeconds());
  var ms = String(d.getMilliseconds());
  while (ms.length < 3) ms = '0' + ms;
  return (hh.length < 2 ? '0' + hh : hh) + ':' + (mi.length < 2 ? '0' + mi : mi) + ':' +
   (ss.length < 2 ? '0' + ss : ss) + '.' + ms;
 }

 function localDateStamp() {
  var d = new Date();
  var mm = String(d.getMonth() + 1);
  var dd = String(d.getDate());
  return d.getFullYear() + '-' + (mm.length < 2 ? '0' + mm : mm) + '-' + (dd.length < 2 ? '0' + dd : dd);
 }
 var MAX_PENDING = 500;

 function getFsPath() {
  try {
   if (!global.cep_node || !global.cep_node.require) return null;
   var os = global.cep_node.require('os');
   var path = global.cep_node.require('path');
   var home = os.homedir();
   var logDir = path.join(home, 'Documents', 'LEAP Settings', 'Logs', LOG_SUBFOLDER);
   var logPath = path.join(logDir, localDateStamp() + '.log');
   return { fs: global.cep_node.require('fs'), path: path, logDir: logDir, logPath: logPath };
  } catch (e) {
   return null;
  }
 }

 var MAX_DETAIL_CHARS = 280;
 var OMIT_DETAIL_KEYS = {
  bodyColorData: 1,
  batchVariableSource: 1,
  profileMetadata: 1,
  graphicAssets: 1,
  cadPlacementDebug: 1,
  savePathsDebug: 1,
  colorCodes: 1,
  fields: 1,
  cmyk: 1,
  rgb: 1,
  tried: 1,
  cadPngTriedPaths: 1,
  steps: 1,
  inkExceptions: 1,
  rows: 1,
  data: 1,
  excel: 1,
  swatches: 1
 };

 function compactValue(value, depth) {
  if (value === undefined || value === null) return value;
  if (typeof value === 'string') {
   if (value.length > MAX_DETAIL_CHARS) {
    return value.slice(0, MAX_DETAIL_CHARS) + '…';
   }
   return value;
  }
  if (typeof value !== 'object') return value;
  if (depth > 2) return '[…]';
  if (Array.isArray(value)) {
   if (value.length > 8) {
    return value.slice(0, 8).map(function (v) {
     return compactValue(v, depth + 1);
    }).concat(['…+' + (value.length - 8)]);
   }
   return value.map(function (v) {
    return compactValue(v, depth + 1);
   });
  }
  var out = {};
  var keys = Object.keys(value);
  for (var k = 0; k < keys.length; k++) {
   var key = keys[k];
   if (OMIT_DETAIL_KEYS[key]) {
    if (Array.isArray(value[key])) {
     out[key] = '[' + value[key].length + ' items]';
    } else if (value[key] && typeof value[key] === 'object') {
     out[key] = '{…}';
    } else {
     out[key] = '…';
    }
    continue;
   }
   out[key] = compactValue(value[key], depth + 1);
  }
  return out;
 }

 function formatDetail(detail) {
  if (detail === undefined || detail === null) return '';
  if (typeof detail === 'string') {
   if (detail.length > MAX_DETAIL_CHARS) {
    if (detail.charAt(0) === '{' || detail.charAt(0) === '[') {
     try {
      return formatDetail(JSON.parse(detail));
     } catch (parseErr) {
      return detail.slice(0, MAX_DETAIL_CHARS) + '…';
     }
    }
    return detail.slice(0, MAX_DETAIL_CHARS) + '…';
  }
  return detail;
  }
  try {
   var compact = compactValue(detail, 0);
   var text = JSON.stringify(compact);
   if (text.length > MAX_DETAIL_CHARS) {
    return text.slice(0, MAX_DETAIL_CHARS) + '…';
   }
   return text;
  } catch (e) {
   try {
    return String(detail).slice(0, MAX_DETAIL_CHARS);
   } catch (e2) {
    return '[unserializable]';
   }
  }
 }

 function compactConsoleMessage(msg) {
  if (!msg || msg.length < MAX_DETAIL_CHARS) return msg;
  var jsonStart = msg.indexOf('{');
  if (jsonStart === -1) {
   return msg.slice(0, MAX_DETAIL_CHARS) + '…';
  }
  var prefix = msg.slice(0, jsonStart).trim();
  var jsonPart = msg.slice(jsonStart);
  try {
   var parsed = JSON.parse(jsonPart);
   return prefix + (prefix ? ' ' : '') + formatDetail(parsed);
  } catch (e) {
   return msg.slice(0, MAX_DETAIL_CHARS) + '…';
  }
 }

 /*
  * Repeat collapsing. A poller or a retry loop can emit the SAME line many times a second; instead
  * of writing each one, identical consecutive lines are counted and flushed as one line with
  * "(×N)" when a different line arrives (or after REPEAT_FLUSH_MS). Errors are never collapsed —
  * every one is written. Content is unchanged; only the duplicate count is folded.
  */
 var REPEAT_FLUSH_MS = 5000;
 var lastKey = '';
 var lastLevel = '';
 var lastRepeat = 0;
 var lastFirstStamp = '';
 var repeatTimer = null;

 function flushRepeat(ctx) {
  if (lastRepeat > 1 && ctx) {
   try {
    var note = lastFirstStamp + '  ' + padRight(lastLevel, 7) + ' ' + padRight('Logger', 16) +
     '  \u2191 previous line repeated ' + lastRepeat + '\u00d7\n';
    ctx.fs.appendFileSync(ctx.logPath, note, 'utf8');
   } catch (eFlush) { }
  }
  lastKey = ''; lastRepeat = 0; lastLevel = ''; lastFirstStamp = '';
  if (repeatTimer) { clearTimeout(repeatTimer); repeatTimer = null; }
 }

 function writeLine(level, category, message, detail) {
  var ctx = getFsPath();
  if (!ctx) return false;
  try {
   var lvl = String(level || 'LOG');
   var repeatKey = lvl + '|' + (category || '') + '|' + (message || '') + '|' + formatDetail(detail);
   if (lvl !== 'ERROR' && repeatKey === lastKey) {
    lastRepeat++;
    if (!repeatTimer) {
     repeatTimer = setTimeout(function () { flushRepeat(getFsPath()); }, REPEAT_FLUSH_MS);
    }
    return true;
   }
   flushRepeat(ctx);
   lastKey = repeatKey; lastLevel = lvl; lastRepeat = 1; lastFirstStamp = localTimeStamp();
   if (!ctx.fs.existsSync(ctx.logDir)) {
    ctx.fs.mkdirSync(ctx.logDir, { recursive: true });
   }
   var cat = category ? String(category) : 'App';
   var msg = message != null ? String(message) : '';
   var extra = formatDetail(detail);
   /*
    * Line shape (readability only — same information, same order, nothing consumed by code):
    *   HH:MM:SS.mmm  LEVEL   Category        message  → detail
    * Local wall-clock time instead of ISO-Z (the file is already per-day, and "18:07Z" read as
    * evening to everyone looking at a 14:07 local session); fixed-width level and category so the
    * message column lines up and the eye can scan straight down for ERROR / WARN / EXPORT.
    */
   var line =
    localTimeStamp() + '  ' +
    padRight(String(level || 'LOG'), 7) + ' ' +
    padRight(cat, 16) + ' ' +
    msg +
    (extra ? '  \u2192 ' + extra : '') +
    '\n';
   ctx.fs.appendFileSync(ctx.logPath, line, 'utf8');
   return true;
  } catch (e) {
   try {
    if (global.console && global.console.error) {
     global.console.error('[leap_seps] write failed:', e.message || e, message);
    }
   } catch (ignore) {}
   return false;
  }
 }

 function flushPending() {
  while (pendingLines.length > 0) {
   var item = pendingLines[0];
   if (!writeLine(item.level, item.category, item.message, item.detail)) {
    break;
   }
   pendingLines.shift();
  }
 }

 function leapSepsWrite(level, category, message, detail) {
  if (!installed) {
   scheduleInstall();
  }
  if (!writeLine(level || 'LOG', category, message, detail)) {
   pendingLines.push({
    level: level || 'LOG',
    category: category,
    message: message,
    detail: detail
   });
   if (pendingLines.length > MAX_PENDING) {
    pendingLines.shift();
   }
  } else if (pendingLines.length > 0) {
   flushPending();
  }
  return true;
 }

 function scheduleInstall() {
  if (installed || installAttempts >= MAX_INSTALL_ATTEMPTS) return;
  installAttempts++;
  if (global.cep_node && global.cep_node.require) {
   installLeapSepsFileLogger();
   return;
  }
  setTimeout(scheduleInstall, 100);
 }

 function installLeapSepsFileLogger() {
  if (installed || global.__LEAP_SEPS_FILE_LOGGER_INSTALLED__) return;
  if (!global.cep_node || !global.cep_node.require) {
   scheduleInstall();
   return;
  }
  installed = true;
  global.__LEAP_SEPS_FILE_LOGGER_INSTALLED__ = true;

  var ctx = getFsPath();
  var logPath = ctx ? ctx.logPath : '(unknown)';

  try {
   if (ctx && !ctx.fs.existsSync(ctx.logDir)) {
    ctx.fs.mkdirSync(ctx.logDir, { recursive: true });
   }
   var d = new Date();
   var version = '';
   try { version = String(global.__LEAP_PANEL_VERSION__ || ''); } catch (eV) { }
   /* The banner is written when the logger installs, which can precede Angular setting the version;
      when it does, the panel logs its own "panel <version>" line right after ngOnInit instead. */
   var host = '';
   try { host = global.cep_node.require('os').hostname(); } catch (eH) { }
   var user = '';
   try { user = global.cep_node.require('os').userInfo().username; } catch (eU) { }
   var banner =
    '\n' +
    '================================================================================\n' +
    '  LEAP Color Separator \u2014 session started ' + localDateStamp() + ' ' + localTimeStamp() +
    (version ? '   (panel ' + version + ')' : '') + '\n' +
    (user || host ? '  User: ' + (user || '?') + '   Machine: ' + (host || '?') + '\n' : '') +
    '  Log:  ' + logPath + '\n' +
    '  Columns: time  level  category  message  \u2192 detail\n' +
    '================================================================================\n';
   if (ctx) {
    ctx.fs.appendFileSync(ctx.logPath, banner, 'utf8');
   }
  } catch (e) {}

  var origLog = global.console.log;
  var origWarn = global.console.warn;
  var origError = global.console.error;
  var origInfo = global.console.info;

  function argsToMessage(args) {
   var parts = [];
   for (var i = 0; i < args.length; i++) {
    parts.push(formatDetail(args[i]));
   }
   return compactConsoleMessage(parts.join(' '));
  }

  global.console.log = function () {
   writeLine('LOG', 'Console', argsToMessage(arguments), null);
   return origLog.apply(global.console, arguments);
  };
  global.console.warn = function () {
   writeLine('WARN', 'Console', argsToMessage(arguments), null);
   return origWarn.apply(global.console, arguments);
  };
  global.console.error = function () {
   writeLine('ERROR', 'Console', argsToMessage(arguments), null);
   return origError.apply(global.console, arguments);
  };
  if (origInfo) {
   global.console.info = function () {
    writeLine('INFO', 'Console', argsToMessage(arguments), null);
    return origInfo.apply(global.console, arguments);
   };
  }

  if (typeof global.addEventListener === 'function') {
   global.addEventListener('error', function (ev) {
    writeLine(
     'ERROR',
     'Window',
     'Uncaught error: ' + (ev.message || 'unknown'),
     ev.filename ? ev.filename + ':' + ev.lineno : null
    );
   });
   global.addEventListener('unhandledrejection', function (ev) {
    var reason = ev.reason;
    writeLine(
     'ERROR',
     'Promise',
     'Unhandled rejection',
     reason && reason.message ? reason.message : reason
    );
   });
  }

  writeLine('LOG', 'Logger', 'File logger installed', logPath);
  flushPending();
 }

 global.leapSepsWrite = leapSepsWrite;
 global.installLeapSepsFileLogger = installLeapSepsFileLogger;

 scheduleInstall();
})(typeof window !== 'undefined' ? window : global);
