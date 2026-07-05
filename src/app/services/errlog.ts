/**********************************************************************************************
 * errLogger.web.ts — near-real-time error capture for the MODERN (web-stack) CEP panels.
 * --------------------------------------------------------------------------------------------
 * Counterpart of errLogger.js (ES5 panels) / errLogger.jsx (ExtendScript). One copy per panel;
 * set PANEL at the top (NNP for NN-Pro, CSP for Color-Seps).
 *
 * Contract (differs from the ROI logger: errors POST IMMEDIATELY, not on next launch):
 *   - errLog(ctx, err, extra?)  — dev-added at key points. POSTs to /errlog within seconds.
 *   - errInit()                 — call once at panel bootstrap. Hooks window.onerror +
 *                                 unhandledrejection (auto-capture of uncaught bugs), starts
 *                                 the retry timer for errors queued while offline.
 *   - Throttled + deduped: identical (ctx,msg) within 2 min is counted, not re-sent;
 *     hard cap ~20 posts/min. A crashing loop cannot flood the server.
 *   - Everything guarded: error logging must NEVER break the panel.
 *********************************************************************************************/

// ---- per-panel config (the ONLY lines that differ between panels) -------------------------
const ERR_PANEL = { code: 'CSP', version: '1.0.1' };

const ERR_URL = 'https://versioncheck.slsplugins.com/errlog';
const ERR_SECRET = 'a3e7beb1dc72f4c181052c8605efb89a36b4eced764f3aae'; // matches server X-Secret

function errNodeReq(mod: string): any {
  try { return (window as any).cep_node?.require?.(mod) ?? null; } catch (e) { return null; }
}
function errPad(n: number): string { return (n < 10 ? '0' : '') + n; }
function errIso(d: Date): string {
  return d.getUTCFullYear() + '-' + errPad(d.getUTCMonth() + 1) + '-' + errPad(d.getUTCDate()) +
    'T' + errPad(d.getUTCHours()) + ':' + errPad(d.getUTCMinutes()) + ':' + errPad(d.getUTCSeconds()) + 'Z';
}
function errUser(): string { try { return errNodeReq('os')?.userInfo?.().username || 'unknown'; } catch (e) { return 'unknown'; } }
function errMachine(): string { try { return errNodeReq('os')?.hostname?.() || ''; } catch (e) { return ''; } }
let _errLb: string | null | undefined;
function errLb(): string {
  if (_errLb !== undefined) return _errLb || '';
  try {
    const os = errNodeReq('os'), fs = errNodeReq('fs'), path = errNodeReq('path');
    const p = path.join(os.homedir(), 'Documents', 'LEAP Settings', 'logobaseDataPathSettings.json');
    const base = JSON.parse(fs.readFileSync(p, 'utf8'))?.basePath || '';
    const parts = String(base).replace(/[\/\\]+$/, '').split(/[\/\\]/);
    _errLb = parts.length ? parts[parts.length - 1] : '';
  } catch (e) { _errLb = ''; }
  return _errLb || '';
}

// ---- throttle / dedup / offline queue ------------------------------------------------------
const _errSeen: Record<string, { at: number; count: number }> = {};
let _errMinuteCount = 0, _errMinuteStart = 0;
const _errPending: any[] = [];

function errPost(payload: any): void {
  try {
    fetch(ERR_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Secret': ERR_SECRET },
      body: JSON.stringify(payload),
    }).then((r) => { if (!r.ok) throw new Error('http ' + r.status); })
      .catch(() => { const list = payload.errors || [payload]; for (const e of list) if (_errPending.length < 100) _errPending.push(e); });
  } catch (e) {
    const list = payload.errors || [payload];
    for (const el of list) if (_errPending.length < 100) _errPending.push(el);
  }
}

/** Dev-added error capture. errLog('export.save', err, {team: 'ANA'}) — never throws. */
export function errLog(ctx: string, err?: any, extra?: Record<string, unknown>): void {
  try {
    const msg = err == null ? '' : (err.message ? String(err.message) : String(err));
    const stack = err && err.stack ? String(err.stack) : '';
    // dedup identical (ctx,msg) within 2 minutes
    const key = ctx + '|' + msg, now = Date.now();
    const seen = _errSeen[key];
    if (seen && now - seen.at < 120000) { seen.count++; return; }
    _errSeen[key] = { at: now, count: 0 };
    // hard cap ~20/min
    if (now - _errMinuteStart > 60000) { _errMinuteStart = now; _errMinuteCount = 0; }
    if (++_errMinuteCount > 20) return;
    const repeats = seen && seen.count ? { repeatsSuppressed: seen.count } : {};
    errPost({
      t: errIso(new Date()), lb: errLb(), u: errUser(),
      p: ERR_PANEL.code, pv: ERR_PANEL.version, machine: errMachine(),
      ctx: String(ctx || ''), msg, stack,
      extra: (extra || seen?.count) ? { ...(extra || {}), ...repeats } : undefined,
    });
  } catch (e) { /* never throws */ }
}

/** Call once at panel bootstrap: auto-capture + offline retry. Never throws. */
export function errInit(): void {
  try {
    window.addEventListener('error', (ev: any) => {
      errLog('uncaught', ev?.error || ev?.message || 'unknown error', ev?.filename ? { file: ev.filename, line: ev.lineno } : undefined);
    });
    window.addEventListener('unhandledrejection', (ev: any) => {
      errLog('unhandledrejection', ev?.reason || 'unknown rejection');
    });
    setInterval(() => {
      if (!_errPending.length) return;
      const batch = _errPending.splice(0, 25);
      errPost({ errors: batch });
    }, 60000);
  } catch (e) { /* never throws */ }
}
