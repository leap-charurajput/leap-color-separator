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
 /*
  * Full LEAP item id (e.g. "FM02-127A-58-KPN"): <style>-<color code>-<org code>-<graphic code>.
  * Entering it fills those four fields; it is also emitted as the [Item ID] / [Item_ID] token.
  */
 itemId?: string;
 /* Optional SEP-grid token fields; blank-fallback so any token can be supplied manually. */
 teamName: string;
 concept: string;
 /*
  * Garment color TEXT for [Garm Colors] / [Colorway_Desc]. No longer a form field — taken from the
  * LICENSING sheet's "Color" value when present, otherwise the Color Code below.
  */
 garmentColors: string;
 /* Additional page-variable tokens supplied by the form (blank-fallback). */
 graphicName?: string;
 graphicCode?: string;
 /* Read from the LICENSING sheet (no form field) — see the component's field declarations. */
 player?: string;
 productLine?: string;
 season?: string;
 artRevisions?: string;
 /* Garment/body color CODE (COLOR_CODE_LOOKUP.xlsx) that sets the GARMENT swatch. */
 garmentColorCode?: string;
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
 /*
  * A job already recorded on the document (LEAPStandaloneJobs), supplied when the form is opened
  * from a Separations-tab row's Generate button. Pre-fills every field from that job instead of
  * re-reading the LICENSING sheet, and marks the export as already done so the user goes straight
  * to Generate. Null for a fresh "+" entry.
  */
 @Input() presetJob: any = null;

 /* ----- Form fields ----- */
 /*
  * Full LEAP item id, e.g. "FM02-127A-58-KPN". Typing/pasting one fills Style Code (FM02),
  * Color Code (127A), Team/Org Code (58) and Graphic Code (KPN) — see applyItemId(). When the
  * document supplies those four separately instead, the id is composed back from them.
  */
 itemId = '';
 position = '';
 /* The org code (LICENSING "Org code"); feeds [Team Code] / [Lineup_Org_Code] / [Team_Org_Code]. */
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
 /*
  * Garment color TEXT for the [Garm Colors] / [Colorway_Desc] tokens. NOT a form field: it comes
  * from the LICENSING sheet's "Color" value (or a restored job), and buildJsonData() falls back to
  * the Color Code when it is empty. The Color Code below is what the user actually edits.
  */
 garmentColors = '';
 /* Feeds the [Graphic Name] / [Art Code] / [Design Name] tokens (NOT the internal pipeline graphicName, which stays = position). */
 graphicName = '';
 /* Feeds the [Graphic Code] / [Graphic_code] document tokens. */
 graphicCode = '';
 /*
  * Read from the LICENSING sheet, no form field: nobody fills these by hand, but when the document
  * carries them the matching [Player] / [Product Line] / [Season] / [Art Revisions] tokens should
  * still print. Empty otherwise, which blanks the token rather than leaving it literal.
  */
 player = '';
 productLine = '';
 season = '';
 artRevisions = '';
 /*
  * Style color CODE (the "Color Code" field, e.g. 127A / 0484) — the second segment of the Item ID.
  * Looked up in COLOR_CODE_LOOKUP.xlsx (same as the LEAP flow) to set the GARMENT swatch, and
  * emitted as [Color Code] / [Style_Color_Code]. Blank -> the swatch keeps the default gray.
  */
 garmentColorCode = '';

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

 /*
  * Path of the document the form was last prefilled for (normalized). Used to detect a REAL
  * document switch so an unrelated refresh (a tab change, or the same document being re-activated)
  * does not wipe what the user is typing. Null until the first prefill resolves a document.
  */
 private lastPrefilledDocKey: string | null = null;
 /* Raw path of the source document (the one the art was selected in), for the XMP job stamp. */
 private sourceDocumentPath = '';

 /*
  * Documents CREATED by this standalone session (the exported ASSETS .ai, generated SEP docs),
  * normalized. Export/Generate open these in Illustrator, which fires documentAfterActivate —
  * that must NOT count as a "document switch", or the form and the separations view would be
  * wiped right after Export (the bug this guards against).
  */
 private sessionDocPaths = new Set<string>();

 /* Normalize a document path for comparison (slashes + case). */
 private normalizeDocPath(p: string): string {
  return String(p || '').trim().split('\\').join('/').toLowerCase();
 }

 /* True while our own Export/Generate is running (they activate documents we created). */
 private isBusyWithOwnDocuments(): boolean {
  if (this.isExporting || this.isGenerating) return true;
  for (let i = 0; i < this.separationGroups.length; i++) {
   if (this.separationGroups[i].isGenerating) return true;
  }
  return false;
 }

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {
  /*
   * Outside Illustrator (plain browser dev) the leap bridge is absent; keep the form
   * inert rather than throwing when the user experiments with it.
   */
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  this.startSelectionPolling();
  this.loadPositionOptions();
  this.checkServerBasePath();
  /*
   * Expose a prefill hook so the Graphics "+" button can refresh the form from the active
   * document each time it opens this tab. force=true: a "+" always re-reads for the current
   * selection and clears the previous export view.
   */
  (window as any)[StandaloneSeparationComponent.PREFILL_HOOK] = () => this.prefillForActiveDocument(true);
  /*
   * Prefill once on first load, EXCEPT when the form was opened with a stored job.
   * Angular runs ngOnChanges BEFORE ngOnInit, so applyPresetJob() has already populated every field
   * by now — re-reading the LICENSING sheet here would overwrite them (Team Code and League came back
   * empty, because LICENSING does not carry them).
   */
  if (!this.presetJob) {
   this.prefillForActiveDocument(true);
  }
 }

 /*
  * Trigger the LEAP-server-path check. The controller reports the outcome into DataIssuesService,
  * which the shell renders as the red banner — no local copy of the warning here, so the user is
  * never shown the same problem twice.
  */
 private checkServerBasePath(): void {
  if (this.isRunningInBrowser || typeof this.controller.getServerBasePathStatus !== 'function') {
   return;
  }
  this.controller.getServerBasePathStatus().catch(() => {
   /* Diagnostic only — never block the form on it. */
  });
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['presetJob'] && this.presetJob) {
   this.applyPresetJob(this.presetJob);
   return;
  }
  if (changes['documentRefreshKey'] && !changes['documentRefreshKey'].firstChange) {
   /*
    * Reload option lists on every refresh, and re-prefill ONLY when the active document actually
    * changed (prefillForActiveDocument(false) is a no-op on a same-document refocus / tab-change
    * bump, so a user mid-entry does not lose their typing). A real switch re-reads the new
    * document's LICENSING sheet and clears the previous document's values.
    */
   this.loadPositionOptions();
   this.prefillForActiveDocument(false);
  }
 }

 ngOnDestroy(): void {
  if (this.selectionPollInterval) {
   clearInterval(this.selectionPollInterval);
   this.selectionPollInterval = null;
  }
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
  * The user typed / pasted an Item ID (fires on change, blur and — via a 0ms defer, so ngModel has
  * caught up — on paste). Splits it into the four codes it is built from.
  */
 onItemIdChange(): void {
  if (this.applyItemId(this.itemId)) {
   /* Style Code changed with it: re-resolve the profile and invalidate a stale export. */
   this.onStyleCodeChange();
  }
  this.cdr.detectChanges();
 }

 /* Paste fires BEFORE the input value updates, so read the model on the next tick. */
 onItemIdPaste(): void {
  setTimeout(() => this.onItemIdChange(), 0);
 }

 /*
  * Split a LEAP item id into its four codes and write them onto the form.
  *
  *   FM02-127A-58-KPN  ->  Style Code FM02 | Color Code 127A | Team/Org Code 58 | Graphic Code KPN
  *
  * A graphic code containing dashes is preserved by joining everything after the third segment, so
  * only the first three separators are structural. Anything shorter than four segments is left
  * alone (a partially typed id must not wipe fields the user already filled in).
  * Returns true when the fields were updated.
  */
 private applyItemId(raw: string): boolean {
  const id = (raw || '').trim();
  if (!id) {
   return false;
  }
  const parts = id.split('-').map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 4) {
   return false;
  }
  this.styleCode = parts[0];
  this.garmentColorCode = parts[1];
  this.teamCode = parts[2];
  this.graphicCode = parts.slice(3).join('-');
  /* Keep the field showing the canonical (trimmed) id the codes were taken from. */
  this.itemId = id;
  return true;
 }

 /*
  * Compose the Item ID from the four codes when the document supplied them separately (LICENSING
  * sheet / restored job) and no id is set yet, so the field is never blank when it is derivable.
  */
 private composeItemIdFromParts(): void {
  if (this.itemId.trim()) {
   return;
  }
  const parts = [this.styleCode, this.garmentColorCode, this.teamCode, this.graphicCode].map((p) =>
   (p || '').trim()
  );
  if (parts.every((p) => p.length > 0)) {
   this.itemId = parts.join('-');
  }
 }

 /*
  * Entry point for (re)prefilling the form from the ACTIVE document.
  * - force = true  (first load, Graphics "+"): always re-read the sheet and clear the export view
  *   for the current selection; document-level manual fields are kept when the document is unchanged.
  * - force = false (documentRefreshKey bumped): act ONLY when the active document actually changed,
  *   so a same-document refocus or a tab-change refresh never clobbers in-progress typing. A real
  *   switch clears the whole form (previous document's data) before prefilling the new document.
  */
 prefillForActiveDocument(force: boolean): void {
  if (this.isRunningInBrowser) {
   return;
  }
  if (typeof this.controller.getActiveDocumentPath !== 'function') {
   /* Older build without the document-path probe: fall back to a plain prefill on forced entries. */
   if (force) {
    this.resetExportState();
    this.prefillFromLicensing();
   }
   return;
  }
  /*
   * Never react to activations caused by our OWN Export/Generate — they open documents we created
   * (the ASSETS export, the SEP doc), and treating that as a switch wiped the form + separations
   * view right after Export.
   */
  if (!force && this.isBusyWithOwnDocuments()) {
   return;
  }
  this.controller
   .getActiveDocumentPath()
   .then((path: string) => {
    const key = this.normalizeDocPath(path);
    /* A document this session created becoming active is not a switch — keep everything as-is. */
    if (!force && key && this.sessionDocPaths.has(key)) {
     return;
    }
    const docChanged = !!key && key !== this.lastPrefilledDocKey;
    if (!force && !docChanged) {
     /* Unrelated refresh on the same document — leave the user's input untouched. */
     return;
    }
    if (!force && docChanged) {
     /*
      * DOCUMENT SWITCH under a live form is owned by the GRAPHICS HOST: it closes this form and
      * reopens a fresh instance for the new document (whose ngOnInit prefills via the forced
      * path). Mutating fields here made values (e.g. Team Code) visibly flip on the still-open
      * form before that close/reopen landed — so on a non-forced switch, do nothing.
      */
     return;
    }
    if (docChanged && !this.sessionDocPaths.has(key)) {
     /* New document: drop the previous document's values entirely, then prefill the new one. */
     this.resetFormForNewDocument();
    } else if (!docChanged) {
     /* Same document, forced ("+"/new selection): only the post-Export view is stale. */
     this.resetExportState();
    }
    if (key && !this.sessionDocPaths.has(key)) {
     this.lastPrefilledDocKey = key;
     /* Raw (un-normalized) path of the document the user selected art in — the source document the
        standalone job is stamped onto at Export. lastPrefilledDocKey is lowercased/slash-normalized
        for comparison, so it cannot be used as a real path. */
     this.sourceDocumentPath = path || '';
    }
    /*
     * Assets already exported for this location? Restore the form + Separations view from the
     * sidecar JSON and skip the LICENSING read — no re-export needed.
     */
    if (this.tryRestoreFromSidecar(String(path || '').trim())) {
     return;
    }
    this.prefillFromLicensing();
   })
   .catch(() => {
    /* Could not resolve the document; on a forced entry still prefill best-effort. */
    if (force) {
     this.resetExportState();
     this.prefillFromLicensing();
    }
   });
 }

 /*
  * Persist the standalone job at Export time, to TWO places — one object, two homes:
  *
  *  1. A sidecar JSON next to the exported ASSETS .ai. Keyed by the EXPORT location, so the metadata
  *     can be reused for other files there and re-opening the source doc skips re-export.
  *  2. The SOURCE document's own XMP (`LEAPStandaloneJobs`). Keyed by the DOCUMENT, so the document
  *     itself records that a standalone job exists for it — the same way a LEAP version document
  *     carries LEAPSeparationProfileData. This is what lets the Separations tab show a standalone job
  *     without a dedicated Standalone tab.
  *
  * Neither is redundant: XMP travels inside the document (survives the exported file being moved),
  * the sidecar survives XMP being stripped and is readable without opening Illustrator.
  *
  * Both are best-effort — a persistence failure must never fail an export that actually succeeded.
  */
 private writeExportSidecar(colors: string[]): void {
  if (!this.exportedFilePath) return;

  const job = {
   itemId: this.itemId.trim(),
   position: this.position.trim(),
   teamCode: this.teamCode.trim(),
   league: this.league.trim(),
   styleCode: this.styleCode.trim(),
   profileName: this.profileName.trim(),
   teamName: this.teamName.trim(),
   concept: this.concept.trim(),
   garmentColors: this.garmentColors.trim(),
   garmentColorCode: this.garmentColorCode.trim(),
   graphicName: this.graphicName.trim(),
   graphicCode: this.graphicCode.trim(),
   player: this.player.trim(),
   productLine: this.productLine.trim(),
   season: this.season.trim(),
   artRevisions: this.artRevisions.trim(),
   exportedFileName: this.exportedFileName,
   exportedFilePath: this.exportedFilePath,
   colors: Array.isArray(colors) ? colors : [],
   /*
    * Which SOURCE document this job belongs to. Restore is doc-specific: several source files can
    * share one folder (and thus one ASSETS folder), and without this key a doc switch restored the
    * NEWEST sidecar regardless of owner — the previous document's Team Code etc. stuck on the form.
    */
   sourceDocumentPath: this.sourceDocumentPath
  };

  /* (1) Sidecar beside the exported .ai — panel-side via cep_node fs, no host round-trip. */
  try {
   const req = (window as any).cep_node?.require;
   if (req) {
    const fs = req('fs');
    const sidecarPath = this.exportedFilePath.replace(/\.ai$/i, '.json');
    fs.writeFileSync(sidecarPath, JSON.stringify(job, null, 2), 'utf8');
   }
  } catch (e) {
   console.warn('[STANDALONE] Could not write export sidecar:', e);
  }

  /* (2) Source-document XMP. Upserted by exportedFilePath, so re-exporting the same selection
     replaces its entry rather than stacking duplicates. */
  try {
   if (typeof this.controller.writeStandaloneJobToXmp === 'function') {
    this.controller
     .writeStandaloneJobToXmp({ ...job, sourceDocumentPath: this.sourceDocumentPath }, this.sourceDocumentPath)
     .then((res: any) => {
      if (res && res.success) {
       console.log(
        '[STANDALONE] Job recorded on source document XMP (' +
         res.jobCount +
         ' job(s), ' +
         (res.replaced ? 'replaced existing' : 'new entry') +
         ')'
       );
      } else {
       console.warn('[STANDALONE] Could not record job on source XMP:', res && res.error);
      }
     })
     .catch((err: any) => console.warn('[STANDALONE] Source XMP write error:', err));
   }
  } catch (e) {
   console.warn('[STANDALONE] Could not record job on source XMP:', e);
  }
 }

 /*
  * Restore the form + Separations view from the newest ASSETS sidecar whose .ai still exists.
  * Returns true when restored (caller then skips the LICENSING prefill and the Export step).
  */
 private tryRestoreFromSidecar(activeDocPath: string): boolean {
  try {
   const req = (window as any).cep_node?.require;
   if (!req || !activeDocPath) return false;
   const fs = req('fs');
   const path = req('path');
   const assetsDir = path.join(path.dirname(activeDocPath), 'ASSETS');
   if (!fs.existsSync(assetsDir)) return false;
   const jsons = fs
    .readdirSync(assetsDir)
    .filter((f: string) => /\.json$/i.test(f))
    .map((f: string) => path.join(assetsDir, f))
    .sort((a: string, b: string) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
   for (const jp of jsons) {
    let sc: any = null;
    try { sc = JSON.parse(fs.readFileSync(jp, 'utf8')); } catch (pe) { continue; }
    if (!sc || !sc.exportedFilePath || !fs.existsSync(sc.exportedFilePath)) continue;
    /*
     * DOC-SPECIFIC restore: a shared folder means a shared ASSETS folder, and its newest sidecar
     * may belong to a DIFFERENT source document — restoring it left the previous document's
     * Team Code etc. on the form. Only a sidecar recorded for THIS document qualifies; older
     * sidecars without the field are skipped (never restore foreign data).
     */
    const scSource = this.normalizeDocPath(String(sc.sourceDocumentPath || ''));
    if (!scSource || scSource !== this.normalizeDocPath(activeDocPath)) continue;
    /* Apply the stored form values (they were user-confirmed at export time). */
    this.itemId = String(sc.itemId || '');
    this.position = String(sc.position || '');
    this.teamCode = String(sc.teamCode || '');
    this.league = String(sc.league || '');
    this.styleCode = String(sc.styleCode || '');
    this.profileName = String(sc.profileName || '');
    this.teamName = String(sc.teamName || '');
    this.concept = String(sc.concept || '');
    this.garmentColors = String(sc.garmentColors || '');
    this.garmentColorCode = String(sc.garmentColorCode || '');
    this.graphicName = String(sc.graphicName || '');
    this.graphicCode = String(sc.graphicCode || '');
    this.player = String(sc.player || '');
    this.productLine = String(sc.productLine || '');
    this.season = String(sc.season || '');
    this.artRevisions = String(sc.artRevisions || '');
    /* Sidecars written before the Item ID field existed still have the four codes. */
    this.composeItemIdFromParts();
    this.exported = true;
    this.exportedFileName = String(sc.exportedFileName || '');
    this.exportedFilePath = String(sc.exportedFilePath || '');
    this.sessionDocPaths.add(this.normalizeDocPath(this.exportedFilePath));
    this.separationGroups = this.buildSeparationGroups(
     Array.isArray(sc.colors) ? sc.colors : []
    );
    this.statusMessage = 'Restored from previous export: ' + this.exportedFileName;
    /* Restore paths skip the LICENSING read — record here so the debug box is not empty. */
    try {
     this.licensingDebug = 'RESTORED FROM SIDECAR: ' + jp + '\n' + JSON.stringify(sc, null, 2);
    } catch (dbgErr) { /* debug only */ }
    this.cdr.detectChanges();
    return true;
   }
   return false;
  } catch (e) {
   return false;
  }
 }

 /* Clear the post-Export view (separations grouped by profile) — it belongs to a specific selection. */
 private resetExportState(): void {
  this.exported = false;
  this.exportedFileName = '';
  this.exportedFilePath = '';
  this.separationGroups = [];
  this.statusMessage = '';
  this.warningMessage = '';
 }

 /* Clear every editable field + the export view when moving to a DIFFERENT document. */
 private resetFormForNewDocument(): void {
  this.itemId = '';
  this.position = '';
  this.teamCode = '';
  this.league = '';
  this.styleCode = '';
  this.profileName = '';
  this.profileResolveWarning = '';
  this.teamName = '';
  this.concept = '';
  this.garmentColors = '';
  this.garmentColorCode = '';
  this.graphicName = '';
  this.graphicCode = '';
  this.player = '';
  this.productLine = '';
  this.season = '';
  this.artRevisions = '';
  this.resetExportState();
 }

 /*
  * Read the active document's LICENSING sheet and prefill the form. Called via
  * prefillForActiveDocument on first load and whenever the Graphics "+" button opens this tab.
  * Safe to call repeatedly; on error the form is simply left as-is. Only non-empty extracted values
  * are applied, so a partial sheet never blanks a field.
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
     /* No LICENSING sheet at all — the file name is the only metadata source. */
     this.applyFilenameFallbacks();
     this.resolveProfileFromStyle();
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
    /* Sheet did not supply everything (League never does) — derive missing values from the file name. */
    this.applyFilenameFallbacks();
    /* Style Code just changed via prefill — resolve its profile from Styles.xlsx. */
    this.resolveProfileFromStyle();
   })
   .catch((err: any) => {
    /* Ignore: leave the form untouched if the sheet cannot be read — file-name fallbacks still apply. */
    this.licensingDebug = 'getLicensingInfo error: ' + (err && err.message ? err.message : String(err));
    this.applyFilenameFallbacks();
    this.resolveProfileFromStyle();
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

  out.designName = at(0);
  out.conceptCode = at(1);
  out.player = at(2);
  /* Row 3 is the sheet's date and row 4 the artist — both come from settings / the run itself. */
  out.productLine = at(5);
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
 /*
  * Known league codes for the file-name fallback. The first file-name segment may carry a suffix
  * (e.g. "MLBN" -> league "MLB"), so we prefix-match against this list; an unmatched segment is
  * used as-is. Extend as new leagues appear.
  */
 private static readonly KNOWN_LEAGUES = [
  'WNBA', 'NCAA', 'MILB', 'MLB', 'NFL', 'NBA', 'NHL', 'MLS', 'USFL', 'XFL'
 ];

 /*
  * Derive missing form values from the SOURCE DOCUMENT FILE NAME. Naming convention:
  * <LEAGUE...>_<CONCEPT>_<STYLE>_<...>  e.g. "MLBN_0FWK_N199_FZD31" ->
  * league "MLB" (known-league prefix of segment 1), concept "0FWK" (segment 2),
  * style "N199" (segment 3). The LICENSING sheet never carries League, so this is its primary
  * source. Fills ONLY still-empty fields — never overwrites sheet or user input.
  */
 private applyFilenameFallbacks(): void {
  try {
   const p = String(this.sourceDocumentPath || '');
   if (!p) return;
   /* Unsaved docs have a pseudo-path ("/Untitled-3") — deriving League from that pollutes the form. */
   if (!this.isSourceDocSaved) return;
   const base = p.split('\\').join('/').split('/').pop() || '';
   const name = base.replace(/\.[^.]+$/, '');
   if (!name) return;
   const segs = name.split('_').map((s) => s.trim()).filter((s) => s.length > 0);
   if (!segs.length) return;

   /*
    * TEAM CODE — the 4th segment is <ORGCODE><GRAPHICCODE> (e.g. "DQSD31" -> DQS + D31,
    * "DNVD31" -> DNV + D31; same split the CAD PNG name uses). The FILE NAME is AUTHORITATIVE
    * here — sibling files differing only in this segment are different teams, while the LICENSING
    * sheet inside them can carry a stale/shared Org code (seen: sheet said GIA, file said DQS).
    * So this OVERRIDES the sheet value, unlike the fill-if-empty fields below.
    */
   if (segs.length > 3) {
    const m4 = segs[3].match(/^(.*?)([A-Za-z]\d+)$/);
    if (m4 && m4[1]) {
     this.teamCode = m4[1];
    }
   }

   if (!this.league.trim()) {
    const segUpper = segs[0].toUpperCase();
    const known = StandaloneSeparationComponent.KNOWN_LEAGUES.find(
     (lg) => segUpper.indexOf(lg) === 0
    );
    this.league = known || segs[0];
   }
   if (!this.concept.trim() && segs.length > 1) {
    this.concept = segs[1];
   }
   if (!this.styleCode.trim() && segs.length > 2) {
    this.styleCode = segs[2];
   }
  } catch (e) {
   /* best-effort — a malformed name simply leaves the fields for the user */
  }
 }

 private applyLicensingRaw(raw: any): void {
  const pick = (v: any) => (v != null ? String(v).trim() : '');

  const orgCode = pick(raw.orgCode);
  const teamName = pick(raw.teamName);
  const conceptCode = pick(raw.conceptCode);
  const style = pick(raw.style);
  const color = pick(raw.color);
  const placement = pick(raw.placement);
  /* Remaining LICENSING labels, each backing a form field / [Token] of the same name. */
  const designName = pick(raw.designName);
  const graphicCode = pick(raw.graphicCode);
  const player = pick(raw.player);
  const productLine = pick(raw.productLine);
  const season = pick(raw.season);
  const artRevisions = pick(raw.artRevisions);

  if (orgCode) this.teamCode = orgCode; /* Team Code = Org code, per the LICENSING sheet. */
  if (teamName) this.teamName = teamName;
  if (conceptCode) this.concept = conceptCode;
  if (style) this.styleCode = style;
  if (designName) this.graphicName = designName;
  if (graphicCode) this.graphicCode = graphicCode;
  if (player) this.player = player;
  if (productLine) this.productLine = productLine;
  if (season) this.season = season;
  if (artRevisions) this.artRevisions = artRevisions;
  if (color) {
   /*
    * The sheet's "Color" field carries garment color CODES (e.g. "0484, 0042") — the same codes
    * COLOR_CODE_LOOKUP.xlsx is keyed by — not descriptive names. Keep the full string as the
    * [Garm Colors] token text, AND feed the FIRST code into the lookup field that sets the
    * GARMENT swatch (mirrors the LEAP flow, which looks up the first color code).
    */
   this.garmentColors = color;
   const firstColorToken = color.split(/[,/]+/)[0].trim();
   if (/^[0-9A-Za-z]{2,6}$/.test(firstColorToken)) {
    this.garmentColorCode = firstColorToken;
   }
  }

  const mappedPosition = this.mapPlacementToPosition(placement);
  if (mappedPosition) this.position = mappedPosition;

  /*
   * The LICENSING sheet has no Item ID row, but it carries the four codes the id is built from —
   * show the composed id so the user sees (and can correct) the same value the [Item ID] token gets.
   */
  this.composeItemIdFromParts();
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
 /*
  * Live Illustrator selection state. Export copies the SELECTED artwork into the ASSETS file, so with
  * nothing selected it would export an empty document — the button is disabled instead. Polled the
  * same way the Graphics tab does it: Illustrator raises no selection-changed event to CEP.
  */
 hasSelection = false;
 private selectionPollInterval: any;

 private startSelectionPolling(): void {
  if (this.isRunningInBrowser) return;
  this.refreshSelectionState();
  this.selectionPollInterval = setInterval(() => this.refreshSelectionState(), 700);
 }

 private refreshSelectionState(): void {
  this.controller
   .getSelectionCount()
   .then((count: number) => {
    const next = (count || 0) > 0;
    if (next !== this.hasSelection) {
     this.hasSelection = next;
     this.cdr.detectChanges();
    }
   })
   .catch(() => { });
  this.validateExportedFileStillExists();
 }

 /*
  * The post-Export state ("Generate without a selection") is only valid while the exported .ai is
  * still ON DISK. If the user deletes it, exported=true would keep the Export button enabled with
  * nothing selected — and Generate would fail on a missing file. Piggybacks on the selection poll;
  * a cheap fs.existsSync every 700ms.
  */
 private validateExportedFileStillExists(): void {
  if (!this.exported || !this.exportedFilePath) return;
  try {
   const req = (window as any).cep_node?.require;
   if (!req) return;
   const fs = req('fs');
   if (!fs.existsSync(this.exportedFilePath)) {
    this.resetExportState();
    this.warningMessage = 'The exported file was deleted — select the artwork and Export again.';
    this.cdr.detectChanges();
   }
  } catch (e) {
   /* best-effort — never break the poll */
  }
 }

 /*
  * CAD reference PNG for the standalone flow (mirrors the LEAP flow's CAD placement). The PNG name
  * is derived from values already on the form + the source file name:
  *   <STYLE>-<COLORCODE>-<PREFIX>-<GCODE>.png
  * e.g. source "MLBN_0FWK_N199_ANGD31" + garment color code "10A" -> "N199-10A-ANG-D31.png"
  * (the 4th file-name segment "ANGD31" splits into "ANG" + "D31" at its final letter+digits run).
  * Searched in a "PNG" folder at the source document's level, one level up and two levels up —
  * case-insensitive file match. Returns '' when anything is missing; the CAD image is optional.
  */
 private resolveCadPngPath(): string {
  try {
   const req = (window as any).cep_node?.require;
   if (!req) return '';
   const fs = req('fs');
   const path = req('path');
   const src = String(this.sourceDocumentPath || '').trim();
   if (!src) return '';

   const base = src.split('\\').join('/').split('/').pop() || '';
   const name = base.replace(/\.[^.]+$/, '');
   const segs = name.split('_').map((s) => s.trim()).filter((s) => s.length > 0);

   const style = this.styleCode.trim() || (segs.length > 2 ? segs[2] : '');
   /*
    * The PNG folder holds ONE PNG PER COLORWAY (e.g. N199-10A-… and N199-20B-…). Choose the one
    * for the color code THIS separation is generated for = the FIRST Garment Color Code (the same
    * code that sets the GARMENT/body swatch). Remaining codes are tried only as fallback when the
    * first code's PNG is missing.
    */
   const colorCodes = this.garmentColorCode
    .split(/[,/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
   const lastSeg = segs.length > 3 ? segs[3] : '';
   /* "ANGD31" -> ["ANG", "D31"]: split at the final letter-followed-by-digits run. */
   const m = lastSeg.match(/^(.*?)([A-Za-z]\d+)$/);
   if (!style || !colorCodes.length || !m || !m[1]) return '';

   /* Collect the PNG dirs once (doc level, one up, two up). */
   const pngDirs: string[] = [];
   let dir = path.dirname(src);
   for (let level = 0; level < 3; level++) {
    pngDirs.push(path.join(dir, 'PNG'));
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
   }

   /* Color code has priority over folder level: the generating code's PNG wins wherever it lives. */
   for (const code of colorCodes) {
    const pngName = (style + '-' + code + '-' + m[1] + '-' + m[2] + '.png').toLowerCase();
    for (const pngDir of pngDirs) {
     try {
      if (fs.existsSync(pngDir)) {
       const files: string[] = fs.readdirSync(pngDir);
       for (const f of files) {
        if (String(f).toLowerCase() === pngName) {
         return path.join(pngDir, f);
        }
       }
      }
     } catch (e) {
      /* unreadable level — keep looking */
     }
    }
   }
  } catch (e) {
   /* best-effort — CAD image is optional */
  }
  return '';
 }

 /*
  * Export writes the ASSETS folder NEXT TO the document, so an UNSAVED document has nowhere to
  * export to — the host reports a pseudo-path for it ("/Untitled-3") with no file extension,
  * while a saved artwork file always has one.
  */
 get isSourceDocSaved(): boolean {
  return /\.[a-z0-9]{1,5}$/i.test(String(this.sourceDocumentPath || '').trim());
 }

 get canGenerate(): boolean {
  if (this.isGenerating || this.isRunningInBrowser || this.isResolvingProfile) {
   return false;
  }
  /*
   * Export needs a live selection. Skipped once the artwork has been exported (or the form was
   * restored from a stored job): the .ai already exists on disk, so Generate no longer depends on
   * what is selected in the document.
   */
  if (!this.exported && !this.hasSelection) {
   return false;
  }
  /* And a SAVED document — no ASSETS destination exists next to an unsaved one. */
  if (!this.exported && !this.isSourceDocSaved) {
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
   itemId: this.effectiveItemId,
   position: this.position.trim(),
   teamCode: this.teamCode.trim(),
   league: this.league.trim(),
   styleCode: this.styleCode.trim(),
   profileName: this.profileName.trim(),
   teamName: this.teamName.trim(),
   concept: this.concept.trim(),
   garmentColors: this.garmentColors.trim(),
   graphicName: this.graphicName.trim(),
   graphicCode: this.graphicCode.trim(),
   player: this.player.trim(),
   productLine: this.productLine.trim(),
   season: this.season.trim(),
   artRevisions: this.artRevisions.trim(),
   garmentColorCode: this.garmentColorCode.trim(),
   exportedFilePath: this.exportedFilePath || undefined
  };
 }

 /*
  * Garment color TEXT for [Garm Colors] / [Colorway_Desc] and the "no spot inks" message. The
  * Garment Colors input was removed, so this is the LICENSING sheet's "Color" value when the
  * document had one, and otherwise the Color Code the user entered.
  */
 private get garmentColorsText(): string {
  return this.garmentColors.trim() || this.garmentColorCode.trim();
 }

 /*
  * The Item ID to publish: what the user entered, or — when they entered nothing — the id composed
  * from the four codes, so [Item ID] resolves even on a form filled field-by-field.
  */
 private get effectiveItemId(): string {
  const typed = this.itemId.trim();
  if (typed) {
   return typed;
  }
  const parts = [this.styleCode, this.garmentColorCode, this.teamCode, this.graphicCode].map((p) =>
   (p || '').trim()
  );
  return parts.every((p) => p.length > 0) ? parts.join('-') : '';
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
    /*
     * The exported file is now open/active in Illustrator. Register it as OUR document so the
     * documentAfterActivate it fires is not mistaken for a switch (which would wipe the form
     * and this separations view).
     */
    if (this.exportedFilePath) {
     this.sessionDocPaths.add(this.normalizeDocPath(this.exportedFilePath));
    }
    this.statusMessage = 'Exported to ASSETS: ' + this.exportedFileName;
    /* Decoration inks extracted from the art, to show as the group's Colors. */
    const colors: string[] = Array.isArray(result.colors)
     ? result.colors.map((c: any) => String(c || '').trim()).filter((c: string) => c.length > 0)
     : [];
    /*
     * The separation engine (splitColors) builds ink plates from SPOT colors only — LEAP art is
     * always spot-swatched, but an arbitrary standalone file may use process/CMYK fills. Warn now,
     * at Export, so the user isn't surprised by an empty Plates list after Generate.
     */
    if (colors.length === 0) {
     this.warningMessage =
      'No spot-color inks found in the selected artwork. Separation plates are built from spot ' +
      'swatches — convert the artwork colors to spot swatches (Swatches panel) and re-export, or ' +
      'the generated separation will have no ink plates.';
    }
    /*
     * Persist the metadata: sidecar next to the exported .ai, and the job on the SOURCE document's
     * XMP. The XMP copy is what the Separations tab reads, so it must be written BEFORE we navigate.
     */
    this.writeExportSidecar(colors);
    /*
     * Export is the end of this form's job. The separation itself is shown on the SEPARATIONS tab,
     * which lists every standalone job recorded on the document (with its own Generate button) — so
     * close the form and go there rather than showing a second, competing copy of that view here.
     * Skipped when the artwork has no spot inks: the warning above needs to stay on screen.
     */
    this.separationGroups = [];
    if (colors.length > 0) {
     this.finishAndShowSeparations();
    } else {
     this.separationGroups = this.buildSeparationGroups(colors);
    }
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
  * Close the form and hand over to the Separations tab. The XMP job stamp written at Export is what
  * that tab reads, so the navigation bump makes it re-read the document and show the new job.
  */
 private finishAndShowSeparations(): void {
  /*
   * Export closes the exported document and re-activates the source one, which fires
   * documentAfterActivate — and the shell's auto-routing would send the user to Graphics, undoing
   * this handover. Suppress that routing for a short window so the navigation below wins.
   */
  (window as any).__LEAP_STANDALONE_HANDOVER_UNTIL__ = Date.now() + 3000;
  const close = (window as any).__LEAP_STANDALONE_CLOSE__;
  if (typeof close === 'function') {
   close();
  }
  const nav = (window as any).__LEAP_TAB_NAVIGATION__;
  if (nav && typeof nav.navigateToTab === 'function') {
   /* Delay so the export's own document activation settles before the tab refreshes. */
   setTimeout(() => nav.navigateToTab(1), 600);
  }
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
    garmentColors: this.garmentColorsText,
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
     exportedFilePath: this.exportedFilePath,
     cadPngPath: this.resolveCadPngPath() || undefined
    });
   })
   .then((result: any) => {
    /*
     * Host diagnostics come back in the response and are echoed to the console, because the
     * ExtendScript-side file logger silently fails here (no [JSX] line ever reaches leap_seps.log).
     * console.* IS captured by the panel file logger, so this is the transport that actually works.
     * Logged for success AND failure — a wrong-plates run reports success.
     */
    if (result && Array.isArray(result.debugLog)) {
     for (const line of result.debugLog) {
      console.log('[STANDALONE] ' + line);
     }
    }
    if (result && result.success) {
     group.status = 'Separation generated. Opening Plates…';
     /* The generated SEP doc is ours too — its activation must not reset this form. */
     if (result.separatedDocumentPath) {
      this.sessionDocPaths.add(this.normalizeDocPath(String(result.separatedDocumentPath)));
     }
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

 /*
  * Build the jsonData map (form values) used to fill the SEP template's [Token] variables.
  * Every known page-variable token is included (blank-defaulted) so no literal "[Token]" is left in
  * the separated document — findValueInJSON returns the empty string and the host replaces the token
  * with it. Key variants (spaced + unspaced) match the host's normalized token lookup.
  */
 private buildJsonData(): any {
  const t = this.teamCode.trim();
  const l = this.league.trim();
  const tn = this.teamName.trim();
  const c = this.concept.trim();
  const pos = this.position.trim();
  const style = this.styleCode.trim();
  const colorCode = this.garmentColorCode.trim();
  const gc = this.garmentColorsText;
  /* [Graphic Name]/[Art Code]/[Design Name] fall back to Position (the value the pipeline uses
     as graphicName) when the Graphic Name field is left empty. */
  const gn = this.graphicName.trim() || pos;
  const gcode = this.graphicCode.trim();
  const item = this.effectiveItemId;
  const player = this.player.trim();
  const productLine = this.productLine.trim();
  const season = this.season.trim();
  const artRev = this.artRevisions.trim();
  return {
   /* Item ID, and the four codes it is composed of. */
   Item_ID: item,
   'Item ID': item,
   TeamCode: t,
   'Team Code': t,
   'Org Code': t,
   League: l,
   League_desc: l,
   TeamName: tn,
   'Team Name': tn,
   Graphic_Org_Name: tn,
   Concept: c,
   ConceptNumber: c,
   'Concept Code': c,
   Styles: style,
   Style: style,
   'Style#': style,
   'Style Code': style,
   Lineup_Style_Code: style,
   'Color Code': colorCode,
   Style_Color_Code: colorCode,
   Color: gc,
   Color_Desc: gc,
   GarmColors: gc,
   'Garm Colors': gc,
   Position: pos,
   /* Additional page-variable tokens sourced from the form (see field declarations). */
   GraphicName: gn,
   'Graphic Name': gn,
   'Art Code': gn,
   'Design Name': gn,
   Graphic_Name: gn,
   'Graphic Code': gcode,
   Graphic_code: gcode,
   Player: player,
   'Player Name': player,
   'Player Jersey Name': player,
   'Product Line': productLine,
   ProductLine: productLine,
   Season: season,
   Style_Season: season,
   'Art Revisions': artRev,
   /* No source at all in standalone — emitted empty so their [Token]s are blanked, not left literal. */
   Brand: '',
   'ORG-GRP': '',
   ORGGRP: '',
   Template: '',
   /*
    * SEP-template tokens under their EXACT document spelling (findValueInJSON matches
    * hasOwnProperty first): concept, org code and colorway all come from the form.
    */
   GRAPHIC_CONCEPT_CODE: c,
   Graphic_Concept_Code: c,
   Lineup_Org_Code: t,
   LINEUP_ORG_CODE: t,
   Team_Org_Code: t,
   True_Org_Code: t,
   Colorway_Desc: gc,
   COLORWAY_DESC: gc
   /*
    * NOT emitted here, on purpose: [DATE], [ARTIST], [Artist Initials], [POS] and [STYLE_CODE] are
    * filled by the host from profileMetadata (updateVariablesInDocument special-cases them), and
    * [C#], [V#] and [CONTROL] are calculated at separation / export time.
    */
  };
 }

 /*
  * Assemble the rich profileMetadata the separation engine needs (underbase flags/meshes, blocker,
  * ink-name formatting, artist, etc.), mirroring the Separations tab's assembly but sourced from the
  * standalone form + the shared profile lookups. Also returns the SEP template file name from
  * General Settings.
  */
 /*
  * Custom per-underbase names for a profile, read from the raw Profiles.json.
  *
  * The leap-bundle profileInfo does not expose `underbaseNames`, so the names have to come from the
  * profile records directly. Mirrors resolveUnderbaseNamesForProfile in separations.component.ts —
  * kept as a local copy because the two pages share no base class today. Returns four entries; an
  * empty entry means "use the default White UB N naming".
  */
 /*
  * Restore the form from a job already recorded on the document, then jump straight to the
  * post-Export state: the artwork was exported when the job was first created, so the .ai already
  * exists and only Generate remains. Used when the user presses Generate on a Separations-tab row.
  */
 private applyPresetJob(job: any): void {
  if (!job) return;
  /* Restore paths skip the LICENSING read, which left the temporary debug box empty — record here. */
  try {
   this.licensingDebug = 'RESTORED FROM XMP JOB:\n' + JSON.stringify(job, null, 2);
  } catch (e) { /* debug only */ }
  this.itemId = job.itemId ? String(job.itemId) : '';
  this.position = job.position ? String(job.position) : '';
  this.teamCode = job.teamCode ? String(job.teamCode) : '';
  this.league = job.league ? String(job.league) : '';
  this.styleCode = job.styleCode ? String(job.styleCode) : '';
  this.profileName = job.profileName ? String(job.profileName) : '';
  this.teamName = job.teamName ? String(job.teamName) : '';
  this.concept = job.concept ? String(job.concept) : '';
  this.garmentColors = job.garmentColors ? String(job.garmentColors) : '';
  this.garmentColorCode = job.garmentColorCode ? String(job.garmentColorCode) : '';
  this.graphicName = job.graphicName ? String(job.graphicName) : '';
  this.graphicCode = job.graphicCode ? String(job.graphicCode) : '';
  this.player = job.player ? String(job.player) : '';
  this.productLine = job.productLine ? String(job.productLine) : '';
  this.season = job.season ? String(job.season) : '';
  this.artRevisions = job.artRevisions ? String(job.artRevisions) : '';
  /* Jobs recorded before the Item ID field existed still carry the four codes. */
  this.composeItemIdFromParts();
  this.exportedFileName = job.exportedFileName ? String(job.exportedFileName) : '';
  this.exportedFilePath = job.exportedFilePath ? String(job.exportedFilePath) : '';
  this.sourceDocumentPath = job.sourceDocumentPath ? String(job.sourceDocumentPath) : '';
  this.exported = !!this.exportedFilePath;
  const colors: string[] = Array.isArray(job.colors) ? job.colors.filter((c: any) => !!c) : [];
  this.separationGroups = this.profileName
   ? [
      {
       profileName: this.profileName,
       styleCodes: this.styleCode ? [this.styleCode] : [],
       colors: colors,
       garmentColors: this.garmentColorsText,
       isGenerating: false,
       status: '',
       error: ''
      }
     ]
   : [];
  /* Its own document is already open/known — do not let its activation reset this form. */
  if (this.exportedFilePath) {
   this.sessionDocPaths.add(this.normalizeDocPath(this.exportedFilePath));
  }
  this.statusMessage = 'Loaded a saved standalone job. Generate the separation when ready.';
  this.cdr.detectChanges();

  /*
   * Opened by the Separations tab's Generate button: run it straight away instead of waiting for the
   * user to press Generate again on a form they never asked to see. Deferred a tick so the group
   * above is bound first. generateGroup() navigates to Plates on success, as the LEAP flow does.
   */
  if (job.autoGenerate && this.separationGroups.length > 0) {
   this.statusMessage = 'Generating separation…';
   setTimeout(() => this.generateGroup(this.separationGroups[0]), 0);
  }
 }

 private async resolveUnderbaseNamesForProfile(profileCode: string, profileName: string): Promise<string[]> {
  const empty = ['', '', '', ''];
  try {
   if (this.isRunningInBrowser || !this.controller.getSeparationProfiles) return empty;
   const result: any = await this.controller.getSeparationProfiles();
   const profiles: any[] = result && result.success && Array.isArray(result.profiles) ? result.profiles : [];
   const code = String(profileCode || '').trim().toLowerCase();
   const name = String(profileName || '').trim().toLowerCase();
   const match = profiles.find((p) => {
    const pc = String((p && (p['Profile Code'] ?? p.profileCode)) || '').trim().toLowerCase();
    const pn = String((p && (p['Profile Name'] ?? p.profileName ?? p.name)) || '').trim().toLowerCase();
    return (!!code && pc === code) || (!!name && pn === name);
   });
   const arr = match && Array.isArray(match.underbaseNames) ? match.underbaseNames : null;
   if (!arr) return empty;
   return [0, 1, 2, 3].map((i) => (arr[i] != null ? String(arr[i]).trim() : ''));
  } catch (_) {
   return empty;
  }
 }

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
  /*
   * Resolve the LEAP Data base path via the panel (CEP) resolver and pass it to the leap-bundle
   * profile lookup — the Node-side existsSync gate fails persistently on some cloud/network drives
   * (same workaround as the Styles.xlsx profile-name lookup above). Without profileInfo the meta
   * carries NO underbase/blocker config, and White UB / Choke generate wrong vs the LEAP flow.
   */
  let dataBasePath = '';
  try {
   if (typeof this.controller.getLeapServerDataPath === 'function') {
    dataBasePath = String((await this.controller.getLeapServerDataPath()) || '').trim();
   }
  } catch (e) {
   dataBasePath = '';
  }
  try {
   const infoOptions: any = dataBasePath ? { ...lookupOptions, basePath: dataBasePath } : lookupOptions;
   const infoRes: any = await this.controller.getProfileInformation(profileCode || profileName, infoOptions);
   if (infoRes && infoRes.success && infoRes.profileInfo) {
    profileInfo = infoRes.profileInfo;
   }
  } catch (e) {
   /* non-fatal */
  }
  if (!profileInfo || !profileInfo.found) {
   /* Surface it — underbase/choke/blocker would silently generate with defaults otherwise. */
   group.error =
    'Profile settings could not be loaded from Profiles.json (underbase/choke config missing). ' +
    'Check General Settings → Data Folder Path, then retry.';
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
   /* Mirror the LEAP flow: the profile's own distress flag wins over the form default. */
   if (profileInfo.distress != null && String(profileInfo.distress).trim() !== '') {
    meta.profileDistress = String(profileInfo.distress).trim().toUpperCase() === 'Y' ? 'Y' : 'N';
   }
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
   /*
    * Custom per-UB names live in the raw Profiles.json (the Node profileInfo does not expose them),
    * so read them directly — same as the LEAP flow. Hardcoding empties here meant a profile with
    * custom underbase names (e.g. "SL White UB" / "SL White UB 2nd") silently fell back to the
    * default "White UB N" naming, producing different swatch + layer names than the LEAP path.
    * Empty entries still mean "use the default naming".
    */
   meta.underbaseNames = await this.resolveUnderbaseNamesForProfile(
    meta.profileCode,
    meta.resolvedProfileName || profileName
   );
   meta.blackInksKnockoutDisplay =
    profileInfo.blackInksKnockoutDisplay != null ? String(profileInfo.blackInksKnockoutDisplay) : '';
   meta.underbaseSwatch =
    profileInfo.underbaseSwatch != null && String(profileInfo.underbaseSwatch).trim() !== ''
     ? String(profileInfo.underbaseSwatch).trim()
     : 'White UB';
   meta.blocker = toEnabled(profileInfo.blocker);
   meta.blockerMesh = profileInfo.blockerMesh != null ? String(profileInfo.blockerMesh) : '';
   meta.formatInkNameLabel = !!profileInfo.formatInkNameLabel;
   /*
    * Same fallback as the LEAP flow. An empty format is NOT equivalent to the default:
    * renameFormattedInks self-defaults to "PANTONE ### C", but resolveSharedWhitePlateSwatchName
    * (color_separation.jsx) gates on `if (fmt)` and builds no candidates when it is blank — so the
    * format-aware white-plate sharing was silently skipped in standalone, giving different white /
    * underbase plates than the LEAP path for the same artwork.
    */
   meta.colorNameLabelFormat =
    profileInfo.colorNameLabelFormat != null && String(profileInfo.colorNameLabelFormat).trim() !== ''
     ? String(profileInfo.colorNameLabelFormat).trim()
     : 'PANTONE ### C';
  }

  /*
   * Body/garment swatch color from COLOR_CODE_LOOKUP.xlsx, keyed by the garment color CODE
   * (prefilled with the first code from the LICENSING sheet; the split guards against a user
   * typing several codes — the FIRST one wins, mirroring the LEAP Separations flow). When unset/
   * not found the swatch keeps its default gray. Best-effort — a lookup failure never blocks
   * generation.
   */
  const garmentCode = this.garmentColorCode.split(/[,/]+/)[0].trim();
  if (garmentCode && !this.isRunningInBrowser && this.controller.getColorByCodeFromLookup) {
   try {
    /* Pass the panel-resolved base path — the Node-side resolver fails on cloud drives. */
    const lookupResult: any = await (this.controller.getColorByCodeFromLookup as any)(garmentCode, dataBasePath || undefined);
    if (lookupResult && lookupResult.success && lookupResult.color) {
     meta.bodyColorData = {
      bodyColor: lookupResult.color.hex,
      colorName: lookupResult.color.colorName,
      cmyk: lookupResult.color.cmyk,
      rgb: lookupResult.color.rgb
     };
    } else {
     console.warn('[STANDALONE] Garment color lookup failed for code:', garmentCode, lookupResult && lookupResult.error);
    }
   } catch (lookupErr) {
    console.warn('[STANDALONE] Garment color lookup error for code:', garmentCode, lookupErr);
   }
  }

  return { meta, sepsTemplateFileName };
 }
}
