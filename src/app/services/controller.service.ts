import { Injectable } from '@angular/core';
import { checkForJSXUpdates, csInterface, evalScript } from '../../libs/helper';

@Injectable({
 providedIn: 'root'
})
export class ControllerService {
 constructor() {
  this.init();
 }

 private init(): void {
  this.log('client controller is initing...');
  this.log(`do we have leap ? ${this.hasSession()}`);

  const isInCEP = !!(window as any).__adobe_cep__;
  this.log(`are we in CEP environment ? ${isInCEP}`);

  if (!this.hasSession()) {
   this.waitForSession()
    .then(() => {
     this.log('Leap is now available');
    })
    .catch(() => {
     if (isInCEP) {
     }
    });
  }

  this.log('client controller has inited');
 }

 private waitForSession(maxRetries: number = 50, delayMs: number = 100): Promise<void> {
  return new Promise((resolve, reject) => {
   let retries = 0;
   const checkSession = () => {
    if (this.hasSession()) {
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

 invokePlugin(options: any): Promise<any> {
  this.log('invokePlugin');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .invokePlugin(options)
    .then((res: any) => {
     return res;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getGraphicsList(): Promise<any> {
  this.log('getGraphicsList called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetGraphicsList', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 toggleLayerVisibility(layerName: string): Promise<any> {
  this.log('toggleLayerVisibility called for layer: ' + layerName);

  return this.ensureSession().then(() => {
   const params = { layerName: layerName };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleToggleLayerVisibility', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 toggleInkVisibility(inkName: string): Promise<any> {
  this.log('toggleInkVisibility called for ink: ' + inkName);

  return this.ensureSession().then(() => {
   const params = { inkName: inkName };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleToggleInkVisibility', params)
    .then((res: string) => {
     const result = JSON.parse(res);
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 resetInkVisibility(): Promise<any> {
  this.log('resetInkVisibility called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleResetInkVisibility', {})
    .then((res: string) => {
     const result = JSON.parse(res);
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 updateSepTable(separationData: any[]): Promise<any> {
  this.log('updateSepTable called with ' + separationData.length + ' rows');

  return this.ensureSession().then(() => {
   const params = { separationData: separationData };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleUpdateSepTable', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getTemplateInfo(): Promise<any> {
  this.log('getTemplateInfo called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetTemplateInfo', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getGraphicSwatches(graphicName: string): Promise<any> {
  this.log('getGraphicSwatches called for: ' + graphicName);

  return this.ensureSession().then(() => {
   const params = { graphicName: graphicName };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetGraphicSwatches', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 checkSeparatedDocument(): Promise<any> {
  this.log('checkSeparatedDocument called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleCheckSeparatedDocument', {})
    .then((res: string) => {
     const result = JSON.parse(res);
     return this.enrichSeparatedDocWithLinks(result);
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 private enrichSeparatedDocWithLinks(result: any): Promise<any> {
  if (
   !result?.success ||
   !result?.data?.isSeparatedDoc ||
   result.data.teamVersionPath ||
   result.data.leapTemplatePath
  ) {
   return Promise.resolve(result);
  }

  const docPath = result.data.docPath;
  if (!docPath) return Promise.resolve(result);

  const script = this.buildGetSeparatedDocumentLinksScript(docPath);
  return evalScript(script)
   .then((linksRes: any) => {
    try {
     const links = JSON.parse(linksRes || '{}');
     if (links?.success && result.data) {
      if (links.teamVersionPath) result.data.teamVersionPath = links.teamVersionPath;
      if (links.teamVersionName) result.data.teamVersionName = links.teamVersionName;
      if (links.leapTemplatePath) result.data.leapTemplatePath = links.leapTemplatePath;
      if (links.leapTemplateName) result.data.leapTemplateName = links.leapTemplateName;
     }
    } catch (_) { }
    return result;
   })
   .catch(() => result);
 }

 private buildGetSeparatedDocumentLinksScript(docPath: string): string {
  const escapedPath = JSON.stringify(docPath);
  return `
(function() {
  var docPath = ${escapedPath};
  if (!docPath || docPath.indexOf('09 SEPARATIONS') === -1) {
    return JSON.stringify({ success: true, teamVersionPath: null, teamVersionName: null, leapTemplatePath: null, leapTemplateName: null });
  }
  var result = { success: true, teamVersionPath: null, teamVersionName: null, leapTemplatePath: null, leapTemplateName: null };
  try {
    var docFile = new File(docPath);
    var graphicFolder = docFile.parent;
    var teamCodeFolder = graphicFolder.parent;
    var leagueSepFolder = teamCodeFolder.parent;
    var separationsFolder = leagueSepFolder.parent;
    var rootFolder = separationsFolder.parent;
    var league = leagueSepFolder.name;
    var docName = docFile.name;
    var originalName = docName.replace(/-SEP.*(\\\\.ai)$/i, '$1');
    if (originalName === docName && docName.indexOf('-SEP') !== -1) {
      originalName = docName.substring(0, docName.indexOf('-SEP')) + '.ai';
    }
    var teamOutsFolder = new Folder(rootFolder.fsName + '/01 TEAMOUTS');
    var leagueFolder = new Folder(teamOutsFolder.fsName + '/' + league);
    var aiFolder = new Folder(leagueFolder.fsName + '/AI');
    var teamVersionFile = new File(aiFolder.fsName + '/' + originalName);
    var templateFolder = Folder(teamOutsFolder.parent);
    var templateFolderName = Folder(templateFolder.fsName.replace(' ASSETS', '')).name;
    var templateFile = File(templateFolder.parent.fsName + '/' + templateFolderName + '.ai');
    if (templateFile.exists) {
      result.leapTemplatePath = templateFile.fsName;
      result.leapTemplateName = decodeURI(templateFile.name);
    }
    if (teamVersionFile.exists) {
      result.teamVersionPath = teamVersionFile.fsName;
      result.teamVersionName = decodeURI(teamVersionFile.name);
    }
  } catch (e) {}
  return JSON.stringify(result);
})();
`;
 }

 getSeparationProfiles(): Promise<any> {
  this.log('getSeparationProfiles called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetSeparationProfiles', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 saveSeparationProfiles(profiles: any[]): Promise<any> {
  this.log('saveSeparationProfiles called with ' + profiles.length + ' profiles');

  return this.ensureSession().then(() => {
   const params = { profiles: profiles };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleSaveSeparationProfiles', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 async saveAppVersion(origin: string) {
  await checkForJSXUpdates(origin + '/');

  const script = `
    var folderPaths = "{\\n" +
      "  \\"origin\\": \\"" + "${origin}" + "\\"\\n" +
    "}";

    var leapSettingsFolder = Folder(Folder.myDocuments + "/LEAP Settings");
    if (!leapSettingsFolder.exists) leapSettingsFolder.create();

    var leapSepsFolder = Folder(Folder.myDocuments + "/LEAP Settings/LEAP_Seps");
    if (!leapSepsFolder.exists) leapSepsFolder.create();

    var file = new File(Folder.myDocuments + "/LEAP Settings/LEAP_Seps/ColorSep_Folder_Paths.json");

    if (file.open("w")) {
      file.write(folderPaths);
      file.close();
    } else {
      $.writeln("Failed to save JSON file.");
    }
  `;

  try {
   const result = await evalScript(script);
   return result;
  } catch (err) {
   throw err;
  }
 }

 async getAppVersion() {
  const script = `
    function getAppVersion() {
      var file = new File(Folder.myDocuments + "/LEAP Settings/LEAP_Seps/ColorSep_Folder_Paths.json");

      if (file.exists && file.open("r")) {
        var content = file.read();
        file.close();

        try {
          var data = eval("(" + content + ")");
          return data.origin || "";
        } catch (e) {
          return "";
        }
      } else {
        return "";
      }
    }

    getAppVersion();
  `;

  try {
   const result = await evalScript(script);

   console.log('[GET APP VERSION] Raw result:', { result });
   if (!result || result === 'undefined' || result === '') return null;
   return result;
  } catch (err) {
   console.error('Failed to get app version:', err);
   return null;
  }
 }

 async generateUnderbaseLayer(sourceLayerName: string, newNameLayer: string): Promise<string> {
  await this.ensureSession();

  const safeSource = sourceLayerName.replace(/'/g, "\\'");
  const safeNew = newNameLayer.replace(/'/g, "\\'");

  const script = `
		function duplicateSeparatedArtLayer(sourceLayerName, newNameLayer) {
		  var doc = app.activeDocument;
	
		  var CONSTANTS = {
			LAYER_NAMES: {
			  SEPARATED_ART: 'SEPARATED_ART'
			}
		  };
	
		  var separatedArtLayer;
		  try {
			separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
		  } catch (e) {
			return 'ERROR: SEPARATED_ART layer not found';
		  }
	
		  var sourceLayer;
		  try {
			sourceLayer = separatedArtLayer.layers.getByName(sourceLayerName);
		  } catch (e) {
			return 'ERROR: Source layer not found: ' + sourceLayerName;
		  }
	
		  var newLayer = separatedArtLayer.layers.add();
		  newLayer.name = newNameLayer;
	
		  (function copyLayer(src, dst) {
			for (var i = src.pageItems.length - 1; i >= 0; i--) {
			  src.pageItems[i].duplicate(dst, ElementPlacement.PLACEATBEGINNING);
			}
	
			for (var j = 0; j < src.layers.length; j++) {
			  var srcSub = src.layers[j];
			  var dstSub = dst.layers.add();
			  dstSub.name = srcSub.name;
			  copyLayer(srcSub, dstSub);
			}
		  })(sourceLayer, newLayer);
	
		  return 'OK';
		}
	
		duplicateSeparatedArtLayer('${safeSource}', '${safeNew}');
	  `;

  try {
   const result = await (window as any).leap.scriptLoader().evalScript(script);

   return result;
  } catch (err) {
   throw err;
  }
 }

 getColorCodesFromExcel(teamCode: string, documentPath?: string): Promise<any> {
  this.log('getColorCodesFromExcel called for team: ' + teamCode);

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getColorCodesFromExcel(teamCode, documentPath)
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getStyleCodesFromExcel(teamCode: string, documentPath?: string): Promise<any> {
  this.log('getStyleCodesFromExcel called for team: ' + teamCode);
  console.log(
   '[Separations] getStyleCodesFromExcel – teamCode:',
   teamCode,
   '| documentPath:',
   documentPath ?? '(missing)'
  );

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getStyleCodesFromExcel(teamCode, documentPath)
    .then((result: any) => {
     const count = result?.styleCodes?.length ?? 0;
     console.log(
      '[Separations] getStyleCodesFromExcel result – success:',
      !!result?.success,
      '| styleCodes count:',
      count,
      result?.error ? '| error: ' + result.error : ''
     );
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getProfileNamesFromExcel(styleCodes: string[]): Promise<any> {
  this.log('getProfileNamesFromExcel called with ' + styleCodes.length + ' style codes');
  console.log(
   '[Separations] getProfileNamesFromExcel – styleCodes count:',
   styleCodes?.length ?? 0,
   '| codes:',
   styleCodes ?? []
  );

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getProfileNamesFromExcel(styleCodes)
    .then((result: any) => {
     const mapKeys = result?.profileMap ? Object.keys(result.profileMap) : [];
     const missing =
      styleCodes?.filter(
       (sc) => !result?.profileMap?.[sc] || result?.profileMap?.[sc] === 'Unknown Profile'
      ) ?? [];
     console.log(
      '[Separations] getProfileNamesFromExcel result – success:',
      !!result?.success,
      '| profileMap entries:',
      mapKeys.length,
      missing.length ? '| style codes with no profile: ' + JSON.stringify(missing) : ''
     );
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getGraphicPlacementOptions(): Promise<any> {
  this.log('getGraphicPlacementOptions called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getGraphicPlacementOptions()
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 saveGraphicsData(graphicsData: any[]): Promise<any> {
  this.log('saveGraphicsData called with ' + graphicsData.length + ' graphics');

  return this.ensureSession().then(() => {
   const params = { graphicsData: graphicsData };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleSaveGraphicsData', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 loadGraphicsData(): Promise<any> {
  this.log('loadGraphicsData called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleLoadGraphicsData', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 loadSeparationPaths(): Promise<any> {
  this.log('loadSeparationPaths called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleLoadSeparationPaths', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 checkGraphicFolderExists(graphicName: string): Promise<any> {
  this.log('checkGraphicFolderExists called for: ' + graphicName);

  return this.ensureSession().then(() => {
   const params = { graphicName: graphicName };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleCheckGraphicFolderExists', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getProfileCodeFromName(profileName: string): Promise<any> {
  this.log('getProfileCodeFromName called for: ' + profileName);

  return this.ensureSession().then(() => {
   const params = { profileName: profileName };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetProfileCodeFromName', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 switchToVersionDocument(): Promise<any> {
  this.log('switchToVersionDocument called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleSwitchToVersionDocument', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 deleteAllPlatesInSeparationDoc(): Promise<any> {
  this.log('deleteAllPlatesInSeparationDoc called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleDeleteAllPlatesInSeparationDocument', {})
    .then((res: string) => {
     const result = JSON.parse(res);
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 openSeparationDocument(filePath: string): Promise<any> {
  this.log('openSeparationDocument called for: ' + filePath);

  return this.ensureSession().then(() => {
   const params = { filePath: filePath };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleOpenSeparationDocument', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 exportPrintGuidePDF(): Promise<any> {
  this.log('exportPrintGuidePDF called');

  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({
        success: false,
        error: "No active document found"
      });
    }

    var doc = app.activeDocument;

    if (!doc.artboards || doc.artboards.length === 0) {
      return JSON.stringify({
        success: false,
        error: "No artboards found in document"
      });
    }

    var pgArtboardIndex = -1;
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      var name = (ab && ab.name != null) ? ab.name.toString() : "";
      if (name && name.toUpperCase() === "PG") {
        pgArtboardIndex = i;
        break;
      }
    }

    if (pgArtboardIndex === -1) {
      return JSON.stringify({
        success: false,
        error: "Artboard named \\"PG\\" not found"
      });
    }

    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var destFile = new File(docFolder.fsName + "/" + docName + "_PrintGuide.pdf");

    var pdfOptions = new PDFSaveOptions();
    pdfOptions.artboardRange = (pgArtboardIndex + 1).toString(); // 1-based index as string
    pdfOptions.compatibility = PDFCompatibility.ACROBAT5;
    pdfOptions.generateThumbnails = true;
    pdfOptions.preserveEditability = false;

    // Save only the PG artboard as PDF
    doc.saveAs(destFile, pdfOptions);

    return JSON.stringify({
      success: true,
      message: "Print Guide PDF exported successfully",
      filePath: destFile.fsName,
      artboardName: "PG",
      artboardIndex: pgArtboardIndex
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error exporting Print Guide PDF: " + (e.message || e.toString())
    });
  }
})();
`;

   return evalScript(script)
    .then((res: any) => {
     const str = typeof res === 'string' ? res : '';
     try {
      return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
     } catch (e) {
      return { success: false, error: 'Invalid JSON response from host', raw: str };
     }
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 exportPostscript(inks: string[]): Promise<any> {
  this.log('exportPostscript called with ' + (inks?.length ?? 0) + ' inks');

  return this.ensureSession().then(() => {
   const presetPath = this.resolveBundledPrintPostscriptPresetPath();
   if (!presetPath) {
    return Promise.resolve({
     success: false,
     error:
      'Could not resolve bundled print preset (extension root). Open the panel from the Illustrator CEP extension so jsx/presets/Print Postscript is on disk.'
    });
   }
   return this.loadGeneralSettings().then((settingsResult) => {
    const resolvedPpdName =
     settingsResult?.success && settingsResult?.data?.ppdName != null
      ? String(settingsResult.data.ppdName).trim() || 'IBlock v2'
      : 'IBlock v2';
    const script = this.buildExportPostscriptScript(
     Array.isArray(inks) ? inks : [],
     presetPath,
     resolvedPpdName
    );
    return evalScript(script)
     .then(async (res: unknown) => {
      const str = typeof res === 'string' ? res : '';
      const result = str ? JSON.parse(str) : { success: false, error: 'No result' };

      if (result?.success && result?.filePath) {
       console.log('[exportPostscript] PS exported:', result.filePath);
       const distiller = await this.launchDistiller(result.filePath);
       console.log('[exportPostscript] Distiller launch result:', distiller);
       return {
        ...result,
        distiller,
        note: distiller.success
         ? 'Adobe Distiller launched to process PostScript.'
         : 'PostScript exported, but Adobe Distiller could not be launched automatically.'
       };
      }

      return result;
     })
     .catch((err: any) => {
      throw err;
     });
   });
  });
 }

 private launchDistiller(psPath: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
   try {
    console.log('[launchDistiller] Requested with PS path:', psPath);
    const win = window as any;
    const req = win?.cep_node?.require;
    if (!req) {
     const msg = 'CEP node runtime is unavailable';
     console.error('[launchDistiller] ' + msg);
     resolve({ success: false, error: msg });
     return;
    }

    const cp = req('child_process');
    const fs = req('fs');
    const appCandidates = [
     '/Applications/Adobe Acrobat DC/Acrobat Distiller.app',
    ];
    let foundAppPath = '';
    for (let i = 0; i < appCandidates.length; i++) {
     const p = appCandidates[i];
     try {
      if (fs.existsSync(p)) {
       foundAppPath = p;
       break;
      }
     } catch (_) { }
    }

    const psExists = (() => {
     try {
      return !!(psPath && fs.existsSync(psPath));
     } catch (_) {
      return false;
     }
    })();

    console.log('[launchDistiller] PS exists:', psExists);
    console.log('[launchDistiller] Distiller app found:', foundAppPath || 'not found in known paths');

    const appNameOrPath = foundAppPath || 'Adobe Acrobat Distiller';
    const openArgs = ['-a', appNameOrPath, psPath];
    console.log('[launchDistiller] Running command: open ' + openArgs.join(' '));

    cp.execFile('open', openArgs, (err: any, stdout: string, stderr: string) => {
     if (err) {
      const errMsg = err.message || String(err);
      console.error('[launchDistiller] Launch failed:', errMsg);
      if (stderr) console.error('[launchDistiller] stderr:', stderr);
      if (stdout) console.log('[launchDistiller] stdout:', stdout);
      resolve({ success: false, error: errMsg + (stderr ? ' | ' + stderr : '') });
      return;
     }
     if (stderr) console.warn('[launchDistiller] stderr:', stderr);
     if (stdout) console.log('[launchDistiller] stdout:', stdout);
     console.log('[launchDistiller] Launch command completed successfully');
     resolve({ success: true });
    });
   } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[launchDistiller] Exception:', msg);
    resolve({ success: false, error: msg });
   }
  });
 }

 /** Absolute path to jsx/presets/Print Postscript inside the installed CEP extension (matches angular.json asset copy). */
 private resolveBundledPrintPostscriptPresetPath(): string {
  const w = window as any;
  if (!w.__adobe_cep__ || typeof csInterface?.getSystemPath !== 'function') {
   return '';
  }
  try {
   const extensionRoot = csInterface.getSystemPath('extension');
   return extensionRoot + '/jsx/presets/Print Postscript';
  } catch {
   return '';
  }
 }

 private buildExportPostscriptScript(inks: string[], printPresetFsPath: string, ppdName: string): string {
  const safeInks = Array.isArray(inks) ? inks : [];
  const inksLiteral = JSON.stringify(safeInks);
  const presetPathLiteral = JSON.stringify(printPresetFsPath);
  const ppdNameLiteral = JSON.stringify(ppdName || 'IBlock v2');
  return `
(function() {
  try {
    var inks = ${inksLiteral};
    if (!app.documents.length) {
      return JSON.stringify({
        success: false,
        error: "No active document found"
      });
    }
    var doc = app.activeDocument;
    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var outputPath = docFolder.fsName + "/" + docName + ".ps";

    // Job options for the print job
    var jobOptions = new PrintJobOptions();
    jobOptions.copies = 1;
    jobOptions.printAllArtboards = false;
    
    var foundIndex = -1;
    for (var i = 0; i < doc.artboards.length; i++) {
      if (doc.artboards[i].name === 'Grid') {
        foundIndex = i;
        break;
      }
    }

    jobOptions.artboardRange = (foundIndex + 1).toString();
    jobOptions.printArea = PrintingBounds.ARTBOARDBOUNDS;
    jobOptions.file = new File(outputPath);

     // Color separation options
    var colorSepOptions = new PrintColorSeparationOptions();
    var _inkList = doc.inkList;
    var printInks = [];
    var inksLookup = {};
    for (var i = 0; i < inks.length; i++) {
      inksLookup[inks[i].toUpperCase()] = true;
    }
    for (var i = 0; i < _inkList.length; i++) {
      var ink = _inkList[i];
      // var inkName = ink.name.toUpperCase();
      // ink.inkInfo.printingStatus = inksLookup[inkName] ? true : false;
      printInks.push(ink);
    }
    colorSepOptions.inkList = printInks;

    // Print options
		var printOptions = new PrintOptions();
    printOptions.printPreset = 'LEAP_SEPS_POSTSCRIPT';
    //  printOptions.colorSeparationOptions = colorSepOptions;
    printOptions.jobOptions = jobOptions;

    app.activeDocument.print(printOptions);

    return JSON.stringify({
      success: true,
      message: "PostScript exported successfully",
      filePath: outputPath
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error exporting PostScript: " + (e.message || e.toString())
    });
  }
})();
`;
 }

 exportSeparationsPreviewPDF(): Promise<any> {
  this.log('exportSeparationsPreviewPDF called');

  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({
        success: false,
        error: "No active document found"
      });
    }

    var doc = app.activeDocument;

    if (!doc.artboards || doc.artboards.length === 0) {
      return JSON.stringify({
        success: false,
        error: "No artboards found in document"
      });
    }

    var gridArtboardIndex = -1;
    for (var i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      var name = (ab && ab.name != null) ? ab.name.toString() : "";
      if (name && name.toUpperCase() === "GRID") {
        gridArtboardIndex = i;
        break;
      }
    }

    if (gridArtboardIndex === -1) {
      return JSON.stringify({
        success: false,
        error: "Artboard named \\"Grid\\" not found"
      });
    }

    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var destFile = new File(docFolder.fsName + "/" + docName + "_SeparationsPreview.pdf");

    var pdfOptions = new PDFSaveOptions();
    pdfOptions.artboardRange = (gridArtboardIndex + 1).toString();
    pdfOptions.compatibility = PDFCompatibility.ACROBAT5;
    pdfOptions.generateThumbnails = true;
    pdfOptions.preserveEditability = false;

    doc.saveAs(destFile, pdfOptions);

    return JSON.stringify({
      success: true,
      message: "Separations Preview PDF exported successfully",
      filePath: destFile.fsName,
      artboardName: "Grid",
      artboardIndex: gridArtboardIndex
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error exporting Separations Preview PDF: " + (e.message || e.toString())
    });
  }
})();
`;

   return evalScript(script)
    .then((res: any) => {
     const str = typeof res === 'string' ? res : '';
     try {
      return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
     } catch (e) {
      return { success: false, error: 'Invalid JSON response from host', raw: str };
     }
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getInkInformationBatch(inkNames: string[], profileName?: string): Promise<any> {
  this.log('getInkInformationBatch called with ' + inkNames.length + ' ink names');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getInkInformationBatch(inkNames, profileName)
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getProfileInformation(profileCode: string): Promise<any> {
  this.log('getProfileInformation called for: ' + profileCode);

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getProfileInformation(profileCode)
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getBodyColor(): Promise<any> {
  this.log('getBodyColor called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetBodyColor', {})
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getStyleInformation(
  styleCodes: string[]
 ): Promise<{ success: boolean; styleInfoMap?: { [key: string]: any }; error?: string }> {
  console.log('[Controller] getStyleInformation called, styleCodes:', styleCodes);
  const win = window as any;
  if (!win.leap) {
   console.error('[Controller] getStyleInformation: window.leap is not defined');
   return Promise.reject(new Error('leap not available'));
  }
  return this.ensureSession().then(() => {
   return win.leap
    .getStyleInformation(styleCodes)
    .then((result: any) => {
     console.log('[Controller] getStyleInformation result:', result);
     return result;
    })
    .catch((err: any) => {
     console.error('[Controller] getStyleInformation failed:', err);
     throw err;
    });
  });
 }

 /**
  * Look up body color (Hex/CMYK/RGB) by code from COLOR_CODE_LOOKUP.xlsx (same folder as Styles.xlsx).
  */
 getColorByCodeFromLookup(colorCode: string): Promise<{
  success: boolean;
  color?: {
   hex: string;
   colorName: string;
   cmyk: { c: number; m: number; y: number; k: number };
   rgb: { r: number; g: number; b: number };
  };
  error?: string;
 }> {
  const win = window as any;
  if (!win.leap) {
   return Promise.reject(new Error('leap not available'));
  }
  return this.ensureSession().then(() => win.leap.getColorByCodeFromLookup(colorCode));
 }

 removeSeparationData(): Promise<any> {
  this.log('removeSeparationData called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleRemoveSeparationData', {})
    .then((res: string) => {
     try {
      return JSON.parse(res);
     } catch (parseErr) {
      console.error('removeSeparationData: failed to parse response', res, parseErr);
      return { success: false, error: 'Invalid response from host', raw: res };
     }
    })
    .catch((err: any) => {
     console.error('removeSeparationData: host call failed', err);
     const message = err?.message || err?.toString?.() || 'Unknown error';
     return { success: false, error: message, rawError: err };
    });
  });
 }

 performSeparation(
  graphicName: string,
  styleCodes: string[] = [],
  profileMetadata: any = null,
  options?: { recreateInActiveDoc?: boolean }
 ): Promise<any> {
  this.log(
   'performSeparation called for: ' +
   graphicName +
   (options?.recreateInActiveDoc ? ' (recreate in active doc)' : '')
  );

  return this.ensureSession().then(() => {
   const params: any = {
    graphicName: graphicName,
    styleCodes: styleCodes,
    profileMetadata: profileMetadata
   };
   if (options?.recreateInActiveDoc === true) {
    params.recreateInActiveDoc = true;
   }

   return (window as any).leap
    .scriptLoader()
    .evalScript('handlePerformSeparation', params)
    .then((res: string) => {
     const result = JSON.parse(res);

     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 /**
  * Recreate plates in the active (separated) document.
  * Call after deleteAllPlatesInSeparationDoc when the user clicks "Recreate All Plates".
  */
 recreatePlatesInActiveDocument(
  graphicName: string,
  cleanup?: { deleteUnpaintedPaths: boolean; deleteLeftoverPaths: boolean }
 ): Promise<any> {
  return this.ensureSession().then(() => {
   const params: Record<string, unknown> = { graphicName };
   if (cleanup) {
    params['deleteUnpaintedPaths'] = cleanup.deleteUnpaintedPaths === true;
    params['deleteLeftoverPaths'] = cleanup.deleteLeftoverPaths === true;
   }
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleRecreatePlatesInActiveDocument', params)
    .then((res: string) => {
     const result = JSON.parse(res);
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 selectAndSaveLeapSettings(): Promise<any> {
  this.log('selectAndSaveLeapSettings called');

  return new Promise((resolve) => {
   const cep = (window as any).cep;
   if (!cep || !cep.fs) {
    resolve({ success: false, error: 'CEP FS not available' });
    return;
   }

   const result = cep.fs.showOpenDialog(false, true, 'Select LEAP Server Data Folder', null);
   if (result.err !== 0) {
    resolve({ success: false, error: 'Error opening dialog: ' + result.err });
    return;
   }

   if (result.data && result.data.length > 0) {
    let selectedPath = result.data[0];

    // Sanitize path as requested (remove file:// prefix and decode)
    if (selectedPath.startsWith('file://')) {
     selectedPath = selectedPath.replace(/^file:\/\//, '');
    }
    selectedPath = decodeURI(selectedPath);
    const os = (window as any).cep_node.require('os');
    const path = (window as any).cep_node.require('path');
    const homeDir = os.homedir();
    const settingsFolder = path.join(homeDir, 'Documents', 'LEAP Settings');
    const settingsFile = path.join(settingsFolder, 'logobaseDataPathSettings.json');

    // Try to create directory if it doesn't exist
    const mkdirResult = cep.fs.makedir(settingsFolder);
    if (mkdirResult.err !== 0 && mkdirResult.err !== 17) {
     console.warn(
      'Failed to create settings directory, trying to write anyway...',
      mkdirResult.err
     );
    }

    const data = {
     basePath: selectedPath
    };

    const writeResult = cep.fs.writeFile(settingsFile, JSON.stringify(data, null, 4));
    if (writeResult.err === 0) {
     resolve({ success: true, path: selectedPath, pathChanged: true });
    } else {
     resolve({ success: false, error: 'Error writing settings file: ' + writeResult.err });
    }
   } else {
    resolve({ success: false, cancelled: true });
   }
  });
 }

 getLeapServerDataPath(): Promise<string> {
  return new Promise((resolve) => {
   const cep = (window as any).cep;
   if (!cep || !cep.fs) {
    resolve('');
    return;
   }

   const os = (window as any).cep_node.require('os');
   const path = (window as any).cep_node.require('path');
   const homeDir = os.homedir();
   const settingsFile = path.join(
    homeDir,
    'Documents',
    'LEAP Settings',
    'logobaseDataPathSettings.json'
   );

   const result = cep.fs.readFile(settingsFile);
   if (result.err === 0) {
    try {
     const data = JSON.parse(result.data);
     resolve(data.basePath || '');
    } catch (e) {
     console.error('Error parsing settings file', e);
     resolve('');
    }
   } else {
    // File doesn't exist or error reading
    resolve('');
   }
  });
 }

 loadGeneralSettings(): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
   const cep = (window as any).cep;
   if (!cep || !cep.fs) {
    resolve({
     success: true,
     data: {
      defaultMesh: '110',
      addUnderbase: true,
      artistName: '',
      artistInitials: '',
      ppdName: 'IBlock v2',
      chokeStrokeColorSwatch: '',
      koDarkColorNames: 'Black, PANTONE PROCESS BLACK C'
     }
    });
    return;
   }

   const os = (window as any).cep_node.require('os');
   const path = (window as any).cep_node.require('path');
   const homeDir = os.homedir();
   const settingsFolder = path.join(homeDir, 'Documents', 'LEAP Settings', 'LEAP_Seps');
   const settingsFile = path.join(settingsFolder, 'general_Settings.json');

   const result = cep.fs.readFile(settingsFile);
   if (result.err === 0) {
    try {
     const data = JSON.parse(result.data);
     resolve({ success: true, data: data || {} });
    } catch (e) {
     console.error('Error parsing general settings file', e);
     resolve({
      success: true,
      data: {
       defaultMesh: '110',
       addUnderbase: true,
       artistName: '',
       artistInitials: '',
       ppdName: 'IBlock v2',
       chokeStrokeColorSwatch: '',
       koDarkColorNames: 'Black, PANTONE PROCESS BLACK C'
      }
     });
    }
   } else {
    resolve({
     success: true,
     data: {
      defaultMesh: '110',
      addUnderbase: true,
      artistName: '',
      artistInitials: '',
      ppdName: 'IBlock v2',
      chokeStrokeColorSwatch: '',
      koDarkColorNames: 'Black, PANTONE PROCESS BLACK C'
     }
    });
   }
  });
 }

 saveGeneralSettings(settings: {
  defaultMesh?: string;
  addUnderbase?: boolean;
  artistName?: string;
  artistInitials?: string;
  ppdName?: string;
  chokeStrokeColorSwatch?: string;
  koDarkColorNames?: string;
 }): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
   const cep = (window as any).cep;
   if (!cep || !cep.fs) {
    resolve({ success: true });
    return;
   }

   const os = (window as any).cep_node.require('os');
   const path = (window as any).cep_node.require('path');
   const homeDir = os.homedir();
   const settingsFolder = path.join(homeDir, 'Documents', 'LEAP Settings', 'LEAP_Seps');
   const settingsFile = path.join(settingsFolder, 'general_Settings.json');

   const mkdirResult = cep.fs.makedir(settingsFolder);
   if (mkdirResult.err !== 0 && mkdirResult.err !== 17) {
    resolve({ success: false, error: 'Failed to create settings directory' });
    return;
   }

   const writeResult = cep.fs.writeFile(settingsFile, JSON.stringify(settings, null, 2));
   if (writeResult.err === 0) {
    resolve({ success: true });
   } else {
    resolve({ success: false, error: 'Error writing settings file: ' + writeResult.err });
   }
  });
 }

 hasSession(): boolean {
  return (window as any).leap !== undefined;
 }

 private ensureSession(maxRetries: number = 50, delayMs: number = 100): Promise<void> {
  if (this.hasSession()) {
   return Promise.resolve();
  }

  return this.waitForSession(maxRetries, delayMs).catch(() => {
   return Promise.reject('No leap');
  });
 }

 private log(val: string): void { }

 private get name(): string {
  return 'Client Controller:: ';
 }

 async getSpotColorSwatches(): Promise<string[]> {
  const script = `
    function getSpotSwatchNames() {
      if (app.documents.length === 0) return "";

      var doc = app.activeDocument;
      var result = [];

      for (var i = 0; i < doc.swatches.length; i++) {
        var sw = doc.swatches[i];
        if (sw.color && sw.color.typename === "SpotColor") {
          result.push(sw.name);
        }
      }

      return result.join("|||");
    }

    getSpotSwatchNames();
  `;

  try {
   const result = (await evalScript(script)) as string;

   console.log('[RESULT: ', result);

   if (!result || result === 'undefined') return [];

   return result.split('|||'); // ✅ string[]
  } catch (err) {
   console.error('Failed to get spot swatches:', err);
   return [];
  }
 }

 async generateCompoundPlate(subLayerNames: string[], newLayerName: string, fillColorName: string) {
  const strifySublayerNames = JSON.stringify(subLayerNames);
  const script = `
function createCompoundPlate(subLayerNames, newLayerName, fillColorName) {
 if (!app.documents.length) {
  throw new Error('No document open');
 }

 var doc = app.activeDocument;
 var PARENT_LAYER_NAME = 'SEPARATED_ART';

 // ---------------- HELPERS ----------------

 function findLayerByName(layers, name) {
  for (var i = 0; i < layers.length; i++) {
   if (layers[i].name === name) return layers[i];
   var found = findLayerByName(layers[i].layers, name);
   if (found) return found;
  }
  return null;
 }

 function unlockItem(item) {
  try {
   item.locked = false;
   if (item.layer) item.layer.locked = false;
  } catch (e) {}
 }

 function applyFill(item, colorName) {
  try {
   var swatch = doc.swatches.getByName(colorName);
   var color = swatch.color;

   if (item.typename === 'PathItem') {
    item.filled = true;
    item.fillColor = color;
   } else if (item.typename === 'CompoundPathItem') {
     item.pathItems[0].filled = true;
     item.pathItems[0].fillColor = color;
   }
    else if(item.typename === 'GroupItem') {
     for (var i = 0; i < item.pageItems.length; i++) {
     applyFill(item.pageItems[i], colorName);
     }
    }
  } catch (e) {}
 }

 function duplicateCompoundPathSafe(compound, targetLayer) {
  unlockItem(compound);

  var newCompound = targetLayer.compoundPathItems.add();

  for (var i = 0; i < compound.pathItems.length; i++) {
   var p = compound.pathItems[i];
   unlockItem(p);
   p.duplicate(newCompound, ElementPlacement.PLACEATEND);
  }

  return newCompound;
 }

 function duplicateItemSafe(item, targetLayer) {
  unlockItem(item);
  try {
   return item.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
  } catch (e) {
   return null;
  }
 }

 function collectPageItems(layer, targetLayer) {
  layer.locked = false;
  layer.visible = true;

  // Page items
  for (var i = layer.pageItems.length - 1; i >= 0; i--) {
   var srcItem = layer.pageItems[i];
   unlockItem(srcItem);

   var dup = null;

   if (srcItem.typename === 'CompoundPathItem') {
    dup = duplicateCompoundPathSafe(srcItem, targetLayer);
   } else {
    dup = duplicateItemSafe(srcItem, targetLayer);
   }

   if (dup) {
    applyFill(dup, fillColorName);
   }
  }

  // Recurse sublayers
  for (var j = 0; j < layer.layers.length; j++) {
   collectPageItems(layer.layers[j], targetLayer);
  }
 }

 // ---------------- MAIN ----------------

 var parentLayer = findLayerByName(doc.layers, PARENT_LAYER_NAME);
 if (!parentLayer) {
  throw new Error('Parent layer not found: ' + PARENT_LAYER_NAME);
 }

 parentLayer.locked = false;
 parentLayer.visible = true;

 // Create compound layer
 var compoundLayer = parentLayer.layers.add();
 compoundLayer.name = newLayerName;
 compoundLayer.locked = false;
 compoundLayer.visible = true;
 compoundLayer.zOrder(ZOrderMethod.SENDTOBACK);

 // Process source layers
 for (var i = 0; i < subLayerNames.length; i++) {
  var srcLayer = findLayerByName(doc.layers, subLayerNames[i]);
  if (!srcLayer) continue;

  collectPageItems(srcLayer, compoundLayer);
 }

 return compoundLayer.name;
}

createCompoundPlate(${strifySublayerNames}, "${newLayerName}", "${fillColorName}");
  `;

  try {
   await evalScript(script);
  } catch (err) {
   console.error('Failed to get spot swatches:', err);
   //  return null;
  }
 }
}
