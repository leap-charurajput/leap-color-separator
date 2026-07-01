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
 @Input() graphicPositions: string[] = [];
 @Input() profileCodes: string[] = [];
 @Output() exportSettingChange = new EventEmitter<{ field: keyof ExportSettings; value: string }>();

 tokenSearch = '';

 readonly fields: ExportSettingField[] = [
  { key: 'printGuideFilePath', label: 'Print guide file path' },
  { key: 'separationPreviewFilePath', label: 'Separation Preview file path' },
  { key: 'postscriptFilePath', label: 'Postscript file path' }
 ];

 get displayedExcelColumns(): string[] {
  const columns = this.uniqueNonEmpty(this.excelColumns);
  return columns.length > 0 ? columns : [...FALLBACK_EXCEL_COLUMNS];
 }

 get displayedGraphicPositions(): string[] {
  const positions = this.uniqueNonEmpty(this.graphicPositions);
  return positions.length > 0 ? positions : [...FALLBACK_GRAPHIC_POSITIONS];
 }

 get filteredExcelColumns(): string[] {
  return this.filterValues(this.displayedExcelColumns);
 }

 get filteredGraphicPositions(): string[] {
  return this.filterValues(this.displayedGraphicPositions);
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
