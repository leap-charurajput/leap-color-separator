import {
 Component,
 Input,
 Output,
 EventEmitter,
 OnInit,
 OnChanges,
 SimpleChanges,
 ChangeDetectorRef,
 ViewChild,
 ElementRef
} from '@angular/core';
import { ControllerService } from '../../services/controller.service';

type ProfileModalTab = 'general' | 'underbase' | 'inkExceptions';

interface InkExceptionRow {
 id: string;
 enabled: boolean;
 inkName: string;
 mesh: string;
 underbaseCount: number;
 hitsCount: number;
 secondHitMesh?: string;
 printMethod?: string;
 profile?: string;
}

interface ProfileFormState {
 id: string;
 name: string;
 code: string;
 colorMesh: string;
 underbaseSwatch: string;
 waterbaseInk: boolean;
 overprintAllInks: boolean;
 blocker: boolean;
 blockerMesh: string;
 blockerKnockoutBlack: boolean;
 blockerKnockoutSwatch: string;
 underbaseEnabled: boolean[];
 underbaseMeshes: string[];
 underbaseKnockoutBlack: boolean[];
 underbaseKnockoutSwatches: string[];
 /** Optional custom name per UB pass (UB1-4). When set, used for the underbase swatch + layer name. */
 underbaseNames: string[];
 formatInkNameLabel: boolean;
 colorNameLabelFormat: string;
 blackInksKnockoutDisplay: string;
 inkExceptions: InkExceptionRow[];
}

