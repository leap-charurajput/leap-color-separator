import {
 ChangeDetectorRef,
 Component,
 Input,
 OnChanges,
 OnDestroy,
 OnInit,
 SimpleChanges
} from '@angular/core';
import { Subscription } from 'rxjs';
import { ConfirmDialogCheckboxOption } from '../../components/confirm-dialog/confirm-dialog.component';
import { SeparationProfileActionDialogResult } from '../../components/separation-profile-action-dialog/separation-profile-action-dialog.component';
import { AddSeparationDialogResult, AddSeparationDialogStyleOption } from '../../components/add-separation-dialog/add-separation-dialog.component';
import { ControllerService } from '../../services/controller.service';
import { GraphicsDataService } from '../../services/graphics-data.service';

interface Separation {
 id: number;
 profile: string;
 styles: string[];
 colors: string[];
 sepFileName: string;
 isCreated: boolean;
}

interface XmpSeparationGroup {
 profile: string;
 styles: string[];
}

@Component({
 selector: 'app-separations',
 templateUrl: './separations.component.html',
 styleUrls: ['./separations.component.css']
})
export class SeparationsComponent implements OnInit, OnChanges, OnDestroy {
 @Input() documentRefreshKey = 0;

 isRunningInBrowser = false;
 expandedGraphics: Set<string> = new Set();
 graphicOptions: string[] = [];
 isLoadingGraphics = false;
 teamCode = '';
 separations: Separation[] = [];
 isLoadingSeparations = false;
 graphicsData: any[] = [];
 availableColors: string[] = [];
 separationPaths: { [key: string]: string } = {};
 graphicFolderStatus: { [key: string]: boolean } = {};
 graphicFileStatus: { [key: string]: boolean } = {};
 isCheckingFolderMap: { [key: string]: boolean } = {};
 hasVersionDocument = false;
 isCheckingDocument = false;
 hasGraphicsPositions = false;
 isSeparatedDoc = false;
 /** Profile names from Profiles.json (Separation Profile Settings); used to disable Generate when profile file missing. */
 profileNamesFromSettings: string[] = [];
 profileNamesLoaded = false;
 /** Current version document path; used to resolve project Batch Excel for style/color codes. */
 versionDocumentPath: string | null = null;
 separatedDocInfo: {
  teamVersionName?: string;
  teamVersionPath?: string;
  leapTemplateName?: string;
  leapTemplatePath?: string;
  profileMetaData?: {
   graphicName?: string;
   createdDate?: string;
   artistName?: string;
   artistInitials?: string;
   styleCodes?: string[];
  };
 } = {};
 /** Show confirmation dialog before deleting all plates */
 showDeleteAllConfirm = false;
 /** Show confirmation before recreating plates (optional cleanup checkboxes) */
 showRecreateAllConfirm = false;
 /** All style codes from team Batch Excel (for New separation dialog). */
 allTeamStyleCodes: string[] = [];
 /** Confirm delete separation .ai file + clear XMP path */
 showDeleteSeparationFileConfirm = false;
 deleteSeparationFileContext: {
  graphicName: string;
  separationId: number;
  profileName: string;
  filePath: string;
 } | null = null;
 /** Duplicate / Edit-New separation dialog */
 separationActionDialogOpen = false;
 separationActionDialogMode: 'duplicate' | 'edit-new' = 'edit-new';
 separationActionDialogIsNew = false;
 separationActionDialogContext: {
  graphicName: string;
  separationId: number;
  originalProfileName: string;
 } | null = null;
 separationActionDialogStyleCodes: string[] = [];
 separationActionDialogInitialProfile = '';
 separationActionDialogInitialStyles: string[] = [];
 separationActionDialogHasFile = false;
 separationActionDialogInitialDuplicateAi = true;
 separationActionDialogInitialScaleEnabled = false;
 separationActionDialogInitialScalePercent: number | null = 100;
 /** Add separation dialog */
 addSeparationDialogOpen = false;
 addSeparationDialogGraphicName = '';
 isLoadingAddSeparationDialog = false;
 styleCatalogOptions: AddSeparationDialogStyleOption[] = [];
 /** Groups read from XMP LEAPSeparationProfileData to persist manual additions across reopen. */
 xmpSeparationGroups: XmpSeparationGroup[] = [];
 recreatePlateCheckboxOptions: ConfirmDialogCheckboxOption[] = [
  {
   id: 'deleteUnpaintedPaths',
   label: 'Delete unpainted paths after Merge'
  },
  {
   id: 'deleteLeftoverPaths',
   label: 'Delete leftover paths after Add'
  }
 ];
 private documentActivateHandler: (() => void) | null = null;
 private graphicsSubscription: Subscription | null = null;

 constructor(
  private controller: ControllerService,
  private cdr: ChangeDetectorRef,
  private graphicsDataService: GraphicsDataService
 ) {
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  this.setupDocumentEventListener();
  this.checkVersionDocument();
  this.subscribeToGraphicsData();
 }

 private subscribeToGraphicsData(): void {
  this.graphicsSubscription = this.graphicsDataService.graphicsData$.subscribe((data) => {
   this.graphicsData = data;
   this.hasGraphicsPositions = data.some((g: any) => g.position && g.position.trim() !== '');
   this.cdr.detectChanges();
  });
 }

 ngOnDestroy(): void {
  this.removeDocumentEventListener();
  if (this.graphicsSubscription) {
   this.graphicsSubscription.unsubscribe();
  }
 }


 ngOnChanges(changes: SimpleChanges): void {
  if (changes['documentRefreshKey']) {
   this.refreshData();
  }
 }

 async refreshData(): Promise<void> {
  this.isCheckingDocument = true;
  this.cdr.detectChanges();
  try {
   await this.checkVersionDocument();
   if (this.hasVersionDocument) {
    await this.loadGraphicsList();
    await this.loadGraphicsData();
    await this.loadSeparationPaths();
    await this.loadTeamCode();
   } else if (!this.isSeparatedDoc) {
    this.graphicOptions = [];
    this.teamCode = '';
    this.separations = [];
    this.graphicsData = [];
    this.separationPaths = {};
    this.hasGraphicsPositions = false;
    this.isSeparatedDoc = false;
    this.cdr.detectChanges();
   }
  } catch (err) {
   console.error('[Separations] refreshData error:', err);
  } finally {
   this.isCheckingDocument = false;
   this.cdr.detectChanges();
  }
 }

 setupDocumentEventListener(): void {
  if (this.isRunningInBrowser || !(window as any).session) {
   return;
  }

  try {
   const csInterface = (window as any).session.scriptLoader().cs;
   const EVENT_DOCUMENT_ACTIVATE = 'documentAfterActivate';

   this.documentActivateHandler = () => {
    this.checkVersionDocument();
    this.loadTeamCode();
    this.loadGraphicsList();
    this.loadGraphicsData();
    this.loadSeparationPaths();
   };

   csInterface.addEventListener(EVENT_DOCUMENT_ACTIVATE, this.documentActivateHandler);
  } catch (err) { }
 }

