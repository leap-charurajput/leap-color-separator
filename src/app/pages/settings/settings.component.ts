import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { csInterface } from '../../../libs/helper';
import {
 ExportSettings,
 GraphicPositionChip
} from '../../components/export-settings-panel/export-settings-panel.component';
import { ControllerService } from '../../services/controller.service';

interface Profile {
 id: string;
 name: string;
 code: string;
 colorMesh: string;
 underbaseSwatch?: string;
 underbaseMeshes: string[];
 underbaseEnabled: boolean[];
 underbaseKnockoutBlack?: boolean[];
 /** Per-UB swatch when K/O is on (optional; persisted on profile JSON). */
 underbaseKnockoutSwatches?: string[];
 /** Optional custom name per UB pass (UB1-4); when set, used for the underbase swatch + layer name. */
 underbaseNames?: string[];
 blocker?: boolean;
 blockerMesh?: string;
 blockerKnockoutBlack?: boolean;
 blockerKnockoutSwatch?: string;
 blackInksKnockoutDisplay?: string;
 waterbaseInk: boolean;
 overprintAllInks?: boolean;
 formatInkNameLabel?: boolean;
 colorNameLabelFormat?: string;
 distress?: string;
 _jsonData?: any;
}

@Component({
 selector: 'app-settings',
 templateUrl: './settings.component.html',
 styleUrls: ['./settings.component.css']
})
export class SettingsComponent implements OnInit, OnChanges {
 @Input() selectedSectionFromMenu: 'Separation Profiles' | 'General Settings' | 'Export Settings' = 'Separation Profiles';
 profiles: Profile[] = [];
 isLoading = true;
 editModalOpen = false;
 selectedProfile: Profile | null = null;
 /** Pre-filled profile when opening the modal from Duplicate (+); not persisted until Save. */
 duplicateProfileDraft: Profile | null = null;
 defaultMesh = '110';
 addUnderbase = true;
 artistName = '';
 artistInitials = '';
 ppdName = 'IBlock v2';
 chokeStrokeColorSwatch = '';
 koDarkColorNames = 'Black, PANTONE PROCESS BLACK C';
 meshValues = '';
 sepsTemplateFileName = 'SEP-GRID-TEMPLATE.ai';
 sepsTemplateFiles: string[] = [];
 selectedSection = 'Separation Profiles';
 exportSettings: ExportSettings = {
  printGuideFilePath: '',
  separationPreviewFilePath: '',
  postscriptFilePath: ''
 };
 exportExcelColumns: string[] = [];
 /*
  * Position chips shown under the export settings "Positions" section. Each chip's
  * label is the ABBV and its tooltip the DESC, both sourced from
  * SETTINGS/graphic_positions.json (see loadGraphicPositionChips).
  */
 exportGraphicPositions: GraphicPositionChip[] = [];

 // 🔑 Environment config
 environments = {
  Production: 'http://salesforce-connector.metadesign.org.in',
  Development: 'http://dev-leap-seps.metadesign.org.in',
  Localhost: 'http://localhost:6002'
 } as const;

 environmentKeys = Object.keys(this.environments) as Array<keyof typeof this.environments>;

 selectedEnvironmentKey: keyof typeof this.environments = 'Production';

 leapServerPath = '';

 constructor(private controller: ControllerService) {}

