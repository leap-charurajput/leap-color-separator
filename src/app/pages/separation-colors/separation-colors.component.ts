import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
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

interface ColorRow {
 id: number;
 colorName: string;
 mesh: string;
 micron: string;
 type: 'separation' | 'compound';
 layerColor?: string;
 colorIcon?: any;
 flashEnabled: boolean;
 coolEnabled: boolean;
 wbEnabled: boolean;
 removed: boolean;
 components?: string[];
 specialInk?: boolean;
 specialInkValue?: string;
 generateChoke?: boolean;
 chokeColor?: string;
}

@Component({
 selector: 'app-separation-colors',
 templateUrl: './separation-colors.component.html',
 styleUrls: ['./separation-colors.component.css']
})
export class SeparationColorsComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
 @Input() documentRefreshKey = 0;

 isRunningInBrowser = false;
 selectedGraphic = '';
 graphicOptions: string[] = [];
 isLoadingGraphics = false;
 isLoadingSwatches = false;
 isSeparatedDoc = false;
 graphicNameFromPath = '';
 graphicSwatches: any[] = [];
 // draggedIndex removed as it is handled by CDK

 graphicMenuItems = ['Add separation color', 'Add compound plate', 'Revert', 'Refresh list'];

 colorRows: ColorRow[] = [];
 nextId = 3;
 hasUIChanges = false;
 documentProfileMetadata: any = null;

 isSeparationModalOpen = false;
 isCompoundModalOpen = false;
 isExportModalOpen = false;
 editingRow: ColorRow | null = null;

 editingMeshRows = new Set<number>();
 selectedMeshRows = new Set<number>();
 meshEditValue = '';
 focusedMeshRowId: number | null = null;
 private isSavingMesh = false;
 private isTypingMesh = false;

 // Visibility state for dimming icons
 visibilityMode: 'allVisible' | 'singleVisible' | 'noneVisible' | 'other' = 'allVisible';
 activeSingleInk: string | null = null;

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
  // Don't initialize with default rows - wait for actual data from document
  this.colorRows = [];
 }

 ngOnInit(): void {
  this.checkIfSeparatedDocument();
  this.registerGlobalRefreshFunction();
 }

 ngAfterViewInit(): void {
  // Data loading is handled in checkIfSeparatedDocument
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['documentRefreshKey'] && !changes['documentRefreshKey'].firstChange) {
   console.log('[SEPARATION] Refresh triggered by App (refreshKey changed)');
   // Reset state when document changes
   this.colorRows = [];
   this.graphicSwatches = [];
   this.checkIfSeparatedDocument();
  }
 }

 ngOnDestroy(): void {
  delete (window as any).__LEAP_SEPARATION_COLORS_REFRESH__;
 }

 private initializeColorRows(): void {
  this.colorRows = [
   {
    id: 1,
    colorName: 'SL White UB',
    mesh: '110',
    micron: 'NA',
    type: 'separation',
    layerColor: '#FF6B6B',
    flashEnabled: true,
    coolEnabled: false,
    wbEnabled: true,
    removed: false
   },
   {
    id: 2,
    colorName: 'White UB',
    mesh: '157',
    micron: 'NA',
    type: 'compound',
    components: ['AMARILLO 78H', 'Bicoastal 3CC'],
    layerColor: '#E8D5C4',
    flashEnabled: true,
    coolEnabled: true,
    wbEnabled: false,
    specialInk: true,
    specialInkValue: 'foil',
    generateChoke: true,
    chokeColor: 'AMARILLO 78H',
    removed: false
   }
  ];
 }

 private getRandomColor(): string {
  const colors = [
   '#FF6B6B',
   '#4ECDC4',
   '#45B7D1',
   '#FFA07A',
   '#98D8C8',
   '#F7DC6F',
   '#BB8FCE',
   '#85C1E2'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
 }

 loadGraphicsList(): void {
  console.log('[SEPARATION] Loading graphics list...');
  this.isLoadingGraphics = true;

  this.controller
   .getGraphicsList()
   .then((result) => {
    if (result.success && result.graphics && Array.isArray(result.graphics)) {
     console.log('[SEPARATION] Graphics loaded:', result.graphics);
     this.graphicOptions = result.graphics;
     if (!this.selectedGraphic && result.graphics.length > 0) {
      this.selectedGraphic = result.graphics[0];
     }
    } else {
     console.error('[SEPARATION] Failed to load graphics:', result.error || 'Invalid response');
     this.graphicOptions = [];
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Error loading graphics:', err);
    this.graphicOptions = [];
   })
   .finally(() => {
    this.isLoadingGraphics = false;
   });
 }

 loadGraphicSwatches(): void {
  if (!this.selectedGraphic) {
   return;
  }

  console.log('[SEPARATION] Loading swatches for graphic:', this.selectedGraphic);
  this.isLoadingSwatches = true;

  this.controller
   .getGraphicSwatches(this.selectedGraphic)
   .then((result) => {
    if (result.success && result.swatches && Array.isArray(result.swatches)) {
     console.log('[SEPARATION] Swatches loaded:', result.swatches);
     this.graphicSwatches = result.swatches;

     const newColorRows = result.swatches.map((swatchData: any, index: number) => {
      const colorHex = swatchData.hex || this.getRandomColor();
      return {
       id: index + 1,
       colorName: swatchData.name,
       mesh: '110',
       micron: 'NA',
       type: 'separation' as const,
       layerColor: colorHex,
       flashEnabled: true,
       coolEnabled: false,
       wbEnabled: true,
       removed: false
      };
     });

     this.colorRows = newColorRows;
     this.nextId = newColorRows.length + 1;
    } else {
     console.error('[SEPARATION] Failed to load swatches:', result.error);
     this.graphicSwatches = [];
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Error loading swatches:', err);
    this.graphicSwatches = [];
   })
   .finally(() => {
    this.isLoadingSwatches = false;
   });
 }

 checkIfSeparatedDocument(): void {
  console.log('[SEPARATION] Checking if document is separated...');

  this.controller
   .checkSeparatedDocument()
   .then((result) => {
    console.log('[SEPARATION] ========================================');
    console.log('[SEPARATION] checkSeparatedDocument - Complete Result:');
    console.log('[SEPARATION] ========================================');
    console.log('[SEPARATION] Full result object:', JSON.stringify(result.data, null, 2));
    console.log('[SEPARATION] result.success:', result.success);

    if (!result.success || !result.data || !result.data.hasDocument) {
     console.log('[SEPARATION] No data structure found or request failed');
     this.setUIForNonSeparatedDocument();
     return;
    }

    const data = result.data;

    if (data.isSeparatedDoc) {
     this.isSeparatedDoc = true;
     this.cdr.detectChanges(); // Force change detection to update template
     if (data.profileMetaData) {
      console.log('[SEPARATION] Setting profile metadata from XMP:', data.profileMetaData);
      this.documentProfileMetadata = data.profileMetaData;
      this.selectedGraphic = data.profileMetaData.graphicName || '';
      this.graphicNameFromPath = data.profileMetaData.graphicName || '';

      setTimeout(() => {
       this.handleRefreshList();
      }, 500); // Small delay to ensure Illustrator is ready
     } else {
      console.log('[SEPARATION] No profile metadata found in XMP');
      this.documentProfileMetadata = null;
      this.selectedGraphic = data.graphicName || '';
      this.graphicNameFromPath = data.graphicName || '';
     }

     // Load color rows from XMP if available (priority 1)
     if (
      data.leapSeparationColorsData &&
      Array.isArray(data.leapSeparationColorsData) &&
      data.leapSeparationColorsData.length > 0
     ) {
      console.log(
       '[SEPARATION] Found LEAPSeparationColorsData in XMP:',
       data.leapSeparationColorsData.length,
       'rows'
      );
      this.isLoadingSwatches = true;
      // Clear existing rows before loading new data
      this.colorRows = [];
      const colorRowsFromXMP = this.convertXMPDataToColorRows(data.leapSeparationColorsData);
      if (colorRowsFromXMP && colorRowsFromXMP.length > 0) {
       this.colorRows = colorRowsFromXMP;
       this.nextId = colorRowsFromXMP.length + 1;
       this.hasUIChanges = false;
       this.isLoadingSwatches = false;
       this.cdr.detectChanges(); // Force change detection after loading color rows
       console.log(
        '[SEPARATION] Loaded color rows from XMP data on document check:',
        colorRowsFromXMP.length,
        'rows'
       );
       console.log('[SEPARATION] Color rows array:', this.colorRows);
       console.log('[SEPARATION] isLoadingSwatches:', this.isLoadingSwatches);
       console.log('[SEPARATION] isSeparatedDoc:', this.isSeparatedDoc);
       console.log('[SEPARATION] isLoadingGraphics:', this.isLoadingGraphics);
       console.log('[SEPARATION] graphicOptions.length:', this.graphicOptions.length);
       console.log(
        '[SEPARATION] Should show table?',
        !this.isLoadingSwatches &&
         (this.isSeparatedDoc || (!this.isLoadingGraphics && this.graphicOptions.length > 0))
       );
      } else {
       console.log('[SEPARATION] Failed to convert XMP data, will use SeparatedLayerNames + Excel');
       this.colorRows = [];
       this.isLoadingSwatches = false;
      }
     } else {
      console.log(
       '[SEPARATION] No LEAPSeparationColorsData found in XMP, will use SeparatedLayerNames + Excel'
      );
      const separatedLayerNames = data.separatedLayerNames;
      if (
       separatedLayerNames &&
       Array.isArray(separatedLayerNames) &&
       separatedLayerNames.length > 0
      ) {
       this.isLoadingSwatches = true;
       this.loadColorRowsFromSeparatedLayerNames();
      } else {
       console.log('[SEPARATION] No SeparatedLayerNames found either, cannot load color data');
       this.isLoadingSwatches = false;
      }
     }
    } else {
     this.isSeparatedDoc = false;
     this.cdr.detectChanges(); // Force change detection
     this.setUIForNonSeparatedDocument();
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Error checking separated document:', err);
    this.isSeparatedDoc = false;
    this.cdr.detectChanges(); // Force change detection
    this.setUIForNonSeparatedDocument();
   });
 }

 private setUIForNonSeparatedDocument(): void {
  this.isSeparatedDoc = false;
  this.graphicNameFromPath = '';
  this.documentProfileMetadata = null;
  this.colorRows = [];
  this.graphicSwatches = [];
  this.selectedGraphic = '';
  this.isLoadingSwatches = false;
  this.loadGraphicsList();
 }

 /************************************************************************************************************
  * Register global refresh function (called from other components)
  ************************************************************************************************************/
 private registerGlobalRefreshFunction(): void {
  (window as any).__LEAP_SEPARATION_COLORS_REFRESH__ = () => {
   setTimeout(() => {
    this.checkIfSeparatedDocument();
   }, 500);
  };
 }

 convertXMPDataToColorRows(xmpData: any[]): ColorRow[] | null {
  if (!xmpData || !Array.isArray(xmpData) || xmpData.length === 0) {
   return null;
  }

  console.log(
   '[SEPARATION] Converting XMP data directly (with hex stored):',
   xmpData.length,
   'rows'
  );

  let currentId = 1;
  const newColorRows: ColorRow[] = [];

  xmpData.forEach((sepData: any) => {
   if (!sepData || !sepData.colorName) {
    return;
   }

   const colorHex = sepData.hex || this.getRandomColor();
   const isWhiteUBColor = this.isWhiteUB(sepData.colorName);
   const isCompound = sepData.type === 'compound';

   const row: ColorRow = {
    id: currentId++,
    colorName: sepData.colorName,
    mesh: sepData.mesh || '110',
    micron: sepData.micron || 'NA',
    type: sepData.type || 'separation',
    layerColor: colorHex,
    flashEnabled: sepData.flash !== undefined ? sepData.flash : true,
    coolEnabled: sepData.cool !== undefined ? sepData.cool : false,
    wbEnabled: sepData.wb !== undefined ? sepData.wb : true,
    removed: false,
    components: sepData.components || (isCompound ? [] : undefined)
   };

   newColorRows.push(row);
  });

  return this.sortColorRowsWithWhiteUBAtBottom(newColorRows);
 }

 loadColorRowsFromSeparatedLayerNames(): void {
  if (this.isRunningInBrowser || !this.selectedGraphic) {
   return;
  }

  console.log(
   '[SEPARATION] Loading color rows using SeparatedLayerNames + Excel for graphic:',
   this.selectedGraphic
  );
  this.isLoadingSwatches = true;

  this.controller
   .getGraphicSwatches(this.selectedGraphic)
   .then((result) => {
    if (result.success && result.swatches && Array.isArray(result.swatches)) {
     console.log(
      '[SEPARATION] Fetched swatches from SeparatedLayerNames:',
      result.swatches.map((s: any) => s.name)
     );

     const validSwatches = this.filterValidSwatches(result.swatches);
     console.log(
      '[SEPARATION] Valid swatches (exist in document):',
      validSwatches.map((s: any) => s.name)
     );

     this.graphicSwatches = validSwatches;

     // Step 2: Get ink names for batch lookup (only from valid swatches)
     const inkNames = validSwatches.map((s: any) => s.name);

     // Get profile name from document metadata if available
     const profileName = this.documentProfileMetadata
      ? this.documentProfileMetadata.profileName
      : null;

     // Step 3: Fetch ink information from Inks.xlsx (includes mesh, micron, profile info)
     return this.controller.getInkInformationBatch(inkNames, profileName);
    } else {
     console.error(
      '[SEPARATION] Failed to load swatches from SeparatedLayerNames:',
      result.error || 'Invalid response'
     );
     this.graphicSwatches = [];
     this.colorRows = [];
     this.isLoadingSwatches = false;
     this.cdr.detectChanges(); // Force change detection on error
     return null;
    }
   })
   .then((inkResult) => {
    if (!inkResult || !inkResult.success || !inkResult.inkInfoList) {
     console.warn('[SEPARATION] Failed to load ink information, using default mesh values');
     this.createColorRowsFromSwatchesWithDefaults();
     this.cdr.detectChanges(); // Force change detection after creating default rows
     return;
    }

    const needsFallbackProfile = inkResult.inkInfoList.some((ink: any) => !ink.found);
    let fallbackProfilePromise: Promise<any> = Promise.resolve(null);

    if (needsFallbackProfile && this.documentProfileMetadata) {
     // Use profileCode if available, otherwise fallback to profileName
     const profileCode =
      this.documentProfileMetadata.profileCode || this.documentProfileMetadata.profileName;
     if (profileCode) {
      fallbackProfilePromise = this.controller.getProfileInformation(profileCode);
     }
    }

    return fallbackProfilePromise.then((fallbackProfileResult: any) => {
     const fallbackProfile =
      fallbackProfileResult &&
      fallbackProfileResult.success &&
      fallbackProfileResult.profileInfo &&
      fallbackProfileResult.profileInfo.found
       ? fallbackProfileResult.profileInfo
       : null;

     // Step 4: Convert swatches to color rows with mesh values and profile settings
     let currentId = 1;
     const newColorRows: ColorRow[] = [];

     this.graphicSwatches.forEach((swatchData: any, index: number) => {
      const inkInfo = inkResult.inkInfoList[index] || { mesh: '110', twoHits: false, found: false };
      const firstRow = this.createColorRowFromSwatch(
       swatchData,
       inkInfo,
       fallbackProfile,
       currentId++
      );
      newColorRows.push(firstRow);

      if (inkInfo.twoHits) {
       const colorHex = swatchData.hex || this.getRandomColor();
       const isWhiteUBColor = this.isWhiteUB(swatchData.name);
       const secondRow: ColorRow = {
        ...firstRow,
        id: currentId++,
        colorName: `${swatchData.name} 2`
       };
       newColorRows.push(secondRow);
      }
     });

     const sortedColorRows = this.sortColorRowsWithWhiteUBAtBottom(newColorRows);
     console.log(
      '[SEPARATION] Color rows loaded from SeparatedLayerNames + Excel:',
      sortedColorRows.length,
      'rows'
     );
     console.log(
      '[SEPARATION] Color rows after sorting:',
      sortedColorRows.map((r) => r.colorName)
     );
     this.colorRows = sortedColorRows;
     this.nextId = currentId;
     this.isLoadingSwatches = false;
     this.cdr.detectChanges(); // Force change detection after loading color rows
     console.log('[SEPARATION] Color rows array:', this.colorRows);
     console.log('[SEPARATION] isLoadingSwatches:', this.isLoadingSwatches);
     console.log('[SEPARATION] isSeparatedDoc:', this.isSeparatedDoc);
     console.log(
      '[SEPARATION] Should show table?',
      !this.isLoadingSwatches &&
       (this.isSeparatedDoc || (!this.isLoadingGraphics && this.graphicOptions.length > 0))
     );
    });
   })
   .catch((err) => {
    console.error('[SEPARATION] Error loading color rows from SeparatedLayerNames + Excel:', err);
    this.graphicSwatches = [];
    this.colorRows = [];
    this.isLoadingSwatches = false;
    this.cdr.detectChanges(); // Force change detection on error
   });
 }

 private filterValidSwatches(swatches: any[]): any[] {
  return swatches.filter((swatch) => {
   const hasValidColor = swatch.cmyk !== null || swatch.rgb !== null;
   if (!hasValidColor) {
    console.log(
     `[SEPARATION] Filtering out swatch "${swatch.name}" - not found in document (no CMYK/RGB data)`
    );
   }
   return hasValidColor;
  });
 }

 private createColorRowFromSwatch(
  swatchData: any,
  inkInfo: any,
  fallbackProfile: any,
  currentId: number
 ): ColorRow {
  const colorHex = swatchData.hex || this.getRandomColor();
  const isWhiteUBColor = this.isWhiteUB(swatchData.name);

  // Determine which profile to use
  let profileInfo: any = {};
  let hasProfile = false;

  if (inkInfo.found && inkInfo.profileInfo && inkInfo.profileInfo.found) {
   // Primary: Use profile from Inks.xlsx
   profileInfo = inkInfo.profileInfo;
   hasProfile = true;
  } else if (!inkInfo.found && fallbackProfile) {
   // Fallback: Use profile from document XMP
   profileInfo = fallbackProfile;
   hasProfile = true;
  }

  // Use profile values if available, otherwise use defaults
  const flashEnabled = hasProfile ? profileInfo.flash : true;
  const coolEnabled = hasProfile ? profileInfo.cool : false;
  const wbEnabled = hasProfile ? profileInfo.wb : true;
  const micron = hasProfile ? profileInfo.micron : 'NA';

  return {
   id: currentId,
   colorName: swatchData.name,
   mesh: inkInfo.mesh || '110',
   micron: micron,
   type: 'separation',
   layerColor: colorHex,
   flashEnabled: flashEnabled,
   coolEnabled: coolEnabled,
   wbEnabled: wbEnabled,
   removed: false
  };
 }

 private createColorRowsFromSwatchesWithDefaults(): void {
  const newColorRows: ColorRow[] = this.graphicSwatches.map((swatchData: any, index: number) => {
   const colorHex = swatchData.hex || this.getRandomColor();
   const isWhiteUBColor = this.isWhiteUB(swatchData.name);
   return {
    id: index + 1,
    colorName: swatchData.name,
    mesh: '110',
    micron: 'NA',
    type: 'separation',
    layerColor: colorHex,
    flashEnabled: true,
    coolEnabled: false,
    wbEnabled: true,
    removed: false
   };
  });

  const sortedColorRows = this.sortColorRowsWithWhiteUBAtBottom(newColorRows);
  console.log(
   '[SEPARATION] Color rows after sorting (fallback):',
   sortedColorRows.map((r) => r.colorName)
  );
  this.colorRows = sortedColorRows;
  this.nextId = sortedColorRows.length + 1;
  this.isLoadingSwatches = false;
  this.cdr.detectChanges(); // Force change detection after creating default rows
 }

 private sortColorRowsWithWhiteUBAtBottom(rows: ColorRow[]): ColorRow[] {
  if (!rows || rows.length === 0) return rows;

  const sorted = [...rows].sort((a, b) => {
   const aIsWhiteUB = this.isWhiteUB(a.colorName);
   const bIsWhiteUB = this.isWhiteUB(b.colorName);
   if (aIsWhiteUB === bIsWhiteUB) return 0;
   return aIsWhiteUB ? -1 : 1; // White UB at top (return -1 when a is White UB)
  });

  return sorted;
 }

 isWhiteUB(colorName: string): boolean {
  if (!colorName) return false;
  const lowerName = colorName.toLowerCase();
  return lowerName.includes('white ub') || lowerName.includes('whiteub');
 }

 handleGraphicMenuClick(item: string): void {
  console.log('[SEPARATION] Graphic menu clicked:', item);

  if (item === 'Refresh list') {
   this.handleRefreshList();
  } else if (item === 'Add separation color') {
   this.handleAddSeparationColor();
  } else if (item === 'Add compound plate') {
   this.handleAddCompoundPlate();
  } else if (item === 'Revert') {
   this.handleRevert();
  }
 }

 handleRefreshList(): void {
  this.hasUIChanges = false;
  this.updateSepTableInDocument();
 }

 handleExportProcess(): void {
  this.isExportModalOpen = true;
 }

 handleExportSeparations(exportOptions: any): void {
  console.log('[SEPARATION] Starting export process...');

  const exportResults: string[] = [];
  const exportErrors: string[] = [];

  // Export Print Guide PDF
  if (exportOptions.exportPrintGuide) {
   this.controller
    .exportPrintGuidePDF()
    .then((result) => {
     if (result && result.success) {
      exportResults.push('Print Guide PDF');
     } else {
      exportErrors.push('Print Guide PDF: ' + (result?.error || 'Failed'));
     }
     return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
    })
    .catch((err) => {
     exportErrors.push('Print Guide PDF: ' + (err.message || err.reason || 'Unknown error'));
     return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
    });
  } else {
   this.checkExportCompletion(exportOptions, exportResults, exportErrors);
  }

  // Export Postscript
  if (exportOptions.exportPostscript) {
   setTimeout(
    () => {
     this.controller
      .exportPostscript()
      .then((result) => {
       if (result && result.success) {
        exportResults.push('PostScript');
       } else {
        exportErrors.push('PostScript: ' + (result?.error || 'Failed'));
       }
       return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
      })
      .catch((err) => {
       exportErrors.push('PostScript: ' + (err.message || err.reason || 'Unknown error'));
       return this.checkExportCompletion(exportOptions, exportResults, exportErrors);
      });
    },
    exportOptions.exportPrintGuide ? 500 : 0
   );
  }

  // Export Separations Preview PDF (requires PostScript to be exported first)
  if (exportOptions.exportSeparationsPreview) {
   setTimeout(
    () => {
     if (exportOptions.exportPostscript) {
      setTimeout(() => {
       this.controller
        .exportSeparationsPreviewPDF()
        .then((result) => {
         if (result && result.success) {
          exportResults.push('Separations Preview PDF');
         } else {
          exportErrors.push('Separations Preview PDF: ' + (result?.error || 'Failed'));
         }
         this.checkExportCompletion(exportOptions, exportResults, exportErrors);
        })
        .catch((err) => {
         exportErrors.push(
          'Separations Preview PDF: ' + (err.message || err.reason || 'Unknown error')
         );
         this.checkExportCompletion(exportOptions, exportResults, exportErrors);
        });
      }, 500);
     } else {
      this.controller
       .exportSeparationsPreviewPDF()
       .then((result) => {
        if (result && result.success) {
         exportResults.push('Separations Preview PDF');
        } else {
         exportErrors.push('Separations Preview PDF: ' + (result?.error || 'Failed'));
        }
        this.checkExportCompletion(exportOptions, exportResults, exportErrors);
       })
       .catch((err) => {
        exportErrors.push(
         'Separations Preview PDF: ' + (err.message || err.reason || 'Unknown error')
        );
        this.checkExportCompletion(exportOptions, exportResults, exportErrors);
       });
     }
    },
    exportOptions.exportPrintGuide ? 1000 : 0
   );
  }
 }

 private checkExportCompletion(
  exportOptions: any,
  exportResults: string[],
  exportErrors: string[]
 ): void {
  const totalExports =
   (exportOptions.exportPrintGuide ? 1 : 0) +
   (exportOptions.exportPostscript ? 1 : 0) +
   (exportOptions.exportSeparationsPreview ? 1 : 0);

  if (exportResults.length + exportErrors.length >= totalExports) {
   if (exportErrors.length > 0 && exportResults.length === 0) {
    console.error('[SEPARATION] Export failed: ' + exportErrors[0]);
   } else if (exportErrors.length > 0) {
    console.warn(`[SEPARATION] ${exportResults.length} exported, ${exportErrors.length} failed`);
   } else if (exportResults.length > 0) {
    const successMessage =
     exportResults.length === 1
      ? `${exportResults[0]} exported successfully!`
      : `Exported ${exportResults.length} files successfully!`;
    console.log('[SEPARATION]', successMessage);
   }
  }
 }

 handleAddUnderbase(): void {
  this.handleAddCompoundPlate();
 }

 handleRevert(): void {
  console.log('[SEPARATION] Reversing color list order');
  this.colorRows = [...this.colorRows].reverse();
 }

 handleAddSeparationColor(): void {
  console.log('[SEPARATION] Opening modal to add separation color');
  this.editingRow = null;
  this.isSeparationModalOpen = true;
 }

 handleAddCompoundPlate(): void {
  console.log('[SEPARATION] Opening modal to add compound plate');
  this.editingRow = null;
  this.isCompoundModalOpen = true;
 }

 handleSaveSeparationColor(plateData: any): void {
  if (this.editingRow) {
   const updatedRows = this.colorRows.map((row) =>
    row.id === this.editingRow!.id
     ? {
        ...row,
        colorName: plateData.colorName,
        mesh: plateData.mesh,
        micron: plateData.micron,
        flashEnabled: plateData.flashEnabled,
        coolEnabled: plateData.coolEnabled,
        wbEnabled: plateData.wbEnabled
       }
     : row
   );
   this.colorRows = updatedRows;
   this.hasUIChanges = true;
   console.log('[SEPARATION] Separation color updated:', this.editingRow.id);
  } else {
   const randomColor = this.getRandomColor();
   const isWhiteUBColor = this.isWhiteUB(plateData.colorName);
   const newRow: ColorRow = {
    id: this.nextId,
    colorName: plateData.colorName,
    mesh: plateData.mesh,
    micron: plateData.micron,
    type: 'separation',
    layerColor: randomColor,
    flashEnabled: plateData.flashEnabled,
    coolEnabled: plateData.coolEnabled,
    wbEnabled: plateData.wbEnabled,
    removed: false
   };
   this.colorRows = [...this.colorRows, newRow];
   this.nextId++;
   this.hasUIChanges = true;
   console.log('[SEPARATION] New separation color added:', newRow);
  }
  this.isSeparationModalOpen = false;
  this.editingRow = null;
  this.cdr.detectChanges();
 }

 handleSaveCompoundPlate(plateData: any): void {
  if (this.editingRow) {
   const updatedRows = this.colorRows.map((row) =>
    row.id === this.editingRow!.id
     ? {
        ...row,
        colorName: plateData.colorName,
        components: plateData.components,
        mesh: plateData.mesh,
        micron: plateData.micron,
        flashEnabled: plateData.flashEnabled,
        coolEnabled: plateData.coolEnabled,
        wbEnabled: plateData.wbEnabled,
        specialInk: plateData.specialInk,
        specialInkValue: plateData.specialInkValue,
        generateChoke: plateData.generateChoke,
        chokeColor: plateData.chokeColor
       }
     : row
   );
   this.colorRows = updatedRows;
   this.hasUIChanges = true;
   console.log('[SEPARATION] Compound plate updated:', this.editingRow.id);
  } else {
   const compoundColor = '#E8D5C4';
   const newRow: ColorRow = {
    id: this.nextId,
    colorName: plateData.colorName,
    mesh: plateData.mesh,
    micron: plateData.micron,
    type: 'compound',
    components: plateData.components,
    layerColor: compoundColor,
    flashEnabled: plateData.flashEnabled,
    coolEnabled: plateData.coolEnabled,
    wbEnabled: plateData.wbEnabled,
    specialInk: plateData.specialInk,
    specialInkValue: plateData.specialInkValue,
    generateChoke: plateData.generateChoke,
    chokeColor: plateData.chokeColor,
    removed: false
   };
   this.colorRows = [...this.colorRows, newRow];
   this.nextId++;
   this.hasUIChanges = true;
   console.log('[SEPARATION] New compound plate added:', newRow);
  }
  this.isCompoundModalOpen = false;
  this.editingRow = null;
  this.cdr.detectChanges();
 }

 handleColorRowMenuClick(item: string, rowId: number): void {
  console.log('[SEPARATION] Color row menu clicked:', item, 'for row:', rowId);

  if (item === 'Remove color') {
   this.handleRemoveColor(rowId);
  } else if (item === 'Edit') {
   this.handleEditSeparation(rowId);
  } else if (item === 'Add second hit...') {
   console.log('[HIT THE DROPDOWN]', rowId);
   this.handleAddSecondHit(rowId);
  }
 }

 handleAddSecondHit(rowId: number): void {
  const originalRow = this.colorRows.find((row) => row.id === rowId);
  if (!originalRow) return;

  const duplicateName = this.getUniqueSecondHitName(originalRow.colorName);

  const isWhiteUBColor = this.isWhiteUB(originalRow.colorName);
  const duplicateRow: ColorRow = {
   ...originalRow,
   id: this.nextId,
   colorName: this.getUniqueSecondHitName(originalRow.colorName),
   removed: false
  };

  const originalIndex = this.colorRows.findIndex((row) => row.id === rowId);
  const newColorRows = [
   ...this.colorRows.slice(0, originalIndex + 1),
   duplicateRow,
   ...this.colorRows.slice(originalIndex + 1)
  ];

  this.colorRows = newColorRows;
  this.nextId++;
  this.hasUIChanges = true;

  //   🔥 Call Illustrator script (fire-and-forget, UI-safe)
  this.controller
   .generateUnderbaseLayer(originalRow.colorName, duplicateName)
   .then((res: string) => {
    console.log('[SEPARATION] Second hit underbase created:', res);
   })
   .catch((err: any) => {
    console.error('[SEPARATION] Failed to create second hit underbase', err);
   })
   .finally(() => {
    this.updateSepTableInDocument(); // ✅ update SEP TABLE after underbase generation
   });
 }

 getUniqueSecondHitName(currentName: string): string {
  const trimmedName = (currentName || '').trim();
  const match = trimmedName.match(/^(.+?)(?:\s*(\d+))$/);
  let baseName = trimmedName;
  let nextNumber = 2;

  if (match && match[2]) {
   baseName = match[1].trim();
   nextNumber = parseInt(match[2], 10) + 1;
  }

  const existingNames = new Set(
   this.colorRows.map((row) => (row.colorName || '').trim().toLowerCase())
  );
  let candidate = `${baseName} ${nextNumber}`.trim();

  while (existingNames.has(candidate.toLowerCase())) {
   nextNumber += 1;
   candidate = `${baseName} ${nextNumber}`.trim();
  }

  return candidate;
 }

 handleEditSeparation(rowId: number): void {
  const rowToEdit = this.colorRows.find((row) => row.id === rowId);
  if (rowToEdit) {
   console.log('[SEPARATION] Opening modal to edit:', rowId, 'Type:', rowToEdit.type);

   // Set editingRow first, then open modal to ensure data is available
   this.editingRow = rowToEdit;
   this.cdr.detectChanges(); // Force change detection to ensure editData is set

   if (rowToEdit.type === 'compound') {
    this.isCompoundModalOpen = true;
   } else {
    this.isSeparationModalOpen = true;
   }
   this.cdr.detectChanges(); // Force change detection after opening modal
  }
 }

 handleRemoveColor(rowId: number): void {
  const newColorRows = this.colorRows.map((row) => {
   if (row.id === rowId) {
    return { ...row, removed: true };
   }
   return row;
  });

  const sortedRows = newColorRows.sort((a, b) => {
   if (a.removed === b.removed) return 0;
   return a.removed ? 1 : -1;
  });

  this.colorRows = sortedRows;
  this.hasUIChanges = true;
  console.log('[SEPARATION] Color row removed and moved to bottom:', rowId);
 }

 handleToggleInkVisibility(colorName: string): void {
  console.log('[SEPARATION] Toggle ink visibility for:', colorName);

  this.controller
   .toggleInkVisibility(colorName)
   .then((result) => {
    if (result && result.success) {
     console.log('[SEPARATION] Ink visibility mode:', result.mode || 'n/a');
     // Update local state for UI dimming
     if (result.mode) {
      this.visibilityMode = result.mode;
      this.activeSingleInk = result.activeInk || null;
     }
     this.cdr.detectChanges();
    } else {
     console.error('[SEPARATION] Error toggling ink visibility:', result && result.error);
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Failed to toggle ink visibility:', err);
   });
 }

 isInkDimmed(colorName: string): boolean {
  if (this.visibilityMode === 'noneVisible') {
   return true;
  }
  if (this.visibilityMode === 'singleVisible' && this.activeSingleInk) {
   // Dim if this is NOT the active single ink
   return colorName !== this.activeSingleInk;
  }
  return false;
 }

 handleToggleHeaderVisibility(): void {
  console.log('[SEPARATION] Reset ink visibility from header');

  this.controller
   .resetInkVisibility()
   .then((result) => {
    if (result && result.success) {
     console.log('[SEPARATION] Ink visibility reset, mode:', result.mode || 'n/a');
     // Use returned mode (could be 'allVisible' or 'noneVisible')
     this.visibilityMode = result.mode || 'allVisible';
     this.activeSingleInk = null;
     this.cdr.detectChanges();
    } else {
     console.error('[SEPARATION] Error resetting ink visibility:', result && result.error);
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Failed to reset ink visibility:', err);
   });
 }

 // Drag and Drop (CDK)
 drop(event: CdkDragDrop<string[]>): void {
  if (event.previousIndex === event.currentIndex) {
   return;
  }

  moveItemInArray(this.colorRows, event.previousIndex, event.currentIndex);
  this.hasUIChanges = true;
  console.log(
   '[SEPARATION] Color rows reordered from index',
   event.previousIndex,
   'to',
   event.currentIndex
  );
 }

 getSequenceNumber(index: number): string {
  const activeRowsBeforeThis = this.colorRows.slice(0, index).filter((row) => !row.removed).length;
  const row = this.colorRows[index];
  return row.removed ? '' : String(activeRowsBeforeThis + 1);
 }

 getAvailableColors(): string[] {
  return this.colorRows.filter((row) => row.type === 'separation').map((row) => row.colorName);
 }

 isCompoundPlate(row: ColorRow): boolean {
  return row.type === 'compound';
 }

 getSeparationColor(row: ColorRow): string {
  return row.layerColor || '#FF6B6B';
 }

 // Mesh editing functionality
 handleMeshCellClick(rowId: number, event: MouseEvent): void {
  event.stopPropagation();
  const row = this.colorRows.find((r) => r.id === rowId);
  if (!row || row.removed) return;

  // 1. Check if row is already selected
  const isCurrentlySelected = this.selectedMeshRows.has(rowId);

  if (isCurrentlySelected) {
   // 2. If ALREADY selected, enter Edit Mode for ALL selected rows
   const newEditing = new Set<number>();
   this.selectedMeshRows.forEach((id) => {
    newEditing.add(id);
   });

   this.editingMeshRows = newEditing;
   // Use the clicked row's mesh as the starting value for the bulk edit
   this.meshEditValue = row.mesh || '';
   this.focusedMeshRowId = rowId;

   setTimeout(() => {
    const input = document.querySelector(`input[data-mesh-row-id="${rowId}"]`) as HTMLInputElement;
    if (input) {
     input.focus();
     const length = input.value.length;
     input.setSelectionRange(length, length);
    }
   }, 0);
  } else {
   // 3. If NOT selected, ADD to selection (Additive/Toggle behavior)
   this.selectedMeshRows.add(rowId);
   // Force new Set reference to trigger change detection if needed (though we mutated the Set above, Angular might need a new ref)
   this.selectedMeshRows = new Set(this.selectedMeshRows);

   // Ensure we are NOT in edit mode if we are just adding to selection
   this.editingMeshRows = new Set<number>();
   this.meshEditValue = '';
  }
 }

 handleMeshInputChange(value: string): void {
  this.isTypingMesh = true;
  this.meshEditValue = value;
  this.hasUIChanges = true;

  // Note: We do NOT mutate row.mesh here anymore.
  // The inputs bind to [value]="meshEditValue", so they will all update visually.
  // Committing to data model happens on Save.

  setTimeout(() => {
   this.isTypingMesh = false;
  }, 100);
 }

 handleMeshInputBlur(): void {
  // Save on blur
  // We use a small timeout to allow other events (like standard click) to process
  // But in this case, clicking outside SHOULD save.
  setTimeout(() => {
   // If we are still in edit mode (meaning we didn't cancel), save.
   if (this.editingMeshRows.size > 0 && !this.isTypingMesh && !this.isSavingMesh) {
    this.saveMeshValues();
   }
  }, 200);
 }

 handleMeshInputKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Enter') {
   event.preventDefault();
   this.isTypingMesh = false;
   this.saveMeshValues();
  } else if (event.key === 'Escape') {
   event.preventDefault();
   this.isTypingMesh = false;
   this.cancelMeshEdit();
  }
 }

 private saveMeshValues(): void {
  if (this.isSavingMesh) {
   return;
  }

  if (this.editingMeshRows.size === 0) {
   return;
  }

  this.isSavingMesh = true;
  const valueToSave = this.meshEditValue.trim();

  // Update ALL rows that were being edited
  this.colorRows = this.colorRows.map((row) => {
   if (this.editingMeshRows.has(row.id)) {
    return { ...row, mesh: valueToSave };
   }
   return row;
  });

  this.hasUIChanges = true;

  // Clear editing state and selection state after save
  this.editingMeshRows = new Set<number>();
  this.selectedMeshRows = new Set<number>();
  this.meshEditValue = '';

  setTimeout(() => {
   this.isSavingMesh = false;
  }, 100);
 }

 private cancelMeshEdit(): void {
  // Just exit edit mode, maybe keep selection?
  // For now, let's clear everything to return to clean state
  this.editingMeshRows = new Set<number>();
  this.selectedMeshRows = new Set<number>();
  this.meshEditValue = '';
 }

 // Toggle functions
 handleToggleFlash(rowId: number): void {
  this.colorRows = this.colorRows.map((row) =>
   row.id === rowId ? { ...row, flashEnabled: !row.flashEnabled } : row
  );
  this.hasUIChanges = true;
 }

 handleToggleCool(rowId: number): void {
  this.colorRows = this.colorRows.map((row) =>
   row.id === rowId ? { ...row, coolEnabled: !row.coolEnabled } : row
  );
  this.hasUIChanges = true;
 }

 handleToggleWb(rowId: number): void {
  this.colorRows = this.colorRows.map((row) =>
   row.id === rowId ? { ...row, wbEnabled: !row.wbEnabled } : row
  );
  this.hasUIChanges = true;
 }

 isMeshEditing(rowId: number): boolean {
  return this.editingMeshRows.has(rowId);
 }

 isMeshSelected(rowId: number): boolean {
  return this.selectedMeshRows.has(rowId);
 }

 updateSepTableInDocument(): void {
  const activeRows = this.colorRows.filter((row) => !row.removed);

  if (activeRows.length === 0) {
   console.log('[SEPARATION] No active rows to update in SEP TABLE');
   return;
  }

  const separationData = activeRows.map((row, index) => ({
   seq: index + 1,
   colorName: row.colorName,
   mesh: row.mesh,
   micron: row.micron,
   flash: row.flashEnabled,
   cool: row.coolEnabled,
   wb: row.wbEnabled,
   hex: row.layerColor || null,
   type: row.type || 'separation'
  }));

  console.log('[SEPARATION] Updating SEP TABLE with', separationData.length, 'rows');

  this.controller
   .updateSepTable(separationData)
   .then((result) => {
    if (result.success) {
     console.log('[SEPARATION] SEP TABLE updated successfully:', result);
    } else {
     console.error('[SEPARATION] Failed to update SEP TABLE:', result.error);
    }
   })
   .catch((err) => {
    console.error('[SEPARATION] Error updating SEP TABLE:', err);
   });
 }

 handleCancel(): void {
  debugger;
  this.isSeparationModalOpen = false;
  this.isCompoundModalOpen = false;
  this.editingRow = null;
  this.cdr.detectChanges();
 }
}
