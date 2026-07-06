/**********************************************************************************************
 * roiLogger.web.ts — LEAP ROI logger + shipper for the MODERN (web-stack) CEP panels.
 * --------------------------------------------------------------------------------------------
 * Counterpart of roiLogger.jsx (ExtendScript) / roiShipper.js for panels built with React or
 * Angular (NN-Pro, Color-Seps). One identical copy per panel; set PANEL at the top.
 *
 * Same contract as the jsx logger:
 *   - Appends ONE JSON line per value-bearing action to the SHARED per-user daily file
 *     <logobase>/ADMIN_LOG/EVENT_META/Events_YYYY-MM-DD_<user>.jsonl  (LF endings).
 *     Events co-mingle with Exporter/Breakouts events in the same file by design.
 *   - shipOnLaunch(): POSTs CLOSED days (date < today) to the server, archives to _shipped/,
 *     prunes archives older than 7 days. Server dedupes on (computer_name, source_file), so
 *     multiple panels shipping the same file is harmless.
 *   - Everything is guarded: logging/shipping must NEVER break the panel. No throws escape.
 *
 * Requires --enable-nodejs (cep_node). Framework-free; import the two functions you need.
 *********************************************************************************************/

// ---- per-panel config (the ONLY lines that differ between panels) -------------------------
const PANEL = { code: 'CSP', name: 'LEAP Color Separator', version: '1.0.1' };

const API_URL = 'https://versioncheck.slsplugins.com/roi-events';
const SECRET = 'a3e7beb1dc72f4c181052c8605efb89a36b4eced764f3aae'; // matches server X-Secret

// ---- node access (CEP) ---------------------------------------------------------------------
function nodeReq(mod: string): any {
  try { return (window as any).cep_node?.require?.(mod) ?? null; } catch (e) { return null; }
}

// Machine id, minted by Exporter/Teamouts (errLogger.js) into the machine-local
// ~/Documents/LEAP Settings/leap_machine.json. This panel only READS it. Cached.
let _roiMid: string | undefined;
function roiMachineId(): string {
  if (_roiMid !== undefined) return _roiMid;
  try {
    const os = nodeReq('os'), fs = nodeReq('fs'), path = nodeReq('path');
    const p = path.join(os.homedir(), 'Documents', 'LEAP Settings', 'leap_machine.json');
    _roiMid = fs.existsSync(p) ? String(JSON.parse(fs.readFileSync(p, 'utf8'))?.id || '') : '';
  } catch (e) { _roiMid = ''; }
  return _roiMid;
}

