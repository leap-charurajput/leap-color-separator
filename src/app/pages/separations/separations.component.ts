import {
 ChangeDetectorRef,
 Component,
 Input,
 OnChanges,
 OnDestroy,
 OnInit,
 SimpleChanges
} from '@angular/core';
import { ControllerService } from '../../services/controller.service';

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
 selectedGraphic = '';
 graphicOptions: string[] = [];
 isLoadingGraphics = false;
 teamCode = '';
 separations: Separation[] = [];
 isLoadingSeparations = false;
 graphicsData: any[] = [];
 availableColors: string[] = [];
 separationPaths: { [key: string]: string } = {};
 graphicFolderExists = false;
 isCheckingFolder = false;
 hasVersionDocument = false;
 isCheckingDocument = false;
 hasGraphicsPositions = false;
 private documentActivateHandler: (() => void) | null = null;

 constructor(private controller: ControllerService, private cdr: ChangeDetectorRef) {
  this.isRunningInBrowser = !(window as any).__adobe_cep__ && !(window as any).leap;
 }

 ngOnInit(): void {
  this.setupDocumentEventListener();
  this.setupGraphicsPositionsListener();
  this.checkVersionDocument();
 }

 ngOnDestroy(): void {
  this.removeDocumentEventListener();
  this.removeGraphicsPositionsListener();
 }

 setupGraphicsPositionsListener(): void {
  const handleGraphicsPositionsUpdate = () => {
   this.checkGraphicsPositions();
   this.loadGraphicsData();
  };

  window.addEventListener('graphicsPositionsUpdated', handleGraphicsPositionsUpdate);
  window.addEventListener('storage', handleGraphicsPositionsUpdate);

  (window as any).__SEPARATIONS_GRAPHICS_LISTENER__ = handleGraphicsPositionsUpdate;
 }

 removeGraphicsPositionsListener(): void {
  const handler = (window as any).__SEPARATIONS_GRAPHICS_LISTENER__;
  if (handler) {
   window.removeEventListener('graphicsPositionsUpdated', handler);
   window.removeEventListener('storage', handler);
   delete (window as any).__SEPARATIONS_GRAPHICS_LISTENER__;
  }
 }

 ngOnChanges(changes: SimpleChanges): void {
  if (changes['documentRefreshKey']) {
   this.checkVersionDocument();
   if (this.hasVersionDocument) {
    this.loadGraphicsList();
    this.loadTeamCode();
    this.loadGraphicsData();
    this.loadSeparationPaths();
   }
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
  } catch (err) {}
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
  } catch (err) {}
 }

 checkVersionDocument(): void {
  this.isCheckingDocument = true;
  this.controller
   .checkSeparatedDocument()
   .then((separatedResult) => {
    if (separatedResult.success && separatedResult.data && separatedResult.data.isSeparatedDoc) {
     this.hasVersionDocument = false;
     this.isCheckingDocument = false;
     return;
    }
    return this.controller.getTemplateInfo();
   })
   .then((result) => {
    if (result && result.success && result.hasDocument) {
     const isVersionFile = result.hasDocument && result.data && result.data.teamCode;
     this.hasVersionDocument = isVersionFile || false;

     if (this.hasVersionDocument) {
      this.loadGraphicsList();
      this.loadTeamCode();
      this.loadGraphicsData();
      this.loadSeparationPaths();
     }
    } else {
     this.hasVersionDocument = false;
    }
   })
   .catch((err) => {
    this.hasVersionDocument = false;
   })
   .finally(() => {
    this.isCheckingDocument = false;
    this.cdr.detectChanges();
   });
 }

 loadTeamCode(): void {
  this.controller
   .getTemplateInfo()
   .then((result) => {
    if (result.success && result.data && result.data.teamCode) {
     this.teamCode = result.data.teamCode;
     if (this.teamCode && this.teamCode !== '') {
      this.loadAvailableColors();
      if (this.selectedGraphic) {
       this.loadSeparations();
      }
     }
    }
   })
   .catch((err) => {});
 }

 loadAvailableColors(): void {
  if (!this.teamCode || this.teamCode === '') {
   return;
  }

  if (this.isRunningInBrowser) {
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

 loadGraphicsList(): void {
  if (this.isRunningInBrowser) {
   return;
  }

  this.isLoadingGraphics = true;
  this.controller
   .getGraphicsList()
   .then((result) => {
    if (result.success && result.graphics && Array.isArray(result.graphics)) {
     this.graphicOptions = [...result.graphics];

     if (!this.selectedGraphic || !result.graphics.includes(this.selectedGraphic)) {
      this.selectedGraphic = result.graphics.length > 0 ? result.graphics[0] : '';

      if (this.selectedGraphic) {
       this.checkGraphicFolderExists();
       this.loadSeparationPaths();
       if (this.teamCode && this.teamCode !== '') {
        this.loadSeparations();
       }
      }
     }
     this.checkGraphicsPositions();
     this.cdr.detectChanges();
    } else {
     this.graphicOptions = [];
     this.selectedGraphic = '';
     this.hasGraphicsPositions = false;
    }
   })
   .catch((err) => {
    this.graphicOptions = [];
    this.selectedGraphic = '';
    this.hasGraphicsPositions = false;
   })
   .finally(() => {
    this.isLoadingGraphics = false;

    this.cdr.detectChanges();
   });
 }

 loadGraphicsData(): void {
  this.controller
   .loadGraphicsData()
   .then((result) => {
    if (
     result.success &&
     result.graphicsData &&
     Array.isArray(result.graphicsData) &&
     result.graphicsData.length > 0
    ) {
     this.graphicsData = result.graphicsData;
    } else {
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
   })
   .catch((err) => {
    try {
     const savedGraphics = localStorage.getItem('graphicsPositions');
     if (savedGraphics) {
      this.graphicsData = JSON.parse(savedGraphics);
     } else {
      this.graphicsData = [];
     }
    } catch (localErr) {
     this.graphicsData = [];
    }
   });
 }

 checkGraphicsPositions(): void {
  this.controller
   .loadGraphicsData()
   .then((result) => {
    if (
     result.success &&
     result.graphicsData &&
     Array.isArray(result.graphicsData) &&
     result.graphicsData.length > 0
    ) {
     const graphicsData = result.graphicsData;
     const hasPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
     this.hasGraphicsPositions = hasPositions;
    } else {
     try {
      const savedGraphics = localStorage.getItem('graphicsPositions');
      if (savedGraphics) {
       const graphicsData = JSON.parse(savedGraphics);
       const hasPositions = graphicsData.some((g: any) => g.position && g.position.trim() !== '');
       this.hasGraphicsPositions = hasPositions;
      } else {
       this.hasGraphicsPositions = false;
      }
     } catch (err) {
      this.hasGraphicsPositions = false;
     }
    }
   })
   .catch((err) => {
    this.hasGraphicsPositions = false;
   });
 }

 loadSeparationPaths(): void {
  this.controller
   .loadSeparationPaths()
   .then((result) => {
    try {
     if (!result) {
      this.separationPaths = {};
      return;
     }

     if (result.debug) {
      if (result.debug.loadPathsDebug && result.debug.loadPathsDebug.length > 0) {
      }
     }

     if (result.success && result.separationPaths) {
      const paths = result.separationPaths;
      const keys = Object.keys(paths);
      this.separationPaths = paths;
     } else {
      this.separationPaths = {};
     }
    } catch (parseError) {
     this.separationPaths = {};
    }
   })
   .catch((err) => {});
 }

 loadSeparations(): void {
  console.log('RUNL');
  if (this.isRunningInBrowser) {
   return;
  }

  if (!this.teamCode || this.teamCode === '') {
   return;
  }

  this.isLoadingSeparations = true;

  this.controller
   .getStyleCodesFromExcel(this.teamCode)
   .then((styleResult) => {
    console.log('STYLE', { styleResult });
    if (!styleResult.success || !styleResult.styleCodes || styleResult.styleCodes.length === 0) {
     this.separations = [];
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
     return;
    }

    const styleCodes = styleResult.styleCodes;

    console.log('GBD');

    return this.controller.getProfileNamesFromExcel(styleCodes).then((profileResult) => {
     if (!profileResult.success || !profileResult.profileMap) {
      this.separations = [];
      this.isLoadingSeparations = false;
      this.cdr.detectChanges();
      return;
     }

     const profileMap = profileResult.profileMap;
     const profileGroups: { [key: string]: string[] } = {};
     styleCodes.forEach((styleCode: string) => {
      const profileName = profileMap[styleCode] || 'Unknown Profile';
      if (!profileGroups[profileName]) {
       profileGroups[profileName] = [];
      }
      profileGroups[profileName].push(styleCode);
     });

     const separationsList = Object.keys(profileGroups).map((profileName, index) => ({
      id: index + 1,
      profile: profileName,
      styles: profileGroups[profileName].sort(),
      colors: [],
      sepFileName: '',
      isCreated: false
     }));

     console.log('[SEP]', { separationsList });

     this.separations = separationsList;
     this.isLoadingSeparations = false;
     this.cdr.detectChanges();
    });
   })
   .catch((err) => {
    this.separations = [];
    this.isLoadingSeparations = false;
    this.cdr.detectChanges();
   });
 }

 getSelectedGraphicColors(): string[] {
  if (!this.selectedGraphic || this.graphicsData.length === 0) {
   return [];
  }
  const graphic = this.graphicsData.find((g: any) => g.name === this.selectedGraphic);
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

 handleGenerateSeparations(separationId: number): void {
  if (!this.selectedGraphic) {
   return;
  }

  const separation = this.separations.find((s) => s.id === separationId);
  if (!separation) {
   return;
  }

  const styleCodes = separation.styles || [];
  const profileName = separation.profile || '';
  const graphicColors = this.getSelectedGraphicColors();

  const getProfileCodeAndCreateSeparation = async () => {
   let profileCode = null;

   if (profileName && !this.isRunningInBrowser) {
    try {
     const result = await this.controller.getProfileCodeFromName(profileName);

     if (result && result.success && result.profileCode) {
      profileCode = result.profileCode;
     } else {
     }
    } catch (err) {}
   }

   const profileMetadata = {
    profileName: profileName,
    profileCode: profileCode,
    styleCodes: styleCodes,
    colorCodes: graphicColors,
    graphicName: this.selectedGraphic,
    createdDate: new Date().toISOString()
   };

   return this.controller.performSeparation(this.selectedGraphic, styleCodes, profileMetadata);
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
   .catch((err) => {});
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
   .catch((err) => {});
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

 checkGraphicFolderExists(): void {
  if (!this.selectedGraphic || this.selectedGraphic.trim() === '') {
   this.graphicFolderExists = false;
   return;
  }

  this.isCheckingFolder = true;
  this.controller
   .checkGraphicFolderExists(this.selectedGraphic)
   .then((result) => {
    if (result.success) {
     this.graphicFolderExists = result.folderExists || false;
    } else {
     this.graphicFolderExists = false;
    }
   })
   .catch((err) => {
    this.graphicFolderExists = false;
   })
   .finally(() => {
    this.isCheckingFolder = false;
    this.cdr.detectChanges();
   });
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

 getSeparationPath(separation: Separation): string | null {
  if (!this.selectedGraphic || !separation.profile) {
   return null;
  }
  const profileName = separation.profile || '';
  const compositeKey = `${this.selectedGraphic}_${profileName}`;
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

  if (this.selectedGraphic) {
  }

  return separationPath;
 }

 onGraphicChange(graphic: string): void {
  this.selectedGraphic = graphic;
  this.checkGraphicFolderExists();
  this.loadSeparationPaths();
  if (this.teamCode && this.teamCode !== '') {
   this.loadSeparations();
  }
  this.cdr.detectChanges();
 }
}
