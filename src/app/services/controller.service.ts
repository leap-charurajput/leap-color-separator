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
  const twoHitsRaw = entry.Two_Hits != null ? String(entry.Two_Hits).trim().toUpperCase() : 'N';
  const hitsCount = twoHitsRaw === 'Y' || twoHitsRaw === 'YES' ? 2 : 1;
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
  let underbaseCount = enabled && row?.underbaseCount != null ? parseInt(row.underbaseCount, 10) : 1;
  if (isNaN(underbaseCount) || underbaseCount < 1) underbaseCount = 1;
  if (underbaseCount > 4) underbaseCount = 4;
  return {
   Color_Mesh: colorMesh,
   Ink_Color: inkColor,
   Print_Method: row?.printMethod != null ? String(row.printMethod).trim() : '',
   Profile: profileName,
   profileCode: profileCode != null ? String(profileCode).trim() : '',
   Two_Hits: hitsCount >= 2 ? 'Y' : 'N',
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

function findExportValueInObject(obj, key) {
 if (!obj || typeof obj !== "object") return null;
 var normalizedSearchKey = normalizeExportLookupKey(key);
 if (obj.hasOwnProperty(key)) return obj[key];
 for (var prop in obj) {
  if (!obj.hasOwnProperty(prop)) continue;
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

function getExportVariableContext(doc) {
 var docFile = new File(doc.fullName);
 var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
 var meta = getExportXmpMetadata(doc) || {};
 var jsonData = getExportJsonData(docFile) || {};
 var batch = meta.batchVariableSource || {};
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
 setExportAlias(aliases, "Team Code", findExportValueInObject(jsonData, "TeamCode") || teamCodeFromPath || findExportValueInObject(batch, "Team Code"));
 setExportAlias(aliases, "League", findExportValueInObject(jsonData, "League") || leagueFromPath);
 return {
  aliases: aliases,
  batch: batch,
  jsonData: jsonData,
  meta: meta,
  styleInfo: meta.styleInfo || {}
 };
}

function getExportTemplateValue(token, context) {
 var sources = [context.aliases, context.batch, context.jsonData, context.meta, context.styleInfo];
 for (var i = 0; i < sources.length; i++) {
  var value = findExportValueInObject(sources[i], token);
  if (value !== null && value !== undefined && value !== "") return sanitizeExportPathValue(value);
 }
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
 var parts = normalized.split("/");
 while (parts.length > 0 && parts[parts.length - 1] === "") {
  parts.pop();
 }

 var resolvedParts = [];
 for (var i = 0; i < parts.length; i++) {
  if (parts[i] === "" && i === 0) {
   resolvedParts.push("");
   continue;
  }
  if (parts[i] === "") continue;
  resolvedParts.push(resolveExportPathSegment(parts[i], context));
 }

 var fileName = defaultFile.name;
 if (resolvedParts.length > 0) {
  var lastPart = resolvedParts[resolvedParts.length - 1];
  if (lastPart && /\\.[^.\\/]+$/.test(lastPart)) {
   fileName = lastPart;
   resolvedParts.pop();
  }
 }

 var dirPath = resolvedParts.join("/");
 if (!dirPath) {
  dirPath = trimExportPathSlashes(defaultFile.parent.fsName);
 }

 if (!isAbsoluteExportPath(dirPath)) {
  dirPath = joinExportPath(defaultFile.parent.fsName, dirPath);
 }

 var targetFile = new File(joinExportPath(dirPath, fileName));
 ensureExportFolder(targetFile.parent);
 return targetFile;
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
 if (!isAbsoluteExportPath(resolvedPath)) {
  resolvedPath = defaultFile.parent.fsName + "/" + resolvedPath;
 }
 var normalized = resolvedPath.replace(/\\\\/g, "/");
 var defaultName = defaultFile.name;
 var targetFile;
 if (/\\/$/.test(normalized)) {
  targetFile = new File(resolvedPath + defaultName);
 } else {
  var possibleFolder = new Folder(resolvedPath);
  if (possibleFolder.exists) {
   targetFile = new File(possibleFolder.fsName + "/" + defaultName);
  } else {
   targetFile = new File(ensureExportExtension(resolvedPath, extension));
  }
 }
 ensureExportFolder(targetFile.parent);
 return targetFile;
}
`;
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

 exportPostscript(inks: string[]): Promise<any> {
  this.log('exportPostscript called with ' + (inks?.length ?? 0) + ' inks');

  return this.ensureSession().then(() => {
   return this.loadGeneralSettings().then((settingsResult) => {
    const resolvedPpdName =
     settingsResult?.success && settingsResult?.data?.ppdName != null
      ? String(settingsResult.data.ppdName).trim() || 'IBlock v2'
      : 'IBlock v2';
    const script = this.buildExportPostscriptScript(
     Array.isArray(inks) ? inks : [],
     resolvedPpdName
    );
    return evalScript(script)
     .then(async (res: unknown) => {
      const str = typeof res === 'string' ? res : '';
      const result = str ? JSON.parse(str) : { success: false, error: 'No result' };

      if (result?.success) {
       const msg = result.message || 'PostScript exported successfully';
       console.log('[exportPostscript]', msg, result.filePath ? `→ ${result.filePath}` : '');
       if (result.inkDebug) {
        console.log('[exportPostscript] requested inks:', result.requestedInks);
        console.table(result.inkDebug);
       }
      } else {
       console.error('[exportPostscript]', result?.error || 'Failed');
      }

      if (result?.success && result?.filePath) {
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

 /** ExtendScript body aligned with React exportPostscript.script.ts (LEAP Color Separator). */
 private buildExportPostscriptScript(inks: string[], ppdName: string): string {
  const safeInks = Array.isArray(inks) ? inks : [];
  const inksLiteral = JSON.stringify(safeInks);
  const ppdNameLiteral = JSON.stringify(ppdName || 'IBlock v2');
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
    var defaultOutputFile = new File(docFolder.fsName + "/" + docName + ".ps");
    var outputFile = resolveExportFilePath("postscriptFilePath", defaultOutputFile, doc, "ps");
    var outputPath = outputFile.fsName;

    // Flattener
    var flatOptions = new PrintFlattenerOptions();
    flatOptions.clipComplexRegions = false;
    flatOptions.convertStrokesToOutlines = false;
    flatOptions.convertTextToOutlines = false;
    flatOptions.flatteningBalance = 100;
    flatOptions.gradientResolution = 300;
    flatOptions.rasterizationResolution = 300;

     // Font options
    var fontOptions = new PrintFontOptions();
    fontOptions.downloadFonts = PrintFontDownloadMode.DOWNLOADSUBSET;


    // Job options for the print job
    var jobOptions = new PrintJobOptions();
    jobOptions.copies = 1;
    jobOptions.printArea = PrintingBounds.ARTBOARDBOUNDS;
    jobOptions.printAllArtboards = false;
    jobOptions.artboardRange = (gridArtboardIndex + 1).toString();
    jobOptions.file = new File(outputPath);

     // Color separation options
    var colorSepOptions = new PrintColorSeparationOptions();
    colorSepOptions.colorSeparationMode = PrintColorSeparationMode.HOSTBASEDSEPARATION;
    colorSepOptions.convertSpotColors = false;
    colorSepOptions.overprintBlack = false;

    // Normalize like React exportPostscript.script.ts (collapse whitespace + trim + lowercase)
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

    // ExtendScript has no console.log — return inkDebug for panel DevTools
    var inkDebug = [];

    // Read ink list once; set printingStatus on each ink (do not filter the list)
    var inkList = doc.inkList;
    for (var i = 0; i < inkList.length; i++) {
      var ink = inkList[i];
      var normalizedName = normalizeInkName(ink.name);
      var enabled = !!inksLookup[normalizedName];
      inkDebug.push({
        name: String(ink.name),
        normalized: normalizedName,
        enabled: enabled
      });
      if (enabled) {
        ink.inkInfo.printingStatus = InkPrintStatus.ENABLEINK;
      } else {
        ink.inkInfo.printingStatus = InkPrintStatus.DISABLEINK;
      }
    }

    colorSepOptions.inkList = inkList;


 		// Page marks options
    var marksOptions = new PrintPageMarksOptions();
    marksOptions.trimMarks = false;
    marksOptions.registrationMarks = false;
    marksOptions.colorBars = false;
    marksOptions.pageInformationMarks = false;

    // PostScript
		var psOptions = new PrintPostScriptOptions();
		psOptions.postScriptLevel = PrinterPostScriptLevelEnum.PSLEVEL2;
		psOptions.binaryPrinting = false;
		psOptions.imageCompression = PostScriptImageCompressionType.IMAGECOMPRESSIONNONE

    var printCoordinateOptions = new PrintCoordinateOptions();
    printCoordinateOptions.fitToPage = true;

    // Print options
		var printOptions = new PrintOptions();
    printOptions.printPreset = 'LEAP_SEPS_POSTSCRIPT';
    printOptions.colorSeparationOptions = colorSepOptions;
    // printOptions.file = new File(outputPath);
    printOptions.flattenerOptions = flatOptions;
    printOptions.fontOptions = fontOptions;
    printOptions.jobOptions = jobOptions;
    printOptions.pageMarksOptions = marksOptions;
    // printOptions.paperOptions = paperOptions;
    printOptions.coordinateOptions = printCoordinateOptions;
    printOptions.postScriptOptions = psOptions;
    // printOptions.printerName = 'Adobe PostScript File';
    // printOptions.PPDName = ${ppdNameLiteral};

    var previousActiveArtboardIndex = doc.artboards.getActiveArtboardIndex();
    try {
      doc.artboards.setActiveArtboardIndex(gridArtboardIndex);
      app.activeDocument.print(printOptions);
    } finally {
      doc.artboards.setActiveArtboardIndex(previousActiveArtboardIndex);
    }

    return JSON.stringify({
      success: true,
      message: "PostScript exported successfully",
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

 exportSeparationsPreviewPDF(): Promise<any> {
  this.log('exportSeparationsPreviewPDF called');

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
    var defaultDestFile = new File(docFolder.fsName + "/" + docName + "_SeparationsPreview.pdf");
    var destFile = resolveExportFilePath("separationPreviewFilePath", defaultDestFile, doc, "pdf");

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
  options?: { recreateInActiveDoc?: boolean; sepsTemplateFileName?: string }
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
   if (options?.sepsTemplateFileName) {
    params.sepsTemplateFileName = String(options.sepsTemplateFileName);
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
