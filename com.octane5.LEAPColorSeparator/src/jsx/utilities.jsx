#include "./constants.jsx"

function cmykToRgb(c, m, y, k) {
	c = c / 100;
	m = m / 100;
	y = y / 100;
	k = k / 100;

	var r = 255 * (1 - c) * (1 - k);
	var g = 255 * (1 - m) * (1 - k);
	var b = 255 * (1 - y) * (1 - k);

	return {
		r: Math.round(r),
		g: Math.round(g),
		b: Math.round(b)
	};
}

function rgbToHex(r, g, b) {
	var toHex = function (n) {
		var hex = Math.round(n).toString(16);
		return hex.length === 1 ? "0" + hex : hex;
	};
	return "#" + toHex(r) + toHex(g) + toHex(b);
}

function getColorHex(color) {
	if (color.typename === CONSTANTS.COLOR_TYPES.SPOT) {
		return getColorHex(color.spot.color);
	} else if (color.typename === CONSTANTS.COLOR_TYPES.CMYK) {
		var rgb = cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
		return rgbToHex(rgb.r, rgb.g, rgb.b);
	} else if (color.typename === CONSTANTS.COLOR_TYPES.RGB) {
		return rgbToHex(color.red, color.green, color.blue);
	} else if (color.typename === CONSTANTS.COLOR_TYPES.GRAY) {
		var gray = Math.round((100 - color.gray) * 2.55);
		return rgbToHex(gray, gray, gray);
	}
	return "#808080";
}

function getColorName(color) {
	if (color.typename === CONSTANTS.COLOR_TYPES.SPOT) {
		return color.spot.name;
	} else if (color.typename === CONSTANTS.COLOR_TYPES.CMYK) {
		return CONSTANTS.COLOR_PREFIXES.CMYK +
			Math.round(color.cyan) + "_" +
			Math.round(color.magenta) + "_" +
			Math.round(color.yellow) + "_" +
			Math.round(color.black);
	} else if (color.typename === CONSTANTS.COLOR_TYPES.RGB) {
		return CONSTANTS.COLOR_PREFIXES.RGB +
			Math.round(color.red) + "_" +
			Math.round(color.green) + "_" +
			Math.round(color.blue);
	} else if (color.typename === CONSTANTS.COLOR_TYPES.GRAY) {
		return CONSTANTS.COLOR_PREFIXES.GRAY + Math.round(color.gray);
	}
	return CONSTANTS.COLOR_PREFIXES.UNKNOWN;
}

function collectItemsByColor(item, colorGroups) {
	if (item.typename === "CompoundPathItem") {
		if (item.pathItems && item.pathItems.length > 0 &&
			item.pathItems[0].filled && item.pathItems[0].fillColor) {
			var colorName = getColorName(item.pathItems[0].fillColor);

			if (!colorGroups[colorName]) {
				colorGroups[colorName] = [];
			}
			colorGroups[colorName].push(item);
		}
		return;
	}

	if (item.typename === "PathItem" && item.filled && item.fillColor) {
		var colorName = getColorName(item.fillColor);

		if (!colorGroups[colorName]) {
			colorGroups[colorName] = [];
		}
		colorGroups[colorName].push(item);
		return;
	}

	if (item.pageItems && item.pageItems.length > 0) {
		for (var j = 0; j < item.pageItems.length; j++) {
			collectItemsByColor(item.pageItems[j], colorGroups);
		}
	}
}

function duplicateItemToLayer(item, targetLayer, copiedItems) {
	item.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
	if (copiedItems) {
		copiedItems.push(item);
	}
}

function expandObject() {
	try {
		app.executeMenuCommand('outline');
		app.executeMenuCommand('Live Outline Object');
		app.executeMenuCommand('Live Outline Stroke');
		app.executeMenuCommand('expandStyle');

		var actionFile = File(File($.fileName).parent + "/actions/" + CONSTANTS.ACTIONS.FILE_NAME);
		app.loadAction(actionFile);
		app.doScript(CONSTANTS.ACTIONS.EXPAND_NAME, CONSTANTS.ACTIONS.SET_NAME);
		app.unloadAction(CONSTANTS.ACTIONS.SET_NAME, '');
		pathFinderTrim();
	} catch (e) {
		}
}

function pathFinderTrim() {
	app.executeMenuCommand("group");
	app.executeMenuCommand("Live Pathfinder Trim");
	app.executeMenuCommand("expandStyle");
	app.executeMenuCommand("ungroup");
}

function pathFinderAdd() {
	app.executeMenuCommand("group");
	app.executeMenuCommand("Live Pathfinder Add");
	app.executeMenuCommand("expandStyle");
	app.executeMenuCommand("ungroup");
}

