

#include "./utilities.jsx"

function splitColors(_graphicName, cleanupOpts) {
	try {
		var runLeftover = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
		var _sizedArtLayer = app.activeDocument.layers.getByName("SIZED_ART");
		var _sizedGraphicLayer = _sizedArtLayer.layers.getByName("SIZED_GRAPHICS");
		var _graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);
		_graphicItem.selected = true;
		app.redraw();
		app.executeMenuCommand('copy');
		app.executeMenuCommand('pasteInPlace');
		app.redraw();
		expandObject();
		app.executeMenuCommand('group');
		pathFinderDivide();
		var _processItem = app.selection[0];
		app.selection = null;


		var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);


		var colorGroups = {};
		collectItemsByColor(_processItem, colorGroups);


		for (var colorName in colorGroups) {
			if (colorGroups.hasOwnProperty(colorName)) {

				var colorSubLayer = getOrCreateLayer(app.activeDocument, colorName, _separatedArtLayer);


				var items = colorGroups[colorName];
				for (var j = 0; j < items.length; j++) {
					items[j].move(colorSubLayer, ElementPlacement.PLACEATBEGINNING);
				}


				app.selection = null;
				app.activeDocument.activeLayer = colorSubLayer;
				app.activeDocument.activeLayer.hasSelectedArtwork = true;
				app.redraw();
				pathFinderAdd();
				if (runLeftover) {
					deleteLeftoverPathsInLayer(colorSubLayer);
				}
			}
		}
		app.redraw();

	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}


function getKnockoutBlackNamesFromProfile(profileMetadata) {
	try {
		var raw = profileMetadata && profileMetadata.blackInksKnockoutDisplay != null
			? String(profileMetadata.blackInksKnockoutDisplay)
			: "";
		if (!raw) return [];
		var tokens = raw.split(/[\r\n,;|]+/);
		var names = [];
		var seen = {};
		for (var i = 0; i < tokens.length; i++) {
			var name = tokens[i] ? String(tokens[i]).replace(/^\s+|\s+$/g, "") : "";
			if (!name) continue;
			var key = name.toUpperCase();
			if (seen[key]) continue;
			seen[key] = true;
			names.push(name);
		}
		return names;
	} catch (e) {
		return [];
	}
}

function shouldApplyKnockoutForUnderbaseIndex(profileMetadata, ubIndex) {
	try {
		var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
			? profileMetadata.underbaseEnabled
			: null;
		var ko = profileMetadata && profileMetadata.underbaseKnockoutBlack instanceof Array
			? profileMetadata.underbaseKnockoutBlack
			: null;
		if (!enabled || !ko) return false;
		if (ubIndex < 0 || ubIndex >= enabled.length || ubIndex >= ko.length) return false;
		return enabled[ubIndex] === true && ko[ubIndex] === true;
	} catch (e) {
		return false;
	}
}

function isItemFilledWithAnyName(item, nameLookup) {
	try {
		if (!item || !item.filled || !item.fillColor) return false;
		var fill = item.fillColor;
		var fillName = "";
		if (fill.typename === "SpotColor" && fill.spot && fill.spot.name) {
			fillName = String(fill.spot.name);
		}
		if (!fillName) return false;
		return !!nameLookup[fillName.toUpperCase()];
	} catch (e) {
		return false;
	}
}

function removeItemsByFillNamesFromContainer(container, nameLookup) {
	var removed = 0;
	try {
		if (!container || !nameLookup) return 0;
		var toRemove = [];

		function collectPathItems(node) {
			if (!node) return;

			try {
				if (node.typename === "PathItem") {
					if (isItemFilledWithAnyName(node, nameLookup)) {
						toRemove.push(node);
					}
					return;
				}
			} catch (e0) { }

			try {
				if (node.pathItems && node.pathItems.length > 0) {
					for (var p = 0; p < node.pathItems.length; p++) {
						collectPathItems(node.pathItems[p]);
					}
				}
			} catch (e1) { }

			try {
				if (node.pageItems && node.pageItems.length > 0) {
					for (var i = 0; i < node.pageItems.length; i++) {
						collectPathItems(node.pageItems[i]);
					}
				}
			} catch (e2) { }

			try {
				if (node.layers && node.layers.length > 0) {
					for (var l = 0; l < node.layers.length; l++) {
						collectPathItems(node.layers[l]);
					}
				}
			} catch (e3) { }
		}

		collectPathItems(container);

		for (var r = toRemove.length - 1; r >= 0; r--) {
			try {
				toRemove[r].remove();
				removed++;
			} catch (removeErr) { }
		}
	} catch (e) { }
	return removed;
}