 get pageTitle(): string {
  if (this.selectedSection === 'General Settings') return 'General Settings';
  if (this.selectedSection === 'Export Settings') return 'Export Settings';
  return 'Manage Profiles';
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['selectedSectionFromMenu']?.currentValue) {
   this.selectedSection = changes['selectedSectionFromMenu'].currentValue;
  }
 }

 async ngOnInit(): Promise<void> {
  this.selectedSection = this.selectedSectionFromMenu || 'Separation Profiles';
  this.loadProfiles();
  this.loadLeapServerPath();
  this.loadGeneralSettings();
  this.loadExportSettings();
  this.loadExportTokenData();
  this.loadGraphicPositionChips();
  this.loadSepsTemplateFiles();

  try {
   const result = await this.controller.getAppVersion();

   if (result) {
    const foundKey = this.environmentKeys.find((key) => this.environments[key] === result);

    if (foundKey) {
     this.selectedEnvironmentKey = foundKey;
    }
   }
  } catch (err) {
   console.error('Failed to get app version:', err);
  }
 }

 get selectedEnvironmentUrl(): string {
  return this.environments[this.selectedEnvironmentKey];
 }

 onEnvironmentChange(envKey: keyof typeof this.environments): void {
  this.selectedEnvironmentKey = envKey;

  this.controller.saveAppVersion(this.selectedEnvironmentUrl).then((result) => {
   if (result) {
    // console.log('Environment URL saved:', this.selectedEnvironmentUrl);
    // This reloads the panel iframe correctly
    csInterface.evalScript('app.redraw()');

    // Reload HTML
    window.location.reload();
    alert('Restart Adobe Illustrator for this change to take effect');
   } else {
    alert('Failed to save environment URL');
   }
  });
 }

 loadGeneralSettings(): void {
  this.controller.loadGeneralSettings().then((result) => {
   if (result.success && result.data) {
    this.defaultMesh = result.data.defaultMesh != null ? String(result.data.defaultMesh) : '110';
    this.addUnderbase = result.data.addUnderbase !== undefined ? result.data.addUnderbase : true;
    this.artistName = result.data.artistName != null ? String(result.data.artistName) : '';
    this.artistInitials = result.data.artistInitials != null ? String(result.data.artistInitials) : '';
    this.ppdName = result.data.ppdName != null ? String(result.data.ppdName) : 'IBlock v2';
    this.chokeStrokeColorSwatch =
     result.data.chokeStrokeColorSwatch != null ? String(result.data.chokeStrokeColorSwatch) : '';
    this.koDarkColorNames =
     result.data.koDarkColorNames !== undefined && result.data.koDarkColorNames !== null
      ? String(result.data.koDarkColorNames)
      : 'Black, PANTONE PROCESS BLACK C';
    this.meshValues = result.data.meshValues != null ? String(result.data.meshValues) : '';
    this.sepsTemplateFileName =
     result.data.sepsTemplateFileName != null && String(result.data.sepsTemplateFileName).trim() !== ''
      ? String(result.data.sepsTemplateFileName).trim()
      : 'SEP-GRID-TEMPLATE.ai';
   }
  });
 }

 saveGeneralSettings(): void {
  const settings = {
   defaultMesh: this.defaultMesh,
   addUnderbase: this.addUnderbase,
   artistName: this.artistName,
   artistInitials: this.artistInitials,
   ppdName: this.ppdName,
   chokeStrokeColorSwatch: this.chokeStrokeColorSwatch,
   koDarkColorNames: this.koDarkColorNames,
   meshValues: this.meshValues,
   sepsTemplateFileName: this.sepsTemplateFileName
  };
  this.controller.saveGeneralSettings(settings).then((result) => {
   if (!result.success) {
    console.error('Failed to save general settings:', result.error);
   }
  });
 }

 loadExportSettings(): void {
  this.controller.loadExportSettings().then((result) => {
   if (result.success && result.data) {
    this.exportSettings = this.normalizeExportSettings(result.data);
   }
  });
 }

 saveExportSettings(): void {
  this.controller.saveExportSettings(this.exportSettings).then((result) => {
   if (!result.success) {
    console.error('Failed to save export settings:', result.error);
   }
  });
 }

 onExportSettingChange(update: { field: keyof ExportSettings; value: string }): void {
  this.exportSettings = {
   ...this.exportSettings,
   [update.field]: update.value
  };
  this.saveExportSettings();
 }

 loadExportTokenData(): void {
  this.controller
   .getExportSettingsTokenData()
   .then((result) => {
    if (result?.success) {
     this.exportExcelColumns = Array.isArray(result.excelColumns) ? result.excelColumns : [];
    }
   })
   .catch(() => {
    this.exportExcelColumns = [];
   });
 }

 /*
  * Load every graphic position from SETTINGS/graphic_positions.json and expose
  * them to the export settings "Positions" section as chips. The chip label is
  * the abbreviation (ABBV) — the same value that fills the document [POS] token —
  * and the tooltip is the full description (DESC).
  */
 loadGraphicPositionChips(): void {
  this.controller
   .getGraphicPositionOptionsFromJson()
   .then((result) => {
    const entries = result?.success && Array.isArray(result.entries) ? result.entries : [];
    this.exportGraphicPositions = this.buildPositionChips(entries);
   })
   .catch(() => {
    this.exportGraphicPositions = [];
   });
 }

 /*
  * Map DESC/ABBV entries into chips keyed on the abbreviation. The abbreviation is
  * both the visible label and the copied value; the description becomes the
  * tooltip. Entries are de-duplicated by abbreviation so the same code is not
  * shown twice.
  */
 private buildPositionChips(entries: Array<{ desc: string; abbv: string }>): GraphicPositionChip[] {
  const seen = new Set<string>();
  const chips: GraphicPositionChip[] = [];
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
   const desc = String(entry?.desc || '').trim();
   const abbv = String(entry?.abbv || '').trim() || desc;
   if (!abbv || seen.has(abbv)) return;
   seen.add(abbv);
   chips.push({ label: abbv, value: abbv, title: desc || abbv });
  });
  return chips;
 }

 get exportProfileCodes(): string[] {
  const seen = new Set<string>();
  return (Array.isArray(this.profiles) ? this.profiles : [])
   .map((profile) => String(profile?.code || '').trim())
   .filter((code) => {
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
   });
 }

 private normalizeExportSettings(settings: any): ExportSettings {
  return {
   printGuideFilePath: settings?.printGuideFilePath != null ? String(settings.printGuideFilePath) : '',
   separationPreviewFilePath:
    settings?.separationPreviewFilePath != null ? String(settings.separationPreviewFilePath) : '',
   postscriptFilePath: settings?.postscriptFilePath != null ? String(settings.postscriptFilePath) : ''
  };
 }

 loadLeapServerPath(): void {
  this.controller.getLeapServerDataPath().then((path) => {
   this.leapServerPath = path;
   this.loadSepsTemplateFiles();
  });
 }

 onChooseLeapPath(): void {
  this.controller.selectAndSaveLeapSettings().then((result) => {
   if (result.success && result.path) {
    this.leapServerPath = result.path;
    this.loadSepsTemplateFiles();
   } else if (!result.cancelled) {
    // console.error('Error updating LEAP Data path', result.error);
   }
  });
 }

 loadSepsTemplateFiles(): void {
  this.controller.getSepsTemplateFiles().then((result) => {
   if (result.success && Array.isArray(result.files)) {
    this.sepsTemplateFiles = result.files;
    if (this.sepsTemplateFiles.length > 0) {
     const hasSavedSelection = this.sepsTemplateFiles.indexOf(this.sepsTemplateFileName) >= 0;
     if (!hasSavedSelection) {
      this.sepsTemplateFileName = this.sepsTemplateFiles[0];
      this.saveGeneralSettings();
     }
    }
   } else {
    this.sepsTemplateFiles = [];
   }
  });
 }

 loadProfiles(): void {
  this.isLoading = true;

  this.controller
   .getSeparationProfiles()
   .then((result) => {
    if (result.success && Array.isArray(result.profiles)) {
     this.profiles = result.profiles.map((jsonProfile: any, index: number) =>
      this.jsonToReactProfile(jsonProfile, index)
     );
    } else {
     this.profiles = [];
    }
   })
   .catch((err) => {
    this.profiles = [];
   })
   .finally(() => {
    this.isLoading = false;
   });
 }

 jsonToReactProfile(jsonProfile: any, index: number): Profile {
  const meshToString = (value: any) => {
   if (value === null || value === undefined || value === '' || value === ' ' || isNaN(value)) {
    return '';
   }
   return String(value);
  };

  const profileName = jsonProfile['Profile Name'] || '';
  const distress = jsonProfile['Distress'] || 'N';
  const toEnabled = (value: any) => {
   if (value === true || value === 1) return true;
   if (typeof value === 'string') {
    const v = value.trim().toUpperCase();
    return v === 'Y' || v === 'YES' || v === 'TRUE' || v === '1';
   }
   return false;
  };
  const ubMeshes = [
   meshToString(jsonProfile['UB 1 Mesh']),
   meshToString(jsonProfile['UB 2 Mesh']),
   meshToString(jsonProfile['UB 3 Mesh']),
   meshToString(jsonProfile['UB 4 Mesh'])
  ];
  const savedEnabled = Array.isArray(jsonProfile.underbaseEnabled) ? jsonProfile.underbaseEnabled : null;
  const savedKnockout = Array.isArray(jsonProfile.underbaseKnockoutBlack)
   ? jsonProfile.underbaseKnockoutBlack
   : null;
  const underbaseEnabled = [
   true,
   savedEnabled ? !!savedEnabled[1] : toEnabled(jsonProfile['Underbase 2']) || ubMeshes[1] !== '',
   savedEnabled ? !!savedEnabled[2] : toEnabled(jsonProfile['Underbase 3']) || ubMeshes[2] !== '',
   savedEnabled ? !!savedEnabled[3] : toEnabled(jsonProfile['Underbase 4']) || ubMeshes[3] !== ''
  ];
  const underbaseKnockoutBlack = [
   savedKnockout ? !!savedKnockout[0] : false,
   savedKnockout ? !!savedKnockout[1] : false,
   savedKnockout ? !!savedKnockout[2] : false,
   savedKnockout ? !!savedKnockout[3] : false
  ];
  const defaultSw = ['White UB', 'White UB', 'White UB', 'White UB'];
  const savedSwatches = Array.isArray(jsonProfile.underbaseKnockoutSwatches)
   ? jsonProfile.underbaseKnockoutSwatches
   : null;
  const underbaseKnockoutSwatches = [
   savedSwatches && savedSwatches[0] != null && String(savedSwatches[0]).trim() !== ''
    ? String(savedSwatches[0])
    : defaultSw[0],
   savedSwatches && savedSwatches[1] != null && String(savedSwatches[1]).trim() !== ''
    ? String(savedSwatches[1])
    : defaultSw[1],
   savedSwatches && savedSwatches[2] != null && String(savedSwatches[2]).trim() !== ''
    ? String(savedSwatches[2])
    : defaultSw[2],
   savedSwatches && savedSwatches[3] != null && String(savedSwatches[3]).trim() !== ''
    ? String(savedSwatches[3])
    : defaultSw[3]
  ];

  const savedUbNames = Array.isArray(jsonProfile.underbaseNames) ? jsonProfile.underbaseNames : null;
  const underbaseNames = [0, 1, 2, 3].map((j) =>
   savedUbNames && savedUbNames[j] != null ? String(savedUbNames[j]) : ''
  );

  const jp = jsonProfile as any;
  const blockerKnockoutSwatchRaw = jp.blockerKnockoutSwatch != null ? String(jp.blockerKnockoutSwatch).trim() : '';
  const blockerKnockoutSwatch =
   blockerKnockoutSwatchRaw !== '' ? blockerKnockoutSwatchRaw : defaultSw[0];
  const underbaseSwatchRaw =
   jp.underbaseSwatch != null
    ? String(jp.underbaseSwatch).trim()
    : jsonProfile['Underbase Swatch'] != null
     ? String(jsonProfile['Underbase Swatch']).trim()
     : '';
  const underbaseSwatch = underbaseSwatchRaw !== '' ? underbaseSwatchRaw : defaultSw[0];

  return {
   id: jsonProfile.id || this.generateId(profileName, distress),
   name: profileName,
   code: jsonProfile['Profile Code'] || '',
   colorMesh: meshToString(jsonProfile['Color Mesh']),
   underbaseMeshes: ubMeshes,
   underbaseEnabled: underbaseEnabled,
   underbaseKnockoutBlack: underbaseKnockoutBlack,
   underbaseKnockoutSwatches,
   underbaseNames,
   underbaseSwatch,
   blocker: toEnabled(jp.blocker) || toEnabled(jsonProfile.Blocker),
   blockerMesh:
    jp.blockerMesh != null
     ? String(jp.blockerMesh)
     : (jsonProfile['Blocker Mesh'] != null ? String(jsonProfile['Blocker Mesh']) : ''),
   blockerKnockoutBlack: !!jp.blockerKnockoutBlack,
   blockerKnockoutSwatch,
   blackInksKnockoutDisplay:
    jsonProfile.blackInksKnockoutDisplay != null ? String(jsonProfile.blackInksKnockoutDisplay) : '',
   waterbaseInk: jsonProfile['WB'] === 'Y' || jsonProfile['WB'] === true,
   overprintAllInks: jp.overprintAllInks !== undefined ? !!jp.overprintAllInks : true,
   formatInkNameLabel: !!jp.formatInkNameLabel,
   colorNameLabelFormat: jp.colorNameLabelFormat != null ? String(jp.colorNameLabelFormat) : '',
   distress: distress,
   _jsonData: jsonProfile
  };
 }

 reactToJsonProfile(reactProfile: Profile): any {
  const rp = reactProfile as any;
  const stringToNumberOrEmpty = (str: string) => {
   if (!str || str.trim() === '' || str === ' ') {
    return '';
   }
   const num = parseFloat(str);
   return isNaN(num) ? '' : num;
  };

  const pickUbSwatchForJson = (i: number): string => {
   const arr = rp.underbaseKnockoutSwatches;
   if (!arr || !Array.isArray(arr) || i < 0 || i >= arr.length) return 'White UB';
   const raw = arr[i];
   if (raw == null) return 'White UB';
   const t = String(raw).trim();
   return t !== '' ? t : 'White UB';
  };

  const jsonProfile: any = {
   'Profile Name': reactProfile.name || '',
   'Profile Code': reactProfile.code || '',
   'Color Mesh': stringToNumberOrEmpty(reactProfile.colorMesh),
   'Underbase Swatch':
    rp.underbaseSwatch != null && String(rp.underbaseSwatch).trim() !== ''
     ? String(rp.underbaseSwatch).trim()
     : 'White UB',
   'UB 1 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[0]),
   'UB 2 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[1]),
   'UB 3 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[2]),
   'UB 4 Mesh': stringToNumberOrEmpty(reactProfile.underbaseMeshes[3]),
   'Underbase 2': reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[1] ? 'Y' : 'N',
   'Underbase 3': reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[2] ? 'Y' : 'N',
   'Underbase 4': reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[3] ? 'Y' : 'N',
   underbaseEnabled: [
    true,
    !!(reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[1]),
    !!(reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[2]),
    !!(reactProfile.underbaseEnabled && reactProfile.underbaseEnabled[3])
   ],
   underbaseKnockoutBlack: [
    !!(reactProfile.underbaseKnockoutBlack && reactProfile.underbaseKnockoutBlack[0]),
    !!(reactProfile.underbaseKnockoutBlack && reactProfile.underbaseKnockoutBlack[1]),
    !!(reactProfile.underbaseKnockoutBlack && reactProfile.underbaseKnockoutBlack[2]),
    !!(reactProfile.underbaseKnockoutBlack && reactProfile.underbaseKnockoutBlack[3])
   ],
   underbaseKnockoutSwatches: [
    pickUbSwatchForJson(0),
    pickUbSwatchForJson(1),
    pickUbSwatchForJson(2),
    pickUbSwatchForJson(3)
   ],
   underbaseNames: [0, 1, 2, 3].map((i) => {
    const arr = (rp.underbaseNames as string[]) || [];
    return arr[i] != null ? String(arr[i]).trim() : '';
   }),
   underbaseSwatch:
    rp.underbaseSwatch != null && String(rp.underbaseSwatch).trim() !== ''
     ? String(rp.underbaseSwatch).trim()
     : 'White UB',
   blockerKnockoutBlack: !!rp.blockerKnockoutBlack,
   blockerKnockoutSwatch:
    rp.blockerKnockoutSwatch != null && String(rp.blockerKnockoutSwatch).trim() !== ''
     ? String(rp.blockerKnockoutSwatch).trim()
     : 'White UB',
   blockerMesh: rp.blockerMesh != null ? String(rp.blockerMesh) : '',
   overprintAllInks: rp.overprintAllInks !== undefined ? !!rp.overprintAllInks : true,
   formatInkNameLabel: !!rp.formatInkNameLabel,
   colorNameLabelFormat: rp.colorNameLabelFormat != null ? String(rp.colorNameLabelFormat) : '',
   blackInksKnockoutDisplay:
    reactProfile.blackInksKnockoutDisplay != null
     ? String(reactProfile.blackInksKnockoutDisplay)
     : '',
   WB: reactProfile.waterbaseInk ? 'Y' : 'N'
  };

  if (reactProfile._jsonData) {
   jsonProfile.Distress = reactProfile._jsonData.Distress || 'N';
   jsonProfile['2 Hits'] = reactProfile._jsonData['2 Hits'] || 'N';
   jsonProfile.Blocker =
    rp.blocker === true || rp.blocker === false
     ? rp.blocker
      ? 'Y'
      : 'N'
     : reactProfile._jsonData.Blocker || 'N';
   jsonProfile.Flash =
    reactProfile._jsonData.Flash &&
    reactProfile._jsonData.Flash !== null &&
    !isNaN(reactProfile._jsonData.Flash)
     ? reactProfile._jsonData.Flash
     : '';
   jsonProfile.Cool =
    reactProfile._jsonData.Cool &&
    reactProfile._jsonData.Cool !== null &&
    !isNaN(reactProfile._jsonData.Cool)
     ? reactProfile._jsonData.Cool
     : '';
   jsonProfile.Micron = reactProfile._jsonData.Micron || 'XXX';
  } else {
   jsonProfile.Distress = 'N';
   jsonProfile['2 Hits'] = 'N';
   jsonProfile.Blocker = rp.blocker === true || rp.blocker === false ? (rp.blocker ? 'Y' : 'N') : 'N';
   jsonProfile.Flash = '';
   jsonProfile.Cool = '';
   jsonProfile.Micron = 'XXX';
  }

  return jsonProfile;
 }

 generateId(name: string, distress?: string): string {
  const distressValue = distress || 'N';
  const combined = `${name}-${distressValue}`;
  return combined
   .toLowerCase()
   .replace(/[^a-z0-9]+/g, '-')
   .replace(/^-|-$/g, '');
 }

 saveProfiles(profilesToSave: Profile[]): Promise<any> {
  const jsonProfiles = profilesToSave.map((p) => this.reactToJsonProfile(p));
  return this.controller
   .saveSeparationProfiles(jsonProfiles)
   .then((result) => {
    if (!result.success) {
    }
    return result;
   })
   .catch((err) => {
    return { success: false, error: err.message || err.toString() };
   });
 }

 handleAddProfile(): void {
  this.duplicateProfileDraft = null;
  this.selectedProfile = null;
  this.editModalOpen = true;
 }

 handleEditProfile(profile: Profile): void {
  this.duplicateProfileDraft = null;
  this.selectedProfile = profile;
  this.editModalOpen = true;
 }

 /**
  * Opens the edit modal with a copy of the profile; name and code default to "-2".
  * JSON is updated only if the user clicks Save.
  */
 handleDuplicateProfile(profile: Profile): void {
  this.selectedProfile = null;
  this.duplicateProfileDraft = this.buildDuplicateProfileDraft(profile);
  this.editModalOpen = true;
 }

 private buildDuplicateProfileDraft(profile: Profile): Profile {
  const newName = `${profile.name}-2`;
  const baseCode = profile.code || profile._jsonData?.['Profile Code'] || '';
  const newCode = baseCode ? `${baseCode}-2` : '';
  const distress = profile.distress || profile._jsonData?.Distress || 'N';

  let newJsonData: any | undefined;
  if (profile._jsonData) {
   newJsonData = JSON.parse(JSON.stringify(profile._jsonData)) as any;
   newJsonData['Profile Name'] = newName;
   newJsonData['Profile Code'] = newCode;
   newJsonData.id = this.generateId(newName, distress);
  }

  return {
   ...profile,
   id: this.generateId(newName, distress),
   name: newName,
   code: newCode,
   _jsonData: newJsonData
  };
 }

 handleDeleteProfile(profile: Profile): void {
  if (!profile || !profile.id) {
   return;
  }

  const updatedProfiles = this.profiles.filter((p) => p.id !== profile.id);
  if (updatedProfiles.length === this.profiles.length) {
   return;
  }

  this.saveProfiles(updatedProfiles).then((result) => {
   if (result.success) {
    this.profiles = updatedProfiles;
   } else {
   }
  });
 }

 handleModalClose(): void {
  this.editModalOpen = false;
  this.selectedProfile = null;
  this.duplicateProfileDraft = null;
 }

 handleModalSave(updatedProfile: Profile): void {
  let updatedProfiles: Profile[];

  if (this.duplicateProfileDraft) {
   const distress =
    updatedProfile.distress ??
    this.duplicateProfileDraft.distress ??
    this.duplicateProfileDraft._jsonData?.Distress ??
    'N';
   const name = (updatedProfile.name || this.duplicateProfileDraft.name || '').trim();
   const merged: Profile = {
    ...this.duplicateProfileDraft,
    ...updatedProfile,
    name,
    id: this.generateId(name || 'new-profile', distress)
   };
   if (merged._jsonData) {
    const jd = JSON.parse(JSON.stringify(merged._jsonData)) as any;
    jd['Profile Name'] = merged.name;
    jd['Profile Code'] = merged.code ?? '';
    jd.id = merged.id;
    merged._jsonData = jd;
   }
   (merged as any)._jsonData = this.reactToJsonProfile(merged);
   updatedProfiles = [...this.profiles, merged];
  } else if (this.selectedProfile && this.selectedProfile.id) {
   updatedProfiles = this.profiles.map((item) => {
    if (item.id !== this.selectedProfile!.id) return item;
    const merged = { ...item, ...updatedProfile } as Profile;
    (merged as any)._jsonData = this.reactToJsonProfile(merged);
    return merged;
   });
  } else {
   const newProfile: Profile = {
    ...updatedProfile,
    id: updatedProfile.id || this.generateId(updatedProfile.name || 'new-profile')
   };
   (newProfile as any)._jsonData = this.reactToJsonProfile(newProfile);
   updatedProfiles = [...this.profiles, newProfile];
  }

  this.profiles = updatedProfiles;
  this.saveProfiles(updatedProfiles);
  this.handleModalClose();
 }
}
