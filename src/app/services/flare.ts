/**********************************************************************************************
 * flare.web.ts — "Flare" rapid-response bug reporting for the web-stack CEP panels (NN-Pro,
 * Color-Seps). Text-only v1: the user describes the problem; everything else is auto-attached.
 * --------------------------------------------------------------------------------------------
 * What it does:
 *   - Keeps a rolling in-memory trail of the panel's last 100 operations (breadcrumbs).
 *     · flareOp('job.start', {excel: 'DATA_002.xlsx'}) — add these at key points: job start/end,
 *       per-product render, export, template load, server calls. Cheap; call freely.
 *     · console.error / console.warn are tapped automatically (originals still fire).
 *   - flareSubmit(...) POSTs description + ops trail + machine/system context to the server.
 *     The report appears on the LEAP dashboard within seconds; war-time reports are flagged
 *     for immediate triage and an AI pre-analysis is attached for the dev before they look.
 *
 * Panel UI needed (minimal): a "Report Issue" button → textarea + War/Peace toggle → calls
 *   flareSubmit(text, severity, {job, tmpl}). Show ok/fail from the returned promise.
 *
 * One copy per panel; set FLARE_PANEL below. Same Node-https transport as roi.ts/errlog.ts
 * (remote-hosted panels: browser fetch is blocked by CEF web-security). Never throws.
 *********************************************************************************************/

// ---- per-panel config (the ONLY lines that differ between panels) -------------------------
const FLARE_PANEL = { code: 'CSP', version: '1.0.1' };

const FLARE_URL = 'https://versioncheck.slsplugins.com/flare';
const FLARE_SECRET = 'a3e7beb1dc72f4c181052c8605efb89a36b4eced764f3aae'; // same X-Secret as roi/errlog

// ---- helpers (same patterns as roi.ts / errlog.ts) ------------------------------------------
function flareNodeReq(mod: string): any {
  try { return (window as any).cep_node?.require?.(mod) ?? null; } catch (e) { return null; }
}
function flarePad(n: number): string { return (n < 10 ? '0' : '') + n; }
function flareIso(d: Date): string {
  return d.getUTCFullYear() + '-' + flarePad(d.getUTCMonth() + 1) + '-' + flarePad(d.getUTCDate()) +
    'T' + flarePad(d.getUTCHours()) + ':' + flarePad(d.getUTCMinutes()) + ':' + flarePad(d.getUTCSeconds()) + 'Z';
}
function flareUser(): string { try { return flareNodeReq('os')?.userInfo?.().username || 'unknown'; } catch (e) { return 'unknown'; } }
function flareMachine(): string { try { return flareNodeReq('os')?.hostname?.() || ''; } catch (e) { return ''; } }
let _flMid: string | undefined;
function flareMid(): string {
  if (_flMid !== undefined) return _flMid;
  try {
    const os = flareNodeReq('os'), fs = flareNodeReq('fs'), path = flareNodeReq('path');
    const p = path.join(os.homedir(), 'Documents', 'LEAP Settings', 'leap_machine.json');
    _flMid = fs.existsSync(p) ? String(JSON.parse(fs.readFileSync(p, 'utf8'))?.id || '') : '';
  } catch (e) { _flMid = ''; }
  return _flMid;
}
let _flLb: string | undefined;
function flareLb(): string {
  if (_flLb !== undefined) return _flLb;
  try {
    const os = flareNodeReq('os'), fs = flareNodeReq('fs'), path = flareNodeReq('path');
    const p = path.join(os.homedir(), 'Documents', 'LEAP Settings', 'logobaseDataPathSettings.json');
    const base = String(JSON.parse(fs.readFileSync(p, 'utf8'))?.basePath || '').replace(/[\/\\]+$/, '');
    const parts = base.split(/[\/\\]/);
    _flLb = parts.length ? parts[parts.length - 1] : '';
  } catch (e) { _flLb = ''; }
  return _flLb;
}
function flareSys(): any {
  try {
    const os = flareNodeReq('os');
    const cpus = os.cpus() || [];
    return {
      os: os.platform() + ' ' + (os.version ? os.version() : os.release()),
      chip: (cpus[0] && cpus[0].model) || '', cores: cpus.length,
      ramGB: Math.round(os.totalmem() / 1073741824),
      freeGB: Math.round(os.freemem() / 107374182.4) / 10,
    };
  } catch (e) { return {}; }
}

// ---- the ops ring buffer ---------------------------------------------------------------------
const FLARE_RING_MAX = 100;
const _flareRing: Array<{ t: string; op: string; d?: any }> = [];