function removeKnockoutFilledItemsFromUnderbaseLayer(whiteUBLayer, profileMetadata, ubIndex) {
	try {
		if (!whiteUBLayer) return 0;
		if (!shouldApplyKnockoutForUnderbaseIndex(profileMetadata, ubIndex)) return 0;
		var names = getKnockoutBlackNamesFromProfile(profileMetadata);
		if (!names || names.length === 0) return 0;
		var lookup = {};
		for (var i = 0; i < names.length; i++) {
			lookup[names[i].toUpperCase()] = true;
		}
		return removeItemsByFillNamesFromContainer(whiteUBLayer, lookup);
	} catch (e) {
		return 0;
	}
}

function getEnabledUnderbaseIndices(profileMetadata) {
	try {
		var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
			? profileMetadata.underbaseEnabled
			: null;
		if (!enabled || enabled.length === 0) return [0];
		var indices = [];
		for (var i = 0; i < enabled.length; i++) {
			if (enabled[i] === true) indices.push(i);
		}
		if (indices.length === 0) indices.push(0);
		return indices;
	} catch (e) {
		return [0];
	}
}

/** Normalize profile swatch list: true Array, or object map from XMP/JSON bridge. */
function getUnderbaseKnockoutSwatchesArray(profileMetadata) {
	try {
		var raw = profileMetadata && profileMetadata.underbaseKnockoutSwatches;
		if (raw instanceof Array) {
			return raw;
		}
		if (raw && typeof raw === "object") {
			var arr = [];
			for (var i = 0; i < 4; i++) {
				var v = raw[i];
				if (v == null) v = raw[String(i)];
				if (v != null) arr[i] = v;
			}
			if (arr.length > 0) return arr;
		}
	} catch (e) { }
	return [];
}

function setStrokeOverprintOnContainer(container, overprintValue) {
	if (!container) return;
	try {
		if (container.typename === "PathItem") {
			if (typeof container.strokeOverprint !== "undefined") {
				container.strokeOverprint = overprintValue;
			}
			return;
		}
		if (container.typename === "CompoundPathItem") {
			if (container.pathItems && container.pathItems.length > 0) {
				for (var p = 0; p < container.pathItems.length; p++) {
					if (typeof container.pathItems[p].strokeOverprint !== "undefined") {
						container.pathItems[p].strokeOverprint = overprintValue;
					}
				}
			}
			return;
		}
		if (container.typename === "PlacedItem") {
			try {
				if (typeof container.overprint !== "undefined") {
					container.overprint = overprintValue;
				}
			} catch (opErr) { }
			return;
		}
		if (container.pageItems && container.pageItems.length > 0) {
			for (var i = 0; i < container.pageItems.length; i++) {
				setStrokeOverprintOnContainer(container.pageItems[i], overprintValue);
			}
		}
	} catch (e) { }
}

function clearLayerPageItems(layer) {
	try {
		if (!layer || !layer.pageItems) return;
		for (var i = layer.pageItems.length - 1; i >= 0; i--) {
			try { layer.pageItems[i].remove(); } catch (e) { }
		}
	} catch (e2) { }
}