function pad(n: number): string { return (n < 10 ? '0' : '') + n; }
function isoUTC(d: Date): string {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) +
         'T' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds()) + 'Z';
}
function dayLocal(d: Date): string {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function userName(): string {
  try { return nodeReq('os')?.userInfo?.().username || 'unknown'; } catch (e) { return 'unknown'; }
}
function safeUser(u: string): string { return (u || 'unknown').replace(/[^A-Za-z0-9_\-]/g, '_'); }

// Logobase root from the shared settings file (same source the panels themselves use).
function logobasePath(): string {
  try {
    const os = nodeReq('os'), path = nodeReq('path'), fs = nodeReq('fs');
    if (!os || !path || !fs) return '';
    const f = path.join(os.homedir(), 'Documents', 'LEAP Settings', 'logobaseDataPathSettings.json');
    return JSON.parse(fs.readFileSync(f, 'utf8')).basePath || '';
  } catch (e) { return ''; }
}
function logobaseLabel(base: string): string {
  const p = (base || '').replace(/[\/\\]+$/, '');
  const parts = p.split(/[\/\\]/);
  return parts.length ? parts[parts.length - 1] : '';
}
function eventDir(base: string): string {
  const path = nodeReq('path');
  return path ? path.join(base, 'ADMIN_LOG', 'EVENT_META') : '';
}

/** Append one ROI event. Returns true on success. Never throws. */
export function roiLogEvent(info: {
  action: string; league?: string; team?: string; doc?: string;
  artboards?: number | null; elements?: any; tmpl?: string;
}): boolean {
  try {
    const fs = nodeReq('fs'), path = nodeReq('path');
    const base = logobasePath();
    if (!fs || !path || !base) return false;
    const dir = eventDir(base);
    fs.mkdirSync(dir, { recursive: true });
    const now = new Date();
    const u = userName();
    const ev: any = {
      v: 2, t: isoUTC(now), lb: logobaseLabel(base), u: u,
      p: PANEL.code, a: info.action,
      lg: info.league || '', tc: info.team || '', doc: info.doc || '', pv: PANEL.version
    };
    if (info.artboards !== undefined && info.artboards !== null) ev.n = info.artboards;
    if (info.elements) ev.el = info.elements;
    if (info.tmpl) ev.tmpl = info.tmpl;
    const mid = roiMachineId(); if (mid) ev.m = mid;   // machine ref (see machines table)
    const file = path.join(dir, 'Events_' + dayLocal(now) + '_' + safeUser(u) + '.jsonl');
    fs.appendFileSync(file, JSON.stringify(ev) + '\n', 'utf8');
    return true;
  } catch (e) { return false; }
}

/** Has this template already been logged locally? (EVENT_META or its _shipped archive.) */
export function roiTemplateLogged(id: string): boolean {
  try {
    const fs = nodeReq('fs'), path = nodeReq('path');
    const base = logobasePath();
    if (!fs || !path || !base) return false;
    const dir = eventDir(base);
    const name = 'Template_' + safeUser(id) + '.json';
    return fs.existsSync(path.join(dir, name)) || fs.existsSync(path.join(dir, '_shipped', name));
  } catch (e) { return false; }
}

/** Write/refresh a template element record (one file per template id). Never throws. */
export function roiLogTemplate(id: string, elements: any): boolean {
  try {
    const fs = nodeReq('fs'), path = nodeReq('path');
    const base = logobasePath();
    if (!fs || !path || !base || !id) return false;
    const dir = eventDir(base);
    fs.mkdirSync(dir, { recursive: true });
    const rec = {
      v: 2, kind: 'template', t: isoUTC(new Date()),
      uuid: id, lb: logobaseLabel(base), p: PANEL.code, pv: PANEL.version,
      el: elements || {}
    };
    fs.writeFileSync(path.join(dir, 'Template_' + safeUser(id) + '.json'), JSON.stringify(rec) + '\n', 'utf8');
    return true;
  } catch (e) { return false; }
}

// ---- shipper (same behavior as roiShipper.js) ----------------------------------------------
function sh(cmd: string): string | null {
  try { return nodeReq('child_process')?.execSync?.(cmd, { encoding: 'utf8', timeout: 4000 })?.trim() || null; }
  catch (e) { return null; }
}

function illustratorVersion(): string | null {
  try { return new (window as any).CSInterface().getHostEnvironment().appVersion || null; } catch (e) { return null; }
}

/** Phone home to /versioncheck once per UTC day per panel (the "login"/adoption ping). Never throws. */
export function roiPingLogin(): void {
  try {
    const fs = nodeReq('fs'), path = nodeReq('path'), os = nodeReq('os');
    const base = logobasePath();
    if (!fs || !path || !base) return;
    const dir = eventDir(base);
    fs.mkdirSync(dir, { recursive: true });
    const day = (() => { const d = new Date(); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); })();
    const marker = path.join(dir, '.login_' + PANEL.code + '_' + day);
    if (fs.existsSync(marker)) return; // already pinged today from this panel
    let tz: string | null = null, loc: string | null = null;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { /* */ }
    try { loc = (window as any).navigator?.language || null; } catch (e) { /* */ }
    const sysver = sh('sw_vers -productVersion');
    const payload = {
      username: userName(),
      ad_domain: null,
      computer_name: sh('scutil --get ComputerName') || (os ? os.hostname() : null),
      mac_model: sh('sysctl -n hw.model'),
      os_version: sysver ? 'macOS ' + sysver : null,
      timezone: tz,
      locale: loc,
      Illustrator_Version: illustratorVersion(),
      Panel_Name: PANEL.name,
      Panel_Version: PANEL.version,
      LEAP_Server_Folder_Path: base
    };
    fetch(API_URL.replace('/roi-events', '/versioncheck'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then((r) => { if (r.ok) { try { fs.writeFileSync(marker, new Date().toISOString()); } catch (e) { /* */ } } })
      .catch(() => { /* retry next launch */ });
  } catch (e) { /* never throw */ }
}

function clientMeta(): any {
  const os = nodeReq('os');
  return {
    username: userName(),
    computer_name: sh('scutil --get ComputerName') || (os ? os.hostname() : null),
    os_version: sh('sw_vers -productVersion'),
    illustrator_version: null,
    panel_name: PANEL.name,
    panel_version: PANEL.version,
    logobase_label: logobaseLabel(logobasePath())
  };
}

async function shipFile(dir: string, fileName: string): Promise<void> {
  const fs = nodeReq('fs'), path = nodeReq('path');
  const full = path.join(dir, fileName);
  let events: any[] = []; let skipped = 0;
  try {
    const text = fs.readFileSync(full, 'utf8');
    for (const ln of String(text).split(/\r\n|\r|\n/)) {
      const s = ln.trim();
      if (!s) continue;
      try { events.push(JSON.parse(s)); } catch (e) { skipped++; }
    }
  } catch (e) { return; }
  const payload = {
    meta: { ...clientMeta(), source_file: fileName, event_count: events.length, skipped_lines: skipped, sent_at: new Date().toISOString() },
    events
  };
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
    body: JSON.stringify(payload)
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try {
    const sd = path.join(dir, '_shipped');
    if (!fs.existsSync(sd)) fs.mkdirSync(sd);
    fs.renameSync(full, path.join(sd, fileName));
  } catch (e) { /* move failed; server dedupe is the backstop */ }
}

function pruneShipped(dir: string, days: number): void {
  try {
    const fs = nodeReq('fs'), path = nodeReq('path');
    const sd = path.join(dir, '_shipped');
    if (!fs.existsSync(sd)) return;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    for (const n of fs.readdirSync(sd)) {
      const f = path.join(sd, n);
      try { if (fs.statSync(f).mtimeMs < cutoff) fs.unlinkSync(f); } catch (e) { /* skip */ }
    }
  } catch (e) { /* never throw */ }
}

/** Ship all CLOSED daily files (date < today). Call once at panel start. Never throws. */
export async function roiShipOnLaunch(): Promise<void> {
  try {
    const fs = nodeReq('fs');
    const base = logobasePath();
    if (!fs || !base) return;
    const dir = eventDir(base);
    if (!fs.existsSync(dir)) return;
    pruneShipped(dir, 7);
    const today = dayLocal(new Date());
    for (const n of fs.readdirSync(dir)) {
      const m = n.match(/^Events_(\d{4}-\d{2}-\d{2})_.+\.jsonl$/);
      if (m && m[1] < today) {
        try { await shipFile(dir, n); } catch (e) { /* retry next launch */ }
      } else if (/^Template_.+\.json$/.test(n)) {
        try { await shipTemplate(dir, n); } catch (e) { /* retry next launch */ }
      } else {
        const lm = n.match(/^\.login_.+_(\d{4}-\d{2}-\d{2})$/);
        if (lm && lm[1] < today) { try { const p = nodeReq('path'); fs.unlinkSync(p.join(dir, n)); } catch (e) { /* */ } }
      }
    }
  } catch (e) { /* never throw */ }
}

async function shipTemplate(dir: string, fileName: string): Promise<void> {
  const fs = nodeReq('fs'), path = nodeReq('path');
  const full = path.join(dir, fileName);
  let rec: any = null;
  try { rec = JSON.parse(fs.readFileSync(full, 'utf8')); } catch (e) { return; }
  const r = await fetch(API_URL.replace('/roi-events', '/roi-templates'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Secret': SECRET },
    body: JSON.stringify({ meta: clientMeta(), template: rec })
  });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  try {
    const sd = path.join(dir, '_shipped');
    if (!fs.existsSync(sd)) fs.mkdirSync(sd);
    fs.renameSync(full, path.join(sd, fileName));
  } catch (e) { /* server upserts by uuid; safe */ }
}
