import {
 Component,
 Input,
 Output,
 EventEmitter,
 OnInit,
 OnChanges,
 SimpleChanges,
 ChangeDetectorRef
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
   const underbaseCount = clampCount(row.underbaseCount, 4);
   const hitsCount = clampCount(row.hitsCount, 2);
   return { id, enabled, inkName, mesh, underbaseCount, hitsCount } as InkExceptionRow;
  })
  .filter(Boolean) as InkExceptionRow[];
};

const createEmptyInkException = (): InkExceptionRow => ({
 id: makeInkExceptionId(),
 enabled: true,
 inkName: 'New ink',
 mesh: '',
 underbaseCount: 1,
 hitsCount: 1
});

const createDefaultInkExceptions = (): InkExceptionRow[] =>
 normalizeInkExceptionsList([
  { inkName: 'PMS 186', mesh: '110', underbaseCount: 2, hitsCount: 1, enabled: true },
  { inkName: 'PMS 187', mesh: '122', underbaseCount: 1, hitsCount: 1, enabled: true },
  { inkName: 'PMS 199', mesh: '157', underbaseCount: 2, hitsCount: 2, enabled: true }
 ]);

const formatMeshDisplay = (mesh: any): string => {
 const s = mesh == null ? '' : String(mesh).trim();
 if (!s) return '—';
 if (/^m\s/i.test(s)) return s;
 if (s.length >= 2 && s[0].toUpperCase() === 'M' && (s[1] === ' ' || s[1] === '\t')) return s;
 return `M ${s}`;
};

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
 formatInkNameLabel: false,
 colorNameLabelFormat: 'PANTONE XXX C',
 blackInksKnockoutDisplay: defaultBlackColorNames || 'Black, PANTONE Black C, PANTONE Black 6 C, BLACK 00A',
 inkExceptions: createDefaultInkExceptions()
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
 @Output() close = new EventEmitter<void>();
 @Output() save = new EventEmitter<any>();

 formState: ProfileFormState = buildDefaultProfile();
 activeTab: ProfileModalTab = 'general';
 inkExceptionQuery = '';
 editingInkExceptionId: string | null = null;
 draftInkExceptionName = '';
 inkExceptionRemoveId: string | null = null;

 /** Fallback list used when no document is open or swatches fail to load. */
 private readonly fallbackSwatchOptions = ['White UB', 'SL White UB', 'GARMENT'];

 /** Live list populated from the active Illustrator document's spot swatches. */
 knockoutSwatchOptions: string[] = [...this.fallbackSwatchOptions];

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) { }

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
   this.inkExceptionRemoveId = null;
   this.loadDocumentSwatches();
  }
  if (changes['isOpen'] && changes['isOpen'].currentValue === false) {
   this.inkExceptionRemoveId = null;
  }
 }

 private updateFormState(): void {
  const defaultProfile = buildDefaultProfile(this.defaultBlackColorNames);
  if (this.profile) {
   const ub = this.profile.underbaseMeshes || defaultProfile.underbaseMeshes;
   let ubEnabled = this.profile.underbaseEnabled ?? defaultProfile.underbaseEnabled;
   ubEnabled = Array.isArray(ubEnabled) ? [...ubEnabled] : [...defaultProfile.underbaseEnabled];
   ubEnabled[0] = true; // Underbase 1 always checked
   const ubKo = this.profile.underbaseKnockoutBlack ?? defaultProfile.underbaseKnockoutBlack;
   const ubSw =
    (this.profile as any).underbaseKnockoutSwatches ??
    (this.profile as any)._jsonData?.underbaseKnockoutSwatches ??
    defaultProfile.underbaseKnockoutSwatches;
   const ubSwatches = Array.isArray(ubSw)
    ? [0, 1, 2, 3].map((j) => (ubSw[j] != null && String(ubSw[j]).trim() !== '' ? String(ubSw[j]) : defaultProfile.underbaseKnockoutSwatches[j]))
    : [...defaultProfile.underbaseKnockoutSwatches];
   const formatInkNameLabel = this.profile.formatInkNameLabel ?? (this.profile as any).colorNameFormat ?? defaultProfile.formatInkNameLabel;
   const rawInkExceptions = (this.profile as any).inkExceptions;
   this.formState = {
    ...defaultProfile,
    ...this.profile,
    overprintAllInks: this.profile.overprintAllInks ?? true,
    underbaseMeshes: Array.isArray(ub) ? [...ub] : [...defaultProfile.underbaseMeshes],
    underbaseEnabled: ubEnabled,
    underbaseKnockoutBlack: Array.isArray(ubKo) ? [...ubKo] : [...defaultProfile.underbaseKnockoutBlack],
    underbaseKnockoutSwatches: ubSwatches,
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
    inkExceptions: rawInkExceptions != null
     ? normalizeInkExceptionsList(rawInkExceptions)
     : [...defaultProfile.inkExceptions]
   };
  } else {
   this.formState = { ...defaultProfile, inkExceptions: [...defaultProfile.inkExceptions] };
  }
 }

 onOverlayInteraction(event: MouseEvent): void {
  event.stopPropagation();
 }

 setActiveTab(tab: ProfileModalTab): void {
  this.activeTab = tab;
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

 onCheckboxChange(field: keyof ProfileFormState, event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  (this.formState as any)[field] = checked;
 }

 onUnderbaseEnabledChange(index: number, event: Event): void {
  if (index === 0) return; // Underbase 1 is always on, ignore
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

 /** OP = overprint (false), KO = knockout black inks (true). */
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

 /** Include saved swatch value even if it isn't in the live document list. */
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

 get defaultMeshLabel(): string {
  return formatMeshDisplay(this.formState.colorMesh);
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

 cycleRollerCount(current: number): number {
  return current >= 4 ? 1 : current + 1;
 }

 handleInkExceptionAdd(): void {
  this.formState.inkExceptions = [
   ...normalizeInkExceptionsList(this.formState.inkExceptions),
   createEmptyInkException()
  ];
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
 }

 commitInkExceptionNameEdit(): void {
  if (!this.editingInkExceptionId) return;
  this.updateInkException(this.editingInkExceptionId, { inkName: this.draftInkExceptionName });
  this.editingInkExceptionId = null;
 }

 cancelInkExceptionNameEdit(): void {
  this.editingInkExceptionId = null;
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
  this.save.emit({
   ...this.formState,
   underbaseMeshes: [...this.formState.underbaseMeshes],
   underbaseEnabled: [...this.formState.underbaseEnabled],
   underbaseKnockoutBlack: [...this.formState.underbaseKnockoutBlack],
   underbaseKnockoutSwatches: [...this.formState.underbaseKnockoutSwatches],
   blockerKnockoutBlack: !!this.formState.blockerKnockoutBlack,
   blockerKnockoutSwatch: this.formState.blockerKnockoutSwatch,
   underbaseSwatch: this.formState.underbaseSwatch,
   inkExceptions: normalizeInkExceptionsList(this.formState.inkExceptions)
  });
 }

 onCancel(): void {
  this.close.emit();
 }

 /** True when any "k/o black inks" is on (underbases OR blocker). */
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