/** Breadcrumb: record one operation. Call at key points; cheap and never throws. */
export function flareOp(op: string, detail?: any): void {
  try {
    _flareRing.push({ t: flareIso(new Date()), op: String(op || ''), d: detail });
    if (_flareRing.length > FLARE_RING_MAX) _flareRing.shift();
  } catch (e) { /* never throws */ }
}

/** Call once at panel bootstrap: taps console.error/warn into the ring (originals unaffected). */
let _flareInited = false;
export function flareInit(): void {
  if (_flareInited) return;
  _flareInited = true;
  try {
    const err = console.error.bind(console), warn = console.warn.bind(console);
    console.error = (...a: any[]) => { try { flareOp('console.error', a.map(String).join(' ').slice(0, 500)); } catch (e) { /* */ } err(...a); };
    console.warn = (...a: any[]) => { try { flareOp('console.warn', a.map(String).join(' ').slice(0, 500)); } catch (e) { /* */ } warn(...a); };
    window.addEventListener('error', (ev: any) => flareOp('uncaught', String(ev?.message || ev?.error || '').slice(0, 500)));
    flareOp('panel.start', { pv: FLARE_PANEL.version });
  } catch (e) { /* never throws */ }
}

// Node transport (NOT browser fetch — CEF blocks cross-origin requests from remote panels).
function flarePost(body: string): Promise<{ ok: boolean; status: number; id?: number }> {
  return new Promise((resolve) => {
    try {
      const httpsMod = flareNodeReq('https');
      const headers = { 'Content-Type': 'application/json', 'X-Secret': FLARE_SECRET };
      if (!httpsMod) {
        fetch(FLARE_URL, { method: 'POST', headers, body })
          .then(async (r) => resolve({ ok: r.ok, status: r.status, id: (await r.json().catch(() => ({})))?.id }))
          .catch(() => resolve({ ok: false, status: 0 }));
        return;
      }
      const u = new URL(FLARE_URL);
      const req = httpsMod.request(
        { hostname: u.hostname, path: u.pathname, method: 'POST', headers, timeout: 15000 },
        (res: any) => {
          let data = '';
          res.on('data', (c: any) => { data += c; });
          res.on('end', () => {
            let id; try { id = JSON.parse(data).id; } catch (e) { /* */ }
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode || 0, id });
          });
        },
      );
      req.on('error', () => resolve({ ok: false, status: 0 }));
      req.on('timeout', () => { try { req.destroy(); } catch (e) { /* */ } resolve({ ok: false, status: 0 }); });
      req.write(body);
      req.end();
    } catch (e) { resolve({ ok: false, status: 0 }); }
  });
}

/**
 * Submit a flare. The user NEVER picks a phase — every flare is equally urgent when posted.
 * war/peace is context only (what the user was doing): pass severity from panel state when
 * you know it ('war' = Run Job flow, 'peace' = template setup); omit it and the module derives
 * it from the ops trail (any job.* / run* breadcrumb in the last 60 min → war).
 * context: whatever the panel knows — {job: '<excel name>', tmpl: '<template uuid>'}.
 * Returns {ok, id} — show the user "Report #id sent" or "failed, try again".
 */
export function flareSubmit(
  description: string,
  severity?: 'war' | 'peace',
  context?: { job?: string; tmpl?: string; checks?: { firstTime?: boolean; otherMachine?: boolean; otherDoc?: boolean } },
): Promise<{ ok: boolean; status: number; id?: number }> {
  try {
    // The report pane's checkboxes are triage gold — record them as a breadcrumb so the
    // AI analysis can rule out whole failure classes (otherMachine → not environment;
    // otherDoc → not template/data; !firstTime → recurring/regression).
    if (context?.checks) flareOp('flare.checks', context.checks);
    if (!severity) {
      const cutoff = Date.now() - 60 * 60000;
      const recentJob = _flareRing.some((o) => {
        try { return /^(job\.|run)/i.test(o.op) && new Date(o.t).getTime() > cutoff; } catch (e) { return false; }
      });
      severity = recentJob ? 'war' : 'peace';
    }
    flareOp('flare.submit', { severity });
    const payload = {
      t: flareIso(new Date()),
      severity,
      lb: flareLb(), u: flareUser(),
      p: FLARE_PANEL.code, pv: FLARE_PANEL.version,
      machine: flareMachine(), mid: flareMid(),
      job: context?.job || '', tmpl: context?.tmpl || '',
      description: String(description || '').slice(0, 4000),
      ops: _flareRing.slice(),
      sys: flareSys(),
    };
    return flarePost(JSON.stringify(payload));
  } catch (e) { return Promise.resolve({ ok: false, status: 0 }); }
}