 removeDocumentEventListener(): void {
  if (this.isRunningInBrowser || !(window as any).session || !this.documentActivateHandler) {
   return;
  }

  try {
   const csInterface = (window as any).session.scriptLoader().cs;
   const EVENT_DOCUMENT_ACTIVATE = 'documentAfterActivate';

   csInterface.removeEventListener(EVENT_DOCUMENT_ACTIVATE, this.documentActivateHandler);
   this.documentActivateHandler = null;
  } catch (err) { }
 }

 async checkVersionDocument(): Promise<void> {
  this.isCheckingDocument = true;
  try {
   const separatedResult = await this.controller.checkSeparatedDocument();
   // Debug: share this console output to inspect XMP/document detection
   console.log('[Separations] checkSeparatedDocument result:', JSON.stringify({
    success: separatedResult?.success,
    isSeparatedDoc: separatedResult?.data?.isSeparatedDoc,
    docPath: separatedResult?.data?.docPath,
    docName: separatedResult?.data?.docName,
    _debug: separatedResult?.data?._debug
   }, null, 2));
   if (separatedResult.success && separatedResult.data && separatedResult.data.isSeparatedDoc) {
    this.isSeparatedDoc = true;
    this.separatedDocInfo = { ...(separatedResult.data || {}) };
    this.hasVersionDocument = false;
    this.versionDocumentPath = null;
    this.isCheckingDocument = false;

    // Try to fetch styleInfo if missing from XMP but styleCodes are present
    const meta: any = this.separatedDocInfo.profileMetaData;
    if (meta && !meta.styleInfo && meta.styleCodes && Array.isArray(meta.styleCodes) && meta.styleCodes.length > 0) {
     try {
      const styleRes = await this.controller.getStyleInformation(meta.styleCodes);
      if (styleRes?.success && styleRes.styleInfoMap) {
       const firstCode = meta.styleCodes[0];
       const styleInfo = styleRes.styleInfoMap[firstCode];
       if (styleInfo) {
        meta.styleInfo = styleInfo;
       }
      }
     } catch (e) {
      console.warn('[Separations] Failed to fetch styleInfo for separated doc', e);
     }
    }

    // Debug: full payload received by Separations (should show template/version links and profileMetaData)
    console.log('[Separations] separatedDocInfo set (Current sep UI data):', {
     hasProfileMetaData: !!this.separatedDocInfo.profileMetaData,
     hasStyleInfo: !!(this.separatedDocInfo.profileMetaData as any)?.styleInfo,
     graphicName: (this.separatedDocInfo.profileMetaData as any)?.graphicName,
     artistName: (this.separatedDocInfo.profileMetaData as any)?.artistName,
     artistInitials: (this.separatedDocInfo.profileMetaData as any)?.artistInitials,
     teamVersionName: this.separatedDocInfo.teamVersionName,
     leapTemplateName: this.separatedDocInfo.leapTemplateName,
     willShowRows: !!(
      this.separatedDocInfo.teamVersionName ||
      this.separatedDocInfo.leapTemplateName ||
      ((this.separatedDocInfo.profileMetaData as any)?.graphicName || '').trim() ||
      ((this.separatedDocInfo.profileMetaData as any)?.artistName || (this.separatedDocInfo.profileMetaData as any)?.artistInitials || '').trim()
     )
    });
    this.cdr.detectChanges();
    await this.loadProfileNamesFromSettings();
    return;
   }
   this.isSeparatedDoc = false;
   this.separatedDocInfo = {};
   const result = await this.controller.getTemplateInfo();
   if (this.isSeparatedDoc || !result) return;
   if (result.success && result.hasDocument) {
    const isVersionFile = result.hasDocument && result.data && result.data.teamCode;
    this.hasVersionDocument = !!isVersionFile;
    this.versionDocumentPath = result.documentPath || null;

    if (this.hasVersionDocument) {
     await this.loadProfileNamesFromSettings();
     await this.loadGraphicsList();
     await this.loadGraphicsData();
     await this.loadSeparationPaths();
     await this.loadTeamCode();
    }
   } else {
    this.hasVersionDocument = false;
    this.versionDocumentPath = null;
    this.graphicOptions = [];
    this.teamCode = '';
    this.separations = [];
    this.graphicsData = [];
    this.separationPaths = {};
    this.hasGraphicsPositions = false;
   }
  } catch (err) {
   console.error('[Separations] checkVersionDocument error:', err);
   this.hasVersionDocument = false;
  } finally {
   // Debug: final state after check (share this to verify UI state)
   console.log('[Separations] checkVersionDocument state:', {
    isSeparatedDoc: this.isSeparatedDoc,
    hasVersionDocument: this.hasVersionDocument,
    versionDocumentPath: this.versionDocumentPath,
    isCheckingDocument: this.isCheckingDocument,
    separatedDocInfoKeys: this.isSeparatedDoc ? Object.keys(this.separatedDocInfo || {}) : []
   });
   this.isCheckingDocument = false;
   this.cdr.detectChanges();
  }
 }

 loadProfileNamesFromSettings(): Promise<void> {
  if (this.isRunningInBrowser || !this.controller.getSeparationProfiles) {
   return Promise.resolve();
  }
  if (!this.hasVersionDocument && !this.isSeparatedDoc) {
   return Promise.resolve();
  }
  return this.controller
   .getSeparationProfiles()
   .then((result: any) => {
    if (result && result.success && Array.isArray(result.profiles)) {
     this.profileNamesFromSettings = (result.profiles as any[])
      .map((p: any) => {
       const name = p && (p['Profile Name'] ?? p.profileName ?? p.name) != null
        ? String(p['Profile Name'] ?? p.profileName ?? p.name).trim()
        : '';
       return name;
      })
      .filter(Boolean);
    } else {
     this.profileNamesFromSettings = [];
    }
    this.profileNamesLoaded = true;
    this.cdr.detectChanges();
   })
   .catch((err) => {
    this.profileNamesFromSettings = [];
    this.profileNamesLoaded = true;
    this.cdr.detectChanges();
   });
 }

 async loadTeamCode(): Promise<void> {
  try {
   const result = await this.controller.getTemplateInfo();
   if (result.success && result.data && result.data.teamCode) {
    this.teamCode = result.data.teamCode;
    if (result.documentPath) {
     this.versionDocumentPath = result.documentPath;
    }
    if (this.teamCode && this.teamCode !== '') {
     await this.loadAvailableColors();
     await this.loadSeparations();
    }
   } else {
    this.teamCode = '';
    this.separations = [];
    this.cdr.detectChanges();
   }
  } catch (err) {
   console.error('[Separations] loadTeamCode error:', err);
  }
 }

