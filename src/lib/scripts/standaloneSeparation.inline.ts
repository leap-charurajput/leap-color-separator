/*
 * ExtendScript (host) orchestration for the STANDALONE (non-LEAP) separation.
 *
 * Inline host-code string (same delivery pattern as the other inline scripts) run via evalScript.
 * It reuses the REAL separation engine already loaded from cep_adapters.jsx / color_separation.jsx /
 * utilities.jsx by calling those global helpers (copyAndPrepareSEPDocument, placeAndEmbedGraphicAI,
 * splitColors, generateUnderbase, ink-exception + formatting helpers, XMP). It mirrors
 * handlePerformSeparation, changing only the three things that differ for a non-LEAP file:
 *   1) metadata comes from the form (params.jsonData / params.profileMetadata), not a team JSON;
 *   2) the graphic comes from the exported ASSETS .ai (params.exportedFilePath), not 02 GRAPHICS;
 *   3) output is written to a flat SEPS folder at the same level as ASSETS (no 09 SEPARATIONS tree).
 *
 * handlePerformSeparation and the LEAP path are untouched.
 */
export const standaloneSeparationHostCode = `
/*
 * Diagnostics are COLLECTED and returned in the response, not only written with appendLeapSepLog.
 * On this setup the host-side file write silently fails — appendLeapSepLog swallows every error in a
 * bare try/catch and no [JSX] line ever reaches leap_seps.log — while the panel-side console logger
 * demonstrably works. The caller console.logs these, so they land in the log that way regardless.
 * appendLeapSepLog is still called too, so the lines also appear directly if host logging recovers.
 */
var stdSepDebug = [];
function stdSepLog(msg) {
	try { stdSepDebug.push(String(msg)); } catch (ePush) { }
	try { stdSepLog("" + msg); } catch (eLog) { }
}

function stdSepErr(msg, extra) {
	var out = { success: false, error: msg, debugLog: stdSepDebug };
	if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) out[k] = extra[k]; } }
	try { unloadLEAPColorSepsActions(); } catch (e) { }
	return JSON.stringify(out);
}

function standaloneSeparationRun(params) {
	/*
	 * Two-stage (same contract as the LEAP flow):
	 *   stage "prepare"  -> create SEP doc, place the ASSETS art into SIZED_GRAPHICS, flatten, stamp
	 *                       LEAPSeparationStatus = "preparedForSeps", save, STOP (user edits art).
	 *   stage "generate" -> on the open prepared SEP doc: splitColors + underbase + XMP, stamp "separated".
	 *   stage "full"     -> legacy single shot (kept; panel no longer calls it).
	 */
	var stage = params.stage || "full";
	var isPrepare = stage === "prepare";
	var isGenerate = stage === "generate";
	if (isGenerate) {
		return standaloneGenerateFromPrepared(params);
	}
	stdSepDebug = [];
	if (!params) return stdSepErr("No parameters provided");

	var graphicName = params.graphicName ? String(params.graphicName) : "";
	var styleCodes = params.styleCodes || [];
	var profileMetadata = params.profileMetadata || {};
	var jsonData = params.jsonData || {};
	var sepsTemplateFileName = params.sepsTemplateFileName || "SEP-GRID-TEMPLATE.ai";
	var exportedFilePath = params.exportedFilePath ? String(params.exportedFilePath) : "";
	var fromSelection = params.fromSelection === true;
	var docBaseName = params.docBaseName ? String(params.docBaseName) : "";

	if (!graphicName) return stdSepErr("Graphic name (position) is required");

	var rootFolder = null;
	var docName = "";
	var selectionItems = null;
	var sourceDoc = null;

	if (fromSelection) {
		/*
		 * "Done"-flow prepare (no ASSETS export step): the art is the CURRENT SELECTION in the
		 * source document. Capture the item references NOW — copyAndPrepareSEPDocument switches the
		 * active document, and the selection must come from the source doc. Output goes to a SEPS
		 * folder NEXT TO THE SOURCE DOCUMENT (there is no ASSETS folder on this path).
		 */
		if (app.documents.length === 0) return stdSepErr("No document is open");
		sourceDoc = app.activeDocument;
		var srcFile = null;
		try { srcFile = sourceDoc.fullName ? new File(sourceDoc.fullName) : null; } catch (eSrcF) { srcFile = null; }
		if (!srcFile || !srcFile.exists) {
			return stdSepErr("Save the document first so a SEPS folder can be created next to it");
		}
		selectionItems = [];
		var liveSel = sourceDoc.selection || [];
		for (var selI = 0; selI < liveSel.length; selI++) {
			if (liveSel[selI]) selectionItems.push(liveSel[selI]);
		}
		if (selectionItems.length === 0) {
			return stdSepErr("Nothing is selected. Select the artwork to separate, then Prepare.");
		}
		rootFolder = srcFile.parent;
		docName = (docBaseName || graphicName).replace(/[^A-Za-z0-9._-]+/g, "_");
		if (!docName) docName = "ASSET";
		stdSepLog("prepare from selection: " + selectionItems.length + " item(s), doc=" + docName);
	} else {
		if (!exportedFilePath) return stdSepErr("Exported graphic file path is required");
		var aiFile = new File(exportedFilePath);
		if (!aiFile.exists) return stdSepErr("Exported graphic file not found: " + exportedFilePath);
		/*
		 * Output: a flat SEPS folder at the SAME LEVEL as ASSETS (its sibling). A non-LEAP job has no
		 * 09 SEPARATIONS tree to anchor to, so the separation sits next to the graphic it was made from.
		 */
		var assetsFolder = aiFile.parent;                 /* .../ASSETS */
		if (!assetsFolder) return stdSepErr("Could not resolve the ASSETS folder from the exported file");
		rootFolder = assetsFolder.parent;                 /* the document folder that holds ASSETS */
		/* Base name for the separated file (mirrors the exported name, e.g. 7G_FM01_Front). */
		docName = aiFile.name.replace(/\\.[^\\.]+$/, "");
	}
	if (!rootFolder) return stdSepErr("Could not resolve the document folder");
	var sepFolder = new Folder(rootFolder.fsName + "/SEPS");
	if (!sepFolder.exists) sepFolder.create();
	if (!sepFolder.exists) return stdSepErr("Could not create the SEPS folder");

	var templateFile = getTemplateFile(sepsTemplateFileName);
	if (!templateFile) {
		var attempted = getTemplateFile.lastAttemptedPath;
		return stdSepErr(attempted
			? "SEP template not found at: " + attempted
			: "SEP template not found. Verify basePath in logobaseDataPathSettings.json.");
	}

	/* Give the pipeline a next-version number keyed on this graphic/profile (best-effort). */
	var profileNameForVersion = profileMetadata.profileName != null ? String(profileMetadata.profileName) : "";
	try {
		profileMetadata.separationVersion = getNextSeparationVersion(app.documents.length ? app.activeDocument : null, graphicName, profileNameForVersion);
	} catch (verr) { profileMetadata.separationVersion = 1; }

	stdSepLog(
		"graphic=" + graphicName +
		" profile=" + (profileMetadata.profileName || "?") + "/" + (profileMetadata.profileCode || "?") +
		" colors=[" + (profileMetadata.colorCodes ? profileMetadata.colorCodes.join(", ") : "") + "]" +
		" out=" + sepFolder.fsName
	);

	/* 1) Create the SEP doc from the template and fill its variables from the form-derived jsonData. */
	var sepDoc = copyAndPrepareSEPDocument(templateFile, sepFolder, docName, jsonData, styleCodes, profileMetadata, null);
	if (!sepDoc) return stdSepErr("Failed to create the SEP document from the template");
	var sepDocFile = new File(sepDoc.fullName);
	var sepDocPath = sepDocFile.fsName;

	try { app.activeDocument = sepDoc; } catch (eAct) { }

	/*
	 * 1b) CAD reference PNG (mirrors the LEAP flow's placeCadPngInDocument step). The path is
	 * resolved PANEL-side from a PNG folder near the source document; missing/empty -> skipped.
	 */
	if (params.cadPngPath) {
		try { placeCadPngInDocument(sepDoc, String(params.cadPngPath)); } catch (eCad) { }
	}

	/* 2) Place the art onto the SEP_ART area. */
	unlockSizedGraphicsContents(sepDoc);
	if (fromSelection) {
		/*
		 * Copy the captured selection from the source document and paste it into SIZED_GRAPHICS —
		 * the same tail the LEAP selection path uses (group, name = graphicName, centre-top align
		 * to SEP_ART, prepare, overprint off).
		 */
		var selPlacedOk = false;
		try {
			var selSizedArt = sepDoc.layers.getByName("SIZED_ART");
			var selSizedGraphics;
			try { selSizedGraphics = selSizedArt.layers.getByName("SIZED_GRAPHICS"); }
			catch (eSelSg) { selSizedGraphics = selSizedArt.layers.add(); selSizedGraphics.name = "SIZED_GRAPHICS"; }
			var selSepArtGuide = findPageItemByName(selSizedArt, "SEP_ART") || findPageItemByName(sepDoc, "SEP_ART");

			app.activeDocument = sourceDoc;
			sourceDoc.selection = null;
			var selCount = 0;
			for (var selP = 0; selP < selectionItems.length; selP++) {
				try {
					var selIt = selectionItems[selP];
					if (selIt.locked) selIt.locked = false;
					if (selIt.hidden) selIt.hidden = false;
					selIt.selected = true;
					selCount++;
				} catch (eSelOne) { }
			}
			if (selCount === 0) {
				return stdSepErr("Could not re-select the artwork", { separatedDocumentPath: sepDocPath });
			}
			app.copy();
			sourceDoc.selection = null;

			app.activeDocument = sepDoc;
			app.preferences.setBooleanPreference('layers/pastePreserve', false);
			sepDoc.activeLayer = selSizedGraphics;
			app.paste();
			if (sepDoc.selection.length > 0) {
				app.executeMenuCommand("group");
				var selPasted = sepDoc.selection && sepDoc.selection.length ? sepDoc.selection[0] : null;
				if (!selPasted) {
					try { selPasted = selSizedGraphics.pageItems[0]; } catch (eSelTop) { selPasted = null; }
				}
				if (selPasted) {
					selPasted.name = graphicName;
					/*
					 * EMBED any placed items inside the pasted selection FIRST. NN Pro products build
					 * their art from PlacedItems (linked name/number PDFs) — left linked, the flatten
					 * pass has no filled vector paths to work on and splitColors finds no ink colors
					 * ("No ink colors found in the processed art"). embed() swaps each placed item for
					 * native art in place, so collect the list first, then embed each.
					 */
					try {
						var placedList = [];
						(function collectPlaced(container) {
							try {
								if (container.typename === "PlacedItem") { placedList.push(container); return; }
								if (container.pageItems) {
									for (var cp = 0; cp < container.pageItems.length; cp++) {
										collectPlaced(container.pageItems[cp]);
									}
								}
							} catch (eWalk) { }
						})(selPasted);
						for (var pe = 0; pe < placedList.length; pe++) {
							try { placedList[pe].embed(); } catch (eEmbed) { }
						}
						if (placedList.length) {
							stdSepLog("embedded " + placedList.length + " placed item(s) from the selection");
						}
					} catch (eEmbedAll) { }
					/* embed() can restructure the paste — re-resolve the group if the reference died. */
					try {
						var probeBounds = selPasted.geometricBounds;
					} catch (eProbe) {
						try { selPasted = selSizedGraphics.pageItems[0]; selPasted.name = graphicName; } catch (eReacq) { }
					}
					if (selSepArtGuide) {
						var selGuideBounds = selSepArtGuide.geometricBounds;
						var selCurBounds = selPasted.geometricBounds;
						var selCurCenterX = selCurBounds[0] + ((selCurBounds[2] - selCurBounds[0]) / 2);
						var selTargetCenterX = selGuideBounds[0] + ((selGuideBounds[2] - selGuideBounds[0]) / 2);
						selPasted.translate(selTargetCenterX - selCurCenterX, selGuideBounds[1] - selCurBounds[1]);
					}
					prepareSizedArtGraphicForProcessing(sepDoc, selPasted);
					setFillOverprintOnContainer(selPasted, false);
					/*
					 * Fill every [GRAPHIC] placeholder on SIZED_ART with a scaled duplicate of the same
					 * art — the file-based flow put the exported .ai there (placeGraphicInDocument);
					 * the selection flow has no file, so the pasted group itself is the source. Same
					 * fit rule: uniform scale into the placeholder bounds, centred.
					 */
					try {
						var gphCount = 0;
						if (selSizedArt.pathItems && selSizedArt.pathItems.length > 0) {
							for (var gp = 0; gp < selSizedArt.pathItems.length; gp++) {
								var gphPath = selSizedArt.pathItems[gp];
								if (!gphPath || gphPath.name !== "[GRAPHIC]") continue;
								var gb = gphPath.geometricBounds;
								var gbW = gb[2] - gb[0];
								var gbH = gb[1] - gb[3];
								if (gbW <= 0 || gbH <= 0) continue;
								var gphDup = selPasted.duplicate(selSizedArt, ElementPlacement.PLACEATBEGINNING);
								gphDup.name = "";
								var dupW = gphDup.width;
								var dupH = gphDup.height;
								if (dupW > 0 && dupH > 0) {
									var fitPct = Math.min(gbW / dupW, gbH / dupH) * 100;
									gphDup.resize(fitPct, fitPct);
								}
								var newW = gphDup.width;
								var newH = gphDup.height;
								gphDup.left = gb[0] + ((gbW - newW) / 2);
								gphDup.top = gb[3] + gbH - ((gbH - newH) / 2);
								gphCount++;
							}
						}
						if (gphCount) {
							stdSepLog("placed a selection copy into " + gphCount + " [GRAPHIC] placeholder(s)");
						}
					} catch (eGph) { stdSepLog("[GRAPHIC] preview error: " + (eGph.message || eGph)); }
					selPlacedOk = true;
				}
			}
			sepDoc.selection = null;
		} catch (eSelPlace) {
			return stdSepErr("Selected artwork could not be placed: " + (eSelPlace.message || eSelPlace), { separatedDocumentPath: sepDocPath });
		}
		if (!selPlacedOk) {
			return stdSepErr("Selected artwork could not be placed into the SEP document", { separatedDocumentPath: sepDocPath });
		}
	} else {
		try { placeGraphicInDocument(sepDoc, "", exportedFilePath); } catch (ePng) { }
		var aiPlaced = placeAndEmbedGraphicAI(sepDoc, exportedFilePath, graphicName);
		if (!aiPlaced) {
			return stdSepErr("Graphic AI could not be placed: " + exportedFilePath, { separatedDocumentPath: sepDocPath });
		}
	}
	sepDoc.save();

	/*
	 * 2b) Flatten live objects BEFORE splitting — standalone art is arbitrary, so it can carry live
	 * text and appearances that LEAP teamout art never has. Outline text (Type > Create Outlines) and
	 * Expand Appearance on the SIZED_GRAPHICS contents, then consolidate them into one named item so
	 * splitColors receives exactly the shape the LEAP flow gives it.
	 */
	try {
		app.activeDocument = sepDoc;
		var sgPrepLayer = sepDoc.layers.getByName("SIZED_ART").layers.getByName("SIZED_GRAPHICS");
		sepDoc.selection = null;
		try { sgPrepLayer.hasSelectedArtwork = true; } catch (ePrepSel) { }
		if (sepDoc.selection && sepDoc.selection.length) {
			/*
			 * Outline live text and expand appearances only. expandObject() is deliberately NOT called
			 * here: splitColors already runs it on its own pasted copy, so doing it again on the
			 * ORIGINAL placed item is redundant AND destructive — Expand replaces the item with new
			 * ones and drops its name, which is exactly what splitColors needs to find it by.
			 */
			try { app.executeMenuCommand("outline"); } catch (ePrepOutline) { }
			try { app.executeMenuCommand("expandStyle"); } catch (ePrepStyle) { }
		}
		sepDoc.selection = null;
		app.redraw();

		/*
		 * Consolidate whatever is sitting in SIZED_GRAPHICS into ONE item named graphicName.
		 *
		 * In the standalone flow there is no LEAP "graphic" to address — SIZED_GRAPHICS just holds the
		 * art that was pasted/embedded from the exported ASSETS file. splitColors, however, resolves its
		 * subject with pageItems.getByName(graphicName) and, when that throws, silently falls back to
		 * pageItems[0] — a SINGLE top-level item. So if the paste left several top-level items, or if
		 * outlining text / expanding appearances dropped the placed item's name, only the first item's
		 * inks get plates and every other ink disappears from Plates.
		 *
		 * Done unconditionally so the subject is deterministic: group when there is more than one item,
		 * then always (re)apply the name. This hands splitColors the same shape the LEAP flow does.
		 */
		try {
			var sgFix = sepDoc.layers.getByName("SIZED_ART").layers.getByName("SIZED_GRAPHICS");
			var sgCount = sgFix.pageItems.length;
			if (sgCount === 0) {
				stdSepLog("WARNING: SIZED_GRAPHICS is empty after flatten - nothing to separate");
			} else {
				if (sgCount > 1) {
					sepDoc.selection = null;
					sgFix.hasSelectedArtwork = true;
					app.executeMenuCommand("group");
					app.redraw();
				}
				sepDoc.selection = null;
				if (sgFix.pageItems.length > 0) {
					sgFix.pageItems[0].name = graphicName;
				}
				stdSepLog(
					"consolidated SIZED_GRAPHICS: " + sgCount + " top-level item(s) -> 1 named '" + graphicName + "'"
				);
			}
		} catch (eFix) { stdSepLog("could not consolidate SIZED_GRAPHICS: " + (eFix.message || eFix)); }
		/*
		 * Log the SIZED_GRAPHICS top-level items AFTER flattening. splitColors resolves the graphic by
		 * NAME and silently falls back to pageItems[0] — a SINGLE item — when the name is gone, so an
		 * expand that drops the name or ungroups the art would separate only part of the artwork.
		 */
		try {
			var sgNames = [];
			for (var sgi = 0; sgi < sgPrepLayer.pageItems.length; sgi++) {
				sgNames.push("'" + sgPrepLayer.pageItems[sgi].name + "'");
			}
			stdSepLog(
				"after flatten SIZED_GRAPHICS has " + sgPrepLayer.pageItems.length +
				" top-level item(s): " + sgNames.join(", ") + " (splitColors will look for '" + graphicName + "')"
			);
		} catch (eSgLog) { }
	} catch (ePrep) { stdSepLog("flatten prep error: " + (ePrep.message || ePrep)); }

	if (isPrepare) {
		/* Stamp status + everything Generate needs, then stop with the SEP document open for editing. */
		try {
			var prepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
			if (prepXmp.isXmpCreated) {
				prepXmp.setStructField(SEP_STATUS_FIELD, SEP_STATUS_PREPARED, false, false);
				prepXmp.setStructField("LEAPPreparedContext", {
					graphicName: graphicName,
					styleCodes: styleCodes,
					standalone: true,
					fromSelection: fromSelection,
					exportedFilePath: exportedFilePath,
					separationVersion: profileMetadata.separationVersion || 1
				}, true, false);
				prepXmp.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
				prepXmp.commit();
			}
		} catch (ePrepXmp) { stdSepLog("prepare: XMP write error: " + (ePrepXmp.message || ePrepXmp)); }
		try { sepDoc.save(); } catch (ePrepSave) { }
		try { app.activeDocument = sepDoc; } catch (ePrepAct) { }
		stdSepLog("prepared for seps: " + sepDocPath);
		return JSON.stringify({
			success: true,
			stage: "prepared",
			debugLog: stdSepDebug,
			separatedDocumentPath: sepDocPath,
			graphicName: graphicName
		});
	}

	return standaloneSplitAndFinish(sepDoc, sepDocPath, graphicName, profileMetadata, stdSepDebug);
}

/* GENERATE stage for standalone: the active document must be the prepared SEP doc. */
function standaloneGenerateFromPrepared(params) {
	if (!app.documents.length) return stdSepErr("No document is open");
	var sepDoc = app.activeDocument;
	var status = getSeparationStatusFromDoc(sepDoc);
	if (status !== SEP_STATUS_PREPARED) {
		return stdSepErr(status === SEP_STATUS_SEPARATED
			? "This separation has already been generated. Run Prepare for Seps again to start over."
			: "Run Prepare for Seps first — the active document is not a prepared SEP document.");
	}
	var ctx = null;
	var profileMetadata = params.profileMetadata || {};
	try {
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
		if (xmp.isXmpCreated) {
			if (xmp.doesStructFieldExist("LEAPPreparedContext")) ctx = xmp.getStructField("LEAPPreparedContext", true);
			if (xmp.doesStructFieldExist("SeparationProfileMetadata")) {
				var stamped = xmp.getStructField("SeparationProfileMetadata", true);
				if (stamped && typeof stamped === "object") profileMetadata = stamped;
			}
		}
	} catch (eCtx) { }
	if (!ctx || !ctx.graphicName) return stdSepErr("Prepared context missing on this document. Run Prepare for Seps again.");
	var graphicName = String(ctx.graphicName);
	var sepDocPath = new File(sepDoc.fullName).fsName;
	try { unlockSizedGraphicsContents(sepDoc); } catch (eUnlock) { }
	stdSepLog("generate (from prepared): graphic=" + graphicName + " doc=" + sepDocPath);
	/* Outline + expand whatever the user edited (same treatment the LEAP generate applies) — the
	   prepare-time flatten covered the PLACED art, not anything added since. */
	try {
		var expandReport = expandPreparedArtForSeparation(sepDoc, graphicName);
		if (expandReport && expandReport.error) {
			return stdSepErr("Could not expand the prepared art: " + expandReport.error, { separatedDocumentPath: sepDocPath });
		}
	} catch (eExpandPrep) {
		return stdSepErr("Could not expand the prepared art: " + (eExpandPrep.message || eExpandPrep), { separatedDocumentPath: sepDocPath });
	}
	var result = standaloneSplitAndFinish(sepDoc, sepDocPath, graphicName, profileMetadata, stdSepDebug);
	try {
		var parsed = JSON.parse(result);
		if (parsed && parsed.success) {
			try { app.activeDocument = sepDoc; } catch (eA) { }
			setSeparationStatusOnDoc(sepDoc, SEP_STATUS_SEPARATED);
			try { sepDoc.save(); } catch (eS) { }
			parsed.stage = "separated";
			return JSON.stringify(parsed);
		}
	} catch (eP) { }
	return result;
}

/* Shared second half: split + underbase + XMP. Used by the legacy full run and by Generate. */
function standaloneSplitAndFinish(sepDoc, sepDocPath, graphicName, profileMetadata, stdSepDebug) {
	try { app.activeDocument = sepDoc; } catch (eActSplit) { }
	/* 3) Run the real color split + underbase + ink-exception pipeline (same as the LEAP path). */
	loadLEAPColorSepsActions();
	var splitColorsError = parseSplitColorsResult(splitColors(graphicName));
	if (splitColorsError) {
		stdSepLog("splitColors failed: " + splitColorsError);
		return stdSepErr(splitColorsError, { separatedDocumentPath: sepDocPath, graphicName: graphicName });
	}
	/* Plates produced by the split, BEFORE underbase/second-hit/rename run. Compare against the
	   extracted colors logged above to see exactly which ink lost its plate. */
	try {
		stdSepLog("plates after splitColors: " + getSeparatedArtLayerNames(sepDoc).join(", "));
	} catch (eSplitLog) { }

	var profileCodeForHits = profileMetadata && profileMetadata.profileCode
		? String(profileMetadata.profileCode).replace(/^\\s+|\\s+$/g, "").toUpperCase()
		: "";
	var secondHitApplied = [];
	deleteNonFillStrokeItems();
	mergeInkExceptionUnderbaseIntoProfileMetadata(profileMetadata, sepDoc);
	generateUnderbase(graphicName, null, profileMetadata);
	if (profileCodeForHits) {
		try { app.activeDocument = sepDoc; } catch (e2) { }
		var secondHitResult = applyInkExceptionSecondHitLayers(sepDoc, profileCodeForHits);
		secondHitApplied = secondHitResult.applied || [];
	}
	try { auditSecondHitLayers(sepDoc, secondHitApplied, "standalone: after applyInkExceptionSecondHitLayers"); } catch (eAudit) { }
	setOverprintOnSeparatedArt(sepDoc, true);
	deleteSizedGraphicsSublayer(sepDoc);
	unloadLEAPColorSepsActions();

	/* 4) Final ink naming + underbase XMP record. */
	try { renameFormattedInks(sepDoc, profileMetadata); } catch (eFmt) { }
	try { recordUnderbaseLayersToXmp(sepDoc, profileMetadata); } catch (eRec) { }

	/* 5) Collect plate layer names and write the separation XMP the Plates tab reads. */
	var layerNames = [];
	try {
		layerNames = getSeparatedArtLayerNames(sepDoc);
		layerNames = filterPlateLayerNamesForUi(layerNames, profileMetadata);
		if (layerNames.length > 0) {
			var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
			if (sepXmp.isXmpCreated) {
				sepXmp.setStructField(SEP_STATUS_FIELD, SEP_STATUS_SEPARATED, false, false);
				sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
				sepXmp.setStructField("LEAPSeparationColorsData", [], true, false);
				sepXmp.commit();
				sepDoc.save();
			}
		}
	} catch (eLayers) { }

	stdSepLog("final plates: " + (layerNames && layerNames.length ? layerNames.join(", ") : "NONE"));

	if (!layerNames || layerNames.length === 0) {
		return stdSepErr("Separation plates were not created. Verify the graphic colors and SEP_ART placement.", {
			separatedDocumentPath: sepDocPath,
			graphicName: graphicName
		});
	}

	/* 6) Color count -> page variables + metadata. */
	var inkColorCount = 0;
	try { inkColorCount = countPgInkColorsFromLayerNames(layerNames); } catch (eCount) { }
	if (profileMetadata) profileMetadata.separationColorCount = inkColorCount;
	try {
		var sepXmpMeta = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
		if (sepXmpMeta.isXmpCreated && profileMetadata) {
			sepXmpMeta.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
			sepXmpMeta.commit();
		}
	} catch (eMeta) { }
	try {
		updateSeparationPageVariables(sepDoc, inkColorCount, null);
		sepDoc.save();
	} catch (eVars) { }

	/* Leave the separated document open and active so the panel can show the Plates tab. */
	try { app.activeDocument = sepDoc; } catch (eActive) { }

	return JSON.stringify({
		success: true,
		debugLog: stdSepDebug,
		separatedDocumentPath: sepDocPath,
		graphicName: graphicName,
		layerNames: layerNames,
		colorCount: inkColorCount
	});
}
`;
