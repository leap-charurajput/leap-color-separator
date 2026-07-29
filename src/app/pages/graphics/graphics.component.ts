import {
 AfterViewInit,
 ChangeDetectorRef,
 Component,
 Input,
 OnChanges,
 OnDestroy,
 OnInit,
 SimpleChanges
} from '@angular/core';
import { ControllerService } from '../../services/controller.service';
import { GraphicsDataService } from '../../services/graphics-data.service';
import { CreateGraphicModalResult } from '../../components/create-graphic-modal/create-graphic-modal.component';

interface Graphic {
 id: string;
 name: string;
 position: string;
 samePlates: string;
 colors: string[] | null;
 distress: boolean;
 underbase234Swatch?: string;
}

interface ModalState {
 isOpen: boolean;
 graphicId: string | null;
 graphicName: string;
 availableColors: string[];
 selectedColors: string[];
 isLoadingColors: boolean;
}

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
 selector: 'app-graphics',
 templateUrl: './graphics.component.html',
 styleUrls: ['./graphics.component.css']
})
export class GraphicsComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
 @Input() documentRefreshKey = 0;

 graphics: Graphic[] = [
  { id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false }
 ];
 graphicNames: string[] = [];
 isLoadingGraphics = false;
 private _teamCode = '';
 modalState: ModalState = {
  isOpen: false,
  graphicId: null,
  graphicName: '',
  availableColors: [],
  selectedColors: [],
  isLoadingColors: false
 };
 availableColors: string[] = [];
 positionOptions: string[] = [];

 // --- Per-graphic Underbase 2–4 swatch (UB1 lives in profile settings) ---
 underbaseSwatchOptionsByGraphic: { [graphicName: string]: string[] } = {};
 requiredUnderbasePassCount = 2;

 isSaving = false;
 hasVersionDocument = false;
 isCheckingDocument = false;
 isSeparatedDoc = false;
 separatedDocInfo: {
  teamVersionName?: string;
  teamVersionPath?: string;
  leapTemplateName?: string;
  leapTemplatePath?: string;
 } = {};
 samePlatesOptions: string[] = [];

 hasSelection = false;
 hasActiveDocument = false;
 createGraphicModalOpen = false;
 isCreatingGraphic = false;
 createGraphicWarning = '';

 private isMounted = true;
 private teamCodeCheckInterval: any;
 private selectionPollInterval: any;

 get teamCode(): string {
  return this._teamCode;
 }

 set teamCode(value: string) {
  if (this._teamCode !== value) {
   this._teamCode = value;
   if (value && value !== '') {
    this.loadAvailableColors();
   }
  }
 }

 isRunningInBrowser = false;

 constructor(
  private controller: ControllerService,
  private cdr: ChangeDetectorRef,
  private graphicsDataService: GraphicsDataService
 ) {
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  this.startSelectionPolling();
  this.checkVersionDocument().then(() => {
   if (this.hasVersionDocument) {
    this.loadGraphicsList();
    this.loadTeamCode();
    this.loadPositionOptions();
    this.loadUnderbaseSwatchOptionsForAllGraphics();
   } else if (this.hasActiveDocument) {
    this.loadPositionOptions();
   }
  });
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['documentRefreshKey']) {
   setTimeout(() => {
    this.checkVersionDocument().then(() => {
     if (this.hasVersionDocument) {
      this.loadGraphicsList();
      this.loadTeamCode();
      this.loadPositionOptions();
      this.loadUnderbaseSwatchOptionsForAllGraphics();
     } else if (this.hasActiveDocument) {
      this.loadPositionOptions();
     }
    });
   }, 200);
  }
 }

 private startSelectionPolling(): void {
  if (this.isRunningInBrowser) return;
  this.refreshSelectionState();
  this.selectionPollInterval = setInterval(() => {
   if (this.isMounted) {
    this.refreshSelectionState();
   }
  }, 700);
 }

 private refreshSelectionState(): void {
  Promise.all([
   this.controller.getSelectionCount().catch(() => 0),
   this.controller.hasActiveIllustratorDocument().catch(() => false)
  ]).then(([count, hasDoc]) => {
   if (!this.isMounted) return;
   this.hasSelection = count > 0;
   this.hasActiveDocument = hasDoc;
   this.cdr.detectChanges();
  });
 }

 /**
  * Build per-graphic option lists for Underbase 2–4 from each graphic's own art whites.
  */
 loadUnderbaseSwatchOptionsForAllGraphics(): void {
  const individualGraphics = this.graphics.filter((g) => g.id !== 'all');
  if (individualGraphics.length === 0) {
   this.underbaseSwatchOptionsByGraphic = {};
   this.cdr.detectChanges();
   return;
  }

  Promise.all([
   ...individualGraphics.map((g) =>
    this.controller
     .getGraphicsArtWhiteSwatches(g.name)
     .catch(() => ({ success: false, swatches: [] as string[] }))
   ),
   this.controller.loadGraphicsData().catch(() => ({} as any)),
   this.controller.getSeparationProfiles().catch(() => ({ profiles: [] }))
  ])
   .then((results) => {
    const loaded = results[results.length - 2] as any;
    const profilesResult = results[results.length - 1] as any;
    const swatchResults = results.slice(0, individualGraphics.length) as Array<{
     success: boolean;
     swatches: string[];
    }>;

    const graphicsDataMap: { [key: string]: any } = {};
    if (loaded?.graphicsData && Array.isArray(loaded.graphicsData)) {
     loaded.graphicsData.forEach((entry: any) => {
      if (entry?.name) {
       graphicsDataMap[entry.name] = entry;
      }
     });
    }
    const globalFallback =
     typeof loaded?.underbase2Swatch === 'string' ? loaded.underbase2Swatch.trim() : '';

    const profiles = profilesResult?.profiles || profilesResult?.data || profilesResult || [];
    this.requiredUnderbasePassCount = Math.max(2, this.computeMaxUnderbasePassFromProfiles(profiles));

    const optionsByGraphic: { [graphicName: string]: string[] } = {};
    individualGraphics.forEach((graphic, index) => {
     const artWhites = (swatchResults[index]?.success && Array.isArray(swatchResults[index].swatches)
      ? swatchResults[index].swatches
      : []
     )
      .map((n) => String(n || '').trim())
      .filter((n) => n.length > 0);

     const options = artWhites.length > 0 ? artWhites : ['White UB'];
     optionsByGraphic[graphic.name] = options;

     const savedData = graphicsDataMap[graphic.name];
     const savedSwatch =
      savedData?.underbase234Swatch ||
      savedData?.underbase2Swatch ||
      globalFallback;
     const defaultWhite = artWhites[0] || 'White UB';
     graphic.underbase234Swatch = this.pickSavedUnderbaseSwatch(
      savedSwatch,
      options,
      defaultWhite
     );
    });

    this.underbaseSwatchOptionsByGraphic = optionsByGraphic;
    this.graphics = this.graphics.map((g) => {
     if (g.id === 'all') {
      return g;
     }
     const individual = individualGraphics.find((ig) => ig.id === g.id);
     return individual ? { ...g, underbase234Swatch: individual.underbase234Swatch } : g;
    });
    this.cdr.detectChanges();
   })
   .catch(() => {
    this.underbaseSwatchOptionsByGraphic = {};
    this.requiredUnderbasePassCount = 2;
    this.cdr.detectChanges();
   });
 }

 getUnderbaseSwatchOptions(graphicName: string): string[] {
  return this.underbaseSwatchOptionsByGraphic[graphicName] || ['White UB'];
 }

 private toProfileFlagEnabled(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
   const normalized = value.trim().toUpperCase();
   return normalized === 'Y' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1';
  }
  return false;
 }

 private computeMaxUnderbasePassFromProfile(profile: any): number {
  if (!profile) return 1;
  let count = 1;
  if (this.toProfileFlagEnabled(profile['Underbase 4']) || this.toProfileFlagEnabled(profile['UB 4'])
   || this.toProfileFlagEnabled(profile.underbase4Enabled) || this.toProfileFlagEnabled(profile.ub4Enabled)
   || this.toProfileFlagEnabled(profile.underbase4)) {
   count = Math.max(count, 4);
  }
  if (this.toProfileFlagEnabled(profile['Underbase 3']) || this.toProfileFlagEnabled(profile['UB 3'])
   || this.toProfileFlagEnabled(profile.underbase3Enabled) || this.toProfileFlagEnabled(profile.ub3Enabled)
   || this.toProfileFlagEnabled(profile.underbase3)) {
   count = Math.max(count, 3);
  }
  if (this.toProfileFlagEnabled(profile['Underbase 2']) || this.toProfileFlagEnabled(profile['UB 2'])
   || this.toProfileFlagEnabled(profile.underbase2Enabled) || this.toProfileFlagEnabled(profile.ub2Enabled)
   || this.toProfileFlagEnabled(profile.underbase2)) {
   count = Math.max(count, 2);
  }
  const enabled = profile.underbaseEnabled;
  if (Array.isArray(enabled) && enabled.length > 0) {
   let arrayCount = enabled[0] !== false ? 1 : 0;
   for (let i = 1; i < enabled.length && i < 4; i++) {
    if (enabled[i]) arrayCount = i + 1;
   }
   if (arrayCount < 1) arrayCount = 1;
   count = Math.max(count, arrayCount);
  }
  return count;
 }

 private computeMaxUnderbasePassFromProfiles(profiles: any[]): number {
  let max = 1;
  if (!Array.isArray(profiles)) return max;
  for (const profile of profiles) {
   max = Math.max(max, this.computeMaxUnderbasePassFromProfile(profile));
  }
  return max;
 }

 private pickSavedUnderbaseSwatch(saved: string | undefined, options: string[], fallback: string): string {
  const trimmed = typeof saved === 'string' ? saved.trim() : '';
  if (trimmed && options.indexOf(trimmed) !== -1) return trimmed;
  return fallback;
 }

 handleUnderbase234SwatchChange(graphicId: string, value: string): void {
  this.graphics = this.graphics.map((g) =>
   g.id === graphicId ? { ...g, underbase234Swatch: value } : g
  );
  this.saveToLocalStorage();
 }

 checkVersionDocument(): Promise<void> {
  if (!(window as any).__adobe_cep__ && !(window as any).leap) {
   this.hasVersionDocument = false;
   return Promise.resolve();
  }

  if (!(window as any).leap) {
   return this.waitForSession(10, 100)
    .then(() => {
     return this.performVersionDocumentCheck();
    })
    .catch(() => {
     this.hasVersionDocument = false;
     this.isCheckingDocument = false;
     this.cdr.detectChanges();
     return Promise.resolve();
    });
  }

  return this.performVersionDocumentCheck();
 }

 private performVersionDocumentCheck(): Promise<void> {
  this.isCheckingDocument = true;
  return this.controller
   .checkSeparatedDocument()
   .then((separatedResult) => {
    if (separatedResult.success && separatedResult.data?.isSeparatedDoc) {
     this.isSeparatedDoc = true;
     this.hasVersionDocument = false;
     this.separatedDocInfo = separatedResult.data || {};
     this.isCheckingDocument = false;
     this.cdr.detectChanges();
     return;
    }
    this.isSeparatedDoc = false;
    this.separatedDocInfo = {};
    return this.controller.getTemplateInfo();
   })
   .then((result) => {
    if (this.isSeparatedDoc) return;
    return this.controller.hasActiveIllustratorDocument().then((hasDoc) => {
     this.hasActiveDocument = hasDoc;
     if (result && result.success && result.hasDocument) {
      const isVersionFile = result.hasDocument && result.data && result.data.teamCode;
      this.hasVersionDocument = isVersionFile || false;
     } else {
      this.hasVersionDocument = false;
     }
     this.isCheckingDocument = false;
     this.cdr.detectChanges();
    });
   })
   .catch((err) => {
    if (err !== 'No leap') {
     this.hasVersionDocument = false;
     this.controller.hasActiveIllustratorDocument().then((hasDoc) => {
      this.hasActiveDocument = hasDoc;
      this.isCheckingDocument = false;
      this.cdr.detectChanges();
     });
    } else {
     this.isCheckingDocument = false;
     this.cdr.detectChanges();
     setTimeout(() => {
      if ((window as any).leap) {
       this.performVersionDocumentCheck();
      } else {
       this.hasVersionDocument = false;
       this.cdr.detectChanges();
      }
     }, 300);
    }
   });
 }

 private waitForSession(maxRetries: number, delayMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
   let retries = 0;
   const checkSession = () => {
    if ((window as any).leap) {
     resolve();
    } else if (retries < maxRetries) {
     retries++;
     setTimeout(checkSession, delayMs);
    } else {
     reject(new Error('Leap not available after retries'));
    }
   };
   checkSession();
  });
 }

 loadTeamCode(): void {
  this.controller
   .getTemplateInfo()
   .then((result) => {
    if (result.success && result.data && result.data.teamCode) {
     this.teamCode = result.data.teamCode;
    this.loadPositionOptions();
    } else {
    }
   })
   .catch((err) => {});
 }

 loadAvailableColors(): void {
  if (!this.teamCode || this.teamCode === '') {
   return;
  }

  this.controller
   .getColorCodesFromExcel(this.teamCode)
   .then((result) => {
    if (result.success && result.colors && Array.isArray(result.colors)) {
     this.availableColors = result.colors;
    } else {
     this.availableColors = [];
    }
   })
   .catch((err) => {
    this.availableColors = [];
   });
 }

 loadPositionOptions(): void {
  this.controller
   .getGraphicPositionOptionsFromJson()
   .then((result) => {
    let placements: string[] = [];

    if (result.success && Array.isArray(result.placements)) {
     placements = result.placements.filter((p: string) => p.trim().toLowerCase() !== 'choose');
    }

    this.positionOptions = placements.length > 0 ? placements : [...DEFAULT_GRAPHIC_POSITIONS];

    this.cdr.detectChanges();
    setTimeout(() => {
     this.autoSelectSinglePosition();
    }, 100);
   })
   .catch(() => {
    this.positionOptions = [...DEFAULT_GRAPHIC_POSITIONS];
    this.cdr.detectChanges();
   });
 }

 loadGraphicsDataFromXMP(): void {
  this.controller
   .loadGraphicsData()
   .then((result) => {
    if (
     result.success &&
     result.graphicsData &&
     Array.isArray(result.graphicsData) &&
     result.graphicsData.length > 0
    ) {
     const graphicsDataMap: { [key: string]: any } = {};
     result.graphicsData.forEach((graphicData: any) => {
      graphicsDataMap[graphicData.name] = graphicData;
     });

     this.graphics = this.graphics.map((g) => {
      if (g.id === 'all') {
       return g;
      }
      const savedData = graphicsDataMap[g.name];
      if (savedData) {
       let colorsValue = savedData.colors;
       if (colorsValue === null || colorsValue === undefined) {
        colorsValue = null;
       } else if (Array.isArray(colorsValue)) {
        if (
         this.availableColors.length > 0 &&
         colorsValue.length === this.availableColors.length &&
         colorsValue.every((color) => this.availableColors.includes(color))
        ) {
         colorsValue = null;
        }
       } else {
        colorsValue = [];
       }

       return {
        ...g,
        position: savedData.position || '',
        samePlates: savedData.samePlates || '',
        colors: colorsValue,
        distress: savedData.distress !== undefined ? savedData.distress : false,
        underbase234Swatch:
         savedData.underbase234Swatch ||
         savedData.underbase2Swatch ||
         g.underbase234Swatch ||
         'White UB'
       };
      }
      return g;
     });
     this.saveToLocalStorage();
     this.cdr.detectChanges();
     setTimeout(() => {
      this.autoSelectSinglePosition();
     }, 100);
    }
   })
   .catch((err) => {});
 }

 loadGraphicsList(): void {
  this.isLoadingGraphics = true;

  this.controller
   .getGraphicsList()
   .then((result) => {
    if (result.success && result.graphics && Array.isArray(result.graphics)) {
     this.graphicNames = result.graphics;
     this.graphics = [
      {
       id: 'all',
       name: 'All graphics',
       position: '',
       samePlates: '',
       colors: null,
       distress: false
      },
      ...result.graphics.map((name: string, index: number) => ({
       id: `graphic-${index}`,
       name: name,
       position: '',
       samePlates: '',
       colors: null,
       distress: false
      }))
     ];
     this.samePlatesOptions = [...this.graphicNames, 'None'];
     this.loadTeamCode();
     setTimeout(() => {
      this.loadGraphicsDataFromXMP();
     }, 100);
    } else {
     this.graphicNames = [];
     this.graphics = [
      {
       id: 'all',
       name: 'All graphics',
       position: '',
       samePlates: '',
       colors: null,
       distress: false
      }
     ];
     this.samePlatesOptions = ['None'];
    }
   })
   .catch((err) => {
    this.graphicNames = [];
    this.graphics = [
     {
      id: 'all',
      name: 'All graphics',
      position: '',
      samePlates: '',
      colors: null,
      distress: false
     }
    ];
    this.samePlatesOptions = ['None'];
   })
   .finally(() => {
    this.isLoadingGraphics = false;
    this.loadUnderbaseSwatchOptionsForAllGraphics();
    this.cdr.detectChanges();
   });
 }

 ngOnDestroy(): void {
  this.isMounted = false;
  if (this.teamCodeCheckInterval) {
   clearInterval(this.teamCodeCheckInterval);
  }
  if (this.selectionPollInterval) {
   clearInterval(this.selectionPollInterval);
  }
 }

 ngAfterViewInit(): void {
  setTimeout(() => {
   this.autoSelectSinglePosition();
  }, 300);
 }

 autoSelectSinglePosition(): void {
  if (this.positionOptions.length > 0 && this.graphics.length > 0 && !this.isLoadingGraphics) {
   if (this.positionOptions.length === 1) {
    setTimeout(() => {
     const singlePosition = this.positionOptions[0];
     const needsUpdate = this.graphics.some((g) => g.position !== singlePosition);
     if (needsUpdate) {
      this.graphics = this.graphics.map((g) => ({
       ...g,
       position: singlePosition
      }));
      this.saveToLocalStorage();
      this.cdr.detectChanges();
     }
    }, 200);
   }
  }
 }

 closeLinkColorsModal(): void {
  this.modalState = {
   isOpen: false,
   graphicId: null,
   graphicName: '',
   availableColors: [],
   selectedColors: [],
   isLoadingColors: false
  };
  this.cdr.detectChanges();
 }

 handleColorsClick(graphicId: string, graphicName: string): void {
  console.log(
   '[Link colors modal] Opening — checkboxes list will load via ControllerService.getColorCodesFromExcel(teamCode) → window.leap (leap-src-index: BATCH .xlsx first, else AI/JSON batch_excel_records)',
   { graphicId, graphicName, teamCode: this.teamCode }
  );

  this.modalState = {
   isOpen: true,
   graphicId,
   graphicName,
   availableColors: [],
   selectedColors: [],
   isLoadingColors: true
  };
  this.cdr.detectChanges(); // Ensure graphic name displays immediately

  this.controller
   .getColorCodesFromExcel(this.teamCode)
   .then((result) => {
    if (result.success && result.colors && Array.isArray(result.colors)) {
     const graphic = this.graphics.find((g) => g.id === graphicId);
     let selectedColors: string[] = [];
     if (graphic?.colors === null) {
      selectedColors = result.colors;
     } else if (graphic?.colors && graphic.colors.length > 0) {
      selectedColors = graphic.colors;
     }

     console.log(
      '[Link colors modal] Checkbox rows (@Input availableColors) — count:',
      result.colors.length,
      '| codes:',
      result.colors,
      '| pre-selected (selectedColors):',
      selectedColors
     );

     this.modalState = {
      isOpen: true,
      graphicId,
      graphicName,
      availableColors: result.colors,
      selectedColors,
      isLoadingColors: false
     };
    } else {
     console.warn('[Link colors modal] No colors for checkboxes — getColorCodesFromExcel failed or empty', {
      success: result?.success,
      error: result?.error,
      colors: result?.colors
     });
     this.modalState = {
      isOpen: true,
      graphicId,
      graphicName,
      availableColors: [],
      selectedColors: [],
      isLoadingColors: false
     };
    }
    this.cdr.detectChanges();
   })
   .catch((err) => {
    console.warn('[Link colors modal] getColorCodesFromExcel threw — no checkboxes', err);
    this.modalState = {
     isOpen: true,
     graphicId,
     graphicName,
     availableColors: [],
     selectedColors: [],
     isLoadingColors: false
    };
    this.cdr.detectChanges();
   });
 }

 handleColorsSave(graphicId: string, selectedColors: string[]): void {
  const modalAvailableColors = this.modalState.availableColors || [];
  let colorsToSave: string[] | null;
  if (selectedColors.length === 0) {
   colorsToSave = [];
  } else if (selectedColors.length === modalAvailableColors.length) {
   colorsToSave = null;
  } else {
   colorsToSave = selectedColors;
  }

  if (graphicId === 'all') {
   this.graphics = this.graphics.map((g) => ({ ...g, colors: colorsToSave }));
  } else {
   this.graphics = this.graphics.map((g) =>
    g.id === graphicId ? { ...g, colors: colorsToSave } : g
   );
  }

  this.closeLinkColorsModal();
  this.saveToLocalStorage();
 }

 getColorsDisplayData(graphic: Graphic): {
  isAll: boolean;
  count: number | null;
  colorsText: string | null;
 } {
  if (graphic.colors === null) {
   return { isAll: true, count: null, colorsText: null };
  }
  if (!graphic.colors || graphic.colors.length === 0) {
   return { isAll: false, count: 0, colorsText: null };
  }
  const selectedCount = graphic.colors.length;
  const colorsText = graphic.colors.join(', ');
  return { isAll: false, count: selectedCount, colorsText };
 }

 handlePositionChange(graphicId: string, position: string): void {
  console.log('position changes: ', { graphicId, position });

  if (graphicId === 'all') {
   this.graphics = this.graphics.map((g) => ({ ...g, position }));
  } else {
   this.graphics = this.graphics.map((g) => (g.id === graphicId ? { ...g, position } : g));
  }
  this.saveToLocalStorage();
  this.cdr.detectChanges();
 }

 handleSamePlatesChange(graphicId: string, samePlates: string): void {
  this.graphics = this.graphics.map((g) => (g.id === graphicId ? { ...g, samePlates } : g));
  this.saveToLocalStorage();
 }

 getAllGraphicsDistressState(): { checked: boolean; indeterminate: boolean } {
  const allGraphicsRow = this.graphics.find((g) => g.id === 'all');
  if (!allGraphicsRow) return { checked: false, indeterminate: false };

  const individualGraphics = this.graphics.filter((g) => g.id !== 'all');
  if (individualGraphics.length === 0) {
   return { checked: allGraphicsRow.distress, indeterminate: false };
  }

  const checkedCount = individualGraphics.filter((g) => g.distress).length;
  const uncheckedCount = individualGraphics.filter((g) => !g.distress).length;

  if (checkedCount === individualGraphics.length) {
   return { checked: true, indeterminate: false };
  }
  if (uncheckedCount === individualGraphics.length) {
   return { checked: false, indeterminate: false };
  }
  return { checked: false, indeterminate: true };
 }

 handleDistressChange(graphicId: string): void {
  if (graphicId === 'all') {
   const currentState = this.getAllGraphicsDistressState();
   const newDistressValue = !currentState.checked || currentState.indeterminate;
   this.graphics = this.graphics.map((g) => ({ ...g, distress: newDistressValue }));
  } else {
   this.graphics = this.graphics.map((g) =>
    g.id === graphicId ? { ...g, distress: !g.distress } : g
   );
  }
  this.saveToLocalStorage();
 }

 handleDoneClick(): void {
  const graphicsToSave = this.graphics
   .filter((g) => g.id !== 'all')
   .map((g) => {
    let colorsArray = g.colors;
    if (colorsArray === null) {
     colorsArray = this.availableColors.length > 0 ? [...this.availableColors] : [];
    } else if (!Array.isArray(colorsArray)) {
     colorsArray = [];
    }

    return {
     name: g.name,
     position: g.position || '',
     samePlates: g.samePlates || '',
     colors: colorsArray,
     distress: g.distress,
     underbase234Swatch: g.underbase234Swatch || 'White UB'
    };
   });

  this.isSaving = true;
  this.controller
   .saveGraphicsData(graphicsToSave)
   .then((result) => {
    if (result.success) {
     // Sync to shared service to notify other components/tabs
     this.saveToLocalStorage();
    } else {
    }
   })
   .catch((err) => {})
   .finally(() => {
    this.isSaving = false;
    this.cdr.detectChanges();
   });
 }

 saveToLocalStorage(): void {
  if (this.graphics.length > 0) {
   const graphicsData = this.graphics.filter((g) => g.id !== 'all');
   this.graphicsDataService.updateGraphicsData(graphicsData);
  }
 }

 get isSingleGraphic(): boolean {
  return this.graphicNames.length === 1;
 }

 get isSinglePosition(): boolean {
  return this.positionOptions.length === 1;
 }

 openDocument(filePath: string): void {
  if (this.isRunningInBrowser) return;
  this.controller.openSeparationDocument(filePath);
 }

 openCreateGraphicModal(): void {
  if (!this.hasSelection || this.isRunningInBrowser) return;
  this.createGraphicWarning = '';
  this.createGraphicModalOpen = true;
  this.cdr.detectChanges();
 }

 /*
  * Standalone (non-LEAP) entry point. The "+" button now routes here: with a live selection it
  * asks the shell to enable and open the Standalone tab (index 3), where the user enters the
  * metadata and runs "Generate Separate". The legacy create-graphic modal (openCreateGraphicModal)
  * is intentionally left intact and unused so the previous behavior can be restored trivially.
  */
 openStandaloneSeparation(): void {
  if (!this.hasSelection || this.isRunningInBrowser) return;
  const nav = (window as any).__LEAP_TAB_NAVIGATION__;
  if (nav && typeof nav.openStandalone === 'function') {
   nav.openStandalone();
  }
 }

 closeCreateGraphicModal(): void {
  this.createGraphicModalOpen = false;
  this.createGraphicWarning = '';
  this.cdr.detectChanges();
 }

 handleCreateGraphicConfirm(payload: CreateGraphicModalResult): void {
  this.isCreatingGraphic = true;
  this.createGraphicWarning = '';
  this.cdr.detectChanges();

  this.controller
   .createGraphicFromSelection(payload)
   .then((result) => {
    if (!result?.success) {
     this.createGraphicWarning = result?.error || 'Could not create graphic.';
     return;
    }

    if (result.hasNonSpotColors && result.nonSpotWarning) {
     this.createGraphicWarning = result.nonSpotWarning;
    }

    const newGraphicName = result.graphicName || payload.position;
    const existingGraphic = this.graphics.find((g) => g.id !== 'all' && g.name === newGraphicName);
    if (!existingGraphic) {
     this.graphics = [
      ...this.graphics,
      {
       id: `graphic-${Date.now()}`,
       name: newGraphicName,
       position: payload.position,
       samePlates: '',
       colors: null,
       distress: false
      }
     ];
     this.graphicNames = [...this.graphicNames, newGraphicName];
     this.samePlatesOptions = [...this.graphicNames, 'None'];
     this.saveToLocalStorage();
    } else {
     this.graphics = this.graphics.map((g) =>
      g.name === newGraphicName ? { ...g, position: payload.position } : g
     );
     this.saveToLocalStorage();
    }

    if (!this.createGraphicWarning) {
     this.createGraphicModalOpen = false;
    }

    setTimeout(() => {
     this.loadGraphicsList();
     this.refreshSelectionState();
    }, 300);
   })
   .catch((err) => {
    this.createGraphicWarning = err?.message || 'Could not create graphic.';
   })
   .finally(() => {
    this.isCreatingGraphic = false;
    this.cdr.detectChanges();
   });
 }

 get showOrganizeGraphics(): boolean {
  return (
   this.hasVersionDocument &&
   !this.isSeparatedDoc &&
   !this.isCheckingDocument &&
   !this.isLoadingGraphics
  );
 }

 get showCreateGraphicActions(): boolean {
  return !this.isSeparatedDoc && !this.isRunningInBrowser && this.hasActiveDocument;
 }
}
