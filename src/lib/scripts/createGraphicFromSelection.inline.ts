/**
 * ExtendScript helpers for creating a GRAPHIC:/BOUNDS: pair from the current selection.
 */
export const createGraphicFromSelectionHostCode = `
var CG_LAYER_NAMES = {
	SIZED_ART: "SIZED_ART",
	LIVE_ART: "LIVE_ART"
};
var CG_GRAPHIC_PREFIX = "GRAPHIC:";
var CG_COLOR_TYPE_SPOT = "SpotColor";

function cgIsSpotFillColor(color) {
	if (!color) return false;
	return color.typename === CG_COLOR_TYPE_SPOT;
}

function cgPageItemHasNonSpotFill(item) {
	if (!item) return false;
	try {
		if (item.typename === "PathItem") {
			if (item.filled && item.fillColor && !cgIsSpotFillColor(item.fillColor)) return true;
			if (item.stroked && item.strokeColor && !cgIsSpotFillColor(item.strokeColor)) return true;
			return false;
		}
		if (item.typename === "CompoundPathItem" && item.pathItems && item.pathItems.length > 0) {
			for (var cp = 0; cp < item.pathItems.length; cp++) {
				if (cgPageItemHasNonSpotFill(item.pathItems[cp])) return true;
			}
			return false;
		}
		if (item.pageItems && item.pageItems.length > 0) {
			for (var i = 0; i < item.pageItems.length; i++) {
				if (cgPageItemHasNonSpotFill(item.pageItems[i])) return true;
			}
		}
	} catch (e) { }
	return false;
}

function cgEnsureDocumentLayer(doc, layerName) {
	var layer;
	try {
		layer = doc.layers.getByName(layerName);
	} catch (e) {
		layer = doc.layers.add();
		layer.name = layerName;
	}
	try {
		layer.visible = true;
		layer.locked = false;
	} catch (e2) { }
	return layer;
}

function cgDocumentHasSavedPath(doc) {
	try {
		return !!(doc && doc.fullName && doc.fullName.fsName);
	} catch (e) {
		return false;
	}
}

function cgWithUserInteraction(callback) {
	var previousLevel;
	try {
		previousLevel = app.userInteractionLevel;
	} catch (e) { }
	try {
		app.userInteractionLevel = UserInteractionLevel.DISPLAYALERTS;
		return callback();
	} finally {
		try {
			app.userInteractionLevel = previousLevel != null
				? previousLevel
				: UserInteractionLevel.DONTDISPLAYALERTS;
		} catch (e2) { }
	}
}

function cgPromptSaveDocumentAs(doc) {
	if (cgDocumentHasSavedPath(doc)) {
		return { saved: true, error: "" };
	}

	var saveFile = null;
	cgWithUserInteraction(function () {
		saveFile = File.saveDialog("Save document before creating graphic", "*.ai");
	});

	if (!saveFile) {
		return { saved: false, error: "Document must be saved before creating a graphic" };
	}

	try {
		var savePath = String(saveFile.fsName || saveFile);
		if (!/\\.ai$/i.test(savePath)) {
			savePath = savePath + ".ai";
			saveFile = new File(savePath);
		}
		doc.saveAs(saveFile);
		return { saved: true, error: "" };
	} catch (e) {
		return { saved: false, error: e.message || "Could not save document" };
	}
}

function cgSaveDocumentSilently(doc) {
	try {
		if (!cgDocumentHasSavedPath(doc)) {
			return { success: false, error: "Document has no saved path" };
		}
		doc.save();
		return { success: true, error: "" };
	} catch (e) {
		return { success: false, error: e.message || "Could not save document" };
	}
}

function cgEnsureAssetsExportPaths(doc) {
	var docFile;
	try {
		docFile = new File(doc.fullName);
	} catch (e) {
		return null;
	}

	var docName = docFile.name.replace(/\\.[^\\.]+$/, "");
	var docParent = docFile.parent;
	if (!docParent || !docParent.exists) {
		return null;
	}

	var sep = "/";
	var assetsFolder = new Folder(docParent.fsName + sep + docName + " Assets");
	if (!assetsFolder.exists) {
		assetsFolder.create();
	}

	var graphicsFolder = new Folder(assetsFolder.fsName + sep + "02 GRAPHICS");
	if (!graphicsFolder.exists) {
		graphicsFolder.create();
	}

	var leagueFolder = new Folder(graphicsFolder.fsName + sep + "SEPS");
	if (!leagueFolder.exists) {
		leagueFolder.create();
	}

	return {
		docName: docName,
		rootFolder: assetsFolder,
		league: "SEPS",
		assetsFolderPath: assetsFolder.fsName
	};
}

function cgExpandGraphicArtwork() {
	try { app.executeMenuCommand("outline"); } catch (e1) { }
	try { app.executeMenuCommand("expandStyle"); } catch (e2) { }
}

function cgSelectGraphicAndBoundsForCopy(boundItem, graphicLayer) {
	app.selection = null;
	var toSelect = [];
	try {
		if (graphicLayer.pageItems && graphicLayer.pageItems.length > 0) {
			for (var gi = 0; gi < graphicLayer.pageItems.length; gi++) {
				toSelect.push(graphicLayer.pageItems[gi]);
			}
		}
	} catch (e) { }
	if (toSelect.length === 0) {
		try {
			graphicLayer.hasSelectedArtwork = true;
			if (app.selection && app.selection.length > 0) {
				for (var si = 0; si < app.selection.length; si++) {
					toSelect.push(app.selection[si]);
				}
			}
		} catch (e2) { }
	}
	if (boundItem) {
		toSelect.push(boundItem);
	}
	if (toSelect.length === 0) {
		return false;
	}
	app.selection = toSelect;
	return true;
}

function cgGetBoundsRectFromSelection(doc) {
	try {
		if (app.selection) {
			for (var i = 0; i < app.selection.length; i++) {
				var selectedItem = app.selection[i];
				if (selectedItem && selectedItem.name && String(selectedItem.name).indexOf("BOUNDS:") === 0) {
					return selectedItem.geometricBounds;
				}
			}
		}
	} catch (e) { }

	try {
		var items = doc.pageItems;
		for (var j = 0; j < items.length; j++) {
			var pageItem = items[j];
			if (pageItem && pageItem.name && String(pageItem.name).indexOf("BOUNDS:") === 0) {
				return pageItem.geometricBounds;
			}
		}
	} catch (e2) { }

	return null;
}

function cgRemoveBoundsFromPastedArt() {
	try {
		if (!app.selection || app.selection.length === 0) return;
		for (var ri = app.selection.length - 1; ri >= 0; ri--) {
			var item = app.selection[ri];
			if (item && item.name && String(item.name).indexOf("BOUNDS:") === 0) {
				item.remove();
			}
		}
	} catch (e) { }
}

function cgExportCreatedGraphicAsset(versionDoc, graphicName, boundItem, graphicLayer, paths) {
	if (!paths || !paths.rootFolder || !paths.league || !paths.docName) {
		return { exported: false, aiFilePath: "", pngFilePath: "", exportError: "Could not resolve export folder" };
	}

	var sep = "/";
	var graphicFolder = new Folder(
		paths.rootFolder.fsName + sep + "02 GRAPHICS" + sep + paths.league + sep + graphicName
	);
	if (!graphicFolder.exists) {
		graphicFolder.create();
	}
	var aiFolder = new Folder(graphicFolder.fsName + sep + "AI");
	var pngFolder = new Folder(graphicFolder.fsName + sep + "PNG");
	if (!aiFolder.exists) aiFolder.create();
	if (!pngFolder.exists) pngFolder.create();

	var aiFile = new File(aiFolder.fsName + sep + paths.docName + "_GRAPHICS_" + graphicName + ".ai");
	var pngFile = new File(pngFolder.fsName + sep + paths.docName + "_GRAPHICS_" + graphicName + ".png");

	try {
		if (!cgSelectGraphicAndBoundsForCopy(boundItem, graphicLayer)) {
			return { exported: false, aiFilePath: "", pngFilePath: "", exportError: "Nothing to export" };
		}
		app.redraw();
		app.executeMenuCommand("copy");
		app.selection = null;

		var boundWidth = Math.abs(boundItem.width);
		var boundHeight = Math.abs(boundItem.height);
		if (boundWidth <= 0 || boundHeight <= 0) {
			boundWidth = 72;
			boundHeight = 72;
		}

		var newDoc = app.documents.add(null, boundWidth, boundHeight);
		newDoc.activate();
		try { app.preferences.setBooleanPreference("layers/pastePreserve", true); } catch (prefErr) { }
		app.executeMenuCommand("paste");
		app.redraw();
		cgExpandGraphicArtwork();

		var boundsRect = cgGetBoundsRectFromSelection(newDoc);
		if (!boundsRect) {
			try {
				boundsRect = boundItem.geometricBounds;
			} catch (boundsRectErr) { }
		}
		cgRemoveBoundsFromPastedArt();

		try {
			var ab = newDoc.artboards[newDoc.artboards.getActiveArtboardIndex()];
			if (boundsRect) {
				ab.artboardRect = boundsRect;
			}
		} catch (abErr) { }

		newDoc.saveAs(aiFile);
		try {
			var pngOptions = new ExportOptionsPNG24();
			pngOptions.artBoardClipping = true;
			pngOptions.transparency = true;
			newDoc.exportFile(pngFile, ExportType.PNG24, pngOptions);
		} catch (pngErr) { }

		try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) { }
		versionDoc.activate();
		app.selection = null;

		return {
			exported: aiFile.exists,
			aiFilePath: aiFile.exists ? aiFile.fsName : "",
			pngFilePath: pngFile.exists ? pngFile.fsName : "",
			exportError: aiFile.exists ? "" : "Graphic AI export failed"
		};
	} catch (e) {
		try { versionDoc.activate(); } catch (actErr) { }
		return {
			exported: false,
			aiFilePath: "",
			pngFilePath: "",
			exportError: e.message || e.toString()
		};
	}
}

function createGraphicFromSelectionRun(params) {
	if (!app.documents.length) {
		return JSON.stringify({ success: false, error: "No active document" });
	}

	var position = params.position ? String(params.position).trim() : "";
	var graphicKey = params.graphicKey ? String(params.graphicKey).trim() : position;
	var name = params.name ? String(params.name).trim() : "";
	var widthIn = parseFloat(params.width);
	var heightIn = parseFloat(params.height);

	if (!app.selection || app.selection.length === 0) {
		return JSON.stringify({ success: false, error: "Nothing is selected" });
	}
	if (!position) {
		return JSON.stringify({ success: false, error: "Position is required" });
	}
	if (!name) {
		name = position;
	}
	if (!(widthIn > 0) || !(heightIn > 0)) {
		return JSON.stringify({ success: false, error: "Width and height must be greater than zero" });
	}

	var doc = app.activeDocument;
	var saveAsResult = cgPromptSaveDocumentAs(doc);
	if (!saveAsResult.saved) {
		return JSON.stringify({
			success: false,
			error: saveAsResult.error || "Document must be saved before creating a graphic"
		});
	}

	if (!graphicKey) {
		graphicKey = position;
	}
	var graphicLayerName = CG_GRAPHIC_PREFIX + graphicKey;
	var boundsName = "BOUNDS:" + graphicKey;

	var liveArtLayer = cgEnsureDocumentLayer(doc, CG_LAYER_NAMES.LIVE_ART);
	var sizedArtLayer = cgEnsureDocumentLayer(doc, CG_LAYER_NAMES.SIZED_ART);

	try {
		var existingGraphic = liveArtLayer.layers.getByName(graphicLayerName);
		if (existingGraphic) {
			return JSON.stringify({
				success: false,
				error: "Graphic already exists for position: " + position
			});
		}
	} catch (existErr) { }

	var selectedItems = [];
	for (var s = 0; s < app.selection.length; s++) {
		selectedItems.push(app.selection[s]);
	}

	var spotItems = [];
	var nonSpotItems = [];
	for (var si = 0; si < selectedItems.length; si++) {
		if (cgPageItemHasNonSpotFill(selectedItems[si])) {
			nonSpotItems.push(selectedItems[si]);
		} else {
			spotItems.push(selectedItems[si]);
		}
	}

	var hasNonSpotColors = nonSpotItems.length > 0;

	for (var ns = 0; ns < nonSpotItems.length; ns++) {
		try {
			nonSpotItems[ns].move(sizedArtLayer, ElementPlacement.PLACEATEND);
		} catch (moveNsErr) { }
	}

	if (spotItems.length === 0) {
		return JSON.stringify({
			success: false,
			error: "No spot-color artwork found in selection to place in GRAPHIC layer"
		});
	}

	var graphicLayer;
	try {
		graphicLayer = liveArtLayer.layers.getByName(graphicLayerName);
	} catch (layerErr) {
		graphicLayer = liveArtLayer.layers.add();
		graphicLayer.name = graphicLayerName;
	}

	for (var sp = 0; sp < spotItems.length; sp++) {
		spotItems[sp].move(graphicLayer, ElementPlacement.PLACEATEND);
	}

	app.selection = null;
	graphicLayer.hasSelectedArtwork = true;
	app.redraw();
	app.executeMenuCommand("group");

	var groupedGraphic = app.selection && app.selection.length > 0 ? app.selection[0] : null;
	var selBounds = groupedGraphic ? groupedGraphic.geometricBounds : null;
	if (!selBounds) {
		return JSON.stringify({ success: false, error: "Could not measure selection bounds" });
	}
	var selWidth = Math.abs(selBounds[2] - selBounds[0]);
	var selHeight = Math.abs(selBounds[1] - selBounds[3]);
	var boundsPaddingPt = 0.5 * 72;
	var widthPt = selWidth + boundsPaddingPt;
	var heightPt = selHeight + boundsPaddingPt;

	var boundItem;
	try {
		boundItem = liveArtLayer.pageItems.getByName(boundsName);
	} catch (boundsErr) {
		boundItem = liveArtLayer.pathItems.rectangle(0, 0, widthPt, heightPt);
		boundItem.name = boundsName;
		boundItem.guides = true;
		boundItem.filled = false;
		boundItem.stroked = true;

		var selCenterX = selBounds[0] + (selWidth / 2);
		var selCenterY = selBounds[1] - (selHeight / 2);
		var left = selCenterX - (widthPt / 2);
		var top = selCenterY + (heightPt / 2);
		boundItem.position = [left, top];

		app.selection = boundItem;
		try { app.executeMenuCommand("Convert to Shape"); } catch (shapeErr) { }
	}

	app.executeMenuCommand("ungroup");
	app.selection = null;

	var saveResult = cgSaveDocumentSilently(doc);
	var exportPaths = cgEnsureAssetsExportPaths(doc);
	if (!exportPaths) {
		return JSON.stringify({
			success: false,
			error: "Could not create assets export folder for this document"
		});
	}

	var exportResult = cgExportCreatedGraphicAsset(doc, graphicKey, boundItem, graphicLayer, exportPaths);

	return JSON.stringify({
		success: true,
		graphicName: graphicKey,
		displayName: name,
		position: position,
		hasNonSpotColors: hasNonSpotColors,
		nonSpotWarning: hasNonSpotColors ? "Non spot colors found and left in SIZED_ART layer" : "",
		exported: exportResult.exported,
		aiFilePath: exportResult.aiFilePath,
		pngFilePath: exportResult.pngFilePath,
		exportError: exportResult.exportError || "",
		assetsFolderPath: exportPaths.assetsFolderPath || "",
		documentPath: cgDocumentHasSavedPath(doc) ? doc.fullName.fsName : "",
		documentSaved: saveResult.success,
		documentSaveError: saveResult.error || ""
	});
}
`;
