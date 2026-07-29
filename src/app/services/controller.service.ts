import { Injectable } from '@angular/core';
import { checkForJSXUpdates, csInterface, evalScript } from '../../libs/helper';
import { createGraphicFromSelection } from '../../lib/scripts/createGraphicFromSelection.script';
/* Standalone (non-LEAP) mode: read the LICENSING sheet from the active document to prefill the form. */
import { getLicensingInfoFromDocument } from '../../lib/scripts/getLicensingInfoFromDocument.script';
/* Standalone (non-LEAP) mode: export the current selection to a sibling ASSETS folder. */
import { exportSelectionToAssets } from '../../lib/scripts/exportSelectionToAssets.script';
/* Standalone (non-LEAP) mode: run the separation on the exported graphic. */
import { runStandaloneSeparation } from '../../lib/scripts/standaloneSeparation.script';
import { hasActiveDocument as hasHostActiveDocument } from '../../lib/scripts/hasActiveDocument.script';
import { getSelectionCount as getHostSelectionCount } from '../../lib/scripts/getSelectionCount.script';
import { LeapSepsLogService } from './leap-seps-log.service';

@Injectable({
 providedIn: 'root'
})
export class ControllerService {
 constructor(private leapSepsLog: LeapSepsLogService) {
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

 /** White spot swatches used as fills in a graphic's LIVE_ART GRAPHIC:* / SIZED_GRAPHICS art. */
 getGraphicsArtWhiteSwatches(
  graphicName?: string
 ): Promise<{ success: boolean; swatches: string[]; error?: string }> {
  this.log('getGraphicsArtWhiteSwatches called' + (graphicName ? ' for ' + graphicName : ''));

  return this.ensureSession().then(() => {
   const params = graphicName ? { graphicName } : {};
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleGetGraphicsArtWhiteSwatches', params)
    .then((res: string) => JSON.parse(res))
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getSelectionCount(): Promise<number> {
  if ((window as any).__adobe_cep__) {
   return getHostSelectionCount().catch(() => 0);
  }
  return this.ensureSession()
   .then(() => getHostSelectionCount())
   .catch(() => 0);
 }

 hasActiveIllustratorDocument(): Promise<boolean> {
  if ((window as any).__adobe_cep__) {
   return hasHostActiveDocument().catch(() => false);
  }
  return this.ensureSession()
   .then(() => hasHostActiveDocument())
   .catch(() => false);
 }

 createGraphicFromSelection(payload: {
  position: string;
  name: string;
  width: number;
  height: number;
 }): Promise<any> {
  this.log('createGraphicFromSelection called');

  const runCreate = () => {
   const graphicKey = this.resolveGraphicPositionAbbreviation(payload.position);
   return this.ensureSession().then(() =>
    createGraphicFromSelection({
     ...payload,
     graphicKey: graphicKey || payload.position
    })
   );
  };

  if (this.graphicPositionLookup.length > 0) {
   return runCreate();
  }

  return this.getGraphicPositionOptionsFromJson().then(() => runCreate());
 }

 /*
  * Standalone (non-LEAP) mode: read the LICENSING submission sheet from the active document so
  * the Standalone form can be prefilled on "+". Returns the raw label/value pairs (orgCode,
  * teamName, conceptCode, style, color, placement, …). Never throws — resolves to a
  * { success:false } shape on error so the form simply stays empty.
  */
 getLicensingInfo(): Promise<any> {
  this.log('getLicensingInfo called');
  return this.ensureSession()
   .then(() => getLicensingInfoFromDocument())
   .catch((err: any) => ({
    success: false,
    error: err?.message || 'Unknown error reading licensing info'
   }));
 }

 /*
  * Standalone (non-LEAP) mode: export the current selection to <activeDocFolder>/ASSETS/<name>.ai
  * and leave that exported document open. Does not modify the active document.
  */
 exportSelectionToAssets(payload: {
  teamCode?: string;
  styleCode?: string;
  position?: string;
 }): Promise<any> {
  this.log('exportSelectionToAssets called');
  return this.ensureSession().then(() => exportSelectionToAssets(payload));
 }

 /*
  * Standalone (non-LEAP) profile lookup that passes an explicit LEAP Data base path (resolved via
  * getLeapServerDataPath) to the leap bundle, avoiding the Node-side getServerBasePath() existsSync
  * gate that can fail on cold/cloud-synced drives. Returns { success, profileMap } / { success:false }.
  */
 getProfileNamesFromExcelAtPath(styleCodes: string[], basePath: string): Promise<any> {
  this.log('getProfileNamesFromExcelAtPath called');
  return this.ensureSession().then(() =>
   (window as any).leap.getProfileNamesFromExcelAtPath(styleCodes, basePath)
  );
 }

 /*
  * Standalone (non-LEAP) mode: run the separation on the exported ASSETS graphic. Reuses the loaded
  * separation engine via the inline script; writes to a flat SEPARATIONS folder next to ASSETS.
  */
 generateStandaloneSeparation(payload: {
  graphicName: string;
  styleCodes: string[];
  profileMetadata: any;
  jsonData: any;
  sepsTemplateFileName?: string;
  exportedFilePath: string;
 }): Promise<any> {
  this.log('generateStandaloneSeparation called');
  return this.ensureSession().then(() => runStandaloneSeparation(payload));
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

 reorderSeparatedArtLayers(orderedNames: string[]): Promise<any> {
  this.log('reorderSeparatedArtLayers called');

  return this.ensureSession().then(() => {
   const params = { orderedNames };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleReorderSeparatedArtLayers', params)
    .then((res: string) => {
     if (res == null || String(res).trim() === '') {
      return { success: false, error: 'Empty response from Illustrator for reorder' };
     }
     try {
      return JSON.parse(String(res));
     } catch (parseErr: any) {
      console.error('[Controller] reorderSeparatedArtLayers JSON.parse failed:', res, parseErr);
      return { success: false, error: 'Invalid JSON from Illustrator: ' + String(res).slice(0, 200) };
     }
    })
    .catch((err: any) => {
     console.error('[Controller] reorderSeparatedArtLayers evalScript failed:', err);
     throw err;
    });
  });
 }

 removeSeparationInkArtifacts(
  tryNames: string[],
  removeSublayer: boolean,
  removeSwatch: boolean
 ): Promise<any> {
  this.log('removeSeparationInkArtifacts called');

  return this.ensureSession().then(() => {
   const normalized = Array.isArray(tryNames)
    ? tryNames.map((n) => String(n || '').trim()).filter((n) => n.length > 0)
    : [];
   const params = {
    tryNames: normalized,
    inkSublayerName: normalized.length > 0 ? normalized[0] : '',
    removeSublayer: !!removeSublayer,
    removeSwatch: !!removeSwatch
   };
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleRemoveSeparationInkArtifacts', params)
    .then((res: string) => {
     if (res == null || String(res).trim() === '') {
      return { success: false, error: 'Empty response from Illustrator' };
     }
     try {
      return JSON.parse(String(res));
     } catch (parseErr: any) {
      console.error('[Controller] removeSeparationInkArtifacts JSON.parse failed:', res, parseErr);
      return { success: false, error: 'Invalid JSON from Illustrator: ' + String(res).slice(0, 200) };
     }
    })
    .catch((err: any) => {
     console.error('[Controller] removeSeparationInkArtifacts evalScript failed:', err);
     throw err;
    });
  });
 }

 showHostAlert(title: string, message: string): Promise<any> {
  this.log('showHostAlert called');

  return this.ensureSession().then(() => {
   const safeTitle = String(title || 'Alert').replace(/'/g, "\\'");
   const safeMessage = String(message || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
   const script = `
(function() {
  try {
    var alertTitle = '${safeTitle}';
    var alertMessage = '${safeMessage}';
    var win, windowResource;
    windowResource = "dialog { " +
      "orientation: 'column', " +
      "alignChildren: ['fill', 'top'], " +
      "preferredSize:[340, 120], " +
      "text: '" + alertTitle + "', " +
      "margins:15, " +
      "messageText: StaticText { text:" + JSON.stringify(alertMessage) + ", properties:{multiline:true} }, " +
      "bottomGroup: Group{ alignment:['center','center'], okButton: Button { text: 'OK', properties:{name:'ok'}, size: [75,24] } }" +
    "}";
    win = new Window(windowResource);
    win.bottomGroup.okButton.onClick = function () { win.close(); };
    win.show();
    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ success: false, error: e && e.message ? e.message : String(e) });
  }
})();
`;
   return evalScript(script).then((res: any) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
    } catch (_e) {
     return { success: false, error: 'Invalid response from host' };
    }
   });
  });
 }

 inspectSelectionForSeparationInk(): Promise<any> {
  this.log('inspectSelectionForSeparationInk called');

  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, canAdd: false, message: 'No active document found' });
    }

    var doc = app.activeDocument;
    var selection = doc.selection || [];
    if (!selection.length) {
      return JSON.stringify({ success: true, canAdd: false, reason: 'no-selection', message: 'Select at least one object first' });
    }

    var separatedArtLayer = null;
    try {
      separatedArtLayer = doc.layers.getByName('SEPARATED_ART');
    } catch (_e0) {}
    if (!separatedArtLayer) {
      return JSON.stringify({ success: false, canAdd: false, message: 'SEPARATED_ART layer not found' });
    }

    function normalizeName(name) {
      return String(name || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    }

    function collectExistingSublayerNames(layer, outArr) {
      for (var i = 0; i < layer.layers.length; i++) {
        var sub = layer.layers[i];
        outArr.push(sub.name);
        collectExistingSublayerNames(sub, outArr);
      }
    }

    var existingNames = [];
    collectExistingSublayerNames(separatedArtLayer, existingNames);

    function fillSpotNameFromPath(pathItem) {
      if (!pathItem || !pathItem.filled || !pathItem.fillColor) {
        return null;
      }
      var fc = pathItem.fillColor;
      if (fc.typename === 'SpotColor' && fc.spot && fc.spot.name) {
        return String(fc.spot.name);
      }
      return null;
    }

    function collectFillSpotNames(item, outArr) {
      if (!item) return;
      var type = item.typename;
      if (type === 'PathItem') {
        var name = fillSpotNameFromPath(item);
        if (name) outArr.push(name);
        return;
      }
      if (type === 'CompoundPathItem') {
        for (var c = 0; c < item.pathItems.length; c++) {
          collectFillSpotNames(item.pathItems[c], outArr);
        }
        return;
      }
      if (type === 'GroupItem') {
        for (var g = 0; g < item.pageItems.length; g++) {
          collectFillSpotNames(item.pageItems[g], outArr);
        }
        return;
      }
      if (type === 'TextFrame') {
        try {
          if (item.textRange && item.textRange.characterAttributes) {
            var textFill = item.textRange.characterAttributes.fillColor;
            if (textFill && textFill.typename === 'SpotColor' && textFill.spot && textFill.spot.name) {
              outArr.push(String(textFill.spot.name));
            }
          }
        } catch (_e1) {}
      }
    }

    var fillSpotNames = [];
    for (var s = 0; s < selection.length; s++) {
      collectFillSpotNames(selection[s], fillSpotNames);
    }

    if (!fillSpotNames.length) {
      return JSON.stringify({
        success: true,
        canAdd: false,
        reason: 'no-spot-fill',
        message: 'Select objects with same fill spot color to add to separation'
      });
    }

    var firstName = fillSpotNames[0];
    var normalizedFirst = normalizeName(firstName);
    for (var j = 1; j < fillSpotNames.length; j++) {
      if (normalizeName(fillSpotNames[j]) !== normalizedFirst) {
        return JSON.stringify({
          success: true,
          canAdd: false,
          reason: 'mixed-spot-fill',
          message: 'Select objects with same fill spot color to add to separation'
        });
      }
    }

    var alreadyExists = false;
    for (var e = 0; e < existingNames.length; e++) {
      if (normalizeName(existingNames[e]) === normalizedFirst) {
        alreadyExists = true;
        break;
      }
    }

    return JSON.stringify({
      success: true,
      canAdd: !alreadyExists,
      alreadyExists: alreadyExists,
      swatchName: firstName,
      reason: alreadyExists ? 'already-exists' : 'ok',
      message: alreadyExists ? (firstName + ' already exists in separation') : ''
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      canAdd: false,
      message: 'Failed to inspect selection: ' + (e && e.message ? e.message : String(e))
    });
  }
})();
`;

   return evalScript(script).then((res: any) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, canAdd: false, message: 'Empty response' };
    } catch (_e) {
     return { success: false, canAdd: false, message: 'Invalid response from host' };
    }
   });
  });
 }

 addSelectionToSeparationInk(inkName: string): Promise<any> {
  this.log('addSelectionToSeparationInk called for: ' + inkName);

  return this.ensureSession().then(() => {
   const safeInkName = String(inkName || '').replace(/'/g, "\\'");
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, message: 'No active document found' });
    }

    var doc = app.activeDocument;
    var selection = doc.selection || [];
    if (!selection.length) {
      return JSON.stringify({ success: false, message: 'No selection available' });
    }

    var targetInkName = '${safeInkName}';
    if (!targetInkName) {
      return JSON.stringify({ success: false, message: 'Invalid ink name' });
    }

    var separatedArtLayer = null;
    try {
      separatedArtLayer = doc.layers.getByName('SEPARATED_ART');
    } catch (_e0) {}
    if (!separatedArtLayer) {
      return JSON.stringify({ success: false, message: 'SEPARATED_ART layer not found' });
    }

    function normalizeName(name) {
      return String(name || '').replace(/\\s+/g, ' ').trim().toLowerCase();
    }

    function cmykToRgb(c, m, y, k) {
      c = c / 100;
      m = m / 100;
      y = y / 100;
      k = k / 100;
      var r = 255 * (1 - c) * (1 - k);
      var g = 255 * (1 - m) * (1 - k);
      var b = 255 * (1 - y) * (1 - k);
      return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
    }

    function rgbToHex(r, g, b) {
      function toHex(n) {
        var h = Math.round(n).toString(16);
        return h.length === 1 ? '0' + h : h;
      }
      return '#' + toHex(r) + toHex(g) + toHex(b);
    }

    function colorToHex(color) {
      if (!color) return null;
      try {
        if (color.typename === 'SpotColor' && color.spot && color.spot.color) {
          return colorToHex(color.spot.color);
        }
        if (color.typename === 'CMYKColor') {
          var rgbFromCmyk = cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
          return rgbToHex(rgbFromCmyk.r, rgbFromCmyk.g, rgbFromCmyk.b);
        }
        if (color.typename === 'RGBColor') {
          return rgbToHex(color.red, color.green, color.blue);
        }
        if (color.typename === 'GrayColor') {
          var g = Math.round((100 - color.gray) * 2.55);
          return rgbToHex(g, g, g);
        }
      } catch (_eColor) {}
      return null;
    }

    function findSubLayerByNormalizedName(parentLayer, normalizedName) {
      for (var i = 0; i < parentLayer.layers.length; i++) {
        var sub = parentLayer.layers[i];
        if (normalizeName(sub.name) === normalizedName) return sub;
      }
      return null;
    }

    var normalizedTarget = normalizeName(targetInkName);
    var targetLayer = findSubLayerByNormalizedName(separatedArtLayer, normalizedTarget);
    if (targetLayer) {
      return JSON.stringify({ success: false, message: targetInkName + ' already exists in separation' });
    }

    targetLayer = separatedArtLayer.layers.add();
    targetLayer.name = targetInkName;
    targetLayer.locked = false;
    targetLayer.visible = true;

    for (var i = selection.length - 1; i >= 0; i--) {
      try {
        var item = selection[i];
        item.locked = false;
        item.hidden = false;
        item.move(targetLayer, ElementPlacement.PLACEATBEGINNING);
      } catch (_e1) {}
    }

    doc.selection = null;
    app.redraw();

    var resolvedHex = null;
    try {
      var sw = doc.swatches.getByName(targetInkName);
      if (sw && sw.color) {
        resolvedHex = colorToHex(sw.color);
      }
    } catch (_e2) {}

    return JSON.stringify({
      success: true,
      inkName: targetInkName,
      hex: resolvedHex,
      message: 'Selection added to separation successfully'
    });
  } catch (e) {
    return JSON.stringify({
      success: false,
      message: 'Failed to add selection to separation: ' + (e && e.message ? e.message : String(e))
    });
  }
})();
`;

   return evalScript(script).then((res: any) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, message: 'Empty response' };
    } catch (_e) {
     return { success: false, message: 'Invalid response from host' };
    }
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

