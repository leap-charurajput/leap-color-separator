import {
 ChangeDetectorRef,
 Component,
 Input,
 OnChanges,
 OnDestroy,
 OnInit,
 SimpleChanges
} from '@angular/core';
import { ControllerService } from '../../services/controller.service';

/*
 * Payload for the standalone separation. The host exports the selection to a sibling ASSETS
 * folder, then runs the same separation process the Separations tab runs, sourcing
 * team/league/style/profile from these form values instead of the LEAP team-out sidecar files.
 */
export interface StandaloneSeparationPayload {
 position: string;
 teamCode: string;
 league: string;
 styleCode: string;
 profileName: string;
 /* Optional SEP-grid token fields; blank-fallback so any token can be supplied manually. */
 teamName: string;
 concept: string;
 garmentColors: string;
 /* Set after the selection has been exported (so generate can separate from the ASSETS file). */
 exportedFilePath?: string;
}

/*
 * A profile group shown after Export, mirroring the Separations tab: one row per profile, listing
 * the style code(s) that resolved to it. In standalone mode there is a single style/profile today,
 * but the shape supports more.
 */
export interface StandaloneSeparationGroup {
 profileName: string;
 styleCodes: string[];
 /* Decoration inks extracted from the exported art (spot swatches used by the artwork). */
 colors: string[];
 /* Garment colors from the LICENSING sheet (the "Color" field); shown when the art has no spot inks. */
 garmentColors: string;
 isGenerating: boolean;
 status: string;
 error: string;
}

/*
 * Default placement options, mirrored from GraphicsComponent so the Position picker still
 * offers sensible values when the placements JSON is unavailable for a non-LEAP file.
 */
const DEFAULT_GRAPHIC_POSITIONS = [
 'Front',
 'Back',
 'Left Chest',
 'Left Sleeve',
 'Right Sleeve',
 'Left Shoulder',
 'Right Shoulder'
];

@Component({
 selector: 'app-standalone-separation',
 templateUrl: './standalone-separation.component.html',
 styleUrls: ['./standalone-separation.component.css']
})
export class StandaloneSeparationComponent implements OnInit, OnChanges, OnDestroy {
 /*
  * Bumped by the shell whenever the active Illustrator document changes, so the form can
  * refresh its option lists (positions / profiles) for the current document context.
  */
 @Input() documentRefreshKey = 0;

 /* ----- Form fields ----- */
 position = '';
 teamCode = '';
 league = '';
 styleCode = '';
 /*
  * Profile is no longer chosen manually — it is resolved from the Style Code via the shared
  * Styles.xlsx (SETTINGS/LEAP_SEPS/Data), the same mapping the Separations tab uses. This holds
  * the resolved profile name that feeds the separation.
  */
 profileName = '';
 /* Optional token fields (see StandaloneSeparationPayload). */
 teamName = '';
 concept = '';
 garmentColors = '';

 /* ----- Option lists ----- */
 positionOptions: string[] = [];
 /*
  * DESC/ABBV entries from graphic_positions.json. Used to translate the LICENSING sheet's
  * "Placement" abbreviation (e.g. "FT") into a real position DESC (e.g. "Front").
  */
 private positionEntries: Array<{ desc: string; abbv: string }> = [];

 /* ----- UI state ----- */
 isGenerating = false;
 isPrefilling = false;
 /* Profile resolution (Style Code -> Styles.xlsx -> profile name). */
 isResolvingProfile = false;
 profileResolveWarning = '';
 /* TEMPORARY diagnostic: the raw profile-lookup result, shown when the debug box is on. */
 profileLookupDebug = '';
 statusMessage = '';
 warningMessage = '';
 isRunningInBrowser = false;

 /* ----- Export + separations view ----- */
 isExporting = false;
 exported = false;
 exportedFileName = '';
 exportedFilePath = '';
 /* Separation rows shown after Export, grouped by profile (like the Separations tab). */
 separationGroups: StandaloneSeparationGroup[] = [];
 /*
  * TEMPORARY diagnostic: the last raw result from getLicensingInfo(), shown in a debug box so we
  * can see what the host read from the document when a field comes back empty. Remove once the
  * LICENSING extraction is confirmed against real files.
  */
 licensingDebug = '';
 showLicensingDebug = true;

