import { Component, EventEmitter, Input, Output } from '@angular/core';

export interface ExportSettings {
 printGuideFilePath: string;
 separationPreviewFilePath: string;
 postscriptFilePath: string;
}

interface ExportSettingField {
 key: keyof ExportSettings;
 label: string;
}

/*
 * A graphic position chip rendered under the "Positions" section.
 * - label: the text shown on the chip (the ABBV from graphic_positions.json).
 * - value: the text copied to the clipboard when the chip is clicked.
 * - title: optional tooltip showing the full position DESC.
 */
export interface GraphicPositionChip {
 label: string;
 value: string;
 title?: string;
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
 printGuideFilePath: '',
 separationPreviewFilePath: '',
 postscriptFilePath: ''
};

const FALLBACK_EXCEL_COLUMNS = [
 'Art Code',
 'Player Code',
 'Color Code',
 'Team Code',
 'League',
 'Style#',
 'Player Jersey Name'
];

const FALLBACK_GRAPHIC_POSITIONS = [
 'Front',
 'Back',
 'Left Chest',
 'Left Sleeve',
 'Right Sleeve',
 'Left Shoulder',
 'Right Shoulder'
];

@Component({
 selector: 'app-export-settings-panel',
 templateUrl: './export-settings-panel.component.html',
 styleUrls: ['./export-settings-panel.component.css']
})
export class ExportSettingsPanelComponent {
 @Input() exportSettings: ExportSettings = { ...DEFAULT_EXPORT_SETTINGS };
 @Input() excelColumns: string[] = [];
 /*
  * Graphic positions accept either plain strings or GraphicPositionChip objects.
  * When sourced from graphic_positions.json each entry is a chip whose label is
  * the abbreviation (ABBV) and whose tooltip is the full description (DESC).
  */
 @Input() graphicPositions: Array<string | GraphicPositionChip> = [];
 @Input() profileCodes: string[] = [];
 @Output() exportSettingChange = new EventEmitter<{ field: keyof ExportSettings; value: string }>();

 tokenSearch = '';

 readonly fields: ExportSettingField[] = [
  { key: 'printGuideFilePath', label: 'Print guide file path' },
  { key: 'separationPreviewFilePath', label: 'Separation file path' },
  { key: 'postscriptFilePath', label: 'Postscript file path' }
 ];

 get displayedExcelColumns(): string[] {
  const columns = this.uniqueNonEmpty(this.excelColumns);
  const base = columns.length > 0 ? columns : [...FALLBACK_EXCEL_COLUMNS];
  /*
   * [Brand] is NOT a batch-Excel column — it resolves from the Styles.xlsx "Brand" column and
   * yields the brand's first letter (F for Fanatics, N for Nike) in separation file/folder
   * patterns. Offered as a chip alongside the batch columns.
   */
  return base.some((c) => c.toLowerCase() === 'brand') ? base : [...base, 'Brand'];
 }

 get displayedGraphicPositions(): GraphicPositionChip[] {
  const positions = this.normalizePositionChips(this.graphicPositions);
  if (positions.length > 0) return positions;
  /* Fall back to a static list when no graphic_positions.json data is available. */
  return FALLBACK_GRAPHIC_POSITIONS.map((label) => ({ label, value: label }));
 }

 get filteredExcelColumns(): string[] {
  return this.filterValues(this.displayedExcelColumns);
 }

 get filteredGraphicPositions(): GraphicPositionChip[] {
  return this.filterPositionChips(this.displayedGraphicPositions);
 }

 get filteredProfileCodes(): string[] {
  return this.filterValues(this.uniqueNonEmpty(this.profileCodes));
 }

 getSettingValue(field: keyof ExportSettings): string {
  return this.exportSettings?.[field] || '';
 }

 onSettingInput(field: keyof ExportSettings, event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  this.exportSettingChange.emit({ field, value });
 }

 copyToken(label: string): void {
  this.copyText(`[${label}]`);
 }

 copyValue(value: string): void {
  this.copyText(value);
 }

 private filterValues(values: string[]): string[] {
  const query = this.tokenSearch.trim().toLowerCase();
  if (!query) return values;
  return values.filter((value) => String(value || '').toLowerCase().includes(query));
 }

 /*
  * Normalize the graphicPositions input (plain strings and/or chip objects) into
  * a de-duplicated list of GraphicPositionChip entries. De-duplication is keyed
  * on the copy value so the same abbreviation is never shown twice.
  */
 private normalizePositionChips(values: Array<string | GraphicPositionChip> = []): GraphicPositionChip[] {
  const seen = new Set<string>();
  const chips: GraphicPositionChip[] = [];
  (Array.isArray(values) ? values : []).forEach((entry) => {
   let chip: GraphicPositionChip | null = null;
   if (typeof entry === 'string') {
    const value = entry.trim();
    if (value) chip = { label: value, value };
   } else if (entry && typeof entry === 'object') {
    const value = String(entry.value || entry.label || '').trim();
    const label = String(entry.label || entry.value || '').trim();
    const title = entry.title != null ? String(entry.title).trim() : '';
    if (value) chip = { label: label || value, value, title: title || undefined };
   }
   if (!chip || seen.has(chip.value)) return;
   seen.add(chip.value);
   chips.push(chip);
  });
  return chips;
 }

 /*
  * Filter position chips by the search box, matching the chip label (ABBV), its
  * copy value, and its tooltip (DESC) so searching either the abbreviation or the
  * full position name surfaces the chip.
  */
 private filterPositionChips(chips: GraphicPositionChip[]): GraphicPositionChip[] {
  const query = this.tokenSearch.trim().toLowerCase();
  if (!query) return chips;
  return chips.filter((chip) =>
   [chip.label, chip.value, chip.title || ''].some((text) => String(text || '').toLowerCase().includes(query))
  );
 }

 private uniqueNonEmpty(values: string[] = []): string[] {
  const seen = new Set<string>();
  return (Array.isArray(values) ? values : [])
   .map((value) => String(value || '').trim())
   .filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
   });
 }

 private copyText(text: string): void {
  try {
   const textarea = document.createElement('textarea');
   textarea.value = text;
   textarea.setAttribute('readonly', '');
   textarea.style.position = 'fixed';
   textarea.style.top = '0';
   textarea.style.left = '-9999px';
   textarea.style.opacity = '0';
   document.body.appendChild(textarea);
   try {
    window.focus?.();
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
   } finally {
    document.body.removeChild(textarea);
   }
  } catch (error) {
   console.error('[ExportSettingsPanel] Failed to copy:', error);
  }
 }
}