 private getProfileInkExceptionsFilePath(basePath: string): string {
  const path = (window as any).cep_node?.require('path');
  if (!path || !basePath) return '';
  const normalized = String(basePath).replace(/\/$/, '');
  return path.join(normalized, 'SETTINGS', 'LEAP_SEPS', 'Data', 'profile_ink_exceptions.json');
 }

 private inkJsonEntryToRow(entry: any, index: number): any | null {
  if (!entry || typeof entry !== 'object') return null;
  const inkColor = entry.Ink_Color != null ? String(entry.Ink_Color).trim() : '';
  const profile = entry.Profile != null ? String(entry.Profile).trim() : '';
  const meshRaw = entry.Color_Mesh;
  const mesh = meshRaw == null || meshRaw === '' ? '' : String(meshRaw).trim();
  /*
   * "Two Hits" is value-driven (no longer Y/N): any non-empty value (except N/No/False/0) means a
   * second hit is required. A numeric value is the second-hit mesh; a legacy Y/Yes carries no mesh.
   */
  const twoHitsRaw = entry.Two_Hits != null ? String(entry.Two_Hits).trim() : '';
  const twoHitsIsNegative = /^(n|no|false|0)$/i.test(twoHitsRaw);
  const hitsCount = twoHitsRaw !== '' && !twoHitsIsNegative ? 2 : 1;
  const secondHitMesh =
   /^(y|yes|true)$/i.test(twoHitsRaw) || twoHitsIsNegative ? '' : twoHitsRaw;
  let underbaseCount = entry.underbase_count != null ? parseInt(entry.underbase_count, 10) : 1;
  if (isNaN(underbaseCount) || underbaseCount < 1) underbaseCount = 1;
  if (underbaseCount > 4) underbaseCount = 4;
  const profileCode = entry.profileCode != null ? String(entry.profileCode).trim() : '';
  return {
   id: `ink-${profile}-${inkColor}-${index}`,
   enabled: true,
   inkName: inkColor,
   mesh,
   underbaseCount,
   hitsCount,
   secondHitMesh,
   printMethod: entry.Print_Method != null ? String(entry.Print_Method).trim() : '',
   profile,
   profileCode
  };
 }

 private inkRowToJsonEntry(row: any, profileName: string, profileCode: string): any {
  const inkColor = row?.inkName != null ? String(row.inkName).trim() : '';
  const enabled = row?.enabled !== false;
  const meshTrimmed = enabled && row?.mesh != null ? String(row.mesh).trim() : '';
  let colorMesh: string | number | null = null;
  if (meshTrimmed !== '') {
   const numeric = parseFloat(meshTrimmed);
   colorMesh = isNaN(numeric) ? meshTrimmed : numeric;
  }
  let hitsCount = enabled && row?.hitsCount != null ? parseInt(row.hitsCount, 10) : 1;
  if (isNaN(hitsCount) || hitsCount < 1) hitsCount = 1;
  /*
   * "Two Hits" now stores the raw second-hit value: a numeric mesh means a second hit is required
   * (and is the second-hit mesh); '' means single hit. A legacy row with only hitsCount writes 'Y'.
   */
  const secondHitMeshTrimmed =
   enabled && row?.secondHitMesh != null ? String(row.secondHitMesh).trim() : '';
  const twoHitsValue =
   hitsCount >= 2 ? (secondHitMeshTrimmed !== '' ? secondHitMeshTrimmed : 'Y') : '';
  let underbaseCount = enabled && row?.underbaseCount != null ? parseInt(row.underbaseCount, 10) : 1;
  if (isNaN(underbaseCount) || underbaseCount < 1) underbaseCount = 1;
  if (underbaseCount > 4) underbaseCount = 4;
  /* Prefer the row's own profileCode/Profile (carried from the imported Excel), else the passed defaults. */
  const rowProfileCode =
   row?.profileCode != null && String(row.profileCode).trim() !== ''
    ? String(row.profileCode).trim()
    : (profileCode != null ? String(profileCode).trim() : '');
  const rowProfile =
   row?.profile != null && String(row.profile).trim() !== ''
    ? String(row.profile).trim()
    : profileName;
  return {
   Color_Mesh: colorMesh,
   Ink_Color: inkColor,
   Print_Method: row?.printMethod != null ? String(row.printMethod).trim() : '',
   Profile: rowProfile,
   profileCode: rowProfileCode,
   Two_Hits: twoHitsValue,
   underbase_count: underbaseCount
  };
 }

 private profileMatchesInkEntry(entry: any, profileCodeKey: string): boolean {
  if (!entry || !profileCodeKey) return false;
  const entryCode = entry.profileCode != null ? String(entry.profileCode).trim().toUpperCase() : '';
  return entryCode !== '' && entryCode === profileCodeKey;
 }

 /**
  * Load ink exceptions for one separation profile (matched by unique profileCode).
  */
 getInkExceptions(profileCode: string, profileName?: string): Promise<any> {
  this.log('getInkExceptions called for code: ' + profileCode);

  return this.getLeapServerDataPath().then((basePath) => {
   if (!basePath || !String(basePath).trim()) {
    return {
     success: false,
     error: 'LEAP Data folder path is not set. Set it under General Settings → Data Folder Path.'
    };
   }

   const cep = (window as any).cep;
   const fs = (window as any).cep_node?.require('fs');
   if (!cep || !fs) {
    return this.ensureSession().then(() => {
     const params = {
      profileCode: profileCode || '',
      profileName: profileName || ''
     };
     return (window as any).leap
      .scriptLoader()
      .evalScript('handleGetInkExceptions', params)
      .then((res: any) => this.parseHostJsonResult(res));
    });
   }

   try {
    const filePath = this.getProfileInkExceptionsFilePath(basePath);
    if (!filePath || !fs.existsSync(filePath)) {
     return { success: true, inkExceptions: [] };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const allEntries = JSON.parse(content);
    if (!Array.isArray(allEntries)) {
     return { success: false, error: 'profile_ink_exceptions.json does not contain an array' };
    }

    const codeKey = profileCode != null ? String(profileCode).trim().toUpperCase() : '';
    if (!codeKey) {
     return { success: true, inkExceptions: [] };
    }

    const rows: any[] = [];
    for (let i = 0; i < allEntries.length; i++) {
     const entry = allEntries[i];
     if (!this.profileMatchesInkEntry(entry, codeKey)) continue;
     const row = this.inkJsonEntryToRow(entry, i);
     if (row) rows.push(row);
    }
    return { success: true, inkExceptions: rows };
   } catch (err: any) {
    return {
     success: false,
     error: err?.message || String(err) || 'Failed to read profile_ink_exceptions.json'
    };
   }
  });
 }

 /**
  * Distinct profileCodes / profileNames present in profile_ink_exceptions.json (UPPERCASE).
  * Used by the Separations page to flag profiles whose ink information has not been imported.
  */
 getInkExceptionProfileCodes(): Promise<{ success: boolean; profileCodes: string[]; profileNames: string[]; error?: string }> {
  return this.getLeapServerDataPath().then((basePath) => {
   if (!basePath || !String(basePath).trim()) {
    return { success: false, profileCodes: [], profileNames: [] };
   }
   const fs = (window as any).cep_node?.require('fs');
   if (!fs) {
    /* Non-CEP (browser/dev): the Separations page guards this behind isRunningInBrowser. */
    return { success: true, profileCodes: [], profileNames: [] };
   }
   try {
    const filePath = this.getProfileInkExceptionsFilePath(basePath);
    if (!filePath || !fs.existsSync(filePath)) {
     return { success: true, profileCodes: [], profileNames: [] };
    }
    const allEntries = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(allEntries)) {
     return { success: false, profileCodes: [], profileNames: [], error: 'profile_ink_exceptions.json does not contain an array' };
    }
    const codeSet: { [key: string]: true } = {};
    const nameSet: { [key: string]: true } = {};
    for (let i = 0; i < allEntries.length; i++) {
     const entry = allEntries[i];
     const code = entry && entry.profileCode != null ? String(entry.profileCode).trim().toUpperCase() : '';
     const name = entry && entry.Profile != null ? String(entry.Profile).trim().toUpperCase() : '';
     if (code) codeSet[code] = true;
     if (name) nameSet[name] = true;
    }
    return { success: true, profileCodes: Object.keys(codeSet), profileNames: Object.keys(nameSet) };
   } catch (err: any) {
    return { success: false, profileCodes: [], profileNames: [], error: err?.message || String(err) };
   }
  });
 }

 /**
  * Let the user pick an Excel/CSV from their own system and parse it into ink-exception rows.
  * Columns are matched case-insensitively (Ink Name / Mesh / Underbase Count / Hits / Print Method).
  * Returns { success, rows, filePath } or { canceled: true } when the picker is dismissed.
  */
 importInkExceptionsFromExcel(): Promise<{ success: boolean; rows?: any[]; filePath?: string; error?: string; canceled?: boolean }> {
  return new Promise((resolve) => {
   try {
    const cep = (window as any).cep;
    if (!cep || !cep.fs) {
     resolve({ success: false, error: 'File system not available' });
     return;
    }
    /* File picker (not a folder); filter to spreadsheet types where supported. */
    const dialog = cep.fs.showOpenDialog(false, false, 'Select Ink Exceptions Excel', null, ['xlsx', 'xls', 'csv']);
    if (!dialog || dialog.err !== 0) {
     resolve({ success: false, error: 'Could not open file dialog (' + (dialog ? dialog.err : 'no response') + ')' });
     return;
    }
    if (!dialog.data || dialog.data.length === 0) {
     resolve({ success: false, canceled: true });
     return;
    }
    let filePath = String(dialog.data[0] || '');
    if (filePath.indexOf('file://') === 0) {
     try { filePath = decodeURIComponent(filePath.replace('file://', '')); } catch (_) { filePath = filePath.replace('file://', ''); }
    }
    /*
     * Read the Excel through the leap bundle (window.leap.readExcelRows). The `xlsx` module is
     * webpacked into the bundle, so it is NOT resolvable via cep_node.require('xlsx') from here.
     */
    const leap = (window as any).leap;
    if (!leap || typeof leap.readExcelRows !== 'function') {
     resolve({ success: false, error: 'Excel reader unavailable — rebuild the LEAP bundle (npm run build-and-setup).' });
     return;
    }
    Promise.all([
     Promise.resolve(leap.readExcelRows(filePath)),
     this.getSeparationProfiles().catch(() => null)
    ])
     .then(([read, profilesResult]: any[]) => {
      if (!read || !read.success) {
       resolve({ success: false, error: (read && read.error) || 'Failed to read the selected file' });
       return;
      }
      let rows = this.mapInkExceptionExcelRows(Array.isArray(read.rows) ? read.rows : []);
      /*
       * The authoritative profileCode comes from Profiles.json, matched by the Excel's Profile NAME —
       * so the Excel no longer needs a Profile Code column. This keeps imported exceptions keyed by the
       * real code (e.g. FAN_PLST, JER_WB) that the app matches on.
       */
      rows = this.applyProfileCodesFromProfilesJson(rows, profilesResult);
      if (rows.length === 0) {
       resolve({ success: false, error: 'No ink rows found. Expected a header row with an "Ink Name" (or "Ink") column.' });
       return;
      }
      resolve({ success: true, rows, filePath });
     })
     .catch((e: any) => resolve({ success: false, error: e?.message || String(e) }));
   } catch (e: any) {
    resolve({ success: false, error: e?.message || String(e) });
   }
  });
 }