 /*
  * Global hook name the shell calls (from the Graphics "+" handler) to (re)prefill the form
  * from the active document's LICENSING sheet. Mirrors the existing __LEAP_TAB_NAVIGATION__ bridge.
  */
 private static readonly PREFILL_HOOK = '__LEAP_STANDALONE_PREFILL__';

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {
  /*
   * Outside Illustrator (plain browser dev) the leap bridge is absent; keep the form
   * inert rather than throwing when the user experiments with it.
   */
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  this.loadPositionOptions();
  /*
   * Expose a prefill hook so the Graphics "+" button can refresh the form from the active
   * document each time it opens this tab.
   */
  (window as any)[StandaloneSeparationComponent.PREFILL_HOOK] = () => this.prefillFromLicensing();
  /* Prefill once on first load too, in case the tab is opened for an already-active document. */
  this.prefillFromLicensing();
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['documentRefreshKey'] && !changes['documentRefreshKey'].firstChange) {
   /*
    * Reload option lists on document activation; the form values themselves are kept so a
    * user who was mid-entry does not lose their typing when Illustrator refocuses.
    */
   this.loadPositionOptions();
  }
 }

 ngOnDestroy(): void {
  /* Remove the global hook this instance registered. */
  if ((window as any)[StandaloneSeparationComponent.PREFILL_HOOK]) {
   try {
    delete (window as any)[StandaloneSeparationComponent.PREFILL_HOOK];
   } catch (e) {
    (window as any)[StandaloneSeparationComponent.PREFILL_HOOK] = undefined;
   }
  }
 }

 /*
  * Load placement options from the same JSON the Graphics tab reads. Falls back to the
  * built-in defaults when unavailable (expected for arbitrary non-LEAP files).
  */
 loadPositionOptions(): void {
  if (this.isRunningInBrowser) {
   this.positionOptions = [...DEFAULT_GRAPHIC_POSITIONS];
   return;
  }
  this.controller
   .getGraphicPositionOptionsFromJson()
   .then((result: any) => {
    let placements: string[] = [];
    if (result && result.success && Array.isArray(result.placements)) {
     placements = result.placements.filter(
      (p: string) => String(p || '').trim().toLowerCase() !== 'choose'
     );
    }
    /* Keep the DESC/ABBV entries so the LICENSING "Placement" abbreviation can be mapped. */
    this.positionEntries = result && Array.isArray(result.entries) ? result.entries : [];
    this.positionOptions = placements.length > 0 ? placements : [...DEFAULT_GRAPHIC_POSITIONS];
    this.cdr.detectChanges();
   })
   .catch(() => {
    this.positionOptions = [...DEFAULT_GRAPHIC_POSITIONS];
    this.cdr.detectChanges();
   });
 }

 /*
  * Resolve the separation profile from the current Style Code using the shared Styles.xlsx
  * (SETTINGS/LEAP_SEPS/Data) — the same Style -> profile mapping the Separations tab uses. There
  * is no manual profile picker in standalone mode: the style code determines the profile.
  */
 resolveProfileFromStyle(): void {
  const style = String(this.styleCode || '').trim();
  this.profileResolveWarning = '';
  if (!style) {
   this.profileName = '';
   this.cdr.detectChanges();
   return;
  }
  if (this.isRunningInBrowser || typeof this.controller.getProfileNamesFromExcel !== 'function') {
   return;
  }

  this.isResolvingProfile = true;
  this.cdr.detectChanges();

  /*
   * The shared lookup matches the style code EXACTLY (case-sensitive) against Styles.xlsx. To be
   * resilient to case/format differences between the LICENSING sheet and the spreadsheet, request
   * a few case variants and match the returned map case-insensitively.
   */
  const variants = [style, style.toUpperCase(), style.toLowerCase()].filter(
   (v, i, arr) => arr.indexOf(v) === i
  );
  const target = style.toUpperCase();

  const finish = () => {
   this.isResolvingProfile = false;
   this.cdr.detectChanges();
  };

  const applyResult = (result: any, basePath: string): void => {
   try {
    this.profileLookupDebug = 'basePath: ' + (basePath || '(empty)') + '\n' + JSON.stringify(result);
    console.log('[Standalone] profile lookup for', variants, 'basePath', basePath, '->', result);
   } catch (e) {
    /* ignore debug stringify issues */
   }
   const map = result && result.success && result.profileMap ? result.profileMap : null;
   let name = '';
   if (map) {
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
     if (String(keys[i]).trim().toUpperCase() === target) {
      name = String(map[keys[i]] || '').trim();
      break;
     }
    }
   }
   if (name && name.toLowerCase() !== 'unknown profile') {
    this.profileName = name;
    this.profileResolveWarning = '';
   } else {
    this.profileName = '';
    const pathIssue =
     result && result.success === false && /base path|data folder|read styles/i.test(String(result.error || ''));
    if (pathIssue) {
     this.profileResolveWarning =
      'Could not read Styles.xlsx from the LEAP Data folder. Check the path under General Settings → Data Folder Path, then edit the Style Code to retry.';
    } else {
     this.profileResolveWarning = 'No profile found in Styles.xlsx for style "' + style + '".';
    }
   }
   finish();
  };

  /*
   * Resolve the LEAP Data base path via the panel (CEP) resolver, which does not gate on
   * existsSync(), and read Styles.xlsx directly through getProfileNamesFromExcelAtPath. This avoids
   * the Node-side getServerBasePath() existsSync check that fails persistently on some cloud/network
   * drives ("Server base path not found"). Falls back to the original shared lookup if the base path
   * cannot be resolved or the new method is unavailable in this build.
   */
  const getBasePath: Promise<string> =
   typeof this.controller.getLeapServerDataPath === 'function'
    ? this.controller.getLeapServerDataPath().then((p: any) => String(p || '').trim())
    : Promise.resolve('');

  getBasePath
   .then((basePath: string) => {
    const canUseAtPath =
     !!basePath && typeof (this.controller as any).getProfileNamesFromExcelAtPath === 'function';
    const lookup = canUseAtPath
     ? (this.controller as any).getProfileNamesFromExcelAtPath(variants, basePath)
     : this.controller.getProfileNamesFromExcel(variants);
    return lookup.then((result: any) => applyResult(result, basePath));
   })
   .catch((err: any) => {
    this.profileName = '';
    this.profileResolveWarning =
     'Could not read Styles.xlsx to resolve the profile' +
     (err && err.message ? ': ' + err.message : '.');
    finish();
   });
 }

 /* Re-resolve the profile whenever the user edits the Style Code (fires on blur/change). */
 onStyleCodeChange(): void {
  /* A changed style invalidates a prior export/grouping; require a fresh Export. */
  this.exported = false;
  this.separationGroups = [];
  this.resolveProfileFromStyle();
 }

 /*
  * Read the active document's LICENSING sheet and prefill the form. Called on first load and
  * whenever the Graphics "+" button opens this tab. Safe to call repeatedly; on error the form
  * is simply left as-is.
  */
 prefillFromLicensing(): void {
  if (this.isRunningInBrowser || typeof this.controller.getLicensingInfo !== 'function') {
   return;
  }
  this.isPrefilling = true;
  this.cdr.detectChanges();

  /* Ensure the placement->position mapping is available before mapping the sheet's Placement. */
  const ensureEntries =
   this.positionEntries.length > 0
    ? Promise.resolve()
    : this.controller
       .getGraphicPositionOptionsFromJson()
       .then((r: any) => {
        this.positionEntries = r && Array.isArray(r.entries) ? r.entries : [];
       })
       .catch(() => {
        /* Non-fatal: fall back to the raw placement string below. */
       });

  ensureEntries
   .then(() => this.controller.getLicensingInfo())
   .then((result: any) => {
    /* TEMPORARY: log + stash the full result so we can diagnose empty prefills on real files. */
    try {
     console.log('[Standalone] getLicensingInfo result:', result);
     this.licensingDebug = JSON.stringify(result, null, 2);
    } catch (e) {
     this.licensingDebug = String(result);
    }
    if (!result || !result.success) {
     return;
    }
    /*
     * Prefer label-matched values (templates with LIVE labels). When those are empty — as on
     * templates whose labels are outlined — derive the values from the unlabeled value frames
     * by content pattern.
     */
    const mapped = this.hasAnyRawValue(result.raw)
     ? result.raw
     : this.deriveFromFrames(result.frames);
    try {
     console.log('[Standalone] licensing mapped ->', mapped);
     this.licensingDebug += '\n\nMAPPED:\n' + JSON.stringify(mapped, null, 2);
    } catch (e) {
     /* ignore debug stringify issues */
    }
    this.applyLicensingRaw(mapped);
    /* Style Code just changed via prefill — resolve its profile from Styles.xlsx. */
    this.resolveProfileFromStyle();
   })
   .catch((err: any) => {
    /* Ignore: leave the form untouched if the sheet cannot be read. */
    this.licensingDebug = 'getLicensingInfo error: ' + (err && err.message ? err.message : String(err));
   })
   .finally(() => {
    this.isPrefilling = false;
    this.cdr.detectChanges();
   });
 }

 /* True if the label-matched raw object carries at least one non-empty value. */
 private hasAnyRawValue(raw: any): boolean {
  if (!raw) return false;
  const keys = Object.keys(raw);
  for (let i = 0; i < keys.length; i++) {
   const v = raw[keys[i]];
   if (v != null && String(v).trim() !== '') return true;
  }
  return false;
 }

 /*
  * Derive field values from the unlabeled value frames (the LICENSING labels are outlined, so
  * there is nothing to match on). Value FORMATS vary between templates (e.g. team code "DNV" vs
  * "7G", style "N199" vs "FM01"), but the value COLUMN's vertical order is stable, so we map by
  * position: isolate the info column (the tightest x-cluster of value frames), sort top-to-bottom,
  * and read fields by row index. Placement is found by its parenthesised suffix; Org code is the
  * short token in the lower block.
  *
  * Stable top-block order (verified across templates):
  *   0 design, 1 concept, 2 player, 3 date, 4 artist, 5 product line, 6 team name, 7 style, 8 color
  */
 private deriveFromFrames(frames: Array<{ t: string; x: number; y: number }>): any {
  const out: any = {};
  if (!Array.isArray(frames) || frames.length === 0) {
   return out;
  }

  const clean = frames
   .map((f) => ({
    t: String(f && f.t != null ? f.t : '').trim(),
    x: Number(f && (f as any).x),
    y: Number(f && (f as any).y)
   }))
   .filter((f) => f.t.length > 0 && isFinite(f.x) && isFinite(f.y));

  /* Drop header / footer / copyright / garment-swatch / PMS-swatch frames and size marks (e.g. 2"). */
  const SKIP = /(©|licensing|submission|garment|fanatics|developed|\bpms\b)/i;
  const isMeasurement = (t: string) => /^\d+(\.\d+)?\s*["”″′’']?$/.test(t);
  const candidates = clean.filter((f) => !SKIP.test(f.t) && !isMeasurement(f.t));
  if (candidates.length === 0) {
   return out;
  }

  const infoColumn = this.pickInfoColumn(candidates);
  if (infoColumn.length < 3) {
   /* Not enough aligned rows to trust position mapping; leave the form as-is. */
   return out;
  }

  /* Sort top -> bottom: y is the frame's top, and a larger y is higher on the sheet. */
  const rows = infoColumn.slice().sort((a, b) => b.y - a.y);
  const at = (i: number): string => (i >= 0 && i < rows.length ? rows[i].t : '');

  out.conceptCode = at(1);
  out.teamName = at(6);
  out.style = at(7);
  out.color = at(8);

  /* Placement: a value with a parenthesised suffix, e.g. "FT (Print)" / "CF (High Solid …)". */
  const placementRow = rows.find((r) => /^[^()]+\([^)]*\)\s*$/.test(r.t));
  out.placement = placementRow ? placementRow.t : '';

  /*
   * Org code (Team Code): in the lower block (index >= 9), the first short alphanumeric token with
   * no space that is not a parenthetical (placement / art revisions) or a date. Handles "DNV"
   * (below color) and "7G" (below the combined graphic/season row) alike.
   */
  for (let i = 9; i < rows.length; i++) {
   const t = rows[i].t;
   if (/\s/.test(t)) continue; /* multiword: graphic + season */
   if (/[()]/.test(t)) continue; /* parenthetical: placement / art revisions */
   if (/^\d{1,2}[.\/]\d/.test(t)) continue; /* date */
   if (/^[0-9A-Za-z]{1,5}$/.test(t)) {
    out.orgCode = t;
    break;
   }
  }

  return out;
 }

 /*
  * Isolate the info column: greedily cluster candidate frames by x (a small tolerance groups the
  * label:value rows that share a left edge) and return the largest cluster (tie -> leftmost). The
  * garment / PMS swatches and size marks sit at different x, so they fall into other clusters.
  */
 private pickInfoColumn(
  cands: Array<{ t: string; x: number; y: number }>
 ): Array<{ t: string; x: number; y: number }> {
  const sorted = cands.slice().sort((a, b) => a.x - b.x);
  const TOL = 12;
  let best: Array<{ t: string; x: number; y: number }> = [];
  let cur: Array<{ t: string; x: number; y: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
   if (cur.length === 0 || Math.abs(sorted[i].x - cur[cur.length - 1].x) <= TOL) {
    cur.push(sorted[i]);
   } else {
    if (cur.length > best.length) best = cur;
    cur = [sorted[i]];
   }
  }
  if (cur.length > best.length) best = cur;
  return best;
 }

 /*
  * Map the raw LICENSING label/value pairs onto the form fields. The sheet does not carry a
  * League or Profile, so those stay for the user to fill. Only non-empty extracted values are
  * applied, so a partial sheet never blanks a field.
  */
 private applyLicensingRaw(raw: any): void {
  const pick = (v: any) => (v != null ? String(v).trim() : '');

  const orgCode = pick(raw.orgCode);
  const teamName = pick(raw.teamName);
  const conceptCode = pick(raw.conceptCode);
  const style = pick(raw.style);
  const color = pick(raw.color);
  const placement = pick(raw.placement);

  if (orgCode) this.teamCode = orgCode; /* Team Code = Org code, per the LICENSING sheet. */
  if (teamName) this.teamName = teamName;
  if (conceptCode) this.concept = conceptCode;
  if (style) this.styleCode = style;
  if (color) this.garmentColors = color;

  const mappedPosition = this.mapPlacementToPosition(placement);
  if (mappedPosition) this.position = mappedPosition;
 }

 /*
  * Translate a LICENSING "Placement" value (e.g. "FT (Print)") into a position. Strips the
  * decoration method in parentheses, then resolves the abbreviation via graphic_positions.json
  * (ABBV -> DESC). Falls back to the raw text (the combo-box accepts custom values).
  */
 private mapPlacementToPosition(placement: string): string {
  const raw = String(placement || '').trim();
  if (!raw) return '';
  /* Take the token before any parenthesis, e.g. "FT (Print)" -> "FT". */
  const token = raw.replace(/\(.*$/, '').trim();
  if (!token) return raw;

  const tokenUpper = token.toUpperCase();
  /* Exact DESC match already? (e.g. sheet already says "Front"). */
  const descMatch = this.positionEntries.find(
   (e) => String(e.desc || '').trim().toUpperCase() === tokenUpper
  );
  if (descMatch) return descMatch.desc;
  /* Otherwise resolve the abbreviation. */
  const abbvMatch = this.positionEntries.find(
   (e) => String(e.abbv || '').trim().toUpperCase() === tokenUpper
  );
  if (abbvMatch) return abbvMatch.desc;

  /* No mapping found — return just the abbreviation token (e.g. "CF"), not the method suffix. */
  return token;
 }

 /* ----- Field change handlers (combo-box / dropdown emit plain strings) ----- */
 onPositionChange(value: string): void {
  this.position = value;
 }

 /*
  * Enable "Generate Separate" only when everything the separation process needs is present.
  * Name / size are intentionally not collected: standalone exports the current selection as-is
  * and does not modify the active document, so the export bounds come from the selection itself.
  */
 get canGenerate(): boolean {
  if (this.isGenerating || this.isRunningInBrowser || this.isResolvingProfile) {
   return false;
  }
  /* profileName is the profile resolved from the Style Code via Styles.xlsx. */
  return (
   !!this.position.trim() &&
   !!this.teamCode.trim() &&
   !!this.league.trim() &&
   !!this.styleCode.trim() &&
   !!this.profileName.trim()
  );
 }

 /* Base payload built from the current form values (shared by export + generate). */
 private buildPayload(): StandaloneSeparationPayload {
  return {
   position: this.position.trim(),
   teamCode: this.teamCode.trim(),
   league: this.league.trim(),
   styleCode: this.styleCode.trim(),
   profileName: this.profileName.trim(),
   teamName: this.teamName.trim(),
   concept: this.concept.trim(),
   garmentColors: this.garmentColors.trim(),
   exportedFilePath: this.exportedFilePath || undefined
  };
 }

 /*
  * Export: export the current selection to <activeDocFolder>/ASSETS/<name>.ai (leaving that file
  * open), then reveal the Separations view grouped by profile — the same shape the Separations tab
  * shows. Generation happens per group from that view.
  */
 onExport(): void {
  if (!this.canGenerate || this.isExporting) {
   return;
  }
  this.warningMessage = '';
  this.statusMessage = '';
  this.isExporting = true;
  this.cdr.detectChanges();

  const payload = this.buildPayload();
  this.controller
   .exportSelectionToAssets({
    teamCode: payload.teamCode,
    styleCode: payload.styleCode,
    position: payload.position
   })
   .then((result: any) => {
    if (!result || !result.success) {
     this.warningMessage = (result && result.error) || 'Could not export the selection to ASSETS.';
     return;
    }
    this.exported = true;
    this.exportedFileName = String(result.fileName || '');
    this.exportedFilePath = String(result.filePath || '');
    this.statusMessage = 'Exported to ASSETS: ' + this.exportedFileName;
    /* Decoration inks extracted from the art, to show as the group's Colors. */
    const colors: string[] = Array.isArray(result.colors)
     ? result.colors.map((c: any) => String(c || '').trim()).filter((c: string) => c.length > 0)
     : [];
    /* Build the profile-grouped separations view (one row per profile). */
    this.separationGroups = this.buildSeparationGroups(colors);
   })
   .catch((err: any) => {
    this.warningMessage = (err && err.message) || 'Could not export the selection to ASSETS.';
   })
   .finally(() => {
    this.isExporting = false;
    this.cdr.detectChanges();
   });
 }

 /*
  * Group the resolved style/profile into separation rows, mirroring the Separations tab's
  * profile grouping. Standalone has a single style/profile today; the structure supports more.
  */
 private buildSeparationGroups(colors: string[]): StandaloneSeparationGroup[] {
  const profile = this.profileName.trim();
  const style = this.styleCode.trim();
  if (!profile || !style) {
   return [];
  }
  return [
   {
    profileName: profile,
    styleCodes: [style],
    colors: Array.isArray(colors) ? colors : [],
    garmentColors: this.garmentColors.trim(),
    isGenerating: false,
    status: '',
    error: ''
   }
  ];
 }

 /*
  * Generate the separation for one profile group. Builds the rich profileMetadata + jsonData, runs
  * the standalone separation (which reuses the real engine via the inline script), and on success
  * switches to the Plates tab to show the generated plates.
  */
 generateGroup(group: StandaloneSeparationGroup): void {
  if (!group || group.isGenerating) {
   return;
  }
  group.error = '';
  group.status = '';

  if (this.isRunningInBrowser || typeof this.controller.generateStandaloneSeparation !== 'function') {
   group.error = 'Standalone separation is not available in this build.';
   this.cdr.detectChanges();
   return;
  }
  if (!this.exportedFilePath) {
   group.error = 'Export the selection first, then generate.';
   this.cdr.detectChanges();
   return;
  }

  group.isGenerating = true;
  group.status = 'Generating separations…';
  this.cdr.detectChanges();

  this.buildStandaloneProfileMetadata(group)
   .then(({ meta, sepsTemplateFileName }) => {
    const jsonData = this.buildJsonData();
    /* Fallback source for any SEP token not explicitly handled. */
    meta.batchVariableSource = jsonData;
    return this.controller.generateStandaloneSeparation({
     graphicName: this.position.trim(),
     styleCodes: group.styleCodes,
     profileMetadata: meta,
     jsonData: jsonData,
     sepsTemplateFileName: sepsTemplateFileName || undefined,
     exportedFilePath: this.exportedFilePath
    });
   })
   .then((result: any) => {
    if (result && result.success) {
     group.status = 'Separation generated. Opening Plates…';
     /* Switch to the Plates tab (index 2) to show the generated plates. */
     const nav = (window as any).__LEAP_TAB_NAVIGATION__;
     if (nav && typeof nav.navigateToTab === 'function') {
      setTimeout(() => nav.navigateToTab(2), 300);
     }
    } else {
     group.error = (result && result.error) || 'Could not generate the separation.';
     group.status = '';
    }
   })
   .catch((err: any) => {
    group.error = (err && err.message) || 'Could not generate the separation.';
    group.status = '';
   })
   .finally(() => {
    group.isGenerating = false;
    this.cdr.detectChanges();
   });
 }

 /* Build the jsonData map (form values) used to fill the SEP template's [Token] variables. */
 private buildJsonData(): any {
  const t = this.teamCode.trim();
  const l = this.league.trim();
  const tn = this.teamName.trim();
  const c = this.concept.trim();
  const gc = this.garmentColors.trim();
  const pos = this.position.trim();
  return {
   TeamCode: t,
   'Team Code': t,
   League: l,
   TeamName: tn,
   'Team Name': tn,
   Concept: c,
   ConceptNumber: c,
   Styles: this.styleCode.trim(),
   GarmColors: gc,
   'Garm Colors': gc,
   Position: pos
  };
 }

 /*
  * Assemble the rich profileMetadata the separation engine needs (underbase flags/meshes, blocker,
  * ink-name formatting, artist, etc.), mirroring the Separations tab's assembly but sourced from the
  * standalone form + the shared profile lookups. Also returns the SEP template file name from
  * General Settings.
  */
 private async buildStandaloneProfileMetadata(
  group: StandaloneSeparationGroup
 ): Promise<{ meta: any; sepsTemplateFileName: string }> {
  const profileName = group.profileName;
  const position = this.position.trim();
  /* Colors carried for reference: prefer art-extracted spot inks, else the sheet's garment colors. */
  const colorCodes =
   group.colors && group.colors.length > 0
    ? group.colors
    : String(group.garmentColors || '')
       .split(',')
       .map((s) => s.trim())
       .filter((s) => s.length > 0);

  let profileCode = '';
  let profileInfo: any = null;
  const lookupOptions = { distress: false };

  try {
   const codeRes: any = await this.controller.getProfileCodeFromName(profileName, lookupOptions);
   if (codeRes && codeRes.success && codeRes.profileCode) {
    profileCode = String(codeRes.profileCode);
   }
  } catch (e) {
   /* non-fatal */
  }
  try {
   const infoRes: any = await this.controller.getProfileInformation(profileCode || profileName, lookupOptions);
   if (infoRes && infoRes.success && infoRes.profileInfo) {
    profileInfo = infoRes.profileInfo;
   }
  } catch (e) {
   /* non-fatal */
  }

  let artistName = '';
  let artistInitials = '';
  let sepsTemplateFileName = '';
  try {
   const gs: any = await this.controller.loadGeneralSettings();
   if (gs && gs.success && gs.data) {
    artistName = gs.data.artistName != null ? String(gs.data.artistName) : '';
    artistInitials = gs.data.artistInitials != null ? String(gs.data.artistInitials) : '';
    sepsTemplateFileName =
     gs.data.sepsTemplateFileName != null ? String(gs.data.sepsTemplateFileName).trim() : '';
   }
  } catch (e) {
   /* non-fatal */
  }

  const meta: any = {
   profileName: profileName,
   profileCode: profileCode,
   styleCodes: group.styleCodes,
   colorCodes: colorCodes,
   graphicName: position,
   createdDate: new Date().toISOString(),
   artistName: artistName,
   artistInitials: artistInitials,
   position: position,
   distress: false,
   profileDistress: 'N'
  };

  const toEnabled = (value: any): boolean => {
   if (value === true || value === 1) return true;
   if (typeof value === 'string') {
    const n = value.trim().toUpperCase();
    return n === 'Y' || n === 'YES' || n === 'TRUE' || n === '1';
   }
   return false;
  };

  if (profileInfo && profileInfo.found) {
   if (profileInfo.profileName) meta.resolvedProfileName = String(profileInfo.profileName);
   if (profileInfo.profileCode) meta.profileCode = String(profileInfo.profileCode);
   meta.underbaseEnabled = [
    true,
    !!profileInfo.underbase2Enabled,
    !!profileInfo.underbase3Enabled,
    !!profileInfo.underbase4Enabled
   ];
   meta.underbaseMeshes = [
    profileInfo.ub1Mesh != null ? String(profileInfo.ub1Mesh) : '',
    profileInfo.ub2Mesh != null ? String(profileInfo.ub2Mesh) : '',
    profileInfo.ub3Mesh != null ? String(profileInfo.ub3Mesh) : '',
    profileInfo.ub4Mesh != null ? String(profileInfo.ub4Mesh) : ''
   ];
   meta.underbaseKnockoutBlack = Array.isArray(profileInfo.underbaseKnockoutBlack)
    ? [
       !!profileInfo.underbaseKnockoutBlack[0],
       !!profileInfo.underbaseKnockoutBlack[1],
       !!profileInfo.underbaseKnockoutBlack[2],
       !!profileInfo.underbaseKnockoutBlack[3]
      ]
    : [false, false, false, false];
   const defaultUbSwatches = ['White UB', 'White UB', 'White UB', 'White UB'];
   const srcUbSwatches = profileInfo.underbaseKnockoutSwatches;
   meta.underbaseKnockoutSwatches = Array.isArray(srcUbSwatches)
    ? [0, 1, 2, 3].map((j) =>
       srcUbSwatches[j] != null && String(srcUbSwatches[j]).trim() !== ''
        ? String(srcUbSwatches[j]).trim()
        : defaultUbSwatches[j]
      )
    : defaultUbSwatches.slice();
   /* Empty entries -> the JSX generator uses the default "White UB N" naming. */
   meta.underbaseNames = ['', '', '', ''];
   meta.blackInksKnockoutDisplay =
    profileInfo.blackInksKnockoutDisplay != null ? String(profileInfo.blackInksKnockoutDisplay) : '';
   meta.underbaseSwatch =
    profileInfo.underbaseSwatch != null && String(profileInfo.underbaseSwatch).trim() !== ''
     ? String(profileInfo.underbaseSwatch).trim()
     : 'White UB';
   meta.blocker = toEnabled(profileInfo.blocker);
   meta.blockerMesh = profileInfo.blockerMesh != null ? String(profileInfo.blockerMesh) : '';
   meta.formatInkNameLabel = !!profileInfo.formatInkNameLabel;
   meta.colorNameLabelFormat =
    profileInfo.colorNameLabelFormat != null && String(profileInfo.colorNameLabelFormat).trim() !== ''
     ? String(profileInfo.colorNameLabelFormat).trim()
     : '';
  }

  return { meta, sepsTemplateFileName };
 }
}