function findLayerByName(layers, layerName) {
	for (var i = 0; i < layers.length; i++) {
		var layer = layers[i];

		if (layer.name === layerName) {
			return layer;
		}

		if (layer.layers && layer.layers.length > 0) {
			var found = findLayerByName(layer.layers, layerName);
			if (found) {
				return found;
			}
		}
	}

	return null;
}

function getOrCreateLayer(doc, layerName, parentLayer) {
	var layer;
	var layerCollection = parentLayer ? parentLayer.layers : doc.layers;

	try {
		layer = layerCollection.getByName(layerName);
	} catch (e) {
		layer = layerCollection.add();
		layer.name = layerName;
	}
	app.redraw();
	return layer;
}

function getSwatchByName(doc, swatchName) {
	try {
		return doc.swatches.getByName(swatchName);
	} catch (e) {
		return null;
	}
}

function applySwatchToFill(doc, swatchName) {
	var swatch = getSwatchByName(doc, swatchName);
	if (swatch) {
		doc.defaultFilled = true;
		doc.defaultFillColor = swatch.color;
		return true;
	}
	return false;
}

function applyStroke(doc, swatchName, strokeWidth) {
	var swatch = getSwatchByName(doc, swatchName);
	if (swatch) {
		doc.defaultStroked = true;
		doc.defaultStrokeColor = swatch.color;
		doc.defaultStrokeWidth = strokeWidth || CONSTANTS.STYLES.DEFAULT_STROKE_WIDTH;
		return true;
	}
	return false;
}

function findTextFrameInGroup(items, name) {
	for (var i = 0; i < items.length; i++) {
		var item = items[i];

		if (item.typename === "TextFrame" && item.name === name) {
			return item;
		}

		if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
			var found = findTextFrameInGroup(item.pageItems, name);
			if (found) return found;
		}
	}
	return null;
}

function updateTextFrameInGroup(group, frameName, content) {
	var textFrame = findTextFrameInGroup(group.pageItems, frameName);
	if (textFrame) {
		textFrame.contents = content;
	} else {
		throw new Error("Text frame not found: " + frameName);
	}
}

function setTextFrameColor(textFrame, color) {
	try {
		if (textFrame && textFrame.textRange && color) {
			textFrame.textRange.fillColor = color;
		}
	} catch (e) {
		}
}

function applyColorToAllTextFramesInGroup(group, color) {
	if (!group || !color) return;

	function findAndColorTextFrames(items) {
		for (var i = 0; i < items.length; i++) {
			var item = items[i];

			if (item.typename === "TextFrame") {
				setTextFrameColor(item, color);
			} else if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
				findAndColorTextFrames(item.pageItems);
			}
		}
	}

	findAndColorTextFrames(group.pageItems);
}

function findRectangleInGroup(items, name) {
	for (var i = 0; i < items.length; i++) {
		var item = items[i];

		if (item.typename === "PathItem" && item.name === name) {
			return item;
		}

		if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
			var found = findRectangleInGroup(item.pageItems, name);
			if (found) return found;
		}
	}
	return null;
}

function applyColorToRectanglesInGroup(group, color) {
	if (!group || !color) return;

	var colRect = findRectangleInGroup(group.pageItems, "COLOR");
	if (colRect) {
		try {
			colRect.filled = true;
			colRect.fillColor = color;
		} catch (e) {
			}
	}
}