function duplicateLayerItems(sourceLayer, targetLayer) {
	try {
		if (!sourceLayer || !targetLayer) return 0;
		var duplicated = 0;

		function duplicateFromLayer(layer) {
			if (!layer) return;

			try {
				for (var i = layer.pageItems.length - 1; i >= 0; i--) {
					var item = layer.pageItems[i];
					if (!item) continue;
					// Duplicate only top-level items in this layer; grouped children come with their parent group.
					if (item.parent !== layer) continue;
					try {
						item.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
						duplicated++;
					} catch (dupErr) { }
				}
			} catch (e1) { }

			try {
				for (var l = layer.layers.length - 1; l >= 0; l--) {
					duplicateFromLayer(layer.layers[l]);
				}
			} catch (e2) { }
		}

		duplicateFromLayer(sourceLayer);
		return duplicated;
	} catch (e3) {
		return 0;
	}
}

function getUnderbaseLayerNameForIndex(index) {
	if (index <= 0) return CONSTANTS.LAYER_NAMES.WHITE_UB;
	return CONSTANTS.LAYER_NAMES.WHITE_UB + " " + (index + 1);
}

function getProfileUnderbaseSwatchName(profileMetadata) {
	try {
		var raw = profileMetadata && profileMetadata.underbaseSwatch != null
			? String(profileMetadata.underbaseSwatch).replace(/^\s+|\s+$/g, "")
			: "";
		return raw || CONSTANTS.SWATCH_NAMES.WHITE_UB;
	} catch (e) {
		return CONSTANTS.SWATCH_NAMES.WHITE_UB;
	}
}

function ensureSwatchExistsFromSource(sourceSwatchName, newSwatchName, fallbackCmyk) {
	try {
		var doc = app.activeDocument;
		try {
			var existing = doc.swatches.getByName(newSwatchName);
			if (existing) return true;
		} catch (existsErr) { }

		var sourceSwatch = null;
		try {
			sourceSwatch = doc.swatches.getByName(sourceSwatchName);
		} catch (sourceErr) { }

		if (!sourceSwatch || !sourceSwatch.color) {
			if (fallbackCmyk) {
				var fallbackSpot = doc.spots.add();
				fallbackSpot.name = newSwatchName;
				var fallbackColor = new CMYKColor();
				fallbackColor.cyan = Math.max(0, Math.min(100, Number(fallbackCmyk.c) || 0));
				fallbackColor.magenta = Math.max(0, Math.min(100, Number(fallbackCmyk.m) || 0));
				fallbackColor.yellow = Math.max(0, Math.min(100, Number(fallbackCmyk.y) || 0));
				fallbackColor.black = Math.max(0, Math.min(100, Number(fallbackCmyk.k) || 0));
				fallbackSpot.color = fallbackColor;
				return true;
			}
			return false;
		}

		var sourceColor = sourceSwatch.color;
		if (sourceColor.typename === "SpotColor" && sourceColor.spot) {
			var newSpot = doc.spots.add();
			newSpot.name = newSwatchName;
			try { newSpot.colorType = sourceColor.spot.colorType; } catch (ctErr) { }
			newSpot.color = sourceColor.spot.color;
			return true;
		}

		var newSwatch = doc.swatches.add();
		newSwatch.name = newSwatchName;
		newSwatch.color = sourceColor;
		return true;
	} catch (e) {
		return false;
	}
}

function isBlockerEnabled(profileMetadata) {
	try {
		var raw = profileMetadata ? profileMetadata.blocker : null;
		if (raw === true || raw === 1) return true;
		if (typeof raw === "string") {
			var normalized = raw.replace(/^\s+|\s+$/g, "").toUpperCase();
			return normalized === "Y" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
		}
		return false;
	} catch (e) {
		return false;
	}
}

function finalizeUnderbaseLayer(underbaseLayer, runLeftoverUb, swatchName) {
	try {
		// Use the provided swatch name; fall back to the default White UB constant if not supplied.
		var resolvedSwatch = (swatchName && String(swatchName).replace(/^\s+|\s+$/g, "") !== "")
			? String(swatchName)
			: CONSTANTS.SWATCH_NAMES.WHITE_UB;
		app.selection = null;
		app.activeDocument.activeLayer = underbaseLayer;
		app.activeDocument.activeLayer.hasSelectedArtwork = true;
		app.redraw();
		applySwatchToFill(app.activeDocument, resolvedSwatch);
		app.executeMenuCommand('sendToBack');
		pathFinderAdd();
		if (runLeftoverUb) {
			deleteLeftoverPathsInLayer(underbaseLayer);
		}
		app.selection = null;
	} catch (e) { }
}