 async loadAvailableColors(): Promise<void> {
  if (!this.teamCode || this.teamCode === '') {
   return;
  }

  if (this.isRunningInBrowser) {
   return;
  }

  try {
   const result = await this.controller.getColorCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined);
   if (result.success && result.colors && Array.isArray(result.colors)) {
    this.availableColors = result.colors;
   } else {
    this.availableColors = [];
   }
  } catch (err) {
   console.error('[Separations] loadAvailableColors error:', err);
   this.availableColors = [];
  }
 }

 async loadGraphicsList(): Promise<void> {
  if (this.isRunningInBrowser) {
   return;
  }

  this.isLoadingGraphics = true;
  try {
   const result = await this.controller.getGraphicsList();
   if (result.success && result.graphics && Array.isArray(result.graphics)) {
    this.graphicOptions = [...result.graphics];

    // Initialize expanded state for all graphics
    this.expandedGraphics.clear();
    this.graphicOptions.forEach((g) => this.expandedGraphics.add(g));

    await this.checkAllGraphicFolders();
    await this.loadSeparationPaths();

    if (this.teamCode && this.teamCode !== '' && this.versionDocumentPath) {
     await this.loadSeparations();
    }

    await this.checkGraphicsPositions();
    this.cdr.detectChanges();
   } else {
    this.graphicOptions = [];
    this.hasGraphicsPositions = false;
   }
  } catch (err) {
   console.error('[Separations] loadGraphicsList error:', err);
   this.graphicOptions = [];
   this.hasGraphicsPositions = false;
  } finally {
   this.isLoadingGraphics = false;
   this.cdr.detectChanges();
  }
 }

 async loadSeparationPaths(skipRefreshSeparations: boolean = false): Promise<void> {
  try {
   const result = await this.controller.loadSeparationPaths();
   if (!result) {
    this.separationPaths = {};
    return;
   }

   if (result.success && result.separationPaths) {
    this.separationPaths = result.separationPaths;
    const entries = Array.isArray(result.separationEntries) ? result.separationEntries : [];
    const grouped: { [profile: string]: Set<string> } = {};
    entries.forEach((entry: any) => {
     const profile = String(entry?.profileName || '').trim();
     if (!profile) return;
     const styles = Array.isArray(entry?.styleCodes)
      ? entry.styleCodes.map((s: any) => String(s || '').trim()).filter(Boolean)
      : [];
     if (!grouped[profile]) grouped[profile] = new Set<string>();
     styles.forEach((s: string) => grouped[profile].add(s));
    });
    this.xmpSeparationGroups = Object.keys(grouped).map((profile) => ({
     profile,
     styles: Array.from(grouped[profile]).sort()
    }));
    if (!skipRefreshSeparations && this.hasVersionDocument && this.teamCode) {
     this.loadSeparations();
    }
   } else {
    this.separationPaths = {};
    this.xmpSeparationGroups = [];
   }
  } catch (err) {
   console.error('[Separations] loadSeparationPaths error:', err);
   this.separationPaths = {};
   this.xmpSeparationGroups = [];
  } finally {
   this.cdr.detectChanges();
  }
 }

 async loadGraphicsData(): Promise<void> {
  try {
   const result = await this.controller.loadGraphicsData();
   if (
    result.success &&
    result.graphicsData &&
    Array.isArray(result.graphicsData) &&
    result.graphicsData.length > 0
   ) {
    this.graphicsData = result.graphicsData;
   } else {
    this.loadGraphicsDataFromLocalStorage();
   }
  } catch (err) {
   this.loadGraphicsDataFromLocalStorage();
  } finally {
   this.cdr.detectChanges();
  }
 }

 private loadGraphicsDataFromLocalStorage(): void {
  try {
   const savedGraphics = localStorage.getItem('graphicsPositions');
   if (savedGraphics) {
    this.graphicsData = JSON.parse(savedGraphics);
   } else {
    this.graphicsData = [];
   }
  } catch (err) {
   this.graphicsData = [];
  }
 }

 async checkGraphicsPositions(): Promise<void> {
  try {
   const result = await this.controller.loadGraphicsData();
   if (
    result.success &&
    result.graphicsData &&
    Array.isArray(result.graphicsData) &&
    result.graphicsData.length > 0
   ) {
    const graphicsData = result.graphicsData;
    this.hasGraphicsPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
   } else {
    this.checkGraphicsPositionsFromLocalStorage();
   }
  } catch (err) {
   this.checkGraphicsPositionsFromLocalStorage();
  } finally {
   this.cdr.detectChanges();
  }
 }

 private checkGraphicsPositionsFromLocalStorage(): void {
  try {
   const savedGraphics = localStorage.getItem('graphicsPositions');
   if (savedGraphics) {
    const graphicsData = JSON.parse(savedGraphics);
    this.hasGraphicsPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
   } else {
    this.hasGraphicsPositions = false;
   }
  } catch (err) {
   this.hasGraphicsPositions = false;
  }
 }

 private upsertSeparationGroupInList(
  list: Separation[],
  profileName: string,
  styleCode: string
 ): Separation[] {
  const normalizedProfile = String(profileName || '').trim() || 'Unknown Profile';
  const normalizedStyle = String(styleCode || '').trim();
  if (!normalizedStyle) return list;
  const existingIndex = list.findIndex((s) => String(s.profile || '').trim() === normalizedProfile);
  if (existingIndex >= 0) {
   return list.map((item, idx) => {
    if (idx !== existingIndex) return item;
    const nextStyles = Array.from(new Set([...(item.styles || []), normalizedStyle])).sort();
    return { ...item, styles: nextStyles };
   });
  }
  const nextId = list.length === 0 ? 1 : Math.max(...list.map((s) => s.id || 0)) + 1;
  return [
   ...list,
   {
    id: nextId,
    profile: normalizedProfile,
    styles: [normalizedStyle],
    colors: [],
    sepFileName: '',
    isCreated: false
   }
  ];
 }

 private mergeSeparationGroups(base: Separation[], groups: XmpSeparationGroup[]): Separation[] {
  let merged = [...(base || [])];
  (groups || []).forEach((group) => {
   const profile = String(group?.profile || '').trim();
   const styles = Array.isArray(group?.styles) ? group.styles : [];
   styles.forEach((styleCode) => {
    merged = this.upsertSeparationGroupInList(merged, profile, styleCode);
   });
  });
  return merged;
 }

 private buildSeparationsFromXmpGroups(): Separation[] {
  const fallbackList = this.mergeSeparationGroups([], this.xmpSeparationGroups);
  return fallbackList.map((item, index) => ({
   ...item,
   id: index + 1
  }));
 }

 loadSeparations(): void {
  const logPrefix = '[Separations] Profile generation:';
  if (this.isRunningInBrowser) {
   return;
  }

  if (!this.teamCode || this.teamCode === '') {
   console.log(logPrefix, 'Skipped – missing teamCode:', this.teamCode || '(empty)');
   this.separations = this.buildSeparationsFromXmpGroups();
   this.allTeamStyleCodes = [];
   if (this.separations.length > 0) {
    console.log(logPrefix, 'Fallback – using XMP separation groups only:', this.separations);
   }
   this.cdr.detectChanges();
   return;
  }

  console.log(logPrefix, 'Inputs – teamCode:', this.teamCode, '| versionDocumentPath:', this.versionDocumentPath);
  this.isLoadingSeparations = true;

  this.controller
   .getStyleCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined)
   .then((styleResult) => {
    if (!styleResult.success || !styleResult.styleCodes || styleResult.styleCodes.length === 0) {
     console.warn(logPrefix, 'Step 1 – Style codes: missing or failed. success:', styleResult?.success, '| count:', styleResult?.styleCodes?.length ?? 0, '| error:', styleResult?.error ?? 'none');
     this.separations = this.buildSeparationsFromXmpGroups();
     this.allTeamStyleCodes = [];
     if (this.separations.length > 0) {
      console.log(logPrefix, 'Fallback – rendering XMP separation groups because style codes are unavailable:', this.separations);
     }
     // Keep existing Styles.xlsx catalog for Add Separation search.
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
     return;
    }

    const styleCodes = styleResult.styleCodes;
    this.allTeamStyleCodes = [...styleCodes];
    console.log(logPrefix, 'Step 1 – Style codes from Excel:', styleCodes.length, 'codes:', styleCodes);

    return this.controller.getProfileNamesFromExcel(styleCodes).then((profileResult) => {
     if (!profileResult.success || !profileResult.profileMap) {
      console.warn(logPrefix, 'Step 2 – Profile names: missing or failed. success:', profileResult?.success, '| error:', profileResult?.error ?? 'none');
      this.separations = this.buildSeparationsFromXmpGroups();
      // Keep style search usable in Add Separation even when profile mapping fails.
      this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
       styleCode: String(styleCode || '').trim(),
       profileName: 'Unknown Profile'
      }));
      if (this.separations.length > 0) {
       console.log(logPrefix, 'Fallback – rendering XMP separation groups because profile mapping is unavailable:', this.separations);
      }
      this.isLoadingSeparations = false;
      this.cdr.detectChanges();
      return;
     }

     const profileMap = profileResult.profileMap;
     this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
      styleCode: String(styleCode || '').trim(),
      profileName: String(profileMap[styleCode] || 'Unknown Profile').trim()
     }));
     const styleCodesWithProfile: string[] = [];
     const styleCodesMissingProfile: string[] = [];
     styleCodes.forEach((sc: string) => {
      const name = profileMap[sc];
      if (name && name !== 'Unknown Profile') {
       styleCodesWithProfile.push(sc);
      } else {
       styleCodesMissingProfile.push(sc);
      }
     });
     console.log(logPrefix, 'Step 2 – Profile map from Styles.xlsx: found for', styleCodesWithProfile.length, 'style codes:', Object.fromEntries(styleCodesWithProfile.map((sc) => [sc, profileMap[sc]])));
     if (styleCodesMissingProfile.length > 0) {
      console.warn(logPrefix, 'Step 2 – Style codes with no profile (will show as "Unknown Profile"):', styleCodesMissingProfile);
     }

     const profileGroups: { [key: string]: string[] } = {};
     styleCodes.forEach((styleCode: string) => {
      const profileName = profileMap[styleCode] || 'Unknown Profile';
      if (!profileGroups[profileName]) {
       profileGroups[profileName] = [];
      }
      profileGroups[profileName].push(styleCode);
     });
     console.log(logPrefix, 'Step 3 – Profile groups (profile → style codes):', profileGroups);

     const separationsList = Object.keys(profileGroups).map((profileName, index) => ({
      id: index + 1,
      profile: profileName,
      styles: profileGroups[profileName].sort(),
      colors: [],
      sepFileName: '',
      isCreated: false
     }));

     console.log(logPrefix, 'Step 4 – Generated separations:', separationsList.length, 'profiles:', separationsList.map((s) => ({ id: s.id, profile: s.profile, styles: s.styles })));
     this.separations = this.mergeSeparationGroups(separationsList, this.xmpSeparationGroups);
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
    });
   })
   .catch((err) => {
    console.error(logPrefix, 'Error loading separations:', err);
    this.separations = this.buildSeparationsFromXmpGroups();
    this.allTeamStyleCodes = [];
    if (this.separations.length > 0) {
     console.log(logPrefix, 'Fallback – rendering XMP separation groups after error:', this.separations);
    }
    // Keep existing Styles.xlsx catalog for Add Separation search.
    this.isLoadingSeparations = false;
    this.cdr.detectChanges();
   });
 }

 getGraphicColors(graphicName: string): string[] {
  if (!graphicName || this.graphicsData.length === 0) {
   return [];
  }
  const graphic = this.graphicsData.find((g: any) => g.name === graphicName);
  if (graphic && graphic.colors !== undefined) {
   if (graphic.colors === null) {
    return this.availableColors;
   }
   if (graphic.colors.length === 0) {
    return [];
   }
   return graphic.colors;
  }
  return [];
 }

 handleGenerateSeparations(separationId: number, graphicName: string): void {
  if (!graphicName) {
   return;
  }

  const separation = this.separations.find((s) => s.id === separationId);
  if (!separation) {
   return;
  }

  const styleCodes = separation.styles || [];
  const profileName = separation.profile || '';
  const graphicColors = this.getGraphicColors(graphicName);

  const getProfileCodeAndCreateSeparation = async () => {
   let profileCode = null;
   let profileInfo: any = null;

   if (profileName && !this.isRunningInBrowser) {
    try {
     const result = await this.controller.getProfileCodeFromName(profileName);

     if (result && result.success && result.profileCode) {
      profileCode = result.profileCode;
     } else {
     }
    } catch (err) { }

    try {
     const profileLookupKey = profileCode || profileName;
     if (profileLookupKey) {
      const profileInfoResult = await this.controller.getProfileInformation(profileLookupKey);
      console.log('[SEPARATIONS][UB_DEBUG] getProfileInformation result for', profileLookupKey, ':', profileInfoResult);
      if (profileInfoResult && profileInfoResult.success && profileInfoResult.profileInfo) {
       profileInfo = profileInfoResult.profileInfo;
      }
     }
    } catch (profileInfoErr) { }
   }

   let artistName = '';
   let artistInitials = '';
   let sepsTemplateFileName = '';
   if (!this.isRunningInBrowser) {
    try {
     const gs = await this.controller.loadGeneralSettings();
     if (gs?.success && gs?.data) {
      artistName = gs.data.artistName != null ? String(gs.data.artistName) : '';
      artistInitials = gs.data.artistInitials != null ? String(gs.data.artistInitials) : '';
      sepsTemplateFileName =
       gs.data.sepsTemplateFileName != null ? String(gs.data.sepsTemplateFileName).trim() : '';
     }
    } catch (err) { }
   }

   const graphicData = this.graphicsData.find((g: any) => g && g.name === graphicName);
   const position = (graphicData && graphicData.position && String(graphicData.position).trim())
    ? String(graphicData.position).trim()
    : '';

   // Resolve body color from first color code via COLOR_CODE_LOOKUP.xlsx (same folder as Styles.xlsx)
   let bodyColorData: any = null;
   const firstColorCode = Array.isArray(graphicColors) && graphicColors.length > 0 ? graphicColors[0] : null;
   if (firstColorCode && !this.isRunningInBrowser && this.controller.getColorByCodeFromLookup) {
    try {
     const lookupResult = await this.controller.getColorByCodeFromLookup(firstColorCode);
     if (lookupResult?.success && lookupResult.color) {
      bodyColorData = {
       bodyColor: lookupResult.color.hex,
       colorName: lookupResult.color.colorName,
       cmyk: lookupResult.color.cmyk,
       rgb: lookupResult.color.rgb
      };
      console.log('[SEPARATIONS] Body color from COLOR_CODE_LOOKUP.xlsx:', bodyColorData.colorName, bodyColorData.bodyColor);
     } else {
      console.warn('[SEPARATIONS] Color lookup failed for code:', firstColorCode, lookupResult?.error);
     }
    } catch (lookupErr) {
     console.warn('[SEPARATIONS] Color lookup error for code:', firstColorCode, lookupErr);
    }
   }

   const profileMetadata: any = {
    profileName: profileName,
    profileCode: profileCode,
    styleCodes: styleCodes,
    colorCodes: graphicColors,
    graphicName: graphicName,
    createdDate: new Date().toISOString(),
    artistName: artistName,
    artistInitials: artistInitials,
    position: position
   };
   if (profileInfo && profileInfo.found) {
    const toEnabled = (value: any) => {
     if (value === true || value === 1) return true;
     if (typeof value === 'string') {
      const normalized = value.trim().toUpperCase();
      return normalized === 'Y' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1';
     }
     return false;
    };
    profileMetadata.underbaseEnabled = [
     true,
     !!profileInfo.underbase2Enabled,
     !!profileInfo.underbase3Enabled,
     !!profileInfo.underbase4Enabled
    ];
    profileMetadata.underbaseMeshes = [
     profileInfo.ub1Mesh != null ? String(profileInfo.ub1Mesh) : '',
     profileInfo.ub2Mesh != null ? String(profileInfo.ub2Mesh) : '',
     profileInfo.ub3Mesh != null ? String(profileInfo.ub3Mesh) : '',
     profileInfo.ub4Mesh != null ? String(profileInfo.ub4Mesh) : ''
    ];
    profileMetadata.underbaseKnockoutBlack = Array.isArray(profileInfo.underbaseKnockoutBlack)
     ? [
      !!profileInfo.underbaseKnockoutBlack[0],
      !!profileInfo.underbaseKnockoutBlack[1],
      !!profileInfo.underbaseKnockoutBlack[2],
      !!profileInfo.underbaseKnockoutBlack[3]
     ]
     : [false, false, false, false];
    const defaultUbSwatches = ['White UB', 'White UB', 'White UB', 'White UB'];
    const srcUbSwatches = (profileInfo as any).underbaseKnockoutSwatches;
    profileMetadata.underbaseKnockoutSwatches = Array.isArray(srcUbSwatches)
     ? [0, 1, 2, 3].map((j) =>
      srcUbSwatches[j] != null && String(srcUbSwatches[j]).trim() !== ''
       ? String(srcUbSwatches[j]).trim()
       : defaultUbSwatches[j]
     )
     : [...defaultUbSwatches];
    profileMetadata.blackInksKnockoutDisplay =
     profileInfo.blackInksKnockoutDisplay != null
      ? String(profileInfo.blackInksKnockoutDisplay)
      : '';
    profileMetadata.underbaseSwatch =
     (profileInfo as any).underbaseSwatch != null && String((profileInfo as any).underbaseSwatch).trim() !== ''
      ? String((profileInfo as any).underbaseSwatch).trim()
      : ((profileInfo as any)['Underbase Swatch'] != null && String((profileInfo as any)['Underbase Swatch']).trim() !== ''
       ? String((profileInfo as any)['Underbase Swatch']).trim()
       : 'White UB');
    profileMetadata.blocker = toEnabled((profileInfo as any).blocker);
    profileMetadata.blockerMesh =
     (profileInfo as any).blockerMesh != null
      ? String((profileInfo as any).blockerMesh)
      : (
       (profileInfo as any)['Blocker Mesh'] != null
        ? String((profileInfo as any)['Blocker Mesh'])
        : ''
      );
    profileMetadata.formatInkNameLabel = !!(profileInfo as any).formatInkNameLabel;
    profileMetadata.colorNameLabelFormat =
     (profileInfo as any).colorNameLabelFormat != null && String((profileInfo as any).colorNameLabelFormat).trim() !== ''
      ? String((profileInfo as any).colorNameLabelFormat)
      : 'PANTONE XXX C';
    console.log('[SEPARATIONS][UB_DEBUG] profileMetadata underbase flags/meshes:', {
     profileName,
     profileCode,
     underbaseEnabled: profileMetadata.underbaseEnabled,
     underbaseMeshes: profileMetadata.underbaseMeshes,
     underbaseKnockoutBlack: profileMetadata.underbaseKnockoutBlack,
     underbaseKnockoutSwatches: profileMetadata.underbaseKnockoutSwatches,
     underbaseSwatch: profileMetadata.underbaseSwatch,
     blackInksKnockoutDisplay: profileMetadata.blackInksKnockoutDisplay
    });
   } else {
    console.warn('[SEPARATIONS][UB_DEBUG] No profileInfo found; underbaseEnabled not set on metadata', {
     profileName,
     profileCode
    });
   }
   if (bodyColorData) {
    profileMetadata.bodyColorData = bodyColorData;
   }

   console.log('[SEPARATIONS][UB_DEBUG] performSeparation payload profileMetadata:', profileMetadata);
   return this.controller.performSeparation(graphicName, styleCodes, profileMetadata, {
    sepsTemplateFileName
   });
  };

  getProfileCodeAndCreateSeparation()
   .then((result) => {
    if (result.success) {
     setTimeout(() => {
      this.loadSeparationPaths();
     }, 1000);

     setTimeout(() => {
      this.loadSeparationPaths();
     }, 1000);

     setTimeout(() => {
      this.loadSeparationPaths();
     }, 2500);

     setTimeout(() => {
      this.loadSeparationPaths();
     }, 4000);

     const tabNavigation = (window as any).__LEAP_TAB_NAVIGATION__;
     if (tabNavigation && typeof tabNavigation.navigateToTab === 'function') {
      tabNavigation.navigateToTab(2);

      setTimeout(() => {
       if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
        (window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
       }
      }, 500);
     }
    } else {
    }
   })
   .catch((err) => { });
 }

 handleOpenSeparation(filePath: string): void {
  this.controller
   .openSeparationDocument(filePath)
   .then((result) => {
    if (result.success) {
     setTimeout(() => {
      const tabNavigation = (window as any).__LEAP_TAB_NAVIGATION__;
      if (tabNavigation && typeof tabNavigation.navigateToTab === 'function') {
       tabNavigation.navigateToTab(2);

       setTimeout(() => {
        if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
         (window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
        }
       }, 500);
      }
     }, 500);
    } else {
    }
   })
   .catch((err) => { });
 }

 handleSeparationMenuClick(item: string, separationId: number, graphicName: string): void {
  if (this.isRunningInBrowser) {
   return;
  }
  const separation = this.separations.find((s) => s.id === separationId);
  if (!separation) {
   return;
  }

  if (item === 'Delete Separation File') {
   const filePath = this.getSeparationPath(separation, graphicName);
   if (!filePath) {
    return;
   }
   this.deleteSeparationFileContext = {
    graphicName,
    separationId,
    profileName: separation.profile,
    filePath
   };
   this.showDeleteSeparationFileConfirm = true;
   this.cdr.detectChanges();
   return;
  }

  if (item === 'Duplicate') {
   this.openSeparationActionDialog('duplicate', graphicName, separation, false);
   return;
  }

  if (item === 'Edit') {
   this.openSeparationActionDialog('edit-new', graphicName, separation, false);
  }
 }

 async handleAddSeparation(graphicName: string): Promise<void> {
  if (!graphicName) {
   return;
  }
  await this.ensureStyleCatalogOptionsLoaded();
  this.addSeparationDialogGraphicName = graphicName;
  this.addSeparationDialogOpen = true;
  console.log('[Separations] Opening Add Separation dialog', {
   styleCatalogOptionsCount: this.styleCatalogOptions.length,
   teamCode: this.teamCode,
   versionDocumentPath: this.versionDocumentPath || '(none)'
  });
  this.cdr.detectChanges();
 }

 cancelAddSeparationDialog(): void {
  this.addSeparationDialogOpen = false;
  this.addSeparationDialogGraphicName = '';
  this.cdr.detectChanges();
 }

 async confirmAddSeparationDialog(result: AddSeparationDialogResult): Promise<void> {
  console.log('[Separations] confirmAddSeparationDialog invoked', {
   graphicName: this.addSeparationDialogGraphicName,
   result
  });
  const profileName = String(result?.profileName || '').trim();
  const styleCodes = Array.isArray(result?.styleCodes)
   ? result.styleCodes.map((s) => String(s || '').trim()).filter(Boolean)
   : [];
  if (!profileName || styleCodes.length === 0) {
   console.warn('[Separations] confirmAddSeparationDialog aborted - invalid payload', {
    profileName,
    styleCodes
   });
   this.cancelAddSeparationDialog();
   return;
  }

  const upsertMany = (codes: string[]) => {
   let next = [...this.separations];
   codes.forEach((styleCode) => {
    next = this.upsertSeparationGroupInList(next, profileName, styleCode);
   });
   this.separations = next;
  };

  if (this.isRunningInBrowser) {
   console.log('[Separations] Browser mode add separation - applying UI only', {
    profileName,
    styleCodes
   });
   upsertMany(styleCodes);
   this.cancelAddSeparationDialog();
   return;
  }

  if (!this.controller.addSeparationProfileDataEntry) {
   console.warn('[Separations] addSeparationProfileDataEntry is not available');
   this.cancelAddSeparationDialog();
   return;
  }

  this.isLoadingAddSeparationDialog = true;
  this.cdr.detectChanges();
  try {
   let profileCode: string | null = null;
   try {
    const codeRes = await this.controller.getProfileCodeFromName(profileName);
    if (codeRes?.success && codeRes.profileCode) {
     profileCode = String(codeRes.profileCode);
    }
   } catch (_) {
    profileCode = null;
   }

   const saveResult = await this.controller.addSeparationProfileDataEntry({
    graphicName: this.addSeparationDialogGraphicName,
    profileName,
    styleCodes,
    profileCode
   });
   console.log('[Separations] addSeparationProfileDataEntry response', saveResult);
   if (saveResult?.success) {
    upsertMany(styleCodes);
    // Refresh XMP-derived groups to ensure reopen consistency.
    await this.loadSeparationPaths(true);
    console.log('[Separations] Add separation completed successfully', {
     profileName,
     styleCodes
    });
   } else {
    console.warn('[Separations] Failed to add separation profile entry:', saveResult?.error);
   }
  } catch (err) {
   console.error('[Separations] Error adding separation profile entry:', err);
  } finally {
   this.isLoadingAddSeparationDialog = false;
   this.cancelAddSeparationDialog();
  }
 }

 private openSeparationActionDialog(
  mode: 'duplicate' | 'edit-new',
  graphicName: string,
  separation: Separation,
  isNew: boolean
 ): void {
  const profileOpts = isNew
   ? [...this.profileNamesFromSettings]
   : this.profileNamesFromSettings.indexOf(separation.profile) >= 0
    ? [...this.profileNamesFromSettings]
    : [...this.profileNamesFromSettings, separation.profile];

  this.separationActionDialogMode = mode;
  this.separationActionDialogIsNew = isNew;
  this.separationActionDialogContext = isNew
   ? { graphicName, separationId: -1, originalProfileName: '' }
   : {
    graphicName,
    separationId: separation.id,
    originalProfileName: separation.profile
   };
  this.separationActionDialogStyleCodes = isNew ? [...this.allTeamStyleCodes] : [...(separation.styles || [])];
  this.separationActionDialogInitialProfile =
   isNew && profileOpts.length > 0 ? profileOpts[0] : separation.profile || (profileOpts[0] || '');
  this.separationActionDialogInitialStyles = isNew ? [] : [...(separation.styles || [])];
  const path = isNew ? null : this.getSeparationPath(separation, graphicName);
  this.separationActionDialogHasFile = !!path;
  this.separationActionDialogInitialDuplicateAi = true;
  this.separationActionDialogInitialScaleEnabled = false;
  this.separationActionDialogInitialScalePercent = 100;
  this.separationActionDialogOpen = true;
  this.cdr.detectChanges();
 }

 cancelDeleteSeparationFile(): void {
  this.showDeleteSeparationFileConfirm = false;
  this.deleteSeparationFileContext = null;
  this.cdr.detectChanges();
 }

 confirmDeleteSeparationFile(): void {
  const ctx = this.deleteSeparationFileContext;
  this.showDeleteSeparationFileConfirm = false;
  this.deleteSeparationFileContext = null;
  this.cdr.detectChanges();
  if (!ctx || this.isRunningInBrowser) {
   return;
  }
  this.controller
   .deleteSeparationFile({
    graphicName: ctx.graphicName,
    profileName: ctx.profileName,
    filePath: ctx.filePath
   })
   .then((res) => {
    if (res?.success) {
     this.loadSeparationPaths();
    }
   })
   .catch(() => { });
 }

 cancelSeparationActionDialog(): void {
  this.separationActionDialogOpen = false;
  this.separationActionDialogContext = null;
  this.cdr.detectChanges();
 }

 async confirmSeparationActionDialog(result: SeparationProfileActionDialogResult): Promise<void> {
  const ctx = this.separationActionDialogContext;
  if (!ctx || this.isRunningInBrowser) {
   this.cancelSeparationActionDialog();
   return;
  }

  if (this.separationActionDialogIsNew) {
   const nextId =
    this.separations.length === 0 ? 1 : Math.max(...this.separations.map((s) => s.id)) + 1;
   this.separations = [
    ...this.separations,
    {
     id: nextId,
     profile: result.profileName,
     styles: [...result.styleCodes],
     colors: [],
     sepFileName: '',
     isCreated: false
    }
   ];
   this.separationActionDialogOpen = false;
   this.separationActionDialogContext = null;
   this.cdr.detectChanges();
   return;
  }

  const separation = this.separations.find((s) => s.id === ctx.separationId);
  if (!separation) {
   this.cancelSeparationActionDialog();
   return;
  }

  let profileCode: string | null | undefined = undefined;
  if (result.profileName !== ctx.originalProfileName) {
   try {
    const codeRes = await this.controller.getProfileCodeFromName(result.profileName);
    if (codeRes?.success && codeRes.profileCode) {
     profileCode = String(codeRes.profileCode);
    }
   } catch {
    profileCode = null;
   }
  }

  const patch: any = {
   graphicName: ctx.graphicName,
   matchProfileName: ctx.originalProfileName,
   profileName: result.profileName,
   styleCodes: result.styleCodes,
   duplicateAiFile: result.duplicateAiFile === true,
   scaleEnabled: result.scaleEnabled === true,
   scalePercent: result.scalePercent
  };
  if (profileCode != null) {
   patch.profileCode = profileCode;
  }

  this.controller
   .updateSeparationProfileDataEntry(patch)
   .then((res) => {
    if (res?.success) {
     separation.profile = result.profileName;
     separation.styles = [...result.styleCodes];
     this.separationActionDialogOpen = false;
     this.separationActionDialogContext = null;
     this.loadSeparationPaths();
    }
   })
   .catch(() => { });
 }

 checkAllGraphicFolders(): void {
  this.graphicOptions.forEach((graphic) => {
   this.checkGraphicFolderExists(graphic);
  });
 }

 private async ensureStyleCatalogOptionsLoaded(): Promise<void> {
  if (this.isRunningInBrowser) return;

  this.isLoadingAddSeparationDialog = true;
  this.cdr.detectChanges();
  try {
   // React parity: load style list directly from SETTINGS/LEAP_SEPS/Data/Styles.xlsx.
   const catalogResult = await this.controller.getStylesCatalogFromExcel();
   if (catalogResult?.success && Array.isArray(catalogResult.styles) && catalogResult.styles.length > 0) {
    this.styleCatalogOptions = catalogResult.styles.map((item: any) => ({
     styleCode: String(item?.styleCode || '').trim(),
     profileName: String(item?.profileName || 'Unknown Profile').trim(),
     styleDesc: String(item?.styleDesc || '').trim()
    })).filter((item: AddSeparationDialogStyleOption) => !!item.styleCode);
    console.log('[Separations] Add dialog style catalog loaded from Styles.xlsx', {
     styleCatalogOptionsCount: this.styleCatalogOptions.length
    });
    return;
   }
   console.warn('[Separations] Styles.xlsx catalog load failed', {
    success: !!catalogResult?.success,
    error: catalogResult?.error ?? 'none'
   });

   // Fallback: legacy team-code + batch-excel flow.
   if (!this.teamCode || this.teamCode === '') {
    this.styleCatalogOptions = [];
    console.warn('[Separations] Add dialog style catalog unavailable (no teamCode + empty Styles.xlsx catalog)');
    return;
   }
   const styleResult = await this.controller.getStyleCodesFromExcel(this.teamCode, this.versionDocumentPath || undefined);
   if (!styleResult?.success || !Array.isArray(styleResult?.styleCodes) || styleResult.styleCodes.length === 0) {
    this.styleCatalogOptions = [];
    console.warn('[Separations] Add dialog style catalog: no style codes (fallback flow)', {
     success: !!styleResult?.success,
     count: styleResult?.styleCodes?.length ?? 0,
     error: styleResult?.error ?? 'none'
    });
    return;
   }
   const styleCodes = styleResult.styleCodes.map((sc: any) => String(sc || '').trim()).filter(Boolean);
   const profileResult = await this.controller.getProfileNamesFromExcel(styleCodes);
   const profileMap = profileResult?.success && profileResult?.profileMap ? profileResult.profileMap : {};
   this.styleCatalogOptions = styleCodes.map((styleCode: string) => ({
    styleCode,
    profileName: String(profileMap[styleCode] || 'Unknown Profile').trim(),
    styleDesc: ''
   }));
   console.log('[Separations] Add dialog style catalog loaded from fallback flow', {
    styleCatalogOptionsCount: this.styleCatalogOptions.length
   });
  } catch (err) {
   this.styleCatalogOptions = [];
   console.error('[Separations] Add dialog style catalog load error:', err);
  } finally {
   this.isLoadingAddSeparationDialog = false;
   this.cdr.detectChanges();
  }
 }

 checkGraphicFolderExists(graphic: string): void {
  if (!graphic || graphic.trim() === '') {
   this.graphicFolderStatus[graphic] = false;
   this.graphicFileStatus[graphic] = false;
   return;
  }

  this.isCheckingFolderMap[graphic] = true;
  this.controller
   .checkGraphicFolderExists(graphic)
   .then((result) => {
    if (result.success) {
     this.graphicFolderStatus[graphic] = result.folderExists || false;
     this.graphicFileStatus[graphic] = result.graphicsFileExists || false;
    } else {
     this.graphicFolderStatus[graphic] = false;
     this.graphicFileStatus[graphic] = false;
    }
   })
   .catch((err) => {
    this.graphicFolderStatus[graphic] = false;
    this.graphicFileStatus[graphic] = false;
   })
   .finally(() => {
    this.isCheckingFolderMap[graphic] = false;
    this.cdr.detectChanges();
   });
 }

 isFolderChecking(graphic: string): boolean {
  return !!this.isCheckingFolderMap[graphic];
 }

 getGraphicFolderStatus(graphic: string): boolean {
  return !!this.graphicFolderStatus[graphic];
 }

 getGraphicFileStatus(graphic: string): boolean {
  return !!this.graphicFileStatus[graphic];
 }

 getFileNameFromPath(path: string): string {
  if (!path) return '';
  const parts = path.split(/[/\\]/);
  return parts[parts.length - 1] || path;
 }

 hasUnknownProfile(separation: Separation): boolean {
  return separation.profile === 'Unknown Profile';
 }

 getMissingStyleCodes(separation: Separation): string[] {
  if (this.hasUnknownProfile(separation)) {
   return separation.styles || [];
  }
  return [];
 }

 /** True when the separation's profile is not in Profiles.json (profile file missing or profile not added). */
 isProfileMissingInSettings(separation: Separation): boolean {
  if (!this.profileNamesLoaded || this.isRunningInBrowser) {
   return false;
  }
  const profileNameTrim = (separation.profile || '').trim();
  if (!profileNameTrim || profileNameTrim === 'Unknown Profile') {
   return false;
  }
  return !this.profileNamesFromSettings.some((n) => n === profileNameTrim);
 }

 openDocument(filePath: string): void {
  if (this.isRunningInBrowser) return;
  this.controller.openSeparationDocument(filePath);
 }

 handleDeleteAllPlates(): void {
  if (this.isRunningInBrowser) return;
  this.showDeleteAllConfirm = true;
  this.cdr.detectChanges();
 }

 cancelDeleteAllPlates(): void {
  this.showDeleteAllConfirm = false;
  this.cdr.detectChanges();
 }

 confirmDeleteAllPlates(): void {
  this.showDeleteAllConfirm = false;
  this.cdr.detectChanges();
  this.controller.deleteAllPlatesInSeparationDoc?.()
   ?.then((res) => {
    if (res?.success && (window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
     (window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
    }
   })
   ?.catch(() => { });
 }

 handleRecreateAllPlates(): void {
  if (this.isRunningInBrowser) return;
  const meta = this.separatedDocInfo?.profileMetaData;
  const graphicName = meta?.graphicName ? String(meta.graphicName).trim() : '';
  if (!graphicName) return;
  this.showRecreateAllConfirm = true;
  this.cdr.detectChanges();
 }

 cancelRecreateAllPlates(): void {
  this.showRecreateAllConfirm = false;
  this.cdr.detectChanges();
 }

 confirmRecreateAllPlates(ev?: void | Record<string, boolean>): void {
  this.showRecreateAllConfirm = false;
  this.cdr.detectChanges();
  const meta = this.separatedDocInfo?.profileMetaData;
  const graphicName = meta?.graphicName ? String(meta.graphicName).trim() : '';
  if (!graphicName) return;

  const evRec = ev && typeof ev === 'object' ? (ev as Record<string, boolean>) : null;
  const cleanup = evRec
   ? {
    deleteUnpaintedPaths: !!evRec['deleteUnpaintedPaths'],
    deleteLeftoverPaths: !!evRec['deleteLeftoverPaths']
   }
   : { deleteUnpaintedPaths: false, deleteLeftoverPaths: false };

  this.controller.deleteAllPlatesInSeparationDoc?.()
   ?.then((delRes) => {
    if (delRes && !delRes.success) return undefined;
    return this.controller.recreatePlatesInActiveDocument?.(graphicName, cleanup);
   })
   ?.then((recreateRes) => {
    if (recreateRes?.success) {
     if ((window as any).__LEAP_SEPARATION_COLORS_REFRESH__) {
      (window as any).__LEAP_SEPARATION_COLORS_REFRESH__();
     }
     if ((window as any).__LEAP_TAB_NAVIGATION__?.navigateToTab) {
      (window as any).__LEAP_TAB_NAVIGATION__.navigateToTab(2);
     }
    }
   })
   ?.catch(() => { });
 }

 getCurrentSepGraphicName(): string {
  const name = this.separatedDocInfo?.profileMetaData?.graphicName;
  return name && name.trim() ? name.trim() : '';
 }

 getCurrentSepArtistDisplay(): string {
  const meta = this.separatedDocInfo?.profileMetaData;
  if (!meta) return '';
  const name = meta.artistName && String(meta.artistName).trim() ? String(meta.artistName).trim() : '';
  const initials = meta.artistInitials && String(meta.artistInitials).trim() ? String(meta.artistInitials).trim() : '';
  return name || initials || '';
 }

 getCurrentSepGeneratedLine(): string {
  const meta = this.separatedDocInfo?.profileMetaData;
  if (!meta) return '';
  const created = meta.createdDate;
  if (!created) return '';
  try {
   const d = new Date(created);
   if (isNaN(d.getTime())) return '';
   const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/');
   const timeStr = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
   const by = meta.artistInitials && meta.artistInitials.trim() ? meta.artistInitials.trim() : '';
   return by ? `${dateStr} at ${timeStr} by ${by}` : `${dateStr} at ${timeStr}`;
  } catch {
   return '';
  }
 }

 getSeparationPath(separation: Separation, graphicName: string): string | null {
  if (!graphicName || !separation.profile) {
   return null;
  }
  const profileName = separation.profile || '';
  const compositeKey = `${graphicName}_${profileName}`;
  let separationPath = this.separationPaths[compositeKey] || null;

  if (!separationPath) {
   const graphicKeys = Object.keys(this.separationPaths);
   const matchingKey = graphicKeys.find((key) => {
    const keyLower = key.toLowerCase();
    const compositeLower = compositeKey.toLowerCase();
    return keyLower === compositeLower;
   });
   if (matchingKey) {
    separationPath = this.separationPaths[matchingKey];
   }
  }

  return separationPath;
 }

 toggleGraphic(graphic: string): void {
  if (this.expandedGraphics.has(graphic)) {
   this.expandedGraphics.delete(graphic);
  } else {
   this.expandedGraphics.add(graphic);
  }
 }

 isGraphicExpanded(graphic: string): boolean {
  return this.expandedGraphics.has(graphic);
 }
}
