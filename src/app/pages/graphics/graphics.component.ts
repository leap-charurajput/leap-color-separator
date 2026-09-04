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

 /*
  * ----- NN Pro product mode (docs/TODO.md "NN Pro separation support") -----
  * An NN Pro PRODUCT (XMP LEAP_XMP_META Document_Type "NN Pro Product") uses this SAME page —
  * only the sources differ: graphics rows come from XMP colorSepsConfig positions
  * ({artboard, position, abbv}; Metadata/template_color_seps.json fallback for old products),
  * colors come from the player row (XMP LEAP_PLAYER_META first, Metadata/<product>.json
  * fallback — its "Color Code"). Done writes the same GraphicsOrganizationData XMP, so the
  * downstream flow is unchanged.
  */
 isNNProDoc = false;
 private nnProDocInfo: any = null;
 private nnProPlayerRow: any = null;

 constructor(
  private controller: ControllerService,
  private cdr: ChangeDetectorRef,
  private graphicsDataService: GraphicsDataService
 ) {
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  /*
   * Bridge the shell uses to show/hide the inline standalone form on this tab (from the "+" button
   * and from a Separations-tab row's Generate). Same global-hook pattern as __LEAP_TAB_NAVIGATION__.
   */
  (window as any).__LEAP_GRAPHICS_STANDALONE__ = {
   open: (job: any) => this.openStandaloneForm(job),
   close: () => this.closeStandaloneForm(),
   /* Tab re-activation: reopen the form from the newest recorded job when appropriate (the form
      closes itself on Done/Export, which otherwise left this tab blank on non-LEAP docs). */
   refresh: () => this.maybeAutoOpenStandaloneForm()
  };
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
   this.maybeAutoOpenStandaloneForm();
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
     /* A different document may carry its own recorded jobs — offer them too. */
     this.maybeAutoOpenStandaloneForm();
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
  /* NN Pro docs have no LIVE_ART/GRAPHIC:* layers — the host art-white scan would just error. */
  if (this.isNNProDoc) {
   this.underbaseSwatchOptionsByGraphic = {};
   this.cdr.detectChanges();
   return;
  }
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

 /*
  * Detect an NN Pro product and resolve its data sources (XMP first, Metadata sidecars as the
  * old-product fallback). Returns true when the active doc is an NN Pro product.
  */
 private detectNNProDocument(): Promise<boolean> {
  return this.controller
   .resolveNNProContext()
   .then((context: any) => {
    if (!context || !context.isNNProProduct) {
     return false;
    }
    /*
     * OLD products carry no positions config (neither XMP colorSepsConfig nor
     * Metadata/template_color_seps.json). Those are handled by the STANDALONE form instead
     * (auto-opens because hasVersionDocument stays false; prefills itself from the NN Pro
     * player row — see standalone-separation tryPrefillFromNNPro). Only a product WITH
     * positions gets the organize-graphics mode.
     */
    const positions = context.colorSepsConfig?.positions;
    const hasPositions =
     Array.isArray(positions) && positions.some((p: any) => p && String(p.artboard || '').trim() !== '');
    if (!hasPositions) {
     console.log('[GRAPHICS] NN Pro product without positions config — standalone form path');
     return false;
    }
    this.nnProDocInfo = context;
    this.nnProPlayerRow = context.playerRow;
    this.isNNProDoc = true;
    console.log('[GRAPHICS] NN Pro product detected:', {
     positions: context.colorSepsConfig?.positions?.length || 0
    });
    return true;
   })
   .catch(() => false);
 }

 /** NN Pro colorway list — the player row's "Color Code" (may arrive as a NUMBER from Excel). */
 private nnProColorList(): string[] {
  const code = this.nnProPlayerRow ? this.nnProPlayerRow['Color Code'] : null;
  const text = code != null ? String(code).trim() : '';
  return text !== '' ? [text] : [];
 }

 private performVersionDocumentCheck(): Promise<void> {
  this.isCheckingDocument = true;
  this.isNNProDoc = false;
  this.nnProDocInfo = null;
  this.nnProPlayerRow = null;
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
     /* Not a LEAP version doc — an NN Pro PRODUCT uses this same page with NN Pro sources. */
     if (!this.hasVersionDocument && hasDoc) {
      return this.detectNNProDocument().then((isNNPro) => {
       if (isNNPro) {
        this.hasVersionDocument = true;
       }
       this.isCheckingDocument = false;
       this.cdr.detectChanges();
      });
     }
     this.isCheckingDocument = false;
     this.cdr.detectChanges();
     return;
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
  if (this.isNNProDoc) {
   /* NN Pro: the player row's "Team Org Code" stands in for the LEAP teamCode. */
   const row = this.nnProPlayerRow;
   this.teamCode = row && row['Team Org Code'] != null ? String(row['Team Org Code']) : '';
   this.loadPositionOptions();
   return;
  }
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
  if (this.isNNProDoc) {
   /* NN Pro: the product carries ONE colorway — the player row's "Color Code". */
   this.availableColors = this.nnProColorList();
   this.cdr.detectChanges();
   return;
  }
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

 /*
  * NN Pro graphics rows — one per colorSepsConfig position ({artboard, position, abbv}). The
  * row NAME is the ARTBOARD (unique + 1:1 with positions; the later separation stage will pull
  * art per artboard), and the Position column prefills with the saved DESC — the same
  * graphic_positions.json vocabulary the LEAP dropdown uses. Saved GraphicsOrganizationData
  * (XMP) overlays on top via loadGraphicsDataFromXMP, exactly like the LEAP path.
  */
 private loadNNProGraphicsList(): void {
  const positions = this.nnProDocInfo?.colorSepsConfig?.positions;
  const entries = Array.isArray(positions)
   ? positions.filter((p: any) => p && String(p.artboard || '').trim() !== '')
   : [];
  this.graphicNames = entries.map((p: any) => String(p.artboard).trim());
  this.graphics = [
   { id: 'all', name: 'All graphics', position: '', samePlates: '', colors: null, distress: false },
   ...entries.map((p: any, index: number) => ({
    id: `graphic-${index}`,
    name: String(p.artboard).trim(),
    position: p.position != null ? String(p.position) : '',
    samePlates: '',
    colors: null,
    distress: false
   }))
  ];
  this.samePlatesOptions = [...this.graphicNames, 'None'];
  this.availableColors = this.nnProColorList();
  this.loadTeamCode();
  setTimeout(() => {
   this.loadGraphicsDataFromXMP();
  }, 100);
  this.isLoadingGraphics = false;
  this.cdr.detectChanges();
 }

 loadGraphicsList(): void {
  this.isLoadingGraphics = true;

  if (this.isNNProDoc) {
   this.loadNNProGraphicsList();
   return;
  }

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
  try { delete (window as any).__LEAP_GRAPHICS_STANDALONE__; } catch (e) { }
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

  if (this.isNNProDoc) {
   /* NN Pro: no BATCH excel — the one colorway comes from the player row's "Color Code". */
   const nnColors = this.nnProColorList();
   const nnGraphic = this.graphics.find((g) => g.id === graphicId);
   this.modalState = {
    isOpen: true,
    graphicId,
    graphicName,
    availableColors: nnColors,
    selectedColors:
     nnGraphic?.colors === null ? nnColors : (nnGraphic?.colors && nnGraphic.colors.length > 0 ? nnGraphic.colors : []),
    isLoadingColors: false
   };
   this.cdr.detectChanges();
   return;
  }

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
 /*
  * Inline standalone (non-LEAP) form, shown on THIS tab under the graphics list when "+" is pressed.
  * Inline rather than a modal or a separate tab: the form is long and a narrow CEP panel gives a
  * modal very little room, and the user is already on Graphics when they press "+".
  * *ngIf, so closing discards the form state and reopening starts clean.
  */
 standaloneFormOpen = false;
 standalonePresetJob: any = null;

 /*
  * Document (normalized path) the form was already auto-opened for. Auto-open happens at most ONCE
  * per document: if the user closes the form, reopening it is their choice — re-showing it on every
  * refresh would fight them.
  */
 private autoOpenedForDocKey: string | null = null;
 /* Document the inline form currently belongs to, so a switch to another document can close it. */
 private standaloneFormDocKey: string | null = null;
 /* Most recent document key seen by the auto-open check; used to stamp a manually opened form. */
 private lastKnownDocKey: string | null = null;

 /*
  * A document that already carries standalone jobs in its XMP (LEAPStandaloneJobs) has been through
  * this flow before, so reopening it brings the form straight back — pre-filled from the most recent
  * job, and already in the post-Export state (the artwork was exported when that job was created, so
  * only Generate remains). The user does not have to press "+" again to see what they entered.
  *
  * Safe for the LEAP flow: a LEAP version document has no LEAPStandaloneJobs field, so this reads an
  * empty list and does nothing.
  */
 private async maybeAutoOpenStandaloneForm(): Promise<void> {
  try {
   if (this.isRunningInBrowser) return;
   if (typeof this.controller.readStandaloneJobsFromXmp !== 'function') return;
   const res: any = await this.controller.readStandaloneJobsFromXmp();
   const docKey = String((res && res.documentPath) || '').trim().toLowerCase();
   /*
    * Landing on a DIFFERENT document invalidates the once-per-document auto-open memo — it belongs
    * to the previous document. Without this, switching away (which auto-closes the form) and back
    * left the non-LEAP document showing a blank Graphics UI: the memo still matched, so the form
    * never reopened. A form the USER closed still stays closed while they remain on that document.
    */
   const prevDocKey = this.lastKnownDocKey;
   this.lastKnownDocKey = docKey || null;
   if (prevDocKey && docKey && prevDocKey !== docKey) {
    this.autoOpenedForDocKey = null;
   }
   const rawJobs = res && res.success && Array.isArray(res.jobs) ? res.jobs : [];
   /*
    * Trust only jobs recorded for THIS document. XMP travels INSIDE the file, so a duplicated /
    * Save-As'd .ai carries the ORIGINAL document's jobs — restoring one put the wrong Team Code /
    * Style Code on the form. Same doc-specific rule as the sidecar restore: a job must name this
    * document as its source; jobs without the field are treated as foreign and ignored.
    */
   const normalizeJobPath = (p: any) =>
    String(p || '').split('\\').join('/').trim().toLowerCase();
   const docNorm = normalizeJobPath(res && res.documentPath);
   const jobs = docNorm
    ? rawJobs.filter((j: any) => j && normalizeJobPath(j.sourceDocumentPath) === docNorm)
    : [];

   /*
    * A LEAP version document must show Organize Graphics. Close a form left open by a PREVIOUS
    * document — the form hides the whole LEAP UI, so leaving it up meant opening a LEAP file and
    * being shown standalone fields instead. Only closed when the document actually differs, so a
    * form the user is filling in on THIS document is never yanked away mid-entry.
    */
   if (this.hasVersionDocument) {
    if (this.standaloneFormOpen && this.standaloneFormDocKey !== docKey) {
     this.closeStandaloneForm();
    }
    return;
   }

   /*
    * NON-LEAP document with nothing recorded yet: auto-open a FRESH form (no "+" needed) — it
    * prefills itself in ngOnInit (sidecar restore → LICENSING sheet → file-name fallbacks).
    * Once per document (autoOpenedForDocKey), and never over a form already open on this document.
    * UNSAVED/blank documents are skipped: the host still reports a pseudo-path for them
    * ("/Untitled-3"), but it has no file EXTENSION — a saved artwork file always does. Those keep
    * the plain UI as before (Export needs a saved file anyway).
    */
   if (jobs.length === 0) {
    if (this.standaloneFormOpen && this.standaloneFormDocKey !== docKey) {
     this.closeStandaloneForm();
    }
    const isSavedFile = /\.[a-z0-9]{1,5}$/i.test(docKey);
    if (docKey && isSavedFile && this.autoOpenedForDocKey !== docKey && !this.standaloneFormOpen) {
     this.autoOpenedForDocKey = docKey;
     this.openStandaloneForm(null);
    }
    return;
   }

   if (docKey && this.autoOpenedForDocKey === docKey) return;
   this.autoOpenedForDocKey = docKey || null;
   /*
    * A form left open by a DIFFERENT document must not survive the switch — without this close,
    * the jobs>0 path early-returned and the PREVIOUS document's values (Team Code etc.) stayed
    * frozen on the UI. A form open for THIS document is left alone (user may be mid-entry).
    */
   if (this.standaloneFormOpen && this.standaloneFormDocKey !== docKey) {
    this.closeStandaloneForm();
   }
   if (this.standaloneFormOpen) return;

   /* Most recent job — entries are appended in export order. */
   const newest = jobs[jobs.length - 1];
   if (newest) {
    this.openStandaloneForm(newest);
   }
  } catch (err) {
   /* Never let this block the Graphics tab. */
  }
 }

 /* Show the inline form, optionally pre-filled from a job recorded on the document. */
 openStandaloneForm(job: any): void {
  this.standalonePresetJob = job || null;
  this.standaloneFormOpen = true;
  this.standaloneFormDocKey = this.lastKnownDocKey;
  this.cdr.detectChanges();
 }

 closeStandaloneForm(): void {
  this.standaloneFormOpen = false;
  this.standalonePresetJob = null;
  this.standaloneFormDocKey = null;
  /* Allow a later auto-reopen (tab return, refresh) — the once-per-doc memo protected against
     reopening OVER a live form, not against reopening after the form closed itself. */
  this.autoOpenedForDocKey = null;
  this.cdr.detectChanges();
 }

 openStandaloneSeparation(): void {
  if (!this.hasSelection || this.isRunningInBrowser) return;
  const openStandalone = () => {
   const nav = (window as any).__LEAP_TAB_NAVIGATION__;
   if (nav && typeof nav.openStandalone === 'function') {
    nav.openStandalone();
   }
  };
  /*
   * The standalone job is recorded on the SOURCE document's XMP at Export, which needs a file on
   * disk — XMP on an unsaved document cannot be persisted and would silently vanish. Stop here
   * rather than after the user has filled in the whole form.
   */
  if (typeof this.controller.isActiveDocumentSaved !== 'function') {
   openStandalone();
   return;
  }
  this.controller
   .isActiveDocumentSaved()
   .then((res) => {
    /* Only block when the host positively reports "not saved" — a probe failure must not lock the
       user out of the feature. */
    if (res && res.success === true && res.saved === false) {
     alert('Save the document first.\n\nA standalone separation is recorded on the document itself, so the document needs to exist on disk before you can start.');
     return;
    }
    openStandalone();
   })
   .catch(() => openStandalone());
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