const makeInkExceptionId = (): string => {
 const c = typeof crypto !== 'undefined' ? crypto : null;
 if (c && typeof c.randomUUID === 'function') {
  return c.randomUUID();
 }
 return `ink-ex-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const clampCount = (value: any, max: number, defaultValue = 1): number => {
 const n = parseInt(value, 10);
 if (isNaN(n) || n < 1) return defaultValue;
 if (n > max) return max;
 return n;
};

const normalizeInkExceptionsList = (raw: any): InkExceptionRow[] => {
 if (!Array.isArray(raw)) return [];
 return raw
  .map((row: any) => {
   if (!row || typeof row !== 'object') return null;
   const id = row.id != null && String(row.id).trim() ? String(row.id) : makeInkExceptionId();
   const inkName = row.inkName != null ? String(row.inkName) : '';
   const mesh = row.mesh != null ? String(row.mesh) : '';
   const enabled = row.enabled !== false && row.disabled !== true;
   const underbaseCount =
    row.underbaseCount != null && !isNaN(parseInt(row.underbaseCount, 10))
     ? Math.max(1, Math.min(4, parseInt(row.underbaseCount, 10)))
     : 1;
   const hitsCount = clampCount(row.hitsCount, 2);
   const secondHitMesh = row.secondHitMesh != null ? String(row.secondHitMesh) : '';
   return {
    id,
    enabled,
    inkName,
    mesh,
    underbaseCount,
    hitsCount,
    secondHitMesh,
    printMethod: row.printMethod != null ? String(row.printMethod) : '',
    profile: row.profile != null ? String(row.profile) : ''
   } as InkExceptionRow;
  })
  .filter(Boolean) as InkExceptionRow[];
};

const createEmptyInkException = (): InkExceptionRow => ({
 id: makeInkExceptionId(),
 enabled: true,
 inkName: 'New ink',
 mesh: '',
 underbaseCount: 1,
 hitsCount: 1,
 secondHitMesh: '',
 printMethod: '',
 profile: ''
});

const normalizeInkNameKey = (name: string): string => (name ?? '').trim().toLowerCase();

/** Id of the later row when two inks share the same name (case-insensitive). */
const findDuplicateInkExceptionRowId = (rows: InkExceptionRow[]): string | null => {
 const seen = new Set<string>();
 for (const row of rows) {
  const key = normalizeInkNameKey(row.inkName);
  if (!key) continue;
  if (seen.has(key)) {
   return row.id;
  }
  seen.add(key);
 }
 return null;
};

const inkNameExistsInExceptions = (
 rows: InkExceptionRow[],
 candidateName: string,
 excludeId: string
): boolean => {
 const key = normalizeInkNameKey(candidateName);
 if (!key) return false;
 return rows.some(
  row => row.id !== excludeId && normalizeInkNameKey(row.inkName) === key
 );
};

const formatMeshDisplay = (mesh: any): string => {
 const s = mesh == null ? '' : String(mesh).trim();
 if (!s) return '—';
 if (/^m\s/i.test(s)) return s;
 if (s.length >= 2 && s[0].toUpperCase() === 'M' && (s[1] === ' ' || s[1] === '\t')) return s;
 return `M ${s}`;
};

const parseMeshValuesList = (meshValues: string): string[] => {
 if (!meshValues || !String(meshValues).trim()) return [];
 return String(meshValues)
  .split(/[,;]+/)
  .map((part) => part.trim())
  .filter(Boolean);
};

/** Normalize mesh for comparison (ink row vs Profile Defaults Color Mesh). */
const normalizeMeshKey = (mesh: any): string => {
 const s = mesh == null ? '' : String(mesh).trim();
 if (!s || s === '—') return '';
 let t = s.replace(/^m\s+/i, '').trim();
 const num = parseFloat(t);
 if (!isNaN(num) && t !== '') return String(num);
 return t;
};

const PROFILE_DEFAULT_HITS_COUNT = 1;

const buildDefaultProfile = (defaultBlackColorNames?: string): ProfileFormState => ({
 id: '',
 name: '',
 code: '',
 colorMesh: '',
 underbaseSwatch: 'White UB',
 waterbaseInk: false,
 overprintAllInks: true,
 blocker: false,
 blockerMesh: '',
 blockerKnockoutBlack: false,
 blockerKnockoutSwatch: 'White UB',
 underbaseEnabled: [true, false, false, false],
 underbaseMeshes: ['110', '122', '', ''],
 underbaseKnockoutBlack: [false, false, false, false],
 underbaseKnockoutSwatches: ['White UB', 'White UB', 'White UB', 'White UB'],
 underbaseNames: ['', '', '', ''],
 formatInkNameLabel: false,
 colorNameLabelFormat: 'PANTONE ### C',
 blackInksKnockoutDisplay: defaultBlackColorNames || 'Black, PANTONE Black C, PANTONE Black 6 C, BLACK 00A',
 inkExceptions: []
});

@Component({
 selector: 'app-edit-separation-profile-modal',
 templateUrl: './edit-separation-profile-modal.component.html',
 styleUrls: ['./edit-separation-profile-modal.component.css']
})
export class EditSeparationProfileModalComponent implements OnInit, OnChanges {
 @Input() isOpen = false;
 @Input() profile: any = null;
 @Input() defaultBlackColorNames = '';
 @Input() meshValues = '';
 @Output() close = new EventEmitter<void>();
 @Output() save = new EventEmitter<any>();

 @ViewChild('inkExceptionsTableBody', { read: ElementRef })
 inkExceptionsTableBody?: ElementRef<HTMLElement>;

 formState: ProfileFormState = buildDefaultProfile();
 activeTab: ProfileModalTab = 'general';
 inkExceptionQuery = '';
 editingInkExceptionId: string | null = null;
 draftInkExceptionName = '';
 inkExceptionNameDuplicate = false;
 inkExceptionRemoveId: string | null = null;
 inkExceptionsLoading = false;
 inkExceptionsLoadError = '';

 /* Import-from-Excel dialog state. */
 inkImportDialogOpen = false;
 inkImportBusy = false;
 inkImportError = '';
 private inkImportRows: any[] = [];
 inkImportCount = 0;
 inkImportDuplicateNames: string[] = [];
 inkImportFileName = '';

 /** Fallback list used when no document is open or swatches fail to load. */
 private readonly fallbackSwatchOptions = ['White UB', 'SL White UB', 'GARMENT'];

 /** Live list populated from the active Illustrator document's spot swatches. */
 knockoutSwatchOptions: string[] = [...this.fallbackSwatchOptions];

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {}

 private readonly excludedSwatches = ['[Registration]', '[None]'];

 private loadDocumentSwatches(): void {
  this.controller
   .getSpotColorSwatches()
   .then((names) => {
    const filtered = (names || []).filter(
     (n) => !this.excludedSwatches.includes(n.trim())
    );
    this.knockoutSwatchOptions = filtered.length > 0 ? filtered : [...this.fallbackSwatchOptions];
    this.cdr.markForCheck();
    this.cdr.detectChanges();
   })
   .catch(() => {
    this.knockoutSwatchOptions = [...this.fallbackSwatchOptions];
    this.cdr.markForCheck();
    this.cdr.detectChanges();
   });
 }

 ngOnInit(): void {
  this.updateFormState();
  this.loadDocumentSwatches();
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['profile'] || changes['isOpen'] || changes['defaultBlackColorNames']) {
   this.updateFormState();
  }
  if (changes['isOpen'] && changes['isOpen'].currentValue === true) {
   this.activeTab = 'general';
   this.inkExceptionQuery = '';
   this.editingInkExceptionId = null;
   this.inkExceptionNameDuplicate = false;
   this.inkExceptionRemoveId = null;
   this.loadDocumentSwatches();
  }
  if (changes['isOpen'] && changes['isOpen'].currentValue === false) {
   this.inkExceptionRemoveId = null;
  }
  // Reload inks when modal opens or when a different profile is selected for edit.
  const profileChanged = !!changes['profile'];
  const modalOpened = changes['isOpen']?.currentValue === true;
  if (this.isOpen && this.profile && (profileChanged || modalOpened)) {
   this.loadInkExceptionsFromServer();
  }
 }

 /** Profile name used in profile_ink_exceptions.json "Profile" field (e.g. Fanatics-HSWB). */
 private getInkProfileFilterName(): string {
  const p = this.profile;
  if (!p) return (this.formState.name || '').trim();
  const fromJson =
   p._jsonData && p._jsonData['Profile Name'] != null ? String(p._jsonData['Profile Name']).trim() : '';
  return (p.name || fromJson || this.formState.name || '').trim();
 }

 /** Profile code from Profiles.json "Profile Code" (e.g. FAN_WB). */
 private getInkProfileFilterCode(): string {
  const p = this.profile;
  if (!p) return (this.formState.code || '').trim();
  const fromJson =
   p._jsonData && p._jsonData['Profile Code'] != null ? String(p._jsonData['Profile Code']).trim() : '';
  return (p.code || fromJson || this.formState.code || '').trim();
 }

 private updateFormState(): void {
  const defaultProfile = buildDefaultProfile(this.defaultBlackColorNames);
  if (this.profile) {
   const ub = this.profile.underbaseMeshes || defaultProfile.underbaseMeshes;
   let ubEnabled = this.profile.underbaseEnabled ?? defaultProfile.underbaseEnabled;
   ubEnabled = Array.isArray(ubEnabled) ? [...ubEnabled] : [...defaultProfile.underbaseEnabled];
   ubEnabled[0] = true;
   const ubKo = this.profile.underbaseKnockoutBlack ?? defaultProfile.underbaseKnockoutBlack;
   const ubSw =
    (this.profile as any).underbaseKnockoutSwatches ??
    (this.profile as any)._jsonData?.underbaseKnockoutSwatches ??
    defaultProfile.underbaseKnockoutSwatches;
   const ubSwatches = Array.isArray(ubSw)
    ? [0, 1, 2, 3].map((j) => (ubSw[j] != null && String(ubSw[j]).trim() !== '' ? String(ubSw[j]) : defaultProfile.underbaseKnockoutSwatches[j]))
    : [...defaultProfile.underbaseKnockoutSwatches];
   /* Custom per-UB names (optional). Empty string means "use the default White UB N naming". */
   const ubNamesRaw =
    (this.profile as any).underbaseNames ??
    (this.profile as any)._jsonData?.underbaseNames ??
    defaultProfile.underbaseNames;
   const ubNames = Array.isArray(ubNamesRaw)
    ? [0, 1, 2, 3].map((j) => (ubNamesRaw[j] != null ? String(ubNamesRaw[j]) : ''))
    : ['', '', '', ''];
   const formatInkNameLabel = this.profile.formatInkNameLabel ?? (this.profile as any).colorNameFormat ?? defaultProfile.formatInkNameLabel;
   this.formState = {
    ...defaultProfile,
    ...this.profile,
    overprintAllInks: this.profile.overprintAllInks ?? true,
    underbaseMeshes: Array.isArray(ub) ? [...ub] : [...defaultProfile.underbaseMeshes],
    underbaseEnabled: ubEnabled,
    underbaseKnockoutBlack: Array.isArray(ubKo) ? [...ubKo] : [...defaultProfile.underbaseKnockoutBlack],
    underbaseKnockoutSwatches: ubSwatches,
    underbaseNames: ubNames,
    blockerKnockoutBlack: !!(this.profile as any).blockerKnockoutBlack || !!(this.profile as any)._jsonData?.blockerKnockoutBlack,
    blockerKnockoutSwatch: String(
     (this.profile as any).blockerKnockoutSwatch ||
      (this.profile as any)._jsonData?.blockerKnockoutSwatch ||
      defaultProfile.blockerKnockoutSwatch
    ),
    underbaseSwatch: String(
     (this.profile as any).underbaseSwatch ||
      (this.profile as any)._jsonData?.underbaseSwatch ||
      defaultProfile.underbaseSwatch
    ),
    formatInkNameLabel,
    colorNameLabelFormat: this.profile.colorNameLabelFormat != null && this.profile.colorNameLabelFormat !== ''
     ? this.profile.colorNameLabelFormat
     : defaultProfile.colorNameLabelFormat,
    inkExceptions: []
   };
  } else {
   this.formState = { ...defaultProfile, inkExceptions: [] };
  }
 }

 private formatInkLoadError(err: any): string {
  if (!err) return 'Failed to load ink exceptions';
  if (typeof err === 'string') return err;
  if (typeof err.reason === 'string') return err.reason;
  if (typeof err.message === 'string') return err.message;
  if (typeof err.error === 'string') return err.error;
  try {
   return JSON.stringify(err);
  } catch {
   return 'Failed to load ink exceptions';
  }
 }

 get activeInkProfileLabel(): string {
  return this.getInkProfileFilterName() || '—';
 }

 loadInkExceptionsFromServer(): void {
  const profileCode = this.getInkProfileFilterCode();
  if (!profileCode) {
   this.formState.inkExceptions = [];
   this.inkExceptionsLoadError = '';
   return;
  }
  const profileName = this.getInkProfileFilterName();
  this.inkExceptionsLoading = true;
  this.inkExceptionsLoadError = '';
  this.controller
   .getInkExceptions(profileCode, profileName)
   .then((result) => {
    if (result?.success && Array.isArray(result.inkExceptions)) {
     this.formState.inkExceptions = normalizeInkExceptionsList(result.inkExceptions);
     this.inkExceptionsLoadError = '';
    } else {
     this.formState.inkExceptions = [];
     this.inkExceptionsLoadError = this.formatInkLoadError(result?.error || result);
    }
   })
   .catch((err) => {
    this.formState.inkExceptions = [];
    this.inkExceptionsLoadError = this.formatInkLoadError(err);
   })
   .finally(() => {
    this.inkExceptionsLoading = false;
    this.cdr.markForCheck();
   });
 }

 onOverlayInteraction(event: MouseEvent): void {
  event.stopPropagation();
 }

 setActiveTab(tab: ProfileModalTab): void {
  this.activeTab = tab;
  if (tab === 'inkExceptions' && this.isOpen && this.profile && !this.inkExceptionsLoading) {
   this.loadInkExceptionsFromServer();
  }
 }

 onInputChange(field: string, event: Event): void {
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  (this.formState as any)[field] = value;
 }

 onMeshChange(index: number, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  this.formState.underbaseMeshes = [...this.formState.underbaseMeshes];
  this.formState.underbaseMeshes[index] = value;
 }

 /* Custom name for a UB pass. Empty = default White UB N naming. Used for swatch + layer name. */
 onUnderbaseNameChange(index: number, event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  this.formState.underbaseNames = [...this.formState.underbaseNames];
  this.formState.underbaseNames[index] = value;
 }

 onCheckboxChange(field: keyof ProfileFormState, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  (this.formState as any)[field] = checked;
 }

 onUnderbaseEnabledChange(index: number, event: Event): void {
  if (index === 0) return;
  const checked = (event.target as HTMLInputElement).checked;
  this.formState.underbaseEnabled = [...this.formState.underbaseEnabled];
  this.formState.underbaseEnabled[index] = checked;
 }

 setBlockerDarkInkKnockout(knockout: boolean): void {
  this.formState.blockerKnockoutBlack = knockout;
 }

 onBlockerSwatchSelectValue(value: string): void {
  this.formState.blockerKnockoutSwatch = value;
 }

 isBlockerSwatchEnabled(): boolean {
  return !!this.formState.blocker && !!this.formState.blockerKnockoutBlack;
 }

 setUnderbaseDarkInkKnockout(index: number, knockout: boolean): void {
  if (!this.formState.underbaseEnabled[index]) {
   return;
  }
  this.formState.underbaseKnockoutBlack = [...this.formState.underbaseKnockoutBlack];
  this.formState.underbaseKnockoutBlack[index] = knockout;
 }

 onUnderbaseKnockoutSwatchChange(index: number, swatchName: string): void {
  this.formState.underbaseKnockoutSwatches = [...this.formState.underbaseKnockoutSwatches];
  this.formState.underbaseKnockoutSwatches[index] = swatchName;
 }

 onUnderbaseSwatchChange(swatchName: string): void {
  this.formState.underbaseSwatch = swatchName;
 }

 isSwatchEnabledForRow(index: number): boolean {
  return !!this.formState.underbaseEnabled[index] && !!this.formState.underbaseKnockoutBlack[index];
 }

 swatchSelectOptionsForIndex(index: number): string[] {
  const v = this.formState.underbaseKnockoutSwatches[index];
  if (v && this.knockoutSwatchOptions.indexOf(v) === -1) {
   return [v, ...this.knockoutSwatchOptions];
  }
  return [...this.knockoutSwatchOptions];
 }

 blockerSwatchOptions(): string[] {
  const v = this.formState.blockerKnockoutSwatch;
  if (v && this.knockoutSwatchOptions.indexOf(v) === -1) {
   return [v, ...this.knockoutSwatchOptions];
  }
  return [...this.knockoutSwatchOptions];
 }

 underbaseSwatchOptions(): string[] {
  const v = this.formState.underbaseSwatch;
  if (v && this.knockoutSwatchOptions.indexOf(v) === -1) {
   return [v, ...this.knockoutSwatchOptions];
  }
  return [...this.knockoutSwatchOptions];
 }

 get filteredInkExceptions(): InkExceptionRow[] {
  const query = this.inkExceptionQuery.trim().toLowerCase();
  const rows = normalizeInkExceptionsList(this.formState.inkExceptions);
  if (!query) return rows;
  return rows.filter(row => (row.inkName || '').toLowerCase().includes(query));
 }

 /** Profile default mesh from Profiles.json "Color Mesh" (ink exceptions column header). */
 get profileDefaultMeshLabel(): string {
  const key = this.profileDefaultMeshKey;
  return key ? formatMeshDisplay(key) : '—';
 }

 /** Raw profile Color Mesh key for matching ink rows (Profiles.json / form). */
 get profileDefaultMeshKey(): string {
  const fromForm = String(this.formState.colorMesh || '').trim();
  if (fromForm) return normalizeMeshKey(fromForm);
  const raw = this.profile?._jsonData?.['Color Mesh'];
  if (raw != null && raw !== '' && String(raw).trim() !== '' && String(raw) !== ' ') {
   return normalizeMeshKey(raw);
  }
  return '';
 }

 inkMeshMatchesProfileDefault(row: InkExceptionRow): boolean {
  if (!row?.enabled) return false;
  const defaultKey = this.profileDefaultMeshKey;
  if (!defaultKey) return !normalizeMeshKey(row.mesh);
  return normalizeMeshKey(row.mesh) === defaultKey;
 }

 inkHitsMatchesProfileDefault(row: InkExceptionRow): boolean {
  if (!row?.enabled) return false;
  const hits = row.hitsCount != null ? parseInt(String(row.hitsCount), 10) : PROFILE_DEFAULT_HITS_COUNT;
  return (isNaN(hits) ? PROFILE_DEFAULT_HITS_COUNT : hits) === PROFILE_DEFAULT_HITS_COUNT;
 }

 inkUnderbaseMatchesProfileDefault(row: InkExceptionRow): boolean {
  if (!row?.enabled) return false;
  const count = row.underbaseCount != null ? parseInt(String(row.underbaseCount), 10) : 1;
  const safe = isNaN(count) ? 1 : Math.max(1, Math.min(4, count));
  return safe === this.profileDefaultUnderbaseCount;
 }

 /**
  * Profile Defaults header only (roller column) — from Profiles.json Underbase 2–4, not ink exceptions.
  * Underbase 1 is always counted; does not use per-ink underbase_count from profile_ink_exceptions.json.
  */
 get profileDefaultUnderbaseCount(): number {
  const toEnabled = (value: any): boolean => {
   if (value === true || value === 1) return true;
   if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    return v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1';
   }
   return false;
  };
  const countFromEnabledFlags = (enabled: boolean[]): number => {
   if (!Array.isArray(enabled) || enabled.length === 0) return 1;
   return Math.max(1, Math.min(4, enabled.filter(Boolean).length));
  };

  /*
   * Prefer the LIVE edited state (formState.underbaseEnabled) so toggling Underbase 2/3/4 on the
   * General tab is reflected immediately in the Ink Exceptions "Profile Defaults" row. Fall back to
   * the loaded profile (_jsonData / underbaseEnabled) only when formState is not populated yet.
   */
  const formEnabled = this.formState?.underbaseEnabled;
  if (Array.isArray(formEnabled) && formEnabled.length > 0) {
   return countFromEnabledFlags(formEnabled);
  }

  const json = this.profile?._jsonData;
  if (json) {
   let count = 1;
   if (toEnabled(json['Underbase 2'])) count++;
   if (toEnabled(json['Underbase 3'])) count++;
   if (toEnabled(json['Underbase 4'])) count++;
   return Math.max(1, Math.min(4, count));
  }

  const profileEnabled = this.profile?.underbaseEnabled;
  if (Array.isArray(profileEnabled) && profileEnabled.length > 0) {
   return countFromEnabledFlags(profileEnabled);
  }

  return 1;
 }

 get meshOptions(): string[] {
  return parseMeshValuesList(this.meshValues);
 }

 get pendingInkExceptionRemove(): InkExceptionRow | null {
  if (!this.inkExceptionRemoveId) return null;
  return normalizeInkExceptionsList(this.formState.inkExceptions).find(row => row.id === this.inkExceptionRemoveId) || null;
 }

 get inkExceptionRemoveMessage(): string {
  const name = this.pendingInkExceptionRemove?.inkName?.trim();
  return name
   ? `Are you sure you want to remove “${name}” from ink exceptions?`
   : 'Are you sure you want to remove this ink from ink exceptions?';
 }

 countArray(count: number): number[] {
  const safeCount = Math.max(1, Math.min(4, Math.floor(Number(count) || 1)));
  return Array.from({ length: safeCount }, (_, index) => index);
 }

 cycleBrushCount(current: number): number {
  return current >= 2 ? 1 : current + 1;
 }

 /** Ink exception rows only — cycles 1→4 from profile_ink_exceptions.json, not Profiles.json underbase settings. */
 cycleInkExceptionUnderbaseCount(current: number): number {
  const safe = Math.max(1, Math.min(4, Math.floor(Number(current) || 1)));
  return safe >= 4 ? 1 : safe + 1;
 }

 formatInkMeshDisplay(mesh: string): string {
  return formatMeshDisplay(mesh);
 }

 canCycleMesh(): boolean {
  return this.meshOptions.length > 1;
 }

 cycleInkExceptionMesh(id: string): void {
  const options = this.meshOptions;
  if (options.length <= 1) return;
  const rows = normalizeInkExceptionsList(this.formState.inkExceptions);
  const row = rows.find((item) => item.id === id);
  if (!row || !row.enabled) return;
  const current = String(row.mesh || '').trim();
  let nextIndex = 0;
  if (current) {
   const currentIndex = options.findIndex((value) => value === current);
   nextIndex = currentIndex >= 0 ? (currentIndex + 1) % options.length : 0;
  }
  this.updateInkException(id, { mesh: options[nextIndex] });
 }

 cycleInkExceptionHits(id: string, current: number): void {
  const nextHits = this.cycleBrushCount(current || 1);
  this.updateInkException(id, { hitsCount: nextHits });
 }

 /**
  * Update the second-hit mesh for an ink exception (digits only; empty clears it). The input is shown
  * only when the ink has two hits; the value is stored on the row and saved into the "Two Hits" column
  * of profile_ink_exceptions.json.
  */
 onInkExceptionSecondHitMeshInput(id: string, event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  const cleaned = String(raw == null ? '' : raw).replace(/[^0-9]/g, '');
  this.updateInkException(id, { secondHitMesh: cleaned });
 }

 cycleInkExceptionUnderbases(id: string, current: number): void {
  const nextCount = this.cycleInkExceptionUnderbaseCount(current || 1);
  this.updateInkException(id, { underbaseCount: nextCount });
 }

 handleInkExceptionAdd(): void {
  this.formState.inkExceptions = [
   createEmptyInkException(),
   ...normalizeInkExceptionsList(this.formState.inkExceptions)
  ];
  this.cdr.detectChanges();
  setTimeout(() => this.scrollInkExceptionsToTop(), 0);
 }

 /*
  * Import ink exceptions from a user-chosen Excel/CSV. Opens the file picker, parses the rows, then
  * shows the import dialog so the user can choose Replace vs Merge (and, on duplicates, which wins).
  */
 handleInkExceptionImport(): void {
  this.inkImportBusy = true;
  this.inkImportError = '';
  this.controller
   .importInkExceptionsFromExcel()
   .then((result: any) => {
    this.inkImportBusy = false;
    if (result?.canceled) {
     return;
    }
    if (!result?.success || !Array.isArray(result.rows) || result.rows.length === 0) {
     this.inkImportError = result?.error || 'No ink rows found in the selected file.';
     this.inkImportDialogOpen = true;
     this.cdr.detectChanges();
     return;
    }
    this.inkImportRows = result.rows;
    this.inkImportCount = result.rows.length;
    this.inkImportFileName = this.baseFileName(result.filePath);
    /* Which imported inks already exist in the current list (case-insensitive). */
    const existingKeys = new Set(
     normalizeInkExceptionsList(this.formState.inkExceptions).map((r) => normalizeInkNameKey(r.inkName))
    );
    const dupNames: string[] = [];
    const seen = new Set<string>();
    for (const row of result.rows) {
     const key = normalizeInkNameKey(String(row?.inkName || ''));
     if (key && existingKeys.has(key) && !seen.has(key)) {
      seen.add(key);
      dupNames.push(String(row.inkName));
     }
    }
    this.inkImportDuplicateNames = dupNames;
    this.inkImportDialogOpen = true;
    this.cdr.detectChanges();
   })
   .catch((err: any) => {
    this.inkImportBusy = false;
    this.inkImportError = err?.message || String(err);
    this.inkImportDialogOpen = true;
    this.cdr.detectChanges();
   });
 }

 get inkImportHasDuplicates(): boolean {
  return this.inkImportDuplicateNames.length > 0;
 }

 /* Apply the imported rows using the chosen strategy. */
 applyInkImport(mode: 'replace' | 'keepExisting' | 'useImported'): void {
  /*
   * Resolve which profile the imported rows belong to. The profileCode from the Excel wins so the
   * entries land in the correct block of the single profile_ink_exceptions.json; fall back to the
   * currently-open profile when the Excel omits it. Captured before closeInkImportDialog() clears the
   * import buffer.
   */
  const codeFromExcel =
   this.inkImportRows
    .map((r: any) => (r && r.profileCode != null ? String(r.profileCode).trim() : ''))
    .find((c: string) => c !== '') || '';
  const nameFromExcel =
   this.inkImportRows
    .map((r: any) => (r && r.profile != null ? String(r.profile).trim() : ''))
    .find((n: string) => n !== '') || '';

  const imported: InkExceptionRow[] = normalizeInkExceptionsList(
   this.inkImportRows.map((r) => ({ ...r, id: makeInkExceptionId() }))
  );
  if (mode === 'replace') {
   this.formState.inkExceptions = imported;
  } else {
   const existing = normalizeInkExceptionsList(this.formState.inkExceptions);
   const indexByKey = new Map<string, number>();
   existing.forEach((row, idx) => indexByKey.set(normalizeInkNameKey(row.inkName), idx));
   for (const imp of imported) {
    const key = normalizeInkNameKey(imp.inkName);
    if (indexByKey.has(key)) {
     if (mode === 'useImported') {
      const idx = indexByKey.get(key) as number;
      existing[idx] = { ...imp, id: existing[idx].id };
     }
     /* keepExisting: leave the current row untouched. */
    } else {
     existing.push(imp);
     indexByKey.set(key, existing.length - 1);
    }
   }
   this.formState.inkExceptions = existing;
  }
  this.closeInkImportDialog();
  this.cdr.detectChanges();
  setTimeout(() => this.scrollInkExceptionsToTop(), 0);

  /* Persist to the single profile_ink_exceptions.json right away so the import survives a restart. */
  this.persistInkExceptionsAfterImport(codeFromExcel, nameFromExcel);
 }

 /*
  * Write the current ink-exception grid into the single profile_ink_exceptions.json immediately after an
  * import. Uses the Excel's profileCode (else the open profile's code). saveInkExceptions replaces only
  * this profileCode's block and preserves every other profile, so one shared file accumulates all imports.
  */
 private persistInkExceptionsAfterImport(codeFromExcel: string, nameFromExcel: string): void {
  const profileCode = (codeFromExcel || this.getInkProfileFilterCode() || (this.formState.code || '')).trim();
  const profileName = (nameFromExcel || this.getInkProfileFilterName() || (this.formState.name || '')).trim();
  if (!profileCode) {
   console.error(
    '[InkImport] No profileCode found (add a profileCode column to the Excel, or set the profile code); ' +
     'profile_ink_exceptions.json was not written.'
   );
   return;
  }
  this.controller
   .saveInkExceptions(profileCode, this.formState.inkExceptions, profileName)
   .then((res: any) => {
    if (!res || !res.success) {
     console.error('[InkImport] Failed to write profile_ink_exceptions.json:', res && res.error);
    } else {
     console.log('[InkImport] profile_ink_exceptions.json updated for profileCode:', profileCode);
    }
   })
   .catch((err: any) => console.error('[InkImport] Failed to write profile_ink_exceptions.json:', err));
 }

 closeInkImportDialog(): void {
  this.inkImportDialogOpen = false;
  this.inkImportRows = [];
  this.inkImportCount = 0;
  this.inkImportDuplicateNames = [];
  this.inkImportFileName = '';
  this.inkImportError = '';
 }

 private baseFileName(filePath: string): string {
  const p = String(filePath || '').replace(/[\\/]+$/, '');
  const parts = p.split(/[\\/]/);
  return parts.length ? parts[parts.length - 1] : p;
 }

 /** Scroll ink list (and any parent scroll containers) so the new top row is visible. */
 private scrollInkExceptionsToTop(): void {
  const tableBody = this.inkExceptionsTableBody?.nativeElement;
  if (!tableBody) return;

  const scrollables: HTMLElement[] = [tableBody];
  let parent: HTMLElement | null = tableBody.parentElement;
  while (parent) {
   const { overflowY } = getComputedStyle(parent);
   if (
    (overflowY === 'auto' || overflowY === 'scroll') &&
    parent.scrollHeight > parent.clientHeight
   ) {
    scrollables.push(parent);
   }
   if (parent.classList.contains('profile-modal-body')) break;
   parent = parent.parentElement;
  }

  for (const el of scrollables) {
   if (el.scrollTop > 0) {
    el.scrollTo({ top: 0, behavior: 'smooth' });
   }
  }
 }

 updateInkException(id: string, patch: Partial<InkExceptionRow>): void {
  this.formState.inkExceptions = normalizeInkExceptionsList(this.formState.inkExceptions).map(row =>
   row.id === id ? { ...row, ...patch } : row
  );
 }

 toggleInkException(id: string): void {
  this.formState.inkExceptions = normalizeInkExceptionsList(this.formState.inkExceptions).map(row =>
   row.id === id ? { ...row, enabled: !row.enabled } : row
  );
 }

 beginInkExceptionNameEdit(row: InkExceptionRow): void {
  if (!row.enabled) return;
  this.editingInkExceptionId = row.id;
  this.draftInkExceptionName = row.inkName || '';
  this.updateInkExceptionNameDuplicateState();
 }

 onInkExceptionNameInput(event: Event): void {
  this.draftInkExceptionName = (event.target as HTMLInputElement).value;
  this.updateInkExceptionNameDuplicateState();
 }

 private updateInkExceptionNameDuplicateState(): void {
  if (!this.editingInkExceptionId) {
   this.inkExceptionNameDuplicate = false;
   return;
  }
  const rows = normalizeInkExceptionsList(this.formState.inkExceptions);
  this.inkExceptionNameDuplicate = inkNameExistsInExceptions(
   rows,
   this.draftInkExceptionName,
   this.editingInkExceptionId
  );
 }

 commitInkExceptionNameEdit(): void {
  if (!this.editingInkExceptionId) return;
  const trimmed = this.draftInkExceptionName.trim();
  const rows = normalizeInkExceptionsList(this.formState.inkExceptions);
  if (inkNameExistsInExceptions(rows, trimmed, this.editingInkExceptionId)) {
   this.inkExceptionNameDuplicate = true;
   return;
  }
  this.inkExceptionNameDuplicate = false;
  this.updateInkException(this.editingInkExceptionId, { inkName: trimmed });
  this.editingInkExceptionId = null;
 }

 cancelInkExceptionNameEdit(): void {
  this.editingInkExceptionId = null;
  this.inkExceptionNameDuplicate = false;
 }

 private focusInkExceptionDuplicateName(): void {
  const inkRows = normalizeInkExceptionsList(this.formState.inkExceptions);
  const duplicateId = findDuplicateInkExceptionRowId(inkRows);
  if (!duplicateId) return;

  const row = inkRows.find(r => r.id === duplicateId);
  if (!row) return;

  this.activeTab = 'inkExceptions';
  this.beginInkExceptionNameEdit(row);
  this.cdr.detectChanges();

  setTimeout(() => {
   const tableBody = this.inkExceptionsTableBody?.nativeElement;
   const rowEl = tableBody?.querySelector(
    `[data-ink-row-id="${duplicateId}"]`
   ) as HTMLElement | null;
   rowEl?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, 0);
 }

 onInkExceptionNameKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
   event.preventDefault();
   this.commitInkExceptionNameEdit();
  }
  if (event.key === 'Escape') {
   event.preventDefault();
   this.cancelInkExceptionNameEdit();
  }
 }

 requestInkExceptionRemove(id: string): void {
  this.inkExceptionRemoveId = id;
 }

 confirmInkExceptionRemove(): void {
  if (!this.inkExceptionRemoveId) return;
  this.formState.inkExceptions = normalizeInkExceptionsList(this.formState.inkExceptions).filter(
   row => row.id !== this.inkExceptionRemoveId
  );
  this.inkExceptionRemoveId = null;
 }

 cancelInkExceptionRemove(): void {
  this.inkExceptionRemoveId = null;
 }

 onSubmit(event: Event): void {
  event.preventDefault();

  if (this.editingInkExceptionId) {
   const trimmed = this.draftInkExceptionName.trim();
   const rows = normalizeInkExceptionsList(this.formState.inkExceptions);
   if (inkNameExistsInExceptions(rows, trimmed, this.editingInkExceptionId)) {
    this.inkExceptionNameDuplicate = true;
    return;
   }
   this.inkExceptionNameDuplicate = false;
   this.updateInkException(this.editingInkExceptionId, { inkName: trimmed });
   this.editingInkExceptionId = null;
  }

  const profileCode = this.getInkProfileFilterCode() || (this.formState.code || '').trim();
  const profileName = this.getInkProfileFilterName() || (this.formState.name || '').trim();
  const inkRows = normalizeInkExceptionsList(this.formState.inkExceptions);

  if (findDuplicateInkExceptionRowId(inkRows) !== null) {
   this.focusInkExceptionDuplicateName();
   return;
  }

  const emitSave = (): void => {
   this.save.emit({
    ...this.formState,
    underbaseMeshes: [...this.formState.underbaseMeshes],
    underbaseEnabled: [...this.formState.underbaseEnabled],
    underbaseKnockoutBlack: [...this.formState.underbaseKnockoutBlack],
    underbaseKnockoutSwatches: [...this.formState.underbaseKnockoutSwatches],
    underbaseNames: [...this.formState.underbaseNames],
    blockerKnockoutBlack: !!this.formState.blockerKnockoutBlack,
    blockerKnockoutSwatch: this.formState.blockerKnockoutSwatch,
    underbaseSwatch: this.formState.underbaseSwatch,
    inkExceptions: inkRows
   });
  };

  if (!profileCode) {
   emitSave();
   return;
  }

  this.controller
   .saveInkExceptions(profileCode, inkRows, profileName)
   .then((result) => {
    if (!result?.success) {
     console.error('Failed to save ink exceptions:', result?.error);
    }
    emitSave();
   })
   .catch((err) => {
    console.error('Failed to save ink exceptions:', err);
    emitSave();
   });
 }

 onCancel(): void {
  this.close.emit();
 }

 isAnyKnockoutBlackChecked(): boolean {
  return this.formState.underbaseKnockoutBlack.some(b => b) || !!this.formState.blockerKnockoutBlack;
 }

 trackByIndex(index: number): number {
  return index;
 }

 trackByInkException(_index: number, row: InkExceptionRow): string {
  return row.id;
 }

 trackBySwatchOption(_index: number, opt: string): string {
  return opt;
 }
}
