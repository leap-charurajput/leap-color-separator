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
    await Promise.all([
     this.loadGraphicsList(),
     this.loadTeamCode(),
     this.loadGraphicsData(),
     this.loadSeparationPaths()
    ]);
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
     await Promise.all([
      this.loadProfileNamesFromSettings(),
      this.loadGraphicsList(),
      this.loadTeamCode(),
      this.loadGraphicsData(),
      this.loadSeparationPaths()
     ]);
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

 async loadSeparationPaths(): Promise<void> {
  try {
   const result = await this.controller.loadSeparationPaths();
   if (!result) {
    this.separationPaths = {};
    return;
   }

   if (result.success && result.separationPaths) {
    this.separationPaths = result.separationPaths;
   } else {
    this.separationPaths = {};
   }
  } catch (err) {
   console.error('[Separations] loadSeparationPaths error:', err);
   this.separationPaths = {};
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

 loadSeparations(): void {
  const logPrefix = '[Separations] Profile generation:';
  if (this.isRunningInBrowser) {
   return;
  }

  if (!this.teamCode || this.teamCode === '') {
   console.log(logPrefix, 'Skipped – missing teamCode:', this.teamCode || '(empty)');
   this.separations = [];
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
     this.separations = [];
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
     return;
    }

    const styleCodes = styleResult.styleCodes;
    console.log(logPrefix, 'Step 1 – Style codes from Excel:', styleCodes.length, 'codes:', styleCodes);

    return this.controller.getProfileNamesFromExcel(styleCodes).then((profileResult) => {
     if (!profileResult.success || !profileResult.profileMap) {
      console.warn(logPrefix, 'Step 2 – Profile names: missing or failed. success:', profileResult?.success, '| error:', profileResult?.error ?? 'none');
      this.separations = [];
      this.isLoadingSeparations = false;
      this.cdr.detectChanges();
      return;
     }

     const profileMap = profileResult.profileMap;
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
     this.separations = separationsList;
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
    });
   })
   .catch((err) => {
    console.error(logPrefix, 'Error loading separations:', err);
    this.separations = [];
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

   if (profileName && !this.isRunningInBrowser) {
    try {
     const result = await this.controller.getProfileCodeFromName(profileName);

     if (result && result.success && result.profileCode) {
      profileCode = result.profileCode;
     } else {
     }
    } catch (err) { }
   }

   let artistName = '';
   let artistInitials = '';
   if (!this.isRunningInBrowser) {
    try {
     const gs = await this.controller.loadGeneralSettings();
     if (gs?.success && gs?.data) {
      artistName = gs.data.artistName != null ? String(gs.data.artistName) : '';
      artistInitials = gs.data.artistInitials != null ? String(gs.data.artistInitials) : '';
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
   if (bodyColorData) {
    profileMetadata.bodyColorData = bodyColorData;
   }

   return this.controller.performSeparation(graphicName, styleCodes, profileMetadata);
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

 handleSeparationMenuClick(item: string, separationId: number): void {
  if (item === 'Duplicate') {
   const separation = this.separations.find((s) => s.id === separationId);
   if (separation) {
    const newSeparation = {
     ...separation,
     id: Math.max(...this.separations.map((s) => s.id)) + 1,
     sepFileName: '',
     isCreated: false
    };
    this.separations = [...this.separations, newSeparation];
    this.cdr.detectChanges();
   }
  } else if (item === 'Edit') {
  }
 }

 checkAllGraphicFolders(): void {
  this.graphicOptions.forEach((graphic) => {
   this.checkGraphicFolderExists(graphic);
  });
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
  this.controller.deleteAllPlatesInSeparationDoc?.()
   ?.then((delRes) => {
    if (delRes && !delRes.success) return undefined;
    return this.controller.recreatePlatesInActiveDocument?.(graphicName);
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