function updateGridColorLabels(doc, separationData) {
	var result = {
		updatedLabels: 0,
		deletedLabels: 0,
		errors: []
	};

	var infoBoxLayer = findLayerByName(doc.layers, "GRID INFO BOX");
	if (!infoBoxLayer) {
		result.errors.push("GRID INFO BOX layer not found in document");
		return result;
	}

	var groupsWithData = {};

	for (var i = 0; i < separationData.length; i++) {
		var sepData = separationData[i];
		var groupName = String(sepData.seq);
		var labelGroup = null;

		for (var j = 0; j < infoBoxLayer.groupItems.length; j++) {
			if (infoBoxLayer.groupItems[j].name === groupName) {
				labelGroup = infoBoxLayer.groupItems[j];
				break;
			}
		}

		if (!labelGroup) {
			result.errors.push("Group '" + groupName + "' not found in GRID INFO BOX layer");
			continue;
		}

		var swatchColor = null;
		if (sepData.colorName) {
			var swatch = getSwatchByName(doc, sepData.colorName);
			if (swatch && swatch.color) {
				swatchColor = swatch.color;
			} else {
				result.errors.push("Swatch '" + sepData.colorName + "' not found for group '" + groupName + "'");
			}
		}

		try {
			updateTextFrameInGroup(labelGroup, "SEQ", String(sepData.seq));
			updateTextFrameInGroup(labelGroup, "COLOR NAME", sepData.colorName);
			updateTextFrameInGroup(labelGroup, "MESH", sepData.mesh);
			updateTextFrameInGroup(labelGroup, "MICRON", sepData.micron);
			updateTextFrameInGroup(labelGroup, "FLASH", sepData.flash ? "Y" : "N");
			updateTextFrameInGroup(labelGroup, "COOL", sepData.cool ? "Y" : "N");
			updateTextFrameInGroup(labelGroup, "WB", sepData.wb ? "Y" : "N");

			if (swatchColor) {
				applyColorToAllTextFramesInGroup(labelGroup, swatchColor);
				applyColorToRectanglesInGroup(labelGroup, swatchColor);
			}

			labelGroup.hidden = false;
			groupsWithData[groupName] = true;

			result.updatedLabels++;
		} catch (e) {
			result.errors.push("Error updating group '" + groupName + "': " + e.message);
		}
	}

	var maxGroupsToCheck = 14;
	for (var i = 1; i <= maxGroupsToCheck; i++) {
		var groupName = String(i);

		if (groupsWithData[groupName]) {
			continue;
		}

		var labelGroup = null;

		for (var j = 0; j < infoBoxLayer.groupItems.length; j++) {
			if (infoBoxLayer.groupItems[j].name === groupName) {
				labelGroup = infoBoxLayer.groupItems[j];
				break;
			}
		}

		if (!labelGroup) {
			continue;
		}

		try {
			labelGroup.hidden = true;
		} catch (e) {
			result.errors.push("Error hiding group '" + groupName + "': " + e.message);
		}
	}

	return result;
}

function normalizeKey(str) {
	return str.toLowerCase().replace(/[\s_-]/g, '');
}

function findValueInJSON(obj, key) {
	var normalizedSearchKey = normalizeKey(key);

	if (obj.hasOwnProperty(key)) {
		return obj[key];
	}

	for (var prop in obj) {
		if (obj.hasOwnProperty(prop)) {
			var normalizedProp = normalizeKey(prop);

			if (normalizedProp === normalizedSearchKey) {
				if (typeof obj[prop] !== 'object' || obj[prop] === null) {
					return obj[prop];
				}
			}
		}
	}

	for (var prop in obj) {
		if (obj.hasOwnProperty(prop) && typeof obj[prop] === 'object' && obj[prop] !== null) {
			var result = findValueInJSON(obj[prop], key);
			if (result !== null) {
				return result;
			}
		}
	}

	return null;
}

function updateVariablesInDocument(doc, jsonData, styleCodes) {
	try {
		var textFrames = doc.textFrames;

		for (var i = 0; i < textFrames.length; i++) {
			var textFrame = textFrames[i];
			var content = textFrame.contents;

			var regex = /\[([^\]]+)\]/g;
			var match;
			var updatedContent = content;

			while ((match = regex.exec(content)) !== null) {
				var variableName = match[1];
				var fullMatch = match[0];
				var value = null;

				if (variableName.toLowerCase() === 'style_code') {
					if (styleCodes && styleCodes.length > 0) {
						value = styleCodes.join(', ');
					} else {
						value = findValueInJSON(jsonData, variableName);
					}
				} else {
					value = findValueInJSON(jsonData, variableName);
				}

				if (value !== null) {
					updatedContent = updatedContent.replace(fullMatch, value.toString());
				}
			}

			if (updatedContent !== content) {
				textFrame.contents = updatedContent;
			}
		}
	} catch (e) {
		}
}

function findAndReadJSONFile(docName, leagueFolder) {
	var jsonFolder = new Folder(leagueFolder.fsName + "/JSON");
	if (!jsonFolder.exists) {
		return null;
	}

	var jsonFiles = jsonFolder.getFiles("*.json");
	var jsonFile = null;

	for (var i = 0; i < jsonFiles.length; i++) {
		var fileName = jsonFiles[i].name;
		if (fileName.indexOf(docName) !== -1) {
			jsonFile = jsonFiles[i];
			break;
		}
	}

	if (!jsonFile) {
		return null;
	}

	jsonFile.open('r');
	var jsonContent = jsonFile.read();
	jsonFile.close();

	try {
		return JSON.parse(jsonContent);
	} catch (e) {
		return null;
	}
}

function decodeURIString(str) {
	if (!str) return str;

	try {
		return decodeURIComponent(str);
	} catch (e) {
		return str;
	}
}