function generateUnderbase(_graphicName, cleanupOpts, profileMetadata) {
	try {
		var runUnpainted = cleanupOpts == null || cleanupOpts.deleteUnpaintedPaths === true;
		var runLeftoverUb = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
		var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);
		var _sizedArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
		var _sizedGraphicLayer = _sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
		var _graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);

		var tempWhiteUBLayer = getOrCreateLayer(app.activeDocument, "__TEMP_WHITE_UB", _separatedArtLayer);
		clearLayerPageItems(tempWhiteUBLayer);
		duplicateItemToLayer(_graphicItem, tempWhiteUBLayer);

		app.selection = null;
		app.activeDocument.activeLayer = tempWhiteUBLayer;
		app.activeDocument.activeLayer.hasSelectedArtwork = true;
		app.redraw();
		setFillOverprintOnContainer(tempWhiteUBLayer, false);
		app.redraw();

		pathFinderMerge();
		app.executeMenuCommand('ungroup');
		if (runUnpainted) {
			deleteNonFillStrokeItems();
		}

		var enabledUnderbaseIndices = getEnabledUnderbaseIndices(profileMetadata);
		var profileUnderbaseSwatch = getProfileUnderbaseSwatchName(profileMetadata);
		for (var ub = 0; ub < enabledUnderbaseIndices.length; ub++) {
			var ubIndex = enabledUnderbaseIndices[ub];
			var ubLayerName = getUnderbaseLayerNameForIndex(ubIndex);
			var ubLayer = getOrCreateLayer(app.activeDocument, ubLayerName, _separatedArtLayer);
			// Match React behavior:
			// - UB1 uses selected profile underbase swatch
			// - UB2+ remain White UB flow
			var ubSwatchName = ubIndex === 0 ? profileUnderbaseSwatch : CONSTANTS.SWATCH_NAMES.WHITE_UB;
			clearLayerPageItems(ubLayer);
			duplicateLayerItems(tempWhiteUBLayer, ubLayer);
			removeKnockoutFilledItemsFromUnderbaseLayer(ubLayer, profileMetadata, ubIndex);
			finalizeUnderbaseLayer(ubLayer, runLeftoverUb, ubSwatchName);
		}

		if (isBlockerEnabled(profileMetadata)) {
			ensureSwatchExistsFromSource(
				CONSTANTS.SWATCH_NAMES.WHITE_UB,
				CONSTANTS.SWATCH_NAMES.BLOCKER,
				{ c: 0, m: 0, y: 0, k: 0 }
			);
			var blockerLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.BLOCKER, _separatedArtLayer);
			clearLayerPageItems(blockerLayer);
			duplicateLayerItems(tempWhiteUBLayer, blockerLayer);
			finalizeUnderbaseLayer(blockerLayer, runLeftoverUb, CONSTANTS.SWATCH_NAMES.BLOCKER);
		}

		// Generate Choke
		generateChoke(tempWhiteUBLayer, _separatedArtLayer);
		reorderGeneratedUnderbaseLayers(_separatedArtLayer);
		try { tempWhiteUBLayer.remove(); } catch (tempRemoveErr) { }
		app.activeDocument.selection = null;
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: "Underbase generation failed: " + (e.message || e.toString())
		});
	}
}