 /* Map raw spreadsheet objects (keyed by header) to ink-exception rows with flexible header names. */
 private mapInkExceptionExcelRows(raw: any[]): any[] {
  const pick = (obj: any, keys: string[]): string => {
   const lowerMap: any = {};
   Object.keys(obj || {}).forEach((k) => {
    lowerMap[String(k).trim().toLowerCase()] = obj[k];
   });
   for (const key of keys) {
    const v = lowerMap[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
   }
   return '';
  };
  /*
   * Count filled "WUB Mesh 1".."WUB Mesh 4" columns (the underbase passes in the Inks.xlsx layout)
   * so the underbase count is derived when there is no explicit numeric underbase column.
   */
  const countWubMeshColumns = (obj: any): number => {
   const lowerMap: any = {};
   Object.keys(obj || {}).forEach((k) => {
    lowerMap[String(k).trim().toLowerCase()] = obj[k];
   });
   let n = 0;
   for (let i = 1; i <= 4; i++) {
    const v = lowerMap['wub mesh ' + i];
    if (v != null && String(v).trim() !== '') n++;
   }
   return n;
  };
  const out: any[] = [];
  for (const r of raw) {
   if (!r || typeof r !== 'object') continue;
   /* Ink identifier — supports the Inks.xlsx header ("Ink Color") and the raw source headers. */
   const inkName = pick(r, [
    'ink name', 'ink', 'ink_color', 'inkcolor', 'ink color', 'color', 'colour',
    'pantone', 'pantone color', 'csi color'
   ]);
   if (!inkName) continue;
   /* Mesh — includes the Inks.xlsx "Color Mesh" and the source "HSWB MESH". */
   const mesh = pick(r, ['mesh', 'mesh count', 'mesh_count', 'color mesh', 'hswb mesh']);
   const ubRaw = pick(r, ['underbase count', 'underbase', 'underbase_count', 'underbases', 'ub count']);
   /* Hits — numeric column, or the Inks.xlsx "Two Hits" (Y/N) flag. */
   const hitsRaw = pick(r, ['hits count', 'hits', 'hit', 'hits_count', 'no of hits', 'number of hits', 'two hits']);
   const printMethod = pick(r, ['print method', 'method', 'print_method', 'printmethod']);
   /* profileCode comes from the Excel and is kept on every JSON entry so exceptions load per profile. */
   const profileCodeRaw = pick(r, ['profilecode', 'profile code', 'profile_code', 'code']);
   const profileRaw = pick(r, ['profile', 'profile name', 'profile_name']);
   /* Garment/substrate type (Cotton/Poly/Jersey) — used to build a profile code from Profile + Type. */
   const typeRaw = pick(r, ['type', 'garment', 'garment type', 'substrate', 'material', 'fabric']);
   /*
    * Effective profile code: an explicit profileCode column wins; otherwise derive it from the
    * ProfileName + Type combo (e.g. "Fanatics-Plastisol" + "Cotton" -> "Fanatics-Plastisol_Cotton").
    */
   const effectiveProfileCode =
    profileCodeRaw !== ''
     ? profileCodeRaw
     : profileRaw !== ''
      ? typeRaw !== ''
       ? profileRaw + '_' + typeRaw
       : profileRaw
      : '';
   const enabledRaw = pick(r, ['enabled', 'active']);

   /* Underbase count: explicit numeric column first, otherwise the number of filled WUB Mesh columns. */
   let underbaseCount = 1;
   const ubNum = parseInt(ubRaw, 10);
   if (!isNaN(ubNum)) {
    underbaseCount = Math.max(1, Math.min(4, ubNum));
   } else {
    const wubCount = countWubMeshColumns(r);
    if (wubCount > 0) underbaseCount = Math.max(1, Math.min(4, wubCount));
   }

   /*
    * Second hit is driven by the PRESENCE of a value in "Two Hits": empty -> single hit; any value
    * (except N/No/False/0) -> second hit. A numeric value is the second-hit mesh; a legacy Y/Yes has none.
    */
   const hitsValue = String(hitsRaw == null ? '' : hitsRaw).trim();
   const hitsIsNegative = /^(n|no|false|0)$/i.test(hitsValue);
   const hitsHasValue = hitsValue !== '' && !hitsIsNegative;
   const hitsCount = hitsHasValue ? 2 : 1;
   const secondHitMesh = /^(y|yes|true)$/i.test(hitsValue) ? '' : (hitsHasValue ? hitsValue : '');

   out.push({
    inkName,
    mesh,
    underbaseCount,
    hitsCount,
    secondHitMesh,
    printMethod,
    profileCode: effectiveProfileCode,
    profile: profileRaw,
    type: typeRaw,
    enabled: enabledRaw === '' ? true : /^(y|yes|true|1|enabled|active|on)$/i.test(enabledRaw)
   });
  }
  return out;
 }

 /*
  * Overwrite each imported row's profileCode with the code from Profiles.json, matched by the Excel's
  * Profile NAME (case-insensitive; unicode dashes and whitespace normalized the same way the app's
  * profile lookup does). The Excel only needs a Profile name column — the authoritative code
  * (e.g. FAN_PLST, JER_WB) lives in Profiles.json. Falls back to a code match, then to whatever the row
  * already carried, so nothing breaks when a profile isn't found.
  */
 private applyProfileCodesFromProfilesJson(rows: any[], profilesResult: any): any[] {
  const profiles =
   profilesResult && profilesResult.success && Array.isArray(profilesResult.profiles)
    ? profilesResult.profiles
    : Array.isArray(profilesResult)
     ? profilesResult
     : [];
  if (!Array.isArray(rows) || rows.length === 0 || profiles.length === 0) {
   return rows;
  }
  const norm = (v: any) =>
   String(v == null ? '' : v)
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  const codeByName = new Map<string, string>();
  const codeByCode = new Map<string, string>();
  for (const pf of profiles) {
   if (!pf) continue;
   const nameKey = norm(
    pf['Profile Name'] != null ? pf['Profile Name'] : pf.profileName != null ? pf.profileName : pf.name
   );
   const codeRaw =
    pf['Profile Code'] != null ? pf['Profile Code'] : pf.profileCode != null ? pf.profileCode : pf.code;
   const code = codeRaw != null ? String(codeRaw).trim() : '';
   if (code === '') continue;
   if (nameKey) codeByName.set(nameKey, code);
   codeByCode.set(norm(code), code);
  }
  return rows.map((r) => {
   if (!r || typeof r !== 'object') return r;
   const resolved =
    codeByName.get(norm(r.profile)) ||
    codeByCode.get(norm(r.profileCode)) ||
    (r.profileCode != null ? String(r.profileCode) : '');
   return { ...r, profileCode: resolved };
  });
 }

 saveInkExceptions(profileCode: string, inkRows: any[], profileName?: string): Promise<any> {
  this.log('saveInkExceptions called for code: ' + profileCode);

  return this.getLeapServerDataPath().then((basePath) => {
   if (!basePath || !String(basePath).trim()) {
    return {
     success: false,
     error: 'LEAP Data folder path is not set. Set it under General Settings → Data Folder Path.'
    };
   }

   const cep = (window as any).cep;
   const fs = (window as any).cep_node?.require('fs');
   if (!cep || !fs) {
    return this.ensureSession().then(() => {
     const params = {
      profileCode: profileCode || '',
      profileName: profileName || '',
      inkRows: inkRows || []
     };
     return (window as any).leap
      .scriptLoader()
      .evalScript('handleSaveInkExceptions', params)
      .then((res: any) => this.parseHostJsonResult(res));
    });
   }

   try {
    const filePath = this.getProfileInkExceptionsFilePath(basePath);
    if (!filePath) {
     return { success: false, error: 'Could not resolve profile_ink_exceptions.json path' };
    }

    let allEntries: any[] = [];
    if (fs.existsSync(filePath)) {
     const content = fs.readFileSync(filePath, 'utf8');
     const parsed = JSON.parse(content);
     allEntries = Array.isArray(parsed) ? parsed : [];
    }

    const codeKey = profileCode != null ? String(profileCode).trim().toUpperCase() : '';
    if (!codeKey) {
     return { success: false, error: 'Profile code is required to save ink exceptions' };
    }

    const remaining = allEntries.filter((entry) => !this.profileMatchesInkEntry(entry, codeKey));

    let defaultPrintMethod = '';
    for (let i = 0; i < allEntries.length; i++) {
     const sample = allEntries[i];
     if (this.profileMatchesInkEntry(sample, codeKey) && sample?.Print_Method) {
      defaultPrintMethod = String(sample.Print_Method).trim();
      break;
     }
    }

    const updatedProfileEntries: any[] = [];
    for (const row of inkRows || []) {
     if (!row) continue;
     const inkName = row.inkName != null ? String(row.inkName).trim() : '';
     if (!inkName) continue;
     const rowWithMethod = {
      ...row,
      printMethod:
       row.printMethod != null && String(row.printMethod).trim() !== ''
        ? String(row.printMethod).trim()
        : defaultPrintMethod
     };
     updatedProfileEntries.push(
      this.inkRowToJsonEntry(rowWithMethod, profileName || '', profileCode)
     );
    }

    const merged = remaining.concat(updatedProfileEntries);
    const dir = (window as any).cep_node.require('path').dirname(filePath);
    if (!fs.existsSync(dir)) {
     fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf8');
    return { success: true, message: 'Ink exceptions saved successfully' };
   } catch (err: any) {
    return {
     success: false,
     error: err?.message || String(err) || 'Failed to save profile_ink_exceptions.json'
    };
   }
  });
 }

 private parseHostJsonResult(res: any): any {
  if (res == null) return { success: false, error: 'Empty response from host' };
  if (typeof res === 'object') return res;
  if (typeof res !== 'string') return { success: false, error: String(res) };
  const trimmed = res.trim();
  if (!trimmed) return { success: false, error: 'Empty response from host' };
  try {
   return JSON.parse(trimmed);
  } catch {
   return { success: false, error: trimmed };
  }
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
		(function() {
		function duplicateSeparatedArtLayer(sourceLayerName, newNameLayer) {
		  var doc = app.activeDocument;
		  var debug = {
			sourceLayerName: sourceLayerName,
			newLayerName: newNameLayer,
			targetSwatchFound: false,
			targetSpotFound: false,
			fillAssignments: 0,
			strokeAssignments: 0,
			textFillAssignments: 0,
			textStrokeAssignments: 0
		  };
	
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

		  function getSwatchByName(name) {
        try {
          return doc.swatches.getByName(name);
        } catch (e) {
          return null;
        }
		  }

		  function duplicateSpotSwatchIfNeeded(sourceName, targetName) {
      var sourceSwatch = getSwatchByName(sourceName);
      var targetSwatch = doc.spots.add();
      targetSwatch.name = targetName;
      targetSwatch.colorType = ColorModel.SPOT;
      targetSwatch.color = sourceSwatch.color.spot.color;
      return targetSwatch;
		  }

		  var targetSwatch = duplicateSpotSwatchIfNeeded(sourceLayerName, newNameLayer);
		  

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

		  // Simpler recolor flow: select all items in duplicated layer, then apply target swatch.
    try{
		  app.activeDocument.selection = null;
    app.redraw();
      app.activeDocument.activeLayer = newLayer;
      app.activeDocument.activeLayer.hasSelectedArtwork = true;
      app.redraw();
      var newColor = app.activeDocument.swatches.getByName(newNameLayer).color;
      var selectedItems = app.activeDocument.selection || [];

      function applyColorToItem(item, color) {
        if (!item || !color) return;
        try {
          if (item.typename === 'PathItem') {
            if (item.filled) {
              item.fillColor = color;
            }
            if (item.stroked) {
              item.strokeColor = color;
            }
            return;
          }
          if (item.typename === 'CompoundPathItem') {
            for (var cp = 0; cp < item.pathItems.length; cp++) {
              applyColorToItem(item.pathItems[cp], color);
            }
            return;
          }
          if (item.typename === 'GroupItem') {
            for (var gi = 0; gi < item.pageItems.length; gi++) {
              applyColorToItem(item.pageItems[gi], color);
            }
            return;
          }
          if (item.typename === 'TextFrame' && item.textRange && item.textRange.characterAttributes) {
            try { item.textRange.characterAttributes.fillColor = color; } catch (_e1) {}
            try { item.textRange.characterAttributes.strokeColor = color; } catch (_e2) {}
          }
        } catch (_e) {}
      }

      for (var si = 0; si < selectedItems.length; si++) {
        applyColorToItem(selectedItems[si], newColor);
      }
		  app.redraw();
      app.activeDocument.selection = null;
	}catch(e){
 alert('Error: ' + e.message);
	}
		  // layers.add() puts the new sublayer at the top of SEPARATED_ART; keep stack aligned with panel order (after source plate).
		  try {
		    newLayer.move(sourceLayer, ElementPlacement.PLACEAFTER);
		  } catch (moveErr) {}
		  return JSON.stringify({ success: true, debug: debug });
		}

		try {
		  return duplicateSeparatedArtLayer('${safeSource}', '${safeNew}');
		} catch (e) {
		  return JSON.stringify({ success: false, error: e && e.message ? e.message : String(e) });
		}
		})();
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

 getBatchRowVariableSource(teamCode: string, documentPath?: string): Promise<any> {
  this.log('getBatchRowVariableSource called for team: ' + teamCode);

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getBatchRowVariableSource(teamCode, documentPath)
    .then((result: any) => result)
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

 getStylesCatalogFromExcel(): Promise<any> {
  this.log('getStylesCatalogFromExcel called');
  return this.ensureSession().then(async () => {
   const leapServerPath = await this.getLeapServerDataPath();
   return (window as any).leap
    .getStylesCatalogFromExcel(leapServerPath || '')
    .then((result: any) => result)
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getGraphicPlacementOptions(teamCode?: string, documentPath?: string): Promise<any> {
  this.log('getGraphicPlacementOptions called');
  console.log(
   '[Separations] getGraphicPlacementOptions – teamCode:',
   teamCode ?? '(missing)',
   '| documentPath:',
   documentPath ?? '(missing)'
  );

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getGraphicPlacementOptions(documentPath, teamCode)
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 private graphicPositionLookup: Array<{ desc: string; abbv: string }> = [];

 getGraphicPositionOptionsFromJson(): Promise<{
  success: boolean;
  placements: string[];
  /*
   * Full DESC/ABBV entries parsed from graphic_positions.json. Consumers that
   * need the abbreviations (e.g. the export settings "Positions" chips) read
   * this instead of `placements`, which only carries the descriptions.
   */
  entries?: Array<{ desc: string; abbv: string }>;
  error?: string;
 }> {
  return this.getLeapServerDataPath().then((basePath) => {
   const cep = (window as any).cep;
   if (!cep || !cep.fs || !basePath) {
    this.graphicPositionLookup = [];
    return { success: false, placements: [], error: 'Server base path not configured' };
   }

   const path = (window as any).cep_node.require('path');
   const normalizedBasePath = String(basePath).replace(/\/$/, '');
   const lookupPath = path.join(normalizedBasePath, 'SETTINGS', 'graphic_positions.json');
   const result = cep.fs.readFile(lookupPath);
   if (result.err !== 0) {
    this.graphicPositionLookup = [];
    return { success: false, placements: [], error: 'graphic_positions.json not found' };
   }

   try {
    const parsed = JSON.parse(result.data);
    if (!Array.isArray(parsed)) {
     this.graphicPositionLookup = [];
     return { success: false, placements: [], error: 'Invalid graphic_positions.json format' };
    }

    const entries: Array<{ desc: string; abbv: string }> = [];
    parsed.forEach((entry: any) => {
     if (!entry) return;
     const desc = String(
      entry.DESC != null ? entry.DESC : entry.desc != null ? entry.desc : ''
     ).trim();
     const abbv = String(
      entry.ABBV != null ? entry.ABBV : entry.abbv != null ? entry.abbv : ''
     ).trim();
     if (desc) {
      entries.push({ desc, abbv: abbv || desc });
     }
    });

    this.graphicPositionLookup = entries;
    const placements = this.uniqueNonEmptyStrings(entries.map((entry) => entry.desc)).sort((a, b) =>
     a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    return { success: true, placements, entries };
   } catch (error: any) {
    this.graphicPositionLookup = [];
    return {
     success: false,
     placements: [],
     error: error?.message || 'Failed to parse graphic_positions.json'
    };
   }
  });
 }

 resolveGraphicPositionAbbreviation(positionDesc: string): string {
  const original = String(positionDesc || '').trim();
  if (!original) return '';

  const target = original.toLowerCase();
  for (const entry of this.graphicPositionLookup) {
   if (entry.desc.toLowerCase() === target) {
    return entry.abbv || entry.desc;
   }
  }

  return original;
 }

 saveGraphicsData(
  graphicsData: any[],
  underbaseSwatches?: string | { underbase2Swatch?: string; underbase3Swatch?: string; underbase4Swatch?: string }
 ): Promise<any> {
  this.log('saveGraphicsData called with ' + graphicsData.length + ' graphics');

  let ub2 = '';
  let ub3 = '';
  let ub4 = '';
  if (typeof underbaseSwatches === 'string') {
   ub2 = underbaseSwatches;
   ub3 = underbaseSwatches;
   ub4 = underbaseSwatches;
  } else if (underbaseSwatches) {
   ub2 = underbaseSwatches.underbase2Swatch || '';
   ub3 = underbaseSwatches.underbase3Swatch || '';
   ub4 = underbaseSwatches.underbase4Swatch || '';
  }

  return this.ensureSession().then(() => {
   const params = {
    graphicsData: graphicsData,
    underbase2Swatch: ub2,
    underbase3Swatch: ub3,
    underbase4Swatch: ub4
   };
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

 deleteSeparationFile(params: {
  graphicName: string;
  profileName: string;
  filePath?: string;
 }): Promise<any> {
  this.log('deleteSeparationFile called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleDeleteSeparationFile', params)
    .then((res: string) => {
     return JSON.parse(res);
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 updateSeparationProfileDataEntry(params: {
  graphicName: string;
  matchProfileName: string;
  profileName: string;
  styleCodes: string[];
  profileCode?: string | null;
  duplicateAiFile?: boolean;
  scaleEnabled?: boolean;
  scalePercent?: number | null;
 }): Promise<any> {
  this.log('updateSeparationProfileDataEntry called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleUpdateSeparationProfileDataEntry', params)
    .then((res: string) => {
     return JSON.parse(res);
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 addSeparationProfileDataEntry(params: {
  graphicName: string;
  profileName: string;
  styleCodes: string[];
  profileCode?: string | null;
 }): Promise<any> {
  this.log('addSeparationProfileDataEntry called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleAddSeparationProfileDataEntry', params)
    .then((res: string) => JSON.parse(res))
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

 getProfileCodeFromName(
  profileName: string,
  options?: { distress?: boolean | string }
 ): Promise<any> {
  this.log('getProfileCodeFromName called for: ' + profileName);

  return this.ensureSession().then(() => {
   const params: { profileName: string; distress?: boolean | string } = { profileName };
   if (options && options.distress !== undefined && options.distress !== null) {
    params.distress = options.distress;
   }
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

 deleteUbChokeBlockerArtInSeparationDoc(): Promise<any> {
  this.log('deleteUbChokeBlockerArtInSeparationDoc called');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleDeleteUbChokeBlockerArtInSeparationDocument', {})
    .then((res: string) => JSON.parse(res))
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

 private buildExportPathResolverScript(): string {
  return `
function getDefaultExportSettings() {
 return {
  printGuideFilePath: "",
  separationPreviewFilePath: "",
  postscriptFilePath: ""
 };
}

function parseExportJsonSafe(content) {
 try {
  if (!content || !content.length) return null;
  if (typeof JSON !== "undefined" && JSON.parse) return JSON.parse(content);
  return eval("(" + content + ")");
 } catch (e) {
  return null;
 }
}

function getExportSettingsPath() {
 var documentsFolder = Folder.myDocuments || new Folder("~/Documents");
 return documentsFolder.fsName + "/LEAP Settings/LEAP_Seps/export_settings.json";
}

function readExportSettings() {
 try {
  var settingsFile = new File(getExportSettingsPath());
  if (!settingsFile.exists) return getDefaultExportSettings();
  if (!settingsFile.open("r")) return getDefaultExportSettings();
  var content = settingsFile.read();
  settingsFile.close();
  var parsed = parseExportJsonSafe(content) || {};
  var defaults = getDefaultExportSettings();
  for (var key in parsed) {
   if (parsed.hasOwnProperty(key)) defaults[key] = parsed[key];
  }
  return defaults;
 } catch (e) {
  return getDefaultExportSettings();
 }
}

function trimExportString(value) {
 return String(value == null ? "" : value).replace(/^\\s+|\\s+$/g, "");
}

function normalizeExportLookupKey(str) {
 return String(str || "").toLowerCase().replace(/[\\s_#-]/g, "");
}

function setExportAlias(aliases, name, value) {
 if (value == null || value === "") return;
 aliases[name] = value;
 aliases[normalizeExportLookupKey(name)] = value;
}

function isExportScalarValue(value) {
 return value != null && typeof value !== "object";
}

function findExportValueInObject(obj, key) {
 if (!obj || typeof obj !== "object") return null;
 var normalizedSearchKey = normalizeExportLookupKey(key);
 if (obj.hasOwnProperty(key) && isExportScalarValue(obj[key])) return obj[key];
 for (var prop in obj) {
  if (!obj.hasOwnProperty(prop)) continue;
  if (!isExportScalarValue(obj[prop])) continue;
  if (normalizeExportLookupKey(prop) === normalizedSearchKey) return obj[prop];
 }
 for (var nestedProp in obj) {
  if (!obj.hasOwnProperty(nestedProp)) continue;
  var nested = obj[nestedProp];
  if (nested && typeof nested === "object") {
   var result = findExportValueInObject(nested, key);
   if (result !== null && result !== undefined && result !== "") return result;
  }
 }
 return null;
}

function normalizeExportBatchFields(raw) {
 var fields = {};
 if (!raw) return fields;
 if (typeof raw === "string") {
  try {
   if (typeof JSON !== "undefined" && JSON.parse) raw = JSON.parse(raw);
   else raw = eval("(" + raw + ")");
  } catch (e) {
   return fields;
  }
 }
 if (typeof raw !== "object") return fields;
 for (var key in raw) {
  if (!raw.hasOwnProperty(key)) continue;
  var val = raw[key];
  if (!isExportScalarValue(val)) continue;
  var text = trimExportString(val);
  if (text !== "") fields[key] = text;
 }
 return fields;
}

function getExportBatchFields(meta, jsonData) {
 var batch = normalizeExportBatchFields(meta && meta.batchVariableSource ? meta.batchVariableSource : null);
 var fallbackKeys = [
  "Item_ID", "Item ID", "Item Id", "ITEM_ID",
  "Player Code", "Color Code", "Style#", "Style Code", "STYLE_CODE",
  "Team Code", "TeamCode", "League", "Art Code", "Graphic Name",
  "Player Jersey Name", "Lineup Style Code", "Document Name"
 ];
 for (var i = 0; i < fallbackKeys.length; i++) {
  var lookupKey = fallbackKeys[i];
  if (batch[lookupKey]) continue;
  var fromJson = findExportValueInObject(jsonData, lookupKey);
  if (fromJson !== null && fromJson !== undefined && fromJson !== "") {
   batch[lookupKey] = trimExportString(fromJson);
  }
 }
 return batch;
}

function sanitizeExportPathValue(value) {
 var text;
 if (value instanceof Array) {
  text = value.join("_");
 } else if (value && typeof value === "object") {
  text = JSON.stringify(value);
 } else {
  text = String(value == null ? "" : value);
 }
 return trimExportString(text).replace(/[\\\\\\/:*?"<>|]+/g, "-");
}

function getExportXmpMetadata(doc) {
 try {
  if (typeof xmpModifier !== "object") return null;
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist("SeparationProfileMetadata")) {
   return xmp.getStructField("SeparationProfileMetadata", true) || null;
  }
 } catch (e) {}
 return null;
}

/*
 * Read the configured LEAP server base path from the local settings file.
 * Mirrors getServerBasePath() in cep_adapters.jsx so this resolver stays
 * self-contained and independent of the JSX bundle's load order.
 */
function getExportServerBasePath() {
 try {
  var documentsFolder = Folder.myDocuments || new Folder("~/Documents");
  var settingsFile = new File(documentsFolder.fsName + "/LEAP Settings/logobaseDataPathSettings.json");
  if (!settingsFile.exists) return null;
  if (!settingsFile.open("r")) return null;
  var content = settingsFile.read();
  settingsFile.close();
  var parsed = parseExportJsonSafe(content);
  if (parsed && parsed.basePath) return parsed.basePath;
 } catch (e) {}
 return null;
}

/*
 * Load the DESC/ABBV graphic position lookup from
 * <ServerBasePath>/SETTINGS/graphic_positions.json. Returns [] on any failure.
 */
function loadExportGraphicPositionLookup() {
 try {
  var basePath = getExportServerBasePath();
  if (!basePath) return [];
  var normalizedBasePath = String(basePath).replace(/\\/$/, "");
  var lookupFile = new File(normalizedBasePath + "/SETTINGS/graphic_positions.json");
  if (!lookupFile.exists) return [];
  if (!lookupFile.open("r")) return [];
  var content = lookupFile.read();
  lookupFile.close();
  var parsed = parseExportJsonSafe(content);
  return (parsed && parsed instanceof Array) ? parsed : [];
 } catch (e) {
  return [];
 }
}

/*
 * Resolve a position DESC to its ABBV via graphic_positions.json — the same
 * mapping used to fill the Illustrator document [POS] token. Falls back to the
 * original description when no match is found so [POS] is never left blank.
 */
function getExportGraphicPositionAbbreviation(positionDesc) {
 if (positionDesc == null) return "";
 var original = trimExportString(positionDesc);
 if (!original) return "";
 try {
  var target = original.toLowerCase();
  var lookup = loadExportGraphicPositionLookup();
  for (var i = 0; i < lookup.length; i++) {
   var entry = lookup[i];
   if (!entry) continue;
   var desc = entry.DESC != null ? entry.DESC : (entry.desc != null ? entry.desc : "");
   if (!desc) continue;
   if (trimExportString(desc).toLowerCase() === target) {
    var abbv = entry.ABBV != null ? entry.ABBV : (entry.abbv != null ? entry.abbv : "");
    if (abbv != null && trimExportString(abbv) !== "") return trimExportString(abbv);
    break;
   }
  }
 } catch (e) {}
 return original;
}

function getOriginalDocBaseName(docFile) {
 var fileName = docFile.name || "";
 var aiName = fileName.replace(/\\.ai$/i, "");
 if (aiName.indexOf("-SEP") !== -1) return aiName.substring(0, aiName.indexOf("-SEP"));
 return aiName.replace(/\\.[^\\.]+$/, "");
}

function getExportJsonData(docFile) {
 try {
  if (typeof findAndReadJSONFile !== "function") return null;
  var docPath = docFile.fsName || "";
  if (docPath.indexOf("09 SEPARATIONS") === -1) return null;
  var graphicFolder = docFile.parent;
  var teamCodeFolder = graphicFolder.parent;
  var leagueSepFolder = teamCodeFolder.parent;
  var separationsFolder = leagueSepFolder.parent;
  var rootFolder = separationsFolder.parent;
  var leagueFolder = new Folder(rootFolder.fsName + "/01 TEAMOUTS/" + leagueSepFolder.name);
  if (!leagueFolder.exists) return null;
  return findAndReadJSONFile(getOriginalDocBaseName(docFile), leagueFolder);
 } catch (e) {
  return null;
 }
}

function getStyleCodesExportText(meta) {
 try {
  var codes = meta ? meta.styleCodes : null;
  if (codes == null) return null;
  if (codes instanceof Array) {
   if (codes.length === 0) return null;
   var parts = [];
   for (var i = 0; i < codes.length; i++) {
    if (codes[i] != null && String(codes[i]).trim() !== "") {
     parts.push(String(codes[i]).trim());
    }
   }
   if (parts.length === 0) return null;
   if (parts.length === 1) return parts[0];
   return parts.join("_");
  }
  var single = String(codes).trim();
  return single !== "" ? single : null;
 } catch (e) {
  return null;
 }
}

function getExportControlVersionValues(doc) {
 var out = { control: "", version: "" };
 try {
  if (!doc || !doc.textFrames) return out;
  for (var i = 0; i < doc.textFrames.length; i++) {
   var tf = doc.textFrames[i];
   var content = tf.contents == null ? "" : String(tf.contents);
   var trimmed = trimExportString(content);
   /* Skip blanks and bracketed placeholder tokens like [CONTROL] / [V#]. */
   if (trimmed === "" || (trimmed.charAt(0) === "[" && trimmed.charAt(trimmed.length - 1) === "]")) continue;
   var frameName = String(tf.name || "").toLowerCase();
   if ((frameName === "control_number" || frameName === "control number") && out.control === "") { out.control = trimmed; }
   else if ((frameName === "version_number" || frameName === "version number") && out.version === "") { out.version = trimmed; }
  }
 } catch (e) {}
 return out;
}

function getExportVariableContext(doc) {
 var docFile = new File(doc.fullName);
 var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
 var meta = getExportXmpMetadata(doc) || {};
 var jsonData = getExportJsonData(docFile) || {};
 var batch = getExportBatchFields(meta, jsonData);
 var aliases = {};
 var teamCodeFromPath = "";
 var leagueFromPath = "";
 try {
  if ((docFile.fsName || "").indexOf("09 SEPARATIONS") !== -1) {
   teamCodeFromPath = docFile.parent.parent.name;
   leagueFromPath = docFile.parent.parent.parent.name;
  }
 } catch (e) {}
 setExportAlias(aliases, "Document Name", docName);
 setExportAlias(aliases, "Doc Name", docName);
 setExportAlias(aliases, "File Name", docName);
 setExportAlias(aliases, "Profile Code", meta.profileCode);
 setExportAlias(aliases, "Profile Name", meta.profileName);
 setExportAlias(aliases, "Graphic Position", meta.position || meta.graphicPosition);
 setExportAlias(aliases, "Position", meta.position || meta.graphicPosition);
 /*
  * [POS] resolves to the graphic position ABBREVIATION (via graphic_positions.json),
  * matching the value written into the Illustrator document [POS] token. Falls back
  * to the raw position description when no abbreviation is found. Set after the
  * raw-value aliases above so it wins for the "POS" key without altering [Position].
  */
 var posDescForToken = meta.position || meta.graphicPosition;
 if (posDescForToken) {
  setExportAlias(aliases, "POS", getExportGraphicPositionAbbreviation(posDescForToken));
 }
 setExportAlias(aliases, "Art Code", meta.graphicName);
 setExportAlias(aliases, "Graphic Name", meta.graphicName);
 setExportAlias(aliases, "Color Code", meta.colorCodes);
 var styleCodesText = getStyleCodesExportText(meta);
 if (styleCodesText) {
  setExportAlias(aliases, "style_code", styleCodesText);
  setExportAlias(aliases, "STYLE_CODE", styleCodesText);
  setExportAlias(aliases, "Style Code", styleCodesText);
  setExportAlias(aliases, "Style#", styleCodesText);
 } else {
  setExportAlias(aliases, "Style#", meta.styleCodes);
  setExportAlias(aliases, "Style Code", meta.styleCodes);
 }
 var lineupStyleCode = findExportValueInObject(batch, "Lineup Style Code");
 if (!lineupStyleCode) lineupStyleCode = styleCodesText;
 if (lineupStyleCode) setExportAlias(aliases, "Lineup Style Code", lineupStyleCode);
 for (var batchKey in batch) {
  if (batch.hasOwnProperty(batchKey)) {
   setExportAlias(aliases, batchKey, batch[batchKey]);
  }
 }
 setExportAlias(aliases, "Team Code", findExportValueInObject(jsonData, "TeamCode") || teamCodeFromPath || findExportValueInObject(batch, "Team Code") || findExportValueInObject(batch, "Lineup Org Code"));
 setExportAlias(aliases, "League", findExportValueInObject(jsonData, "League") || leagueFromPath || findExportValueInObject(batch, "League_desc") || findExportValueInObject(batch, "League"));
 /*
  * [CONTROL] / [CONTROL_NUMBER] / [CONTROL NUMBER] (and the VERSION equivalents) resolve from the
  * document's CONTROL_NUMBER / VERSION_NUMBER text frames so export file/folder names can embed the
  * control/version number. "Control" covers [CONTROL]; "Control Number" covers [CONTROL_NUMBER] and
  * [CONTROL NUMBER] (both normalize to the same key). Bracketed placeholders and blanks are skipped.
  */
 var controlVersion = getExportControlVersionValues(doc);
 if (controlVersion.control) {
  setExportAlias(aliases, "Control", controlVersion.control);
  setExportAlias(aliases, "Control Number", controlVersion.control);
 }
 if (controlVersion.version) {
  setExportAlias(aliases, "Version", controlVersion.version);
  setExportAlias(aliases, "Version Number", controlVersion.version);
 }
 return {
  aliases: aliases,
  batch: batch,
  jsonData: jsonData,
  meta: meta,
  styleInfo: meta.styleInfo || {}
 };
}

function getExportTemplateValue(token, context) {
 var value = findExportValueInObject(context.aliases, token);
 if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 value = findExportValueInObject(context.jsonData, token);
 if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 value = findExportValueInObject(context.batch, token);
 if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 value = findExportValueInObject(context.meta, token);
 if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 value = findExportValueInObject(context.styleInfo, token);
 if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 return null;
}

function ensureExportFolder(folder) {
 try {
  if (!folder || folder.exists) return true;
  var parent = folder.parent;
  if (parent && !parent.exists) ensureExportFolder(parent);
  return folder.create();
 } catch (e) {
  return false;
 }
}

function isAbsoluteExportPath(pathValue) {
 return /^~\\//.test(pathValue) || /^\\//.test(pathValue) || /^[A-Za-z]:[\\\\\\/]/.test(pathValue);
}

function ensureExportExtension(pathValue, extension) {
 var slashNormalized = pathValue.replace(/\\\\/g, "/");
 if (/\\/$/.test(slashNormalized)) return pathValue;
 var fileName = slashNormalized.substring(slashNormalized.lastIndexOf("/") + 1);
 if (/\\.[^\\.\\/]+$/.test(fileName)) return pathValue;
 return pathValue + "." + extension;
}

function normalizeExportPathSlashes(pathValue) {
 return String(pathValue || "").replace(/\\\\/g, "/");
}

function trimExportPathSlashes(pathValue) {
 var normalized = normalizeExportPathSlashes(pathValue);
 while (normalized.length > 1 && normalized.charAt(normalized.length - 1) === "/") {
  normalized = normalized.substring(0, normalized.length - 1);
 }
 return normalized;
}

function joinExportPath(basePath, segment) {
 var base = trimExportPathSlashes(basePath);
 var part = trimExportPathSlashes(segment);
 if (!part) return base;
 if (!base) return part;
 return base + "/" + part;
}

function getSeparationsFolderFromDocFile(docFile) {
 try {
  var docPath = docFile.fsName || "";
  if (docPath.indexOf("09 SEPARATIONS") === -1) return null;
  var graphicFolder = docFile.parent;
  var teamCodeFolder = graphicFolder.parent;
  var leagueSepFolder = teamCodeFolder.parent;
  return leagueSepFolder.parent;
 } catch (e) {
  return null;
 }
}

function ensureExportFileNameExtension(fileName, extension) {
 if (!fileName) return fileName;
 var ext = String(extension || "").replace(/^\\./, "").toLowerCase();
 if (!ext) return fileName;
 // User supplied an extension (.pdf, .ps, .PDF, etc.) — do not append again
 if (/\\.[^.\\/]+$/i.test(fileName)) return fileName;
 return fileName + "." + ext;
}

function buildExportDestinationFromResolvedPath(resolvedPath, defaultFile, extension) {
 var normalized = normalizeExportPathSlashes(trimExportString(resolvedPath));
 if (!normalized) return defaultFile;

 var endsWithSlash = /\\/$/.test(normalized);
 var parts = normalized.split("/");
 while (parts.length > 0 && parts[parts.length - 1] === "") {
  parts.pop();
 }

 var rootRelativeToSeparations = parts.length > 0 && parts[0] === "";
 if (rootRelativeToSeparations) {
  parts.shift();
 }

 var dirParts = parts;
 var fileName = defaultFile.name;

 if (!endsWithSlash && parts.length > 0) {
  fileName = parts[parts.length - 1];
  dirParts = parts.slice(0, parts.length - 1);
  fileName = ensureExportFileNameExtension(fileName, extension);
 }

 var basePath = defaultFile.parent.fsName;
 if (rootRelativeToSeparations) {
  var separationsFolder = getSeparationsFolderFromDocFile(defaultFile);
  if (separationsFolder) basePath = separationsFolder.fsName;
 }

 var dirPath = dirParts.join("/");
 if (dirPath && isAbsoluteExportPath(dirPath)) {
  basePath = "";
 } else if (dirPath) {
  dirPath = joinExportPath(basePath, dirPath);
 } else {
  dirPath = basePath;
 }

 var targetFile = new File(joinExportPath(dirPath, fileName));
 ensureExportFolder(targetFile.parent);
 return targetFile;
}

function resolveExportPathSegment(segment, context) {
 if (!segment || segment.indexOf("[") === -1) {
  return segment || "";
 }
 return segment.replace(/\\[([^\\]]+)\\]/g, function(match, token) {
  var value = getExportTemplateValue(token, context);
  return value === null || value === undefined ? match : value;
 });
}

function resolveExportFilePathFromTokens(template, defaultFile, extension, context) {
 if (!/\\[[^\\]]+\\]/.test(template)) return null;

 var normalized = normalizeExportPathSlashes(trimExportString(template));
 var endsWithSlash = /\\/$/.test(normalized);
 var parts = normalized.split("/");
 while (parts.length > 0 && parts[parts.length - 1] === "") {
  parts.pop();
 }

 var rootRelativeToSeparations = parts.length > 0 && parts[0] === "";
 if (rootRelativeToSeparations) {
  parts.shift();
 }

 var resolvedParts = [];
 for (var i = 0; i < parts.length; i++) {
  if (parts[i] === "") continue;
  resolvedParts.push(resolveExportPathSegment(parts[i], context));
 }

 var reconstructed = "";
 if (rootRelativeToSeparations) reconstructed = "/";
 reconstructed += resolvedParts.join("/");
 if (endsWithSlash) reconstructed += "/";

 return buildExportDestinationFromResolvedPath(reconstructed, defaultFile, extension);
}

function resolveExportFilePath(settingsKey, defaultFile, doc, extension) {
 var settings = readExportSettings();
 var template = settings && settings[settingsKey] != null ? trimExportString(settings[settingsKey]) : "";
 if (!template) return defaultFile;
 var context = getExportVariableContext(doc);

 if (/\\[[^\\]]+\\]/.test(template)) {
  var tokenBasedFile = resolveExportFilePathFromTokens(template, defaultFile, extension, context);
  if (tokenBasedFile) return tokenBasedFile;
 }

 var resolvedPath = template.replace(/\\[([^\\]]+)\\]/g, function(match, token) {
  var value = getExportTemplateValue(token, context);
  return value === null || value === undefined ? match : value;
 });
 if (!resolvedPath) return defaultFile;
 return buildExportDestinationFromResolvedPath(resolvedPath, defaultFile, extension);
}
`;
 }

 /**
  * Write the user-entered Control number and Version number into the active document before export,
  * then SAVE. First export: the bracketed tokens [CONTROL] / [V#] are replaced in place. Repeat export:
  * those tokens are already gone, so the dedicated text frames named CONTROL_NUMBER / VERSION_NUMBER
  * are overwritten by name. Matching lowercases the frame name and loops every frame, so the names may
  * be any case (CONTROL_NUMBER, Control_Number, …) and there may be more than one of each.
  */
 updateControlAndVersionNumbers(controlNumber: string, versionNumber: string): Promise<any> {
  this.log('updateControlAndVersionNumbers called');
  const controlLiteral = JSON.stringify(String(controlNumber == null ? '' : controlNumber));
  /* Auto-prefix "V" only when the entered version doesn't already start with V/v (e.g. "3" -> "V3", "V3" -> "V3"). */
  const versionRaw = String(versionNumber == null ? '' : versionNumber).trim();
  const versionValue = versionRaw !== '' && !/^v/i.test(versionRaw) ? 'V' + versionRaw : versionRaw;
  const versionLiteral = JSON.stringify(versionValue);
  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    var control = ${controlLiteral};
    var version = ${versionLiteral};
    var replaced = 0;
    if (doc.textFrames) {
      for (var i = 0; i < doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        var content = tf.contents;
        if (content == null) { continue; }
        var frameName = String(tf.name || "").toLowerCase().replace(/\\s+/g, "_");
        var updated = String(content).replace(/\\[CONTROL\\]/gi, control).replace(/\\[V#\\]/gi, version);
        if (frameName === "control_number" && control !== "") {
          updated = control;
        } else if (frameName === "version_number" && version !== "") {
          updated = version;
        }
        if (updated !== content) {
          tf.contents = updated;
          replaced++;
        }
      }
    }
    // Save the file in place so the control/version numbers are baked in before PostScript export.
    doc.save();
    return JSON.stringify({ success: true, replaced: replaced });
  } catch (e) {
    return JSON.stringify({ success: false, error: "Error updating control number: " + (e.message || e.toString()) });
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
    });
  });
 }

 /*
  * Read the Control number and Version number back from the active document's text frames named
  * CONTROL_NUMBER / VERSION_NUMBER (case-insensitive; also matches the spaced "CONTROL NUMBER").
  * Used to pre-fill the Export modal on a repeat export. Returns { success, controlNumber, versionNumber }.
  */
 getControlAndVersionNumbers(): Promise<any> {
  this.log('getControlAndVersionNumbers called');
  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    var control = "";
    var version = "";
    if (doc.textFrames) {
      for (var i = 0; i < doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        var content = tf.contents == null ? "" : String(tf.contents);
        var frameName = String(tf.name || "").toLowerCase();
        if ((frameName === "control_number" || frameName === "control number") && control === "") { control = content; }
        else if ((frameName === "version_number" || frameName === "version number") && version === "") { version = content; }
      }
    }
    return JSON.stringify({ success: true, controlNumber: control, versionNumber: version });
  } catch (e) {
    return JSON.stringify({ success: false, error: "Error reading control/version: " + (e.message || e.toString()) });
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
    });
  });
 }

/*
  * Write the Plates-UI total color count into the sheet's [C#] tokens and any text frames named
  * "TOTAL COLORS" (case-insensitive, one or more allowed). The count is supplied by the Plates UI
  * (every non-removed plate: inks + White UB + Blocker) rather than derived from the raw
  * SEPARATED_ART layers, and is pushed whenever the plates (re)load, regenerate, or a color is
  * removed, so the number always matches what the user sees. First fill replaces the [C#] token;
  * later updates overwrite the "TOTAL COLORS" frame(s) by name. Only saves when something changed.
  */
 updateTotalColors(count: number): Promise<any> {
  this.log('updateTotalColors called');
  const countLiteral = JSON.stringify(String(count == null ? '' : count));
  return this.ensureSession().then(() => {
   const script = `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    var count = ${countLiteral};
    var replaced = 0;
    if (doc.textFrames) {
      for (var i = 0; i < doc.textFrames.length; i++) {
        var tf = doc.textFrames[i];
        var content = tf.contents;
        if (content == null) { continue; }
        var frameName = String(tf.name || "").toLowerCase().replace(/\\s+/g, "_");
        var updated = String(content).replace(/\\[C#\\]/gi, count);
        if (frameName === "total_colors" && count !== "") {
          updated = count;
        }
        if (updated !== content) {
          tf.contents = updated;
          replaced++;
        }
      }
    }
    // Persist only when a frame actually changed, to avoid marking the doc dirty on every reload.
    if (replaced > 0) { try { doc.save(); } catch (saveErr) {} }
    return JSON.stringify({ success: true, replaced: replaced });
  } catch (e) {
    return JSON.stringify({ success: false, error: "Error updating total colors: " + (e.message || e.toString()) });
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
    });
  });
 }

  exportPrintGuidePDF(): Promise<any> {
  this.log('exportPrintGuidePDF called');

  return this.ensureSession().then(() => {
   const exportPathResolverCode = this.buildExportPathResolverScript();
   const script = `
(function() {
  ${exportPathResolverCode}
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
    var defaultDestFile = new File(docFolder.fsName + "/" + docName + "_PrintGuide.pdf");
    var destFile = resolveExportFilePath("printGuideFilePath", defaultDestFile, doc, "pdf");

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

 /** Remove swatches not used in the given or active document (Illustrator action set). */
 removeUnusedSwatches(
  documentPath?: string
 ): Promise<{ success: boolean; message?: string; error?: string }> {
  this.log(
   'removeUnusedSwatches called' + (documentPath ? ' doc=' + documentPath : '')
  );
  this.leapSepsLog.logProcess('removeUnusedSwatches start', {
   doc: documentPath ? documentPath.split('/').pop() : '(active)'
  });

  return this.ensureSession().then(() => {
   const script = this.buildRemoveUnusedSwatchesScript(documentPath);
   return evalScript(script)
    .then((res: unknown) => {
     const str = typeof res === 'string' ? res : '';
     const result = str
      ? JSON.parse(str)
      : { success: false, error: 'No result from removeUnusedSwatches' };

     if (result?.success) {
      console.log('[removeUnusedSwatches]', result.message || 'Unused swatches removed');
     } else {
      console.warn('[removeUnusedSwatches]', result?.error || 'Failed');
     }
     return result;
    })
    .catch((err: any) => {
     const message = err?.message || String(err);
     console.error('[removeUnusedSwatches]', message);
     return { success: false, error: message };
    });
  });
 }

 /** Check print preset, PPD, and optional document prerequisites for PostScript export. */
 checkPostscriptReadiness(options?: { requireDocument?: boolean }): Promise<any> {
  const requireDocument = options?.requireDocument === true;
  return this.ensureSession().then(() => {
   const script = this.buildCheckPostscriptReadinessScript(requireDocument);
   return evalScript(script)
     .then((res: unknown) => {
      const str = typeof res === 'string' ? res : '';
      return str ? JSON.parse(str) : { success: false, ready: false, issues: [] };
     })
     .catch((err: any) => ({
      success: false,
      ready: false,
      issues: [],
      error: err?.message || String(err)
     }));
  });
 }

 private buildCheckPostscriptReadinessScript(requireDocument: boolean): string {
  const requireDocumentLiteral = requireDocument ? 'true' : 'false';
  return `
(function() {
  var PRESET_NAME = 'LEAP_SEPS_POSTSCRIPT';
  var requireDocument = ${requireDocumentLiteral};
  var issues = [];

  function pushIssue(id, message) {
    issues.push({ id: id, message: message });
  }

  function trimStr(s) {
    return String(s || "").replace(/^\\s+|\\s+$/g, "");
  }

  // Prime the PPD/printer subsystem (read-only); empty on a cold launch until read.
  var ppdCount = -1;
  var printerCount = -1;
  try { var _ppdList = app.PPDFileList; ppdCount = _ppdList ? _ppdList.length : -1; } catch (ppdErr) {}
  try { var _prnList = app.printerList; printerCount = _prnList ? _prnList.length : -1; } catch (prnErr) {}
  if (ppdCount <= 0 && printerCount <= 0) {
    pushIssue(
      "PPD_NOT_INITIALIZED",
      "The PostScript print subsystem is not initialized yet. Open File > Print once " +
      "(choose the Adobe PostScript File printer + IBlock PPD, then Cancel) to initialize " +
      "it. This only needs to be done once per Illustrator session."
    );
  }

  var matchedPresetName = null;
  var presetListNames = [];

  try {
    var allPresets = app.printPresetsList;
    if (allPresets && allPresets.length) {
      var target = PRESET_NAME.toLowerCase();
      for (var p = 0; p < allPresets.length; p++) {
        var entry = trimStr(allPresets[p]);
        if (entry) presetListNames.push(entry);
        if (entry.toLowerCase() === target) {
          matchedPresetName = entry;
          break;
        }
      }
    }
  } catch (presetListErr) { }

  if (!matchedPresetName) {
    var listHint = presetListNames.length
      ? " Illustrator printPresetsList: " + presetListNames.join(", ") + "."
      : "";
    pushIssue(
      "PRESET_NOT_FOUND",
      "Print preset \\"" + PRESET_NAME + "\\" was not found in Illustrator's print preset list." + listHint
    );
  }

  if (requireDocument) {
    if (!app.documents.length) {
      pushIssue("NO_DOCUMENT", "No Illustrator document is open.");
    } else {
      var doc = app.activeDocument;
      if (!doc.artboards || doc.artboards.length === 0) {
        pushIssue("NO_ARTBOARDS", "The active document has no artboards.");
      } else {
        var gridFound = false;
        for (var abIndex = 0; abIndex < doc.artboards.length; abIndex++) {
          var ab = doc.artboards[abIndex];
          var abName = (ab && ab.name != null) ? ab.name.toString() : "";
          if (abName && abName.toUpperCase() === "GRID") {
            gridFound = true;
            break;
          }
        }
        if (!gridFound) {
          pushIssue(
            "GRID_ARTBOARD_MISSING",
            "Artboard named GRID was not found in the active document. " +
            "PostScript export prints the GRID artboard only."
          );
        }
      }
    }
  }

  return JSON.stringify({
    success: true,
    ready: issues.length === 0,
    issues: issues,
    ppdCount: ppdCount,
    printerCount: printerCount
  });
})();
`;
 }

 /** Export GRID artboard to PostScript (postscriptFilePath). Does not run Distiller. */
 exportPostscript(inks: string[]): Promise<any> {
  return this.exportGridPostscript(
   Array.isArray(inks) ? inks : [],
   'postscriptFilePath',
   '.ps',
   'exportPostscript',
   'PostScript exported successfully'
  );
 }

 /** Resolve postscriptFilePath for the active document (does not export). */
 resolvePostscriptExportPath(): Promise<{ success: boolean; filePath?: string; error?: string }> {
  return this.ensureSession().then(() => {
   const exportPathResolverCode = this.buildExportPathResolverScript();
   const script = `
(function() {
  ${exportPathResolverCode}
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var defaultOutputFile = new File(docFolder.fsName + "/" + docName + ".ps");
    var outputFile = resolveExportFilePath("postscriptFilePath", defaultOutputFile, doc, "ps");
    var outputPath = outputFile.fsName;
    if (/\\.pdf$/i.test(outputPath)) {
      outputPath = outputPath.replace(/\\.pdf$/i, ".ps");
    }
    return JSON.stringify({ success: true, filePath: outputPath });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error resolving PostScript path: " + (e.message || e.toString())
    });
  }
})();
`;
   return evalScript(script).then((res: unknown) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
    } catch {
     return { success: false, error: 'Invalid JSON response from host', raw: str };
    }
   });
  });
 }

 /** Check whether the resolved PostScript export file already exists on disk. */
 findExistingPostscriptExportFile(): Promise<{
  exists: boolean;
  filePath?: string;
  error?: string;
 }> {
  return this.resolvePostscriptExportPath().then((resolved) => {
   if (!resolved?.success || !resolved.filePath) {
    return {
     exists: false,
     error: resolved?.error || 'Could not resolve PostScript export path'
    };
   }
   try {
    const fs = (window as any).cep_node?.require?.('fs');
    if (!fs) {
     return { exists: false, filePath: resolved.filePath, error: 'CEP filesystem is unavailable' };
    }
    return { exists: fs.existsSync(resolved.filePath), filePath: resolved.filePath };
   } catch (e: any) {
    return {
     exists: false,
     filePath: resolved.filePath,
     error: e?.message || String(e)
    };
   }
  });
 }

 /** Resolve separationPreviewFilePath for the active document (PDF only; does not export). */
 resolveSeparationsPreviewExportPath(): Promise<{
  success: boolean;
  filePath?: string;
  error?: string;
 }> {
  return this.ensureSession().then(() => {
   const exportPathResolverCode = this.buildExportPathResolverScript();
   const script = `
(function() {
  ${exportPathResolverCode}
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var defaultPdfFile = new File(docFolder.fsName + "/" + docName + "_SeparationsPreview.pdf");
    var pdfFile = resolveExportFilePath("separationPreviewFilePath", defaultPdfFile, doc, "pdf");
    ensureExportFolder(pdfFile.parent);
    return JSON.stringify({ success: true, filePath: pdfFile.fsName });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error resolving Separations Preview path: " + (e.message || e.toString())
    });
  }
})();
`;
   return evalScript(script).then((res: unknown) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
    } catch {
     return { success: false, error: 'Invalid JSON response from host', raw: str };
    }
   });
  });
 }

 private companionPdfPathForPs(psPath: string): string {
  if (/\.ps$/i.test(psPath)) {
   return psPath.replace(/\.ps$/i, '.pdf');
  }
  return psPath + '.pdf';
 }

 /** Find PDF Distiller wrote (checks Postscript folder and Separation Preview folder). */
 private findDistillerPdfPath(
  sourcePsPath: string,
  targetPdfPath: string,
  distillerStartedAtMs: number
 ): string | null {
  try {
   const req = (window as any).cep_node?.require;
   if (!req) return null;
   const fs = req('fs');
   const path = req('path');
   const minMtime = distillerStartedAtMs - 3000;
   const sourceDir = path.dirname(sourcePsPath);
   const targetDir = path.dirname(targetPdfPath);
   const baseName = path.basename(sourcePsPath, path.extname(sourcePsPath));

   const isFreshPdf = (filePath: string): boolean => {
    try {
     if (!fs.existsSync(filePath)) return false;
     const stat = fs.statSync(filePath);
     return stat.isFile() && stat.size > 0 && stat.mtimeMs >= minMtime;
    } catch (_) {
     return false;
    }
   };

   const dirs: string[] = [];
   const addDir = (dir: string) => {
    if (!dir || dirs.indexOf(dir) !== -1) return;
    dirs.push(dir);
   };
   addDir(sourceDir);
   addDir(targetDir);

   const explicitCandidates: string[] = [
    targetPdfPath,
    this.companionPdfPathForPs(sourcePsPath)
   ];
   for (let d = 0; d < dirs.length; d++) {
    explicitCandidates.push(path.join(dirs[d], baseName.replace(/_PS$/i, '') + '.pdf'));
    explicitCandidates.push(path.join(dirs[d], baseName + '.pdf'));
    explicitCandidates.push(path.join(dirs[d], path.basename(targetPdfPath)));
   }

   for (let i = 0; i < explicitCandidates.length; i++) {
    if (isFreshPdf(explicitCandidates[i])) {
     return explicitCandidates[i];
    }
   }

   let newestPath: string | null = null;
   let newestMtime = 0;
   for (let d = 0; d < dirs.length; d++) {
    let entries: string[] = [];
    try {
     entries = fs.readdirSync(dirs[d]);
    } catch (_) {
     continue;
    }
    for (let i = 0; i < entries.length; i++) {
     const name = entries[i];
     if (!/\.pdf$/i.test(name)) continue;
     /*
      * Only accept the Distiller output, which shares the source .ps base name (e.g. "..._Seps.pdf").
      * A blind "newest PDF" scan could otherwise grab an UNRELATED fresh PDF in the same folder — e.g.
      * the Print Guide "..._PGN.pdf" — and move/rename it to the seps-preview PDF, destroying the Print
      * Guide. This is exactly why exporting into the same /SEPS/ folder made the Print Guide disappear.
      */
     const nameBase = path.basename(name, path.extname(name));
     const expectedBaseNoPs = baseName.replace(/_PS$/i, '');
     const targetBase = path.basename(targetPdfPath, path.extname(targetPdfPath));
     if (nameBase !== baseName && nameBase !== expectedBaseNoPs && nameBase !== targetBase) continue;
     const fullPath = path.join(dirs[d], name);
     try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size <= 0 || stat.mtimeMs < minMtime) continue;
      if (stat.mtimeMs > newestMtime) {
       newestMtime = stat.mtimeMs;
       newestPath = fullPath;
      }
     } catch (_) { }
    }
   }
   return newestPath;
  } catch (e: any) {
   console.warn('[findDistillerPdfPath] Error:', e?.message || e);
   return null;
  }
 }

 private delayMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
 }

 /** Move a file (rename); falls back to copy + delete source if cross-volume. */
 private moveFileOnDisk(fs: any, pathModule: any, fromPath: string, toPath: string): void {
  if (pathModule.resolve(fromPath) === pathModule.resolve(toPath)) return;
  if (fs.existsSync(toPath)) {
   fs.unlinkSync(toPath);
  }
  try {
   fs.renameSync(fromPath, toPath);
  } catch (_) {
   fs.copyFileSync(fromPath, toPath);
   fs.unlinkSync(fromPath);
  }
 }

 /**
  * Distiller writes PDF beside the PostScript file; move it to separationPreviewFilePath (PDF only).
  */
 private async placeDistillerPdfAtSeparationsPreviewPath(
  sourcePsPath: string,
  targetPdfPath: string,
  distillerStartedAtMs: number,
  timeoutMs = 300000,
  intervalMs = 2000
 ): Promise<{ success: boolean; pdfPath?: string; distillerPdfPath?: string; error?: string }> {
  try {
   const req = (window as any).cep_node?.require;
   if (!req) {
    return { success: false, error: 'CEP node runtime is unavailable' };
   }
   const fs = req('fs');
   const path = req('path');

   console.log(
    '[placeDistillerPdfAtSeparationsPreviewPath] Waiting for Distiller PDF in:',
    path.dirname(sourcePsPath),
    'or',
    path.dirname(targetPdfPath),
    '| target:',
    targetPdfPath
   );

   let distillerPdfPath: string | null = null;
   const deadline = distillerStartedAtMs + timeoutMs;
   let pollCount = 0;
   while (Date.now() < deadline) {
    pollCount++;
    distillerPdfPath = this.findDistillerPdfPath(sourcePsPath, targetPdfPath, distillerStartedAtMs);
    if (distillerPdfPath) break;
    if (pollCount === 1 || pollCount % 5 === 0) {
     console.log(
      '[placeDistillerPdfAtSeparationsPreviewPath] Still waiting for Distiller PDF (poll',
      pollCount + ')...'
     );
    }
    await this.delayMs(intervalMs);
   }

   if (!distillerPdfPath) {
    return {
     success: false,
     error:
      'Timed out waiting for Distiller PDF in folder: ' +
      path.dirname(sourcePsPath) +
      ' (expected a new .pdf after processing ' +
      path.basename(sourcePsPath) +
      ')'
    };
   }

   const targetDir = path.dirname(targetPdfPath);
   if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
   }

   if (path.resolve(distillerPdfPath) !== path.resolve(targetPdfPath)) {
    this.moveFileOnDisk(fs, path, distillerPdfPath, targetPdfPath);
    console.log(
     '[placeDistillerPdfAtSeparationsPreviewPath] Moved PDF:',
     distillerPdfPath,
     '→',
     targetPdfPath
    );
   } else {
    console.log(
     '[placeDistillerPdfAtSeparationsPreviewPath] PDF already at Separation Preview path:',
     targetPdfPath
    );
   }

   // Remove duplicate PDF left in Postscript folder after move (Distiller output beside .ps)
   const postscriptFolderPdf = this.companionPdfPathForPs(sourcePsPath);
   if (
    fs.existsSync(postscriptFolderPdf) &&
    path.resolve(postscriptFolderPdf) !== path.resolve(targetPdfPath)
   ) {
    try {
     fs.unlinkSync(postscriptFolderPdf);
     console.log(
      '[placeDistillerPdfAtSeparationsPreviewPath] Removed duplicate PDF from Postscript folder:',
      postscriptFolderPdf
     );
    } catch (_) { }
   }

   // Remove legacy .ps mistakenly placed at Separation Preview path by older builds
   const legacyPsAtPreview = /\.pdf$/i.test(targetPdfPath)
    ? targetPdfPath.replace(/\.pdf$/i, '.ps')
    : targetPdfPath + '.ps';
   if (
    fs.existsSync(legacyPsAtPreview) &&
    path.resolve(legacyPsAtPreview) !== path.resolve(sourcePsPath)
   ) {
    try {
     fs.unlinkSync(legacyPsAtPreview);
    } catch (_) { }
   }

   return { success: true, pdfPath: targetPdfPath, distillerPdfPath: targetPdfPath };
  } catch (e: any) {
   return { success: false, error: e?.message || String(e) };
  }
 }

 /**
  * Distill the PostScript into a PDF that lives BESIDE the .ps in the Postscript
  * folder (same base name, .pdf extension) — so the Postscript file path folder
  * holds both the .ps and the .pdf. This is exactly where Distiller writes the
  * PDF, so no move is required. (The "Separation file path" is used for the
  * separation .ai copy instead — see copySeparationFile.)
  */
 async distillSeparationsPreviewPDF(sourcePsPath: string): Promise<any> {
  this.log('distillSeparationsPreviewPDF called for: ' + sourcePsPath);
  if (!sourcePsPath) {
   return {
    success: false,
    error: 'PostScript file path is required for Separations Preview PDF'
   };
  }

  /*
   * Target the companion PDF path (the .ps path with a .pdf extension) so the
   * distilled PDF stays in the Postscript folder next to the .ps.
   */
  const targetPdfPath = this.companionPdfPathForPs(sourcePsPath);
  console.log('[distillSeparationsPreviewPDF] source PS:', sourcePsPath);
  console.log('[distillSeparationsPreviewPDF] target PDF (Postscript folder):', targetPdfPath);

  const distillerStartedAt = Date.now();
  const distiller = await this.launchDistiller(sourcePsPath);
  console.log('[distillSeparationsPreviewPDF] Distiller launch result:', distiller);

  if (!distiller.success) {
   return {
    success: false,
    filePath: targetPdfPath,
    sourcePostscriptPath: sourcePsPath,
    distiller,
    error: distiller.error || 'Adobe Distiller could not be launched.'
   };
  }

  const placed = await this.placeDistillerPdfAtSeparationsPreviewPath(
   sourcePsPath,
   targetPdfPath,
   distillerStartedAt
  );
  if (!placed.success) {
   console.error('[distillSeparationsPreviewPDF] Failed to place PDF:', placed.error);
   return {
    success: false,
    filePath: targetPdfPath,
    sourcePostscriptPath: sourcePsPath,
    distiller,
    error:
     placed.error ||
     'Distiller was launched but the PDF could not be placed at the Separation Preview path.'
   };
  }

  console.log(
   '[distillSeparationsPreviewPDF] Success. Distiller PDF:',
   placed.distillerPdfPath,
   '| Separation Preview PDF:',
   placed.pdfPath
  );

  // PDF is fully generated and placed at its final path — auto-open it in the default
  // PDF viewer. Best-effort: a failure to open does not fail the export.
  const opened = this.openFileInDefaultApp(placed.pdfPath as string);
  if (!opened.success) {
   console.warn('[distillSeparationsPreviewPDF] Could not auto-open PDF:', opened.error);
  }

  return {
   success: true,
   filePath: placed.pdfPath,
   distillerPdfPath: placed.distillerPdfPath,
   sourcePostscriptPath: sourcePsPath,
   distiller,
   opened: opened.success,
   message: 'Separations Preview PDF created via Distiller.',
   note: 'PDF written beside the .ps in the Postscript folder (Postscript file path holds both .ps and .pdf).'
  };
 }

 /**
  * Copy the active separation .ai file to the resolved "Separation file path"
  * (the separationPreviewFilePath export setting). The path template is token-aware
  * (e.g. [POS], [Art Code], recursive folders) and the file is named accordingly
  * with a .ai extension. Skips silently when the template is empty or when the
  * resolved target is the source file itself. Returns { success, filePath, skipped }.
  */
 copySeparationFile(): Promise<{ success: boolean; filePath?: string; skipped?: boolean; error?: string }> {
  this.log('copySeparationFile called');
  return this.ensureSession().then(() => {
   const exportPathResolverCode = this.buildExportPathResolverScript();
   const script = `
(function() {
  ${exportPathResolverCode}
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var doc = app.activeDocument;
    if (!doc.fullName) {
      return JSON.stringify({ success: false, error: "Active document has not been saved to disk" });
    }

    /* Only copy when the user configured a Separation file path template. */
    var settings = readExportSettings();
    var template = (settings && settings.separationPreviewFilePath != null)
      ? trimExportString(settings.separationPreviewFilePath)
      : "";
    if (!template) {
      return JSON.stringify({ success: true, skipped: true });
    }

    var srcFile = new File(doc.fullName);
    if (!srcFile.exists) {
      return JSON.stringify({ success: false, error: "Separation .ai file not found on disk: " + srcFile.fsName });
    }

    var docFolder = srcFile.parent;
    var docName = srcFile.name.replace(/\\.[^\\.]+$/, "");
    var defaultAiFile = new File(docFolder.fsName + "/" + docName + ".ai");
    var targetFile = resolveExportFilePath("separationPreviewFilePath", defaultAiFile, doc, "ai");
    ensureExportFolder(targetFile.parent);

    /* Never copy the file onto itself. */
    if (targetFile.fsName === srcFile.fsName) {
      return JSON.stringify({ success: true, skipped: true, filePath: targetFile.fsName });
    }

    /* File.copy does not overwrite an existing target, so clear it first. */
    if (targetFile.exists) {
      targetFile.remove();
    }

    var copied = srcFile.copy(targetFile.fsName);
    if (!copied) {
      return JSON.stringify({ success: false, error: "Failed to copy separation file to: " + targetFile.fsName });
    }
    return JSON.stringify({ success: true, filePath: targetFile.fsName });
  } catch (e) {
    return JSON.stringify({
      success: false,
      error: "Error copying separation file: " + (e.message || e.toString())
    });
  }
})();
`;
   return evalScript(script).then((res: unknown) => {
    const str = typeof res === 'string' ? res : '';
    try {
     return str ? JSON.parse(str) : { success: false, error: 'Empty response from host' };
    } catch {
     return { success: false, error: 'Invalid JSON response from host', raw: str };
    }
   });
  });
 }

 private exportGridPostscript(
  inks: string[],
  settingsKey: 'postscriptFilePath',
  defaultPsSuffix: string,
  logPrefix: string,
  successMessage: string
 ): Promise<any> {
  this.log(logPrefix + ' called with ' + (inks?.length ?? 0) + ' inks');

  return this.ensureSession().then(() => {
   return this.loadGeneralSettings().then((settingsResult) => {
    const resolvedPpdName =
     settingsResult?.success && settingsResult?.data?.ppdName != null
      ? String(settingsResult.data.ppdName).trim() || 'IBlock v2'
      : 'IBlock v2';
    const script = this.buildExportPostscriptScript(
     inks,
     resolvedPpdName,
     settingsKey,
     defaultPsSuffix
    );
    return evalScript(script)
     .then((res: unknown) => {
      const str = typeof res === 'string' ? res : '';
      const result = str ? JSON.parse(str) : { success: false, error: 'No result' };

      if (result?.success) {
       const msg = result.message || successMessage;
       console.log('[' + logPrefix + ']', msg, result.filePath ? `→ ${result.filePath}` : '');
       if (result.inkDebug) {
        console.log('[' + logPrefix + '] requested inks:', result.requestedInks);
        console.table(result.inkDebug);
       }
       return { ...result, message: successMessage };
      }

      console.error('[' + logPrefix + ']', result?.error || 'Failed');
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
     '/Applications/Adobe Acrobat DC/Acrobat Distiller.app'
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

    if (!psExists) {
     const msg = 'PostScript file not found: ' + psPath;
     console.error('[launchDistiller] ' + msg);
     resolve({ success: false, error: msg });
     return;
    }

    console.log('[launchDistiller] PS exists:', psExists);
    console.log('[launchDistiller] Distiller app found:', foundAppPath || 'not found in known paths');

    const appNameOrPath = foundAppPath || 'Adobe Acrobat Distiller';
    const openArgs = ['-a', appNameOrPath, psPath];
    console.log('[launchDistiller] Running command: open ' + openArgs.join(' '));

    // execFile('open', ...) often never calls back when Distiller opens a document — spawn detached instead.
    let settled = false;
    const finish = (result: { success: boolean; error?: string }) => {
     if (settled) return;
     settled = true;
     resolve(result);
    };
    const child = cp.spawn('open', openArgs, { detached: true, stdio: 'ignore' });
    child.on('error', (spawnErr: any) => {
     const errMsg = spawnErr?.message || String(spawnErr);
     console.error('[launchDistiller] Spawn failed:', errMsg);
     finish({ success: false, error: errMsg });
    });
    if (!child.pid) {
     finish({ success: false, error: 'Failed to start Distiller process' });
     return;
    }
    child.unref();
    console.log('[launchDistiller] Distiller launch spawned (non-blocking), pid:', child.pid);
    finish({ success: true });
   } catch (e: any) {
    const msg = e?.message || String(e);
    console.error('[launchDistiller] Exception:', msg);
    resolve({ success: false, error: msg });
   }
  });
 }

 /**
  * Open a finished file in the OS default application (used to auto-open the Separations
  * Preview PDF once Distiller has fully written it). Non-blocking / best-effort — never
  * throws, so a failure to open does not fail the export.
  */
 private openFileInDefaultApp(filePath: string): { success: boolean; error?: string } {
  try {
   if (!filePath) { return { success: false, error: 'No file path provided' }; }
   const win = window as any;
   const req = win?.cep_node?.require;
   if (!req) { return { success: false, error: 'CEP node runtime is unavailable' }; }
   const cp = req('child_process');
   const fs = req('fs');
   const process = win?.cep_node?.process || req('process');

   if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found: ' + filePath };
   }

   const platform = process?.platform || 'darwin';
   let command: string;
   let args: string[];
   if (platform === 'win32') {
    // "start" needs an empty title arg; run through cmd.
    command = 'cmd';
    args = ['/c', 'start', '', filePath];
   } else if (platform === 'darwin') {
    command = 'open';
    args = [filePath];
   } else {
    command = 'xdg-open';
    args = [filePath];
   }

   console.log('[openFileInDefaultApp] Opening:', command, args.join(' '));
   const child = cp.spawn(command, args, { detached: true, stdio: 'ignore' });
   child.on('error', (err: any) => {
    console.error('[openFileInDefaultApp] Spawn failed:', err?.message || String(err));
   });
   if (child.pid) { child.unref(); }
   return { success: true };
  } catch (e: any) {
   console.error('[openFileInDefaultApp] Exception:', e?.message || String(e));
   return { success: false, error: e?.message || String(e) };
  }
 }

 /**
  * Reveal a file in the OS file browser with the file selected (macOS "Reveal in
  * Finder", Windows Explorer /select, Linux opens the containing folder). Used by
  * the export-results modal links. Best-effort; never throws.
  */
 revealFileInFinder(filePath: string): { success: boolean; error?: string } {
  try {
   if (!filePath) { return { success: false, error: 'No file path provided' }; }
   const win = window as any;
   const req = win?.cep_node?.require;
   if (!req) { return { success: false, error: 'CEP node runtime is unavailable' }; }
   const cp = req('child_process');
   const fs = req('fs');
   const path = req('path');
   const process = win?.cep_node?.process || req('process');

   if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found: ' + filePath };
   }

   const platform = process?.platform || 'darwin';
   let command: string;
   let args: string[];
   if (platform === 'win32') {
    /* Explorer selects the file when passed /select,<path> as a single token. */
    command = 'explorer';
    args = ['/select,' + filePath];
   } else if (platform === 'darwin') {
    /* -R reveals (selects) the file in Finder instead of opening it. */
    command = 'open';
    args = ['-R', filePath];
   } else {
    /* No universal "reveal" on Linux — open the containing folder instead. */
    command = 'xdg-open';
    args = [path.dirname(filePath)];
   }

   console.log('[revealFileInFinder] Revealing:', command, args.join(' '));
   const child = cp.spawn(command, args, { detached: true, stdio: 'ignore' });
   child.on('error', (err: any) => {
    console.error('[revealFileInFinder] Spawn failed:', err?.message || String(err));
   });
   if (child.pid) { child.unref(); }
   return { success: true };
  } catch (e: any) {
   console.error('[revealFileInFinder] Exception:', e?.message || String(e));
   return { success: false, error: e?.message || String(e) };
  }
 }

 /** ExtendScript: remove unused swatches via Illustrator action (LEAP Variables / colorVariable.jsx). */
 private buildRemoveUnusedSwatchesScript(documentPath?: string): string {
  const docPathLiteral = JSON.stringify(documentPath || '');
  return `
(function() {
  try {
    if (!app.documents.length) {
      return JSON.stringify({ success: false, error: "No active document found" });
    }
    var docPath = ${docPathLiteral};
    var doc = app.activeDocument;
    if (docPath) {
      var found = null;
      for (var d = 0; d < app.documents.length; d++) {
        var openDoc = app.documents[d];
        if (openDoc.fullName && openDoc.fullName.fsName === docPath) {
          found = openDoc;
          break;
        }
      }
      if (!found) {
        return JSON.stringify({
          success: false,
          error: "Document not open: " + docPath
        });
      }
      doc = found;
    }
    var prevDoc = null;
    try {
      prevDoc = app.activeDocument;
      app.activeDocument = doc;
    } catch (activateErr) { }

    var tempItems = [];
    var swatches = doc.swatches;
    for (var s = 0; s < swatches.length; s++) {
      var swatchName = swatches[s].name;
      if (swatchName && swatchName.indexOf("$") === 0) {
        try {
          var tempRect = doc.pathItems.rectangle(0, 0, 25, 25);
          tempRect.fillColor = doc.swatches.getByName(swatchName).color;
          tempItems.push(tempRect);
        } catch (tempErr) { }
      }
    }

    var actionSetName = "unusedsw";
    var actionName = "swtchdel";
    var actionString = [
      "/version 3",
      "/name [ 8",
      "756e757365647377",
      "]",
      "/isOpen 1",
      "/actionCount 1",
      "/action-1 {",
      "/name [ 8",
      "737774636864656c",
      "]",
      "/keyIndex 0",
      "/colorIndex 0",
      "/isOpen 0",
      "/eventCount 2",
      "/event-1 {",
      "/useRulersIn1stQuadrant 0",
      "/internalName (ai_plugin_swatches)",
      "/localizedName [ 8",
      "5377617463686573",
      "]",
      "/isOpen 0",
      "/isOn 1",
      "/hasDialog 0",
      "/parameterCount 1",
      "/parameter-1 {",
      "/key 1835363957",
      "/showInPalette 4294967295",
      "/type (enumerated)",
      "/name [ 17",
      "    53656c65637420416c6c20556e75736564",
      "]",
      "/value 11",
      "}",
      "}",
      "/event-2 {",
      "/useRulersIn1stQuadrant 0",
      "/internalName (ai_plugin_swatches)",
      "/localizedName [ 8",
      "5377617463686573",
      "]",
      "/isOpen 0",
      "/isOn 1",
      "/hasDialog 1",
      "/showDialog 0",
      "/parameterCount 1",
      "/parameter-1 {",
      "/key 1835363957",
      "/showInPalette 4294967295",
      "/type (enumerated)",
      "/name [ 13",
      "    44656c65746520537761746368",
      "]",
      "/value 3",
      "}",
      "}",
      "}"
    ].join("\\n");

    var tempFile = new File(Folder.temp.fsName + "/leap_unusedswatches.aia");
    if (tempFile.exists) {
      tempFile.remove();
    }
    tempFile.open("w");
    tempFile.write(actionString);
    tempFile.close();
    app.loadAction(tempFile);
    app.doScript(actionName, actionSetName);
    app.unloadAction(actionSetName, "");
    tempFile.remove();

    if (tempItems.length) {
      for (var t = tempItems.length - 1; t >= 0; t--) {
        try {
          tempItems[t].remove();
        } catch (removeTempErr) { }
      }
    }

    try {
      doc.save();
    } catch (saveErr) { }

    if (prevDoc) {
      try {
        app.activeDocument = prevDoc;
      } catch (restoreErr) { }
    }

    var docLabel = "document";
    try {
      docLabel = doc.name;
    } catch (nameErr) { }

    return JSON.stringify({
      success: true,
      message: "Unused swatches removed from " + docLabel
    });
  } catch (e) {
    try {
      app.unloadAction("unusedsw", "");
    } catch (unloadErr) { }
    return JSON.stringify({
      success: false,
      error: e && e.message ? e.message : String(e)
    });
  }
})();
`;
 }

 /** ExtendScript body aligned with React exportPostscript.script.ts (LEAP Color Separator). */
 private buildExportPostscriptScript(
  inks: string[],
  ppdName: string,
  settingsKey: string,
  defaultPsSuffix: string
 ): string {
  const safeInks = Array.isArray(inks) ? inks : [];
  const inksLiteral = JSON.stringify(safeInks);
  const ppdNameLiteral = JSON.stringify(ppdName || 'IBlock v2');
  const settingsKeyLiteral = JSON.stringify(settingsKey);
  const defaultPsSuffixLiteral = JSON.stringify(defaultPsSuffix);
  const exportPathResolverCode = this.buildExportPathResolverScript();
  return `
(function() {
  ${exportPathResolverCode}
  try {
    var inks = ${inksLiteral};
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
    for (var abIndex = 0; abIndex < doc.artboards.length; abIndex++) {
      var ab = doc.artboards[abIndex];
      var abName = (ab && ab.name != null) ? ab.name.toString() : "";
      if (abName && abName.toUpperCase() === "GRID") {
        gridArtboardIndex = abIndex;
        break;
      }
    }

    if (gridArtboardIndex === -1) {
      return JSON.stringify({
        success: false,
        error: "Artboard named \\"GRID\\" not found"
      });
    }

    var docFile = new File(doc.fullName);
    var docFolder = docFile.parent;
    var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
    var defaultOutputFile = new File(docFolder.fsName + "/" + docName + ${defaultPsSuffixLiteral});
    var outputFile = resolveExportFilePath(${settingsKeyLiteral}, defaultOutputFile, doc, "ps");
    var outputPath = outputFile.fsName;
    // Settings may target the final PDF path; Distiller needs a .ps source file
    if (/\\.pdf$/i.test(outputPath)) {
      outputPath = outputPath.replace(/\\.pdf$/i, ".ps");
      outputFile = new File(outputPath);
    }

    var flatOptions = new PrintFlattenerOptions();
    flatOptions.clipComplexRegions = false;
    flatOptions.convertStrokesToOutlines = false;
    flatOptions.convertTextToOutlines = false;
    flatOptions.flatteningBalance = 100;
    flatOptions.gradientResolution = 300;
    flatOptions.rasterizationResolution = 300;

    var fontOptions = new PrintFontOptions();
    fontOptions.downloadFonts = PrintFontDownloadMode.DOWNLOADSUBSET;

    var jobOptions = new PrintJobOptions();
    jobOptions.copies = 1;
    jobOptions.printArea = PrintingBounds.ARTBOARDBOUNDS;
    jobOptions.printAllArtboards = false;
    jobOptions.artboardRange = (gridArtboardIndex + 1).toString();
    jobOptions.file = new File(outputPath);

    var colorSepOptions = new PrintColorSeparationOptions();
    colorSepOptions.colorSeparationMode = PrintColorSeparationMode.HOSTBASEDSEPARATION;
    colorSepOptions.convertSpotColors = false;
    colorSepOptions.overprintBlack = false;

    function normalizeInkName(name) {
      return String(name == null ? "" : name)
        .replace(/\\s+/g, " ")
        .replace(/^\\s+|\\s+$/g, "")
        .toLowerCase();
    }
    var inksLookup = {};
    for (var i = 0; i < inks.length; i++) {
      inksLookup[normalizeInkName(inks[i])] = true;
    }

    // Enable plates in the panel list; disable every other ink.
    function applyInkStatuses(list) {
      var report = [];
      for (var i = 0; i < list.length; i++) {
        var ink = list[i];
        var normalizedName = normalizeInkName(ink.name);
        var enabled = !!inksLookup[normalizedName];
        try {
          ink.inkInfo.printingStatus = enabled ? InkPrintStatus.ENABLEINK : InkPrintStatus.DISABLEINK;
        } catch (statusErr) {}
        report.push({ name: String(ink.name), normalized: normalizedName, enabled: enabled });
      }
      return report;
    }
    var inkList = doc.inkList;
    var inkDebug = applyInkStatuses(inkList);
    colorSepOptions.inkList = inkList;

    var marksOptions = new PrintPageMarksOptions();
    marksOptions.trimMarks = false;
    marksOptions.registrationMarks = false;
    marksOptions.colorBars = false;
    marksOptions.pageInformationMarks = false;

    var psOptions = new PrintPostScriptOptions();
    psOptions.postScriptLevel = PrinterPostScriptLevelEnum.PSLEVEL2;
    psOptions.binaryPrinting = false;
    psOptions.imageCompression = PostScriptImageCompressionType.IMAGECOMPRESSIONNONE;

    var printCoordinateOptions = new PrintCoordinateOptions();
    printCoordinateOptions.fitToPage = true;

    var printOptions = new PrintOptions();
    printOptions.printPreset = 'LEAP_SEPS_POSTSCRIPT';
    printOptions.colorSeparationOptions = colorSepOptions;
    printOptions.flattenerOptions = flatOptions;
    printOptions.fontOptions = fontOptions;
    printOptions.jobOptions = jobOptions;
    printOptions.pageMarksOptions = marksOptions;
    printOptions.coordinateOptions = printCoordinateOptions;
    printOptions.postScriptOptions = psOptions;
    // NOTE: Do NOT set printOptions.printerName / printOptions.PPDName by script.
    // On Illustrator 2026 this makes print() dereference a null pointer and hard-crash
    // (the PPD model name cannot be resolved unless the PPD has already been initialized
    // by a manual File > Print). The print preset above carries the printer/PPD instead.
    // printOptions.printerName = 'Adobe PostScript File';
    // printOptions.PPDName = ${ppdNameLiteral};

    // Prime the PPD/printer subsystem (read-only) so a cold launch doesn't need a manual
    // File > Print first. Empty on a fresh launch until these are read.
    var ppdPrime = { ppdCount: -1, printerCount: -1 };
    try { var _ppdList = app.PPDFileList; ppdPrime.ppdCount = _ppdList ? _ppdList.length : -1; } catch (ppdErr) {}
    try { var _prnList = app.printerList; ppdPrime.printerCount = _prnList ? _prnList.length : -1; } catch (prnErr) {}
    if (ppdPrime.ppdCount <= 0 && ppdPrime.printerCount <= 0) {
      return JSON.stringify({
        success: false,
        error: "PostScript print subsystem is not initialized yet. Open File > Print once " +
               "(choose the Adobe PostScript File printer + IBlock PPD, then Cancel) to " +
               "initialize it, then run the export again.",
        ppdPrime: ppdPrime
      });
    }

    // Keep only plate-list spot inks; strip all other colors before print (DISABLEINK does
    // not suppress process inks). Colors are restored in the finally block after print().
    // The Registration swatch is an exception: registration-colored artwork (e.g. info /
    // labels / marks) is meant to print on EVERY separation, so it must always be kept even
    // though "[Registration]" is never in the plate list.
    function colorIsRegistration(sp) {
      if (!sp) { return false; }
      try { if (sp.colorType === ColorModel.REGISTRATION) { return true; } } catch (rcErr) {}
      try {
        var n = normalizeInkName(sp.name);
        if (n === "[registration]" || n === "registration") { return true; }
      } catch (rnErr) {}
      return false;
    }
    function colorIsPlateInk(color) {
      if (!color) { return false; }
      try {
        var tn = color.typename;
        if (tn === "NoColor") { return true; }
        if (tn === "SpotColor") {
          if (colorIsRegistration(color.spot)) { return true; }
          return !!inksLookup[normalizeInkName(color.spot.name)];
        }
        if (tn === "GradientColor") {
          var stops = color.gradient.gradientStops;
          for (var g = 0; g < stops.length; g++) {
            if (!colorIsPlateInk(stops[g].color)) { return false; }
          }
          return true;
        }
        return false;
      } catch (ciErr) { return false; }
    }
    var hiddenRestore = [];
    try {
      var allPageItems = doc.pageItems;
      for (var hpi = 0; hpi < allPageItems.length; hpi++) {
        var pit = allPageItems[hpi];
        try {
          if (pit.typename === "TextFrame") {
            // Text ink lives on the character runs.
            var chars = pit.textRange.characters;
            var savedChars = [];
            for (var ci = 0; ci < chars.length; ci++) {
              try {
                var ca = chars[ci].characterAttributes;
                var sc = { ca: ca };
                var chg = false;
                if (!colorIsPlateInk(ca.fillColor)) { sc.fill = ca.fillColor; ca.fillColor = new NoColor(); chg = true; }
                if (!colorIsPlateInk(ca.strokeColor)) { sc.stroke = ca.strokeColor; ca.strokeColor = new NoColor(); chg = true; }
                if (chg) { savedChars.push(sc); }
              } catch (cErr) {}
            }
            if (savedChars.length) { hiddenRestore.push({ kind: "text", chars: savedChars }); }
          } else if (pit.typename === "PathItem" || pit.typename === "CompoundPathItem") {
            var entry = { kind: "path", item: pit };
            var chg2 = false;
            if (pit.filled === true && !colorIsPlateInk(pit.fillColor)) { entry.fill = pit.fillColor; pit.fillColor = new NoColor(); chg2 = true; }
            if (pit.stroked === true && !colorIsPlateInk(pit.strokeColor)) { entry.stroke = pit.strokeColor; pit.strokeColor = new NoColor(); chg2 = true; }
            if (chg2) { hiddenRestore.push(entry); }
          }
        } catch (hpErr) {}
      }
    } catch (scanErr) {}

    var previousActiveArtboardIndex = doc.artboards.getActiveArtboardIndex();
    var finalInkReport = inkDebug;
    try {
      doc.artboards.setActiveArtboardIndex(gridArtboardIndex);
      // Re-apply ink statuses on a fresh inkList right before print.
      var freshInkList = doc.inkList;
      finalInkReport = applyInkStatuses(freshInkList);
      colorSepOptions.inkList = freshInkList;
      printOptions.colorSeparationOptions = colorSepOptions;
      app.activeDocument.print(printOptions);
    } finally {
      doc.artboards.setActiveArtboardIndex(previousActiveArtboardIndex);
      // Restore stripped colors exactly — document left unchanged.
      for (var hri = 0; hri < hiddenRestore.length; hri++) {
        try {
          var rEntry = hiddenRestore[hri];
          if (rEntry.kind === "text") {
            for (var sci = 0; sci < rEntry.chars.length; sci++) {
              try {
                var scr = rEntry.chars[sci];
                if (typeof scr.fill !== "undefined") { scr.ca.fillColor = scr.fill; }
                if (typeof scr.stroke !== "undefined") { scr.ca.strokeColor = scr.stroke; }
              } catch (tcErr) {}
            }
          } else {
            if (typeof rEntry.fill !== "undefined") { rEntry.item.fillColor = rEntry.fill; }
            if (typeof rEntry.stroke !== "undefined") { rEntry.item.strokeColor = rEntry.stroke; }
          }
        } catch (hrErr) {}
      }
    }

    // Per-ink report to a log file (console.table truncates).
    try {
      var logDir = new Folder(Folder.myDocuments.fsName + "/LEAP Settings/LEAP_Seps");
      if (!logDir.exists) { logDir.create(); }
      var logF = new File(logDir.fsName + "/postscript_inks.log");
      logF.encoding = "UTF-8";
      logF.open("a");
      logF.writeln("===== PS export @ " + (new Date()).toString() + " =====");
      logF.writeln("output: " + outputPath);
      logF.writeln("requestedInks (" + inks.length + "): " + inks.join(", "));
      logF.writeln("stripped non-plate-ink items: " + hiddenRestore.length);
      logF.writeln("enumerated inks (" + finalInkReport.length + "):");
      for (var li = 0; li < finalInkReport.length; li++) {
        logF.writeln(
          "  " + (finalInkReport[li].enabled ? "[ON ] " : "[off] ") +
          finalInkReport[li].name + "  (norm: " + finalInkReport[li].normalized + ")"
        );
      }
      logF.writeln("");
      logF.close();
    } catch (logErr) {}

    return JSON.stringify({
      success: true,
      message: "PostScript exported successfully",
      ppdPrime: ppdPrime,
      inkReport: finalInkReport,
      strippedNonPlateItems: hiddenRestore.length,
      filePath: outputPath,
      artboardName: "GRID",
      artboardIndex: gridArtboardIndex,
      requestedInks: inks,
      inkDebug: inkDebug
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

 getInkInformationBatch(
  inkNames: string[],
  profileName?: string,
  profileCode?: string
 ): Promise<any> {
  this.log('getInkInformationBatch called with ' + inkNames.length + ' ink names');

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getInkInformationBatch(inkNames, profileName, profileCode)
    .then((result: any) => {
     return result;
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 getProfileInformation(
  profileCode: string,
  options?: { distress?: boolean | string }
 ): Promise<any> {
  this.log('getProfileInformation called for: ' + profileCode);

  return this.ensureSession().then(() => {
   return (window as any).leap
    .getProfileInformation(profileCode, options || {})
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
  options?: { recreateInActiveDoc?: boolean; sepsTemplateFileName?: string }
 ): Promise<any> {
  this.log(
   'performSeparation called for: ' +
   graphicName +
   (options?.recreateInActiveDoc ? ' (recreate in active doc)' : '')
  );
  this.leapSepsLog.logProcess('performSeparation start', {
   graphicName,
   styleCodes,
   profileCode: profileMetadata?.profileCode,
   profileName: profileMetadata?.profileName
  });

  return this.ensureSession().then(() => {
   const params: any = {
    graphicName: graphicName,
    styleCodes: styleCodes,
    profileMetadata: profileMetadata
   };
   if (options?.recreateInActiveDoc === true) {
    params.recreateInActiveDoc = true;
   }
   if (options?.sepsTemplateFileName) {
    params.sepsTemplateFileName = String(options.sepsTemplateFileName);
   }

   return (window as any).leap
    .scriptLoader()
    .evalScript('handlePerformSeparation', params)
    .then((res: string) => {
     const result = JSON.parse(res);
     console.log('[Controller] performSeparation result:', result);
     if (!result?.success) {
      this.leapSepsLog.logError('performSeparation', result?.error || 'Failed', result);
      return result;
     }
     this.leapSepsLog.logProcess('performSeparation JSX success', {
      plates: result.layerNames?.length,
      sepFile: result.separatedDocumentPath
        ? String(result.separatedDocumentPath).split('/').pop()
        : undefined
     });
     return result;
    })
    .catch((err: any) => {
     this.leapSepsLog.logError('performSeparation', err);
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
     if (!result?.success) {
      return result;
     }
     return this.removeUnusedSwatches().then((swResult) => ({
      ...result,
      removeUnusedSwatches: swResult
     }));
    })
    .catch((err: any) => {
     throw err;
    });
  });
 }

 /**
  * Regenerate choke and underbase from existing ink plates in SEPARATED_ART (ink plates unchanged).
  */
 regenerateUnderbaseFromExistingInks(
  cleanup?: { deleteUnpaintedPaths: boolean; deleteLeftoverPaths: boolean }
 ): Promise<any> {
  return this.ensureSession().then(() => {
   const params: Record<string, unknown> = {};
   if (cleanup) {
    params['deleteUnpaintedPaths'] = cleanup.deleteUnpaintedPaths === true;
    params['deleteLeftoverPaths'] = cleanup.deleteLeftoverPaths === true;
   }
   return (window as any).leap
    .scriptLoader()
    .evalScript('handleRegenerateUnderbaseFromExistingInks', params)
    .then((res: string) => {
     const result = JSON.parse(res);
     if (!result?.success) {
      this.leapSepsLog.logError('regenerateUnderbaseFromExistingInks', result?.error || 'Failed', result);
      return result;
     }
     this.leapSepsLog.logProcess('regenerateUnderbaseFromExistingInks complete', result);
     return result;
    })
    .catch((err: any) => {
     this.leapSepsLog.logError('regenerateUnderbaseFromExistingInks', err);
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
      koDarkColorNames: 'Black, PANTONE PROCESS BLACK C',
      meshValues: '',
      sepsTemplateFileName: 'SEP-GRID-TEMPLATE.ai'
     }
    });
    return;
   }

   const os = (window as any).cep_node.require('os');
   const path = (window as any).cep_node.require('path');
   const homeDir = os.homedir();
   const settingsFolder = path.join(homeDir, 'Documents', 'LEAP Settings', 'LEAP_Seps');
   const settingsFile = path.join(settingsFolder, 'general_settings.json');

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
       koDarkColorNames: 'Black, PANTONE PROCESS BLACK C',
       meshValues: '',
       sepsTemplateFileName: 'SEP-GRID-TEMPLATE.ai'
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
      koDarkColorNames: 'Black, PANTONE PROCESS BLACK C',
      meshValues: '',
      sepsTemplateFileName: 'SEP-GRID-TEMPLATE.ai'
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
  meshValues?: string;
  sepsTemplateFileName?: string;
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
   const settingsFile = path.join(settingsFolder, 'general_settings.json');

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

 loadExportSettings(): Promise<{ success: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
   const defaultSettings = {
    printGuideFilePath: '',
    separationPreviewFilePath: '',
    postscriptFilePath: ''
   };
   const cep = (window as any).cep;
   if (!cep || !cep.fs) {
    resolve({ success: true, data: defaultSettings });
    return;
   }

   const os = (window as any).cep_node.require('os');
   const path = (window as any).cep_node.require('path');
   const homeDir = os.homedir();
   const settingsFolder = path.join(homeDir, 'Documents', 'LEAP Settings', 'LEAP_Seps');
   const settingsFile = path.join(settingsFolder, 'export_settings.json');

   const result = cep.fs.readFile(settingsFile);
   if (result.err === 0) {
    try {
     const data = JSON.parse(result.data);
     resolve({ success: true, data: { ...defaultSettings, ...(data || {}) } });
    } catch (e) {
     resolve({ success: true, data: defaultSettings });
    }
   } else {
    resolve({ success: true, data: defaultSettings });
   }
  });
 }

 saveExportSettings(settings: {
  printGuideFilePath?: string;
  separationPreviewFilePath?: string;
  postscriptFilePath?: string;
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
   const settingsFile = path.join(settingsFolder, 'export_settings.json');

   const mkdirResult = cep.fs.makedir(settingsFolder);
   if (mkdirResult.err !== 0 && mkdirResult.err !== 17) {
    resolve({ success: false, error: 'Failed to create settings directory' });
    return;
   }

   const normalizedSettings = {
    printGuideFilePath: settings?.printGuideFilePath || '',
    separationPreviewFilePath: settings?.separationPreviewFilePath || '',
    postscriptFilePath: settings?.postscriptFilePath || ''
   };
   const writeResult = cep.fs.writeFile(settingsFile, JSON.stringify(normalizedSettings, null, 2));
   if (writeResult.err === 0) {
    resolve({ success: true });
   } else {
    resolve({ success: false, error: 'Error writing export settings file: ' + writeResult.err });
   }
  });
 }

 async getExportSettingsTokenData(): Promise<{
  success: boolean;
  excelColumns: string[];
  graphicPositions: string[];
  error?: string;
 }> {
  try {
   const documentPath = await this.getActiveDocumentPathForClient();
   let excelColumns = await this.getBatchExcelColumnNamesFromLeap(documentPath);
   if (excelColumns.length === 0) {
    excelColumns = this.getBatchExcelColumnNames(documentPath);
   }
   let graphicPositions: string[] = [];
   try {
    const positionsResult = await this.getGraphicPlacementOptions(undefined, documentPath);
    if (positionsResult?.success && Array.isArray(positionsResult.placements)) {
     graphicPositions = positionsResult.placements;
    } else if (Array.isArray(positionsResult)) {
     graphicPositions = positionsResult;
    }
   } catch (_) {
    graphicPositions = [];
   }
   return {
    success: true,
    excelColumns,
    graphicPositions: this.uniqueNonEmptyStrings(graphicPositions)
   };
  } catch (error: any) {
   return {
    success: false,
    excelColumns: [],
    graphicPositions: [],
    error: error?.message || String(error)
   };
  }
 }

 private async getBatchExcelColumnNamesFromLeap(documentPath: string): Promise<string[]> {
  try {
   const result = await (window as any).leap.getBatchExcelColumnNames(documentPath);
   return this.uniqueNonEmptyStrings(result?.success && Array.isArray(result.columns) ? result.columns : []);
  } catch (_) {
   return [];
  }
 }

 private async getActiveDocumentPathForClient(): Promise<string> {
  try {
   const res = await (window as any).leap.scriptLoader().evalScript('handleGetActiveDocumentPath', {});
   const data = JSON.parse(res);
   return data?.success && data?.documentPath ? String(data.documentPath) : '';
  } catch (_) {
   return '';
  }
 }

 private getBatchExcelColumnNames(documentPath: string): string[] {
  try {
   const req = (window as any)?.cep_node?.require;
   if (!req || !documentPath) return [];
   const fs = req('fs');
   const path = req('path');
   const XLSX = req('xlsx');
   const excelFilePath = this.findBatchExcelFile(documentPath, fs, path);
   if (!excelFilePath) return [];
   let workbook;
   try {
    const fileBuffer = fs.readFileSync(excelFilePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   } catch (_) {
    workbook = XLSX.readFile(excelFilePath);
   }
   const sheetName = workbook?.SheetNames?.[0];
   const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
   if (!worksheet) return [];
   const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
   const headerRow = Array.isArray(rows) && rows.length > 0 ? rows[0] : [];
   return this.uniqueNonEmptyStrings(Array.isArray(headerRow) ? headerRow.map((value: any) => String(value || '')) : []);
  } catch (_) {
   return [];
  }
 }

 private findBatchExcelFile(documentPath: string, fs: any, path: any): string {
  try {
   if (!documentPath || !fs.existsSync(documentPath)) return '';
   const firstExcelFromBatchFolder = (batchFolderPath: string): string => {
    if (!batchFolderPath || !fs.existsSync(batchFolderPath)) return '';
    const files = fs
     .readdirSync(batchFolderPath)
     .filter((file: string) => {
      const filePath = path.join(batchFolderPath, file);
      return fs.statSync(filePath).isFile() && /\.xlsx$/i.test(file);
     })
     .sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return files.length > 0 ? path.join(batchFolderPath, files[0]) : '';
   };

   let walkDir = path.dirname(documentPath);
   while (walkDir) {
    const entries = fs.existsSync(walkDir) ? fs.readdirSync(walkDir) : [];
    const batchFolderName = entries.find((entry: string) => {
     const entryPath = path.join(walkDir, entry);
     return fs.statSync(entryPath).isDirectory() && entry.toUpperCase() === 'BATCH';
    });
    if (batchFolderName) {
     const excelPath = firstExcelFromBatchFolder(path.join(walkDir, batchFolderName));
     if (excelPath) return excelPath;
    }
    const parentWalkDir = path.dirname(walkDir);
    if (!parentWalkDir || parentWalkDir === walkDir) break;
    walkDir = parentWalkDir;
   }

   let currentDir = path.dirname(documentPath);
   let teamoutsFolder = '';
   while (currentDir) {
    const folderName = path.basename(currentDir);
    if (folderName.toUpperCase().includes('TEAMOUTS') || folderName.toUpperCase().includes('01')) {
     teamoutsFolder = currentDir;
     break;
    }
    const parentDir = path.dirname(currentDir);
    if (!parentDir || parentDir === currentDir) break;
    currentDir = parentDir;
   }
   if (!teamoutsFolder) return '';
   const batchParentDir = path.dirname(path.dirname(teamoutsFolder));
   const batchFolderPath = path.join(batchParentDir, 'BATCH');
   if (!fs.existsSync(batchFolderPath) || !fs.statSync(batchFolderPath).isDirectory()) return '';
   const files = fs
    .readdirSync(batchFolderPath)
    .filter((file: string) => {
     const filePath = path.join(batchFolderPath, file);
     return fs.statSync(filePath).isFile() && /\.xlsx$/i.test(file);
    })
    .sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
   return files.length > 0 ? path.join(batchFolderPath, files[0]) : '';
  } catch (_) {
   return '';
  }
 }

 private uniqueNonEmptyStrings(values: any[]): string[] {
  const seen = new Set<string>();
  return (Array.isArray(values) ? values : [])
   .map((value) => String(value || '').trim())
   .filter((value) => {
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
   });
 }

 getSepsTemplateFiles(): Promise<{ success: boolean; files: string[]; error?: string }> {
  return this.getLeapServerDataPath()
   .then((basePath) => {
    const normalizedBasePath = String(basePath || '').trim().replace(/[\/\\]+$/, '');
    if (!normalizedBasePath) {
     return { success: false, files: [], error: 'LEAP server path is not configured' };
    }

    const req = (window as any)?.cep_node?.require;
    if (!req) {
     return { success: false, files: [], error: 'CEP node runtime is unavailable' };
    }

    const fs = req('fs');
    const path = req('path');
    const templatesDir = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Templates');
    if (!fs.existsSync(templatesDir)) {
     return { success: false, files: [], error: 'Templates folder not found: ' + templatesDir };
    }

    const aiFiles = (fs.readdirSync(templatesDir) as string[])
     .filter((name: string) => /\.ai$/i.test(name))
     .sort((a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return { success: true, files: aiFiles };
   })
   .catch((err: any) => ({
    success: false,
    files: [],
    error: err?.message || String(err)
   }));
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

 private log(val: string): void {
  this.leapSepsLog.logInfo('Controller', val);
 }

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
