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
 *   3) output is written to a flat SEPARATIONS folder sibling to ASSETS.
 *
 * handlePerformSeparation and the LEAP path are untouched.
 */
export const standaloneSeparationHostCode = `
function stdSepErr(msg, extra) {
	var out = { success: false, error: msg };
	if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) out[k] = extra[k]; } }
	try { unloadLEAPColorSepsActions(); } catch (e) { }
	return JSON.stringify(out);
}

function standaloneSeparationRun(params) {
	if (!params) return stdSepErr("No parameters provided");

	var graphicName = params.graphicName ? String(params.graphicName) : "";
	var styleCodes = params.styleCodes || [];
	var profileMetadata = params.profileMetadata || {};
	var jsonData = params.jsonData || {};
	var sepsTemplateFileName = params.sepsTemplateFileName || "SEP-GRID-TEMPLATE.ai";
	var exportedFilePath = params.exportedFilePath ? String(params.exportedFilePath) : "";

	if (!graphicName) return stdSepErr("Graphic name (position) is required");
	if (!exportedFilePath) return stdSepErr("Exported graphic file path is required");

	var aiFile = new File(exportedFilePath);
	if (!aiFile.exists) return stdSepErr("Exported graphic file not found: " + exportedFilePath);

	/* Output: a flat SEPARATIONS folder sibling to the ASSETS folder that holds the exported file. */
	var assetsFolder = aiFile.parent;                 /* .../ASSETS */
	if (!assetsFolder) return stdSepErr("Could not resolve the ASSETS folder from the exported file");
	var rootFolder = assetsFolder.parent;             /* the document folder (sibling of ASSETS) */
	if (!rootFolder) return stdSepErr("Could not resolve the document folder");
	var sepFolder = new Folder(rootFolder.fsName + "/SEPARATIONS");
	if (!sepFolder.exists) sepFolder.create();
	if (!sepFolder.exists) return stdSepErr("Could not create the SEPARATIONS folder");

	/* Base name for the separated file (mirrors the exported name, e.g. 7G_FM01_Front). */
	var docName = aiFile.name.replace(/\\.[^\\.]+$/, "");

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

	/* 1) Create the SEP doc from the template and fill its variables from the form-derived jsonData. */
	var sepDoc = copyAndPrepareSEPDocument(templateFile, sepFolder, docName, jsonData, styleCodes, profileMetadata, null);
	if (!sepDoc) return stdSepErr("Failed to create the SEP document from the template");
	var sepDocFile = new File(sepDoc.fullName);
	var sepDocPath = sepDocFile.fsName;

	try { app.activeDocument = sepDoc; } catch (eAct) { }

	/* 2) Place + embed the exported graphic onto the SEP_ART area. */
	unlockSizedGraphicsContents(sepDoc);
	try { placeGraphicInDocument(sepDoc, "", exportedFilePath); } catch (ePng) { }
	var aiPlaced = placeAndEmbedGraphicAI(sepDoc, exportedFilePath, graphicName);
	if (!aiPlaced) {
		return stdSepErr("Graphic AI could not be placed: " + exportedFilePath, { separatedDocumentPath: sepDocPath });
	}
	sepDoc.save();

	/* 3) Run the real color split + underbase + ink-exception pipeline (same as the LEAP path). */
	loadLEAPColorSepsActions();
	var splitColorsError = parseSplitColorsResult(splitColors(graphicName));
	if (splitColorsError) {
		return stdSepErr(splitColorsError, { separatedDocumentPath: sepDocPath, graphicName: graphicName });
	}

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
				sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
				sepXmp.setStructField("LEAPSeparationColorsData", [], true, false);
				sepXmp.commit();
				sepDoc.save();
			}
		}
	} catch (eLayers) { }

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
		separatedDocumentPath: sepDocPath,
		graphicName: graphicName,
		layerNames: layerNames,
		colorCount: inkColorCount
	});
}
`;