function generateChoke(sourceLayer, separatedArtLayer) {

	var chokeLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.CHOKE, separatedArtLayer);
	try {
		var topMostWhiteUbLayer = null;
		var topMostWhiteUbIndex = 999999;
		for (var layerIndex = 0; layerIndex < separatedArtLayer.layers.length; layerIndex++) {
			var candidateLayer = separatedArtLayer.layers[layerIndex];
			if (candidateLayer && candidateLayer.name && candidateLayer.name.indexOf(CONSTANTS.LAYER_NAMES.WHITE_UB) === 0) {
				if (layerIndex < topMostWhiteUbIndex) {
					topMostWhiteUbIndex = layerIndex;
					topMostWhiteUbLayer = candidateLayer;
				}
			}
		}

		if (topMostWhiteUbLayer) {
			chokeLayer.move(topMostWhiteUbLayer, ElementPlacement.PLACEBEFORE);
		} else {
			chokeLayer.move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);
		}
	} catch (layerMoveErr) {
		chokeLayer.move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);
	}
	clearLayerPageItems(chokeLayer);

	app.activeDocument.activeLayer = sourceLayer;
	app.activeDocument.activeLayer.hasSelectedArtwork = true;
	pathFinderAdd();
	app.executeMenuCommand('ungroup');
	app.redraw();
	var sourceItemCount = 0;
	try { sourceItemCount = sourceLayer.pageItems ? sourceLayer.pageItems.length : 0; } catch (srcCountErr) { }
	var duplicatedCount = duplicateLayerItems(sourceLayer, chokeLayer);
	var chokeItemCount = 0;
	try { chokeItemCount = chokeLayer.pageItems ? chokeLayer.pageItems.length : 0; } catch (chokeCountErr) { }
	// alert("[Choke Debug]\nSource items: " + sourceItemCount + "\nDuplicated: " + duplicatedCount + "\nChoke items: " + chokeItemCount);

	app.redraw();
	app.selection = null;
	app.activeDocument.activeLayer = chokeLayer;
	app.activeDocument.activeLayer.hasSelectedArtwork = true;
	deleteLeftoverPathsInLayer(chokeLayer);
	setFillOverprintOnContainer(chokeLayer, false);

	var noneSwatch = getSwatchByName(app.activeDocument, CONSTANTS.SWATCH_NAMES.NONE);
	if (noneSwatch) {
		app.activeDocument.defaultFilled = true;
		app.activeDocument.defaultFillColor = noneSwatch.color;
		app.redraw();
	}


	applyChokeStroke(app.activeDocument, CONSTANTS.STYLES.CHOKE_STROKE_WIDTH);
	setStrokeOverprintOnContainer(chokeLayer, true);
}

function reorderGeneratedUnderbaseLayers(separatedArtLayer) {
	try {
		if (!separatedArtLayer || !separatedArtLayer.layers) return;

		var chokeLayer = null;
		var baseUnderbaseLayer = null;
		for (var i = 0; i < separatedArtLayer.layers.length; i++) {
			var layer = separatedArtLayer.layers[i];
			if (!layer || !layer.name) continue;
			if (layer.name === CONSTANTS.LAYER_NAMES.CHOKE) chokeLayer = layer;
			if (layer.name === CONSTANTS.LAYER_NAMES.WHITE_UB) baseUnderbaseLayer = layer;
		}

		var generatedUbLayers = [];
		for (var j = 0; j < separatedArtLayer.layers.length; j++) {
			var candidate = separatedArtLayer.layers[j];
			if (!candidate || !candidate.name) continue;
			if (candidate.name.indexOf(CONSTANTS.LAYER_NAMES.WHITE_UB + " ") === 0) {
				generatedUbLayers.push(candidate);
			}
		}
		if (generatedUbLayers.length === 0) return;

		for (var k = generatedUbLayers.length - 1; k >= 0; k--) {
			var ubLayer = generatedUbLayers[k];
			try {
				if (chokeLayer) {
					ubLayer.move(chokeLayer, ElementPlacement.PLACEAFTER);
				} else if (baseUnderbaseLayer) {
					ubLayer.move(baseUnderbaseLayer, ElementPlacement.PLACEBEFORE);
				}
			} catch (moveErr) { }
		}
	} catch (e) { }
}


function getGraphicList() {
	var _graphicList = [];
	var _liveArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.LIVE_ART);
	var _pageItems = _liveArtLayer.layers;

	for (var i = 0; i < _pageItems.length; i++) {
		if (_pageItems[i].name.indexOf(CONSTANTS.GRAPHIC.PREFIX) != -1) {
			_graphicList.push(_pageItems[i].name.split(":")[1]);
		}
	}
	return _graphicList;
}
