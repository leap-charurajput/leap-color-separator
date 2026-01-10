#include "./JSON.jsx";

if (!String.prototype.trim) {
	(function () {
		var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
		String.prototype.trim = function () {
			return this.replace(rtrim, '');
		};
	})();
}

if (!Object.keys) {
	Object.keys = (function () {
		var hasOwnProperty = Object.prototype.hasOwnProperty,
			hasDontEnumBug = !({
				toString: null
			}).propertyIsEnumerable('toString'),
			dontEnums = [
				'toString',
				'toLocaleString',
				'valueOf',
				'hasOwnProperty',
				'isPrototypeOf',
				'propertyIsEnumerable',
				'constructor'
			],
			dontEnumsLength = dontEnums.length;

		return function (obj) {
			if (typeof obj !== 'function' && (typeof obj !== 'object' || obj === null)) {
				throw new TypeError('Object.keys called on non-object');
			}

			var result = [],
				prop, i;

			for (prop in obj) {
				if (hasOwnProperty.call(obj, prop)) {
					result.push(prop);
				}
			}

			if (hasDontEnumBug) {
				for (i = 0; i < dontEnumsLength; i++) {
					if (hasOwnProperty.call(obj, dontEnums[i])) {
						result.push(dontEnums[i]);
					}
				}
			}
			return result;
		};
	}());
}

if (!Array.isArray) {
	Array.isArray = function (arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}

if (typeof xmpModifier !== 'object') {
	xmpModifier = {};
}

if (typeof xmpModifier._cache === 'undefined') {
	xmpModifier._cache = {};
	xmpModifier._cacheXMPString = {};
}

function GetXMP(nameSpace, nodeName, document) {
	var context = this;
	context.destNamespace = nameSpace;
	context.nodeName = nodeName;
	context.document = document || app.documents[0];

	context.init = function () {
		var xmp = null;
		if (ExternalObject.AdobeXMPScript == undefined) {
			ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
		}
		var registeredNameSpace = XMPMeta.registerNamespace(context.destNamespace, context.nodeName);
		var prefix = XMPMeta.getNamespacePrefix(context.destNamespace);
		var isValidXmp = false;
		if (prefix != '') {
			var docFullName = context.document.fullName ? context.document.fullName.fsName : '';
			var cacheKey = docFullName + '|' + context.destNamespace;
			var currentXMPString = context.document.XMPString;

			if (xmpModifier._cache[cacheKey] &&
				xmpModifier._cacheXMPString[cacheKey] === currentXMPString) {
				xmp = xmpModifier._cache[cacheKey];
			} else {
				xmp = new XMPMeta(currentXMPString);
				xmpModifier._cache[cacheKey] = xmp;
				xmpModifier._cacheXMPString[cacheKey] = currentXMPString;
			}
			isValidXmp = true;
		}
		context.xmp = xmp;
		context.isXmpCreated = isValidXmp;
		context.hasPendingChanges = false;
		context.cacheKey = context.document.fullName ? (context.document.fullName.fsName + '|' + context.destNamespace) : null;
	}

	context.doesStructFieldExist = function (structFieldName) {
		return context.xmp.doesStructFieldExist(context.destNamespace, context.nodeName, context.destNamespace, structFieldName)
	}

	context.deleteStructField = function (structFieldName, autoCommit) {
		if (context.doesStructFieldExist(structFieldName)) {
			context.xmp.deleteStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName);
			context.hasPendingChanges = true;

			if (autoCommit !== false) {
				context.commit();
			}
		}
	}

	context.setStructField = function (structFieldName, structFieldValue, doesStringify, autoCommit) {
		structFieldValue = doesStringify ? JSON.stringify(structFieldValue) : structFieldValue;
		context.xmp.setStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName, structFieldValue);
		context.hasPendingChanges = true;

		if (autoCommit !== false) {
			context.commit();
		}
	}

	context.getStructField = function (structFieldName, doesParse) {
		var structFieldValue = [];
		if (context.doesStructFieldExist(structFieldName)) {
			structFieldValue = context.xmp.getStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName).value;
			structFieldValue = doesParse ? JSON.parse(structFieldValue) : structFieldValue;
		}
		return structFieldValue;
	}

	context.commit = function () {
		if (!context.isXmpCreated || !context.xmp) {
			return;
		}
		if (!context.hasPendingChanges) {
			return;
		}
		var packet = context.xmp.serialize(XMPConst.SERIALIZE_USE_COMPACT_FORMAT);
		context.document.XMPString = packet;
		context.document.saved = false;
		context.hasPendingChanges = false;

		if (context.cacheKey) {
			xmpModifier._cache[context.cacheKey] = context.xmp;
			xmpModifier._cacheXMPString[context.cacheKey] = packet;

			var docFullName = context.document.fullName ? context.document.fullName.fsName : '';
			for (var key in xmpModifier._cacheXMPString) {
				if (key.indexOf(docFullName + '|') === 0 && key !== context.cacheKey) {
					xmpModifier._cacheXMPString[key] = packet;
					delete xmpModifier._cache[key];
				}
			}
		}
	}

	context.init();
}

xmpModifier.GetXMP = GetXMP;

#include "./JSON.jsx"
#include "./constants.jsx"
#include "./utilities.jsx"
#include "./color_separation.jsx"

function getServerBasePath() {
	try {
		var documentsFolder = Folder.myDocuments || new Folder("~/Documents");
		var settingsPath = documentsFolder.fsName + "/LEAP Settings/logobaseDataPathSettings.json";
		var settingsFile = new File(settingsPath);
		if (!settingsFile.exists) {
			return null;
		}
		if (!settingsFile.open("r")) {
			return null;
		}
		var content = settingsFile.read();
		settingsFile.close();
		if (!content || !content.length) {
			return null;
		}
		var parsed;
		if (typeof JSON !== "undefined" && JSON.parse) {
			parsed = JSON.parse(content);
		} else {
			parsed = eval("(" + content + ")");
		}
		if (parsed && parsed.basePath) {
			return parsed.basePath;
		}
	} catch (error) {
	}
	return null;
}
function getTemplateFile() {
	getTemplateFile.lastAttemptedPath = null;
	var serverBasePath = getServerBasePath();
	if (serverBasePath) {
		try {
			var normalizedBasePath = serverBasePath.replace(/\/$/, "");
			var templateFolderPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Templates";
			var templateFilePath = templateFolderPath + "/SEP-GRID-TEMPLATE.ai";
			getTemplateFile.lastAttemptedPath = templateFilePath;
			var serverTemplatesFolder = new Folder(templateFolderPath);
			if (serverTemplatesFolder.exists) {
				var serverTemplateFile = new File(templateFilePath);
				if (serverTemplateFile.exists) {
					return serverTemplateFile;
				}
			}
		} catch (serverError) {
		}
	}
	return null;
}
getTemplateFile.lastAttemptedPath = null;
function createSeparationsFolders(rootFolder, league, teamCode, graphicName) {
	var separationsFolder = new Folder(rootFolder.fsName + "/09 SEPARATIONS");
	if (!separationsFolder.exists) {
		separationsFolder.create();
	}
	var leagueSepFolder = new Folder(separationsFolder.fsName + "/" + league);
	if (!leagueSepFolder.exists) {
		leagueSepFolder.create();
	}
	var teamCodeFolder = new Folder(leagueSepFolder.fsName + "/" + teamCode);
	if (!teamCodeFolder.exists) {
		teamCodeFolder.create();
	}
	var graphicNameFolder = new Folder(teamCodeFolder.fsName + "/" + graphicName.toUpperCase());
	if (!graphicNameFolder.exists) {
		graphicNameFolder.create();
	}
	return graphicNameFolder;
}
function placeAndEmbedGraphicAI(sepDoc, graphicAIPath, graphicName) {
	try {
		var aiFile = new File(graphicAIPath);
		if (!aiFile.exists) {
			return false;
		}
		var gridLayer = findLayerByName(sepDoc.layers, "GRID");
		if (!gridLayer) {
			return false;
		}
		var garmentLayer = findLayerByName(gridLayer.layers, "GARMENT");
		if (!garmentLayer) {
			return false;
		}
		if (garmentLayer.pathItems.length === 0) {
			return false;
		}
		var garmentRect = garmentLayer.pathItems[0];
		var targetBounds = garmentRect.geometricBounds;
		var sizedArtLayer = null;
		try {
			sizedArtLayer = sepDoc.layers.getByName("SIZED_ART");
		}
		catch (e) {
			return false;
		}
		var sizedGraphicsLayer = null;
		try {
			sizedGraphicsLayer = sizedArtLayer.layers.getByName("SIZED_GRAPHICS");
		} catch (e) {
			sizedGraphicsLayer = sizedArtLayer.layers.add();
			sizedGraphicsLayer.name = "SIZED_GRAPHICS";
		}
		var graphicDoc = app.open(aiFile);
		graphicDoc.selectObjectsOnActiveArtboard();
		if (graphicDoc.selection.length === 0) {
			graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
			return false;
		}
		var originalBounds = graphicDoc.selection[0].geometricBounds;
		for (var i = 1; i < graphicDoc.selection.length; i++) {
			var itemBounds = graphicDoc.selection[i].geometricBounds;
			originalBounds[0] = Math.min(originalBounds[0], itemBounds[0]);
			originalBounds[1] = Math.max(originalBounds[1], itemBounds[1]);
			originalBounds[2] = Math.max(originalBounds[2], itemBounds[2]);
			originalBounds[3] = Math.min(originalBounds[3], itemBounds[3]);
		}
		app.copy();
		graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
		app.activeDocument = sepDoc;
		app.preferences.setBooleanPreference('layers/pastePreserve', false);
		app.activeDocument.activeLayer = sizedGraphicsLayer;
		app.paste();
		if (app.activeDocument.selection.length > 0) {
			app.executeMenuCommand("group");
			var pastedGroup = app.activeDocument.selection[0];
			pastedGroup.name = graphicName.toUpperCase();
			var currentBounds = pastedGroup.geometricBounds;
			var originalWidth = originalBounds[2] - originalBounds[0];
			var originalHeight = originalBounds[1] - originalBounds[3];
			var targetWidth = targetBounds[2] - targetBounds[0];
			var targetHeight = targetBounds[1] - targetBounds[3];
			var graphicAspectRatio = originalWidth / originalHeight;
			var boundsAspectRatio = targetWidth / targetHeight;
			var newWidth, newHeight;
			if (graphicAspectRatio > boundsAspectRatio) {
				newWidth = targetWidth;
				newHeight = targetWidth / graphicAspectRatio;
			} else {
				newHeight = targetHeight;
				newWidth = targetHeight * graphicAspectRatio;
			}
			var scaleX = (newWidth / originalWidth) * 100;
			var scaleY = (newHeight / originalHeight) * 100;
			pastedGroup.resize(scaleX, scaleY);
			var resizedBounds = pastedGroup.geometricBounds;
			var targetCenterX = targetBounds[0] + (targetWidth / 2);
			var targetCenterY = targetBounds[3] + (targetHeight / 2);
			var currentCenterX = resizedBounds[0] + ((resizedBounds[2] - resizedBounds[0]) / 2);
			var currentCenterY = resizedBounds[3] + ((resizedBounds[1] - resizedBounds[3]) / 2);
			var moveX = targetCenterX - currentCenterX;
			var moveY = targetCenterY - currentCenterY;
			pastedGroup.translate(moveX, moveY);
		}
		app.activeDocument.selection = null;
		return true;
	} catch (e) {
		return false;
	}
}
function placeGraphicInDocument(doc, graphicPNGPath) {
	try {
		var pngFile = new File(graphicPNGPath);
		if (!pngFile.exists) {
			return false;
		}
		var sizedArtLayer = null;
		for (var i = 0; i < doc.layers.length; i++) {
			if (doc.layers[i].name === "SIZED_ART") {
				sizedArtLayer = doc.layers[i];
				break;
			}
		}
		if (!sizedArtLayer) {
			return false;
		}
		var graphicItems = [];
		for (var i = 0; i < sizedArtLayer.pathItems.length; i++) {
			var item = sizedArtLayer.pathItems[i];
			if (item.name === "[GRAPHIC]") {
				graphicItems.push(item);
			}
		}
		if (graphicItems.length === 0) {
			return false;
		}
		for (var i = 0; i < graphicItems.length; i++) {
			var pathItem = graphicItems[i];
			var bounds = pathItem.geometricBounds;
			var placedItem = sizedArtLayer.placedItems.add();
			placedItem.file = pngFile;
			var boundsWidth = bounds[2] - bounds[0];
			var boundsHeight = bounds[1] - bounds[3];
			var originalWidth = placedItem.width;
			var originalHeight = placedItem.height;
			var imageAspectRatio = originalWidth / originalHeight;
			var boundsAspectRatio = boundsWidth / boundsHeight;
			var newWidth, newHeight;
			if (imageAspectRatio > boundsAspectRatio) {
				newWidth = boundsWidth;
				newHeight = boundsWidth / imageAspectRatio;
			} else {
				newHeight = boundsHeight;
				newWidth = boundsHeight * imageAspectRatio;
			}
			placedItem.width = newWidth;
			placedItem.height = newHeight;
			var centerX = bounds[0] + (boundsWidth / 2);
			var centerY = bounds[3] + (boundsHeight / 2);
			placedItem.left = centerX - (newWidth / 2);
			placedItem.top = centerY + (newHeight / 2);
		}
		return true;
	} catch (e) {
		return false;
	}
}
function getSeparatedArtLayerNames(doc) {
	var layerNames = [];
	try {
		var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
		for (var i = 0; i < separatedArtLayer.layers.length; i++) {
			var subLayer = separatedArtLayer.layers[i];
			layerNames.push(subLayer.name);
		}
	} catch (e) { }
	return layerNames;
}
function copyAndPrepareSEPDocument(templateFile, destinationFolder, docName, jsonData, styleCodes, profileMetadata) {
	var profileCode = null;
	if (profileMetadata && profileMetadata.profileCode) {
		profileCode = profileMetadata.profileCode;
	}
	var filename = docName + "-SEP";
	if (profileCode) {
		filename += "-" + profileCode;
	}
	filename += ".ai";
	var destinationFile = new File(destinationFolder.fsName + "/" + filename);
	templateFile.copy(destinationFile);
	if (!destinationFile.exists) {
		return null;
	}
	var sepDoc = app.open(destinationFile);
	updateVariablesInDocument(sepDoc, jsonData, styleCodes);
	try {
		var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
		if (sepXmp.isXmpCreated) {
			sepXmp.setStructField("DocumentType", "Separation Document", false, false);
			if (profileMetadata) {
				sepXmp.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
			}
			try {
				var colorsInfo = jsonData.colors_info || [];
				var bodyColorInfo = null;
				for (var i = 0; i < colorsInfo.length; i++) {
					if (colorsInfo[i].name && colorsInfo[i].name.toLowerCase() === "body") {
						bodyColorInfo = colorsInfo[i];
						break;
					}
				}
				if (bodyColorInfo && bodyColorInfo.colorInfo) {
					var cmyk = bodyColorInfo.colorInfo;
					var rgb = cmykToRgb(cmyk.C || 0, cmyk.M || 0, cmyk.Y || 0, cmyk.K || 0);
					var hexColor = rgbToHex(rgb.r, rgb.g, rgb.b);
					var bodyColorData = {
						bodyColor: hexColor,
						colorName: bodyColorInfo.ColorName || bodyColorInfo.name || "Body",
						cmyk: {
							c: cmyk.C || 0,
							m: cmyk.M || 0,
							y: cmyk.Y || 0,
							k: cmyk.K || 0
						},
						rgb: rgb
					};
					sepXmp.setStructField("BodyColor", bodyColorData, true, false);
				}
			} catch (bodyColorError) {
			}
			sepXmp.commit();
		}
	} catch (e) {
	}
	sepDoc.save();
	return sepDoc;
}
function handlePerformSeparation(params_string) {
	try {
		var params = JSON.parse(params_string);
		var graphicName = params.graphicName;
		var styleCodes = params.styleCodes || [];
		var profileMetadata = params.profileMetadata || null;

		if (!graphicName) {
			return JSON.stringify({
				success: false,
				error: "Graphic name is required"
			});
		}
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}
		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docName = docFile.name.replace(/\.[^\.]+$/, '');
		var aiFolder = docFile.parent;
		var leagueFolder = aiFolder.parent;
		var teamOutsFolder = leagueFolder.parent;
		var rootFolder = teamOutsFolder.parent;
		var templateFile = getTemplateFile();
		if (!templateFile) {
			var attemptedPath = getTemplateFile.lastAttemptedPath;
			if (attemptedPath) {
				return JSON.stringify({
					success: false,
					error: "SEP-GRID-TEMPLATE.ai not found at: " + attemptedPath
				});
			}
			return JSON.stringify({
				success: false,
				error: "SEP-GRID-TEMPLATE.ai not found. Please verify basePath in logobaseDataPathSettings.json."
			});
		}
		var jsonData = findAndReadJSONFile(docName, leagueFolder);
		if (!jsonData) {
			return JSON.stringify({
				success: false,
				error: "JSON file not found or invalid for document: " + docName
			});
		}
		var league = findValueInJSON(jsonData, "League");
		var teamCode = findValueInJSON(jsonData, "TeamCode");
		if (!league || !teamCode) {
			return JSON.stringify({
				success: false,
				error: "League or TeamCode not found in JSON file"
			});
		}
		var originalDoc = activeDoc;
		var originalDocFile = docFile;
		var graphicNameFolder = createSeparationsFolders(rootFolder, league, teamCode, graphicName);
		var sepDoc = copyAndPrepareSEPDocument(templateFile, graphicNameFolder, docName, jsonData, styleCodes, profileMetadata);
		if (!sepDoc) {
			return JSON.stringify({
				success: false,
				error: "Failed to create SEP document"
			});
		}
		var sepDocFile = new File(sepDoc.fullName);
		var sepDocPath = sepDocFile.fsName;
		var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
		var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
		var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + graphicName);
		var pngFolder = new Folder(graphicTypeFolder.fsName + "/PNG");
		var pngFileName = docName + "_GRAPHICS_" + graphicName + ".png";
		var pngFilePath = pngFolder.fsName + "/" + pngFileName;
		var aiFolder = new Folder(graphicTypeFolder.fsName + "/AI");
		var aiFileName = docName + "_GRAPHICS_" + graphicName + ".ai";
		var aiFilePath = aiFolder.fsName + "/" + aiFileName;
		var pngPlaced = placeGraphicInDocument(sepDoc, pngFilePath);
		if (!pngPlaced) {
		}
		var aiPlaced = placeAndEmbedGraphicAI(sepDoc, aiFilePath, graphicName);
		if (!aiPlaced) {
		}
		sepDoc.save();
		splitColors(graphicName);
		generateUnderbase(graphicName);

		try {
			var layerNames = getSeparatedArtLayerNames(sepDoc);
			if (layerNames.length > 0) {
				var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
				if (sepXmp.isXmpCreated) {
					sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
					sepXmp.commit();
					sepDoc.save();
				}
			}
		} catch (e) {
		}

		var savePathsDebug = [];
		try {
			$.sleep(100);
			var foundOriginalDoc = null;
			if (app.documents.length > 0) {
				for (var d = 0; d < app.documents.length; d++) {
					var doc = app.documents[d];
					if (doc.fullName && doc.fullName.fsName === originalDocFile.fsName) {
						foundOriginalDoc = doc;
						break;
					}
				}
				if (foundOriginalDoc) {
					savePathsDebug.push("Found original document: " + foundOriginalDoc.fullName.fsName);
					app.activeDocument = foundOriginalDoc;
					var origXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", foundOriginalDoc);
					if (origXmp.isXmpCreated) {
						savePathsDebug.push("XMP created successfully");
						var separations = [];
						if (origXmp.doesStructFieldExist("LEAPSeparationProfileData")) {
							try {
								var existingSeparations = origXmp.getStructField("LEAPSeparationProfileData", true);
								if (Array.isArray(existingSeparations)) {
									separations = existingSeparations;
									savePathsDebug.push("Found existing separations: " + separations.length);
								}
							} catch (e) {
								savePathsDebug.push("Error loading existing separations: " + e.message);
								separations = [];
							}
						} else {
							savePathsDebug.push("No existing LEAPSeparationProfileData field");
						}
						var existingIndex = -1;
						var currentProfileName = profileMetadata && profileMetadata.profileName ? profileMetadata.profileName : null;
						savePathsDebug.push("Current graphic: " + graphicName + ", profile: " + (currentProfileName || "none"));
						for (var i = 0; i < separations.length; i++) {
							var existingSeparation = separations[i];
							var existingGraphicName = existingSeparation.graphicName;
							var existingProfileName = existingSeparation.profileMetadata && existingSeparation.profileMetadata.profileName ? existingSeparation.profileMetadata.profileName : null;
							if (existingGraphicName === graphicName) {
								if (currentProfileName && existingProfileName) {
									if (existingProfileName === currentProfileName) {
										existingIndex = i;
										savePathsDebug.push("Found existing entry at index: " + i);
										break;
									}
								} else if (!currentProfileName && !existingProfileName) {
									existingIndex = i;
									savePathsDebug.push("Found existing entry at index: " + i);
									break;
								}
							}
						}
						var separationEntry = {
							graphicName: graphicName,
							profileMetadata: profileMetadata || null,
							separatedDocumentPath: sepDocPath
						};
						savePathsDebug.push("Saving separation entry - graphic: " + graphicName + ", path: " + sepDocPath);
						if (existingIndex >= 0) {
							separations[existingIndex] = separationEntry;
							savePathsDebug.push("Updated existing entry at index: " + existingIndex);
						} else {
							separations.push(separationEntry);
							savePathsDebug.push("Added new entry. Total separations: " + separations.length);
						}
						try {
							origXmp.setStructField("LEAPSeparationProfileData", separations, true, false);
							savePathsDebug.push("Set struct field successful");
							origXmp.commit();
							savePathsDebug.push("XMP commit successful");
							if (foundOriginalDoc.fullName && foundOriginalDoc.fullName.fsName) {
								try {
									foundOriginalDoc.save();
									savePathsDebug.push("Document save successful");
								} catch (saveError) {
									savePathsDebug.push("Document save error: " + saveError.message);
								}
							}
						} catch (xmpError) {
							savePathsDebug.push("XMP save error: " + xmpError.message);
						}
					} else {
						savePathsDebug.push("XMP not created for original document");
					}
				} else {
					savePathsDebug.push("Original document not found in open documents");
				}
			}
		} catch (e) {
			savePathsDebug.push("Error saving separation path: " + e.message);
		}

		try {
			app.activeDocument = sepDoc;
		} catch (e) {
		}

		var response = {
			success: true,
			message: "Separation performed successfully for graphic: " + graphicName
		};
		if (savePathsDebug && savePathsDebug.length > 0) {
			response.savePathsDebug = savePathsDebug;
		}
		return JSON.stringify(response);
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetGraphicsList(params_string) {
	try {
		var graphicsList = getGraphicList();
		return JSON.stringify({
			success: true,
			graphics: graphicsList
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleToggleLayerVisibility(params_string) {
	try {
		var params = JSON.parse(params_string);
		var layerName = params.layerName;

		if (!layerName) {
			return JSON.stringify({
				success: false,
				error: "Layer name is required"
			});
		}

		// Check if there's an active document
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}

		var doc = app.activeDocument;

		// Search for layer recursively (including sublayers)
		var layer = findLayerByName(doc.layers, layerName);

		if (!layer) {
			// Layer doesn't exist - this is not an error, just return success with no action
			return JSON.stringify({
				success: true,
				layerFound: false,
				message: "Layer not found: " + layerName
			});
		}

		// Toggle visibility
		layer.visible = !layer.visible;
		var newVisibility = layer.visible;

		return JSON.stringify({
			success: true,
			layerFound: true,
			visible: newVisibility,
			message: "Layer visibility toggled: " + layerName
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}

/*********************************************************
 * Ink visibility helpers for SEPARATED_ART layer
 *********************************************************/
function getSeparatedArtLayer(doc) {
	try {
		return doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
	} catch (e) {
		return null;
	}
}

function getSeparatedArtVisibilityState(separatedArtLayer) {
	var total = separatedArtLayer.layers.length;
	var visibleCount = 0;

	for (var i = 0; i < separatedArtLayer.layers.length; i++) {
		if (separatedArtLayer.layers[i].visible) {
			visibleCount++;
		}
	}

	var mode = "other";
	if (total === 0) {
		mode = "empty";
	} else if (visibleCount === 0) {
		mode = "noneVisible";
	} else if (visibleCount === total) {
		mode = "allVisible";
	} else if (visibleCount === 1) {
		mode = "singleVisible";
	}

	return {
		total: total,
		visibleCount: visibleCount,
		mode: mode
	};
}

/*********************************************************
 * Toggle ink visibility according to SEPARATED_ART rules
 *
 * Expected params: { inkName: "PANTONE 123 C" }
 * States:
 *  - If all sublayers visible  -> hide all, show only clicked ink
 *  - If only one visible       -> show all
 * Returns: { success: true, mode: "allVisible" | "singleVisible" | "other" }
 *********************************************************/
function handleToggleInkVisibility(params_string) {
	try {
		var params = JSON.parse(params_string);
		var inkName = params.inkName;

		if (!inkName) {
			return JSON.stringify({
				success: false,
				error: "Ink name is required"
			});
		}

		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}

		var doc = app.activeDocument;

		// Requirement 1: Hide SIZED_GRAPHICS sublayer
		try {
			var sizedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
			var sizedGraphicsLayer = sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
			sizedGraphicsLayer.visible = false;
			// Postpone redraw until end to prevent flicker, or do it here if needed immediately
		} catch (e) {
			// Layer might not exist
		}

		var separatedArtLayer = getSeparatedArtLayer(doc);

		// Fallback to generic toggle if SEPARATED_ART layer is missing
		if (!separatedArtLayer) {
			var genericLayer = findLayerByName(doc.layers, inkName);
			if (!genericLayer) {
				return JSON.stringify({
					success: true,
					layerFound: false,
					mode: "other",
					message: "Layer not found: " + inkName
				});
			}

			genericLayer.visible = !genericLayer.visible;
			return JSON.stringify({
				success: true,
				layerFound: true,
				mode: "other",
				visible: genericLayer.visible
			});
		}

		var state = getSeparatedArtVisibilityState(separatedArtLayer);
		var targetLayer = null;

		for (var i = 0; i < separatedArtLayer.layers.length; i++) {
			var subLayer = separatedArtLayer.layers[i];
			if (subLayer.name === inkName) {
				targetLayer = subLayer;
				break;
			}
		}

		if (!targetLayer) {
			return JSON.stringify({
				success: true,
				layerFound: false,
				mode: state.mode,
				message: "Ink sublayer not found in SEPARATED_ART: " + inkName
			});
		}

		if (state.mode === "allVisible") {
			// Switch to Single Visible (Solo Mode)
			for (var j = 0; j < separatedArtLayer.layers.length; j++) {
				separatedArtLayer.layers[j].visible = false;
			}
			targetLayer.visible = true;

			// Force redraw
			app.redraw();

			return JSON.stringify({
				success: true,
				layerFound: true,
				mode: "singleVisible",
				activeInk: targetLayer.name
			});
		} else if (state.mode === "singleVisible") {
			// Requirement 3: Exclusive switching logic

			if (targetLayer.visible) {
				// Clicked the active one -> Show All (Toggle off)
				for (var k = 0; k < separatedArtLayer.layers.length; k++) {
					separatedArtLayer.layers[k].visible = true;
				}

				app.redraw();
				return JSON.stringify({
					success: true,
					layerFound: true,
					mode: "allVisible"
				});
			} else {
				// Clicked a different one -> Switch to that one (Exclusive)
				// Hide all first (to ensure the old one is hidden)
				for (var k = 0; k < separatedArtLayer.layers.length; k++) {
					separatedArtLayer.layers[k].visible = false;
				}
				// Show the new one
				targetLayer.visible = true;

				app.redraw();
				return JSON.stringify({
					success: true,
					layerFound: true,
					mode: "singleVisible",
					activeInk: targetLayer.name
				});
			}
		} else {
			// Mixed state -> Default to Show All
			for (var m = 0; m < separatedArtLayer.layers.length; m++) {
				separatedArtLayer.layers[m].visible = true;
			}

			app.redraw();
			return JSON.stringify({
				success: true,
				layerFound: true,
				mode: "allVisible"
			});
		}
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}

/*********************************************************
 * Reset ink visibility from header eye icon
 *
 * - If all sublayers are already visible -> do nothing
 * - If only one (or some) visible       -> show all sublayers
 * Returns: { success: true, mode: "allVisible" | "allVisibleNoOp" | "other" }
 *********************************************************/
function handleResetInkVisibility(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}

		var doc = app.activeDocument;
		var separatedArtLayer = getSeparatedArtLayer(doc);

		if (!separatedArtLayer) {
			return JSON.stringify({
				success: true,
				mode: "other",
				message: "SEPARATED_ART layer not found - no changes made"
			});
		}

		var state = getSeparatedArtVisibilityState(separatedArtLayer);

		if (state.mode === "allVisible") {
			// Toggle to Hide All

			// Requirement 1: Hide SIZED_GRAPHICS when hiding
			try {
				var sizedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
				var sizedGraphicsLayer = sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
				sizedGraphicsLayer.visible = false;
			} catch (e) {
				// Ignore
			}

			for (var i = 0; i < separatedArtLayer.layers.length; i++) {
				separatedArtLayer.layers[i].visible = false;
			}

			app.redraw();
			return JSON.stringify({
				success: true,
				mode: "noneVisible"
			});
		} else {
			// Toggle to Show All
			for (var i = 0; i < separatedArtLayer.layers.length; i++) {
				separatedArtLayer.layers[i].visible = true;
			}

			app.redraw();
			return JSON.stringify({
				success: true,
				mode: "allVisible"
			});
		}
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetTemplateInfo(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: true,
				hasDocument: false,
				message: "No active document"
			});
		}
		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docName = docFile.name.replace(/\.[^\.]+$/, '');
		var docPath = docFile.fsName;
		var leagueFolder;
		if (docPath.indexOf("09 SEPARATIONS") !== -1) {
			var graphicFolder = docFile.parent;
			var teamCodeFolder = graphicFolder.parent;
			var leagueSepFolder = teamCodeFolder.parent;
			var separationsFolder = leagueSepFolder.parent;
			var rootFolder = separationsFolder.parent;
			var league = leagueSepFolder.name;
			var teamOutsFolder = new Folder(rootFolder.fsName + "/01 TEAMOUTS");
			leagueFolder = new Folder(teamOutsFolder.fsName + "/" + league);
		} else {
			var aiFolder = docFile.parent;
			leagueFolder = aiFolder.parent;
		}
		var jsonData = findAndReadJSONFile(docName, leagueFolder);
		if (!jsonData) {
			return JSON.stringify({
				success: false,
				error: "JSON file not found or invalid for document: " + docName
			});
		}
		var templateInfo = {
			template: decodeURIString(findValueInJSON(jsonData, "Template") || docName),
			brand: decodeURIString(findValueInJSON(jsonData, "Brand") || ""),
			orgGrp: decodeURIString(findValueInJSON(jsonData, "ORG-GRP") || findValueInJSON(jsonData, "ORGGRP") || ""),
			conceptNumber: decodeURIString(findValueInJSON(jsonData, "Concept") || findValueInJSON(jsonData, "ConceptNumber") || ""),
			graphicName: decodeURIString(findValueInJSON(jsonData, "GraphicName") || findValueInJSON(jsonData, "Graphic Name") || ""),
			teamName: decodeURIString(findValueInJSON(jsonData, "TeamName") || findValueInJSON(jsonData, "Team Name") || ""),
			teamCode: findValueInJSON(jsonData, "TeamCode") || "",
			garmColors: decodeURIString(findValueInJSON(jsonData, "GarmColors") || findValueInJSON(jsonData, "Garm Colors") || ""),
			styles: decodeURIString(findValueInJSON(jsonData, "Styles") || "")
		};
		return JSON.stringify({
			success: true,
			hasDocument: true,
			documentPath: docPath,
			data: templateInfo
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetActiveDocumentPath(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document"
			});
		}
		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docPath = docFile.fsName;
		return JSON.stringify({
			success: true,
			documentPath: docPath
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleUpdateSepTable(params_string) {
	try {
		var params = JSON.parse(params_string);
		var separationData = params.separationData;
		if (!separationData || !separationData.length) {
			return JSON.stringify({
				success: false,
				error: "No separation data provided"
			});
		}
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}
		var doc = app.activeDocument;
		var errors = [];
		var updatedRows = 0;
		var clearedRows = 0;
		var pgInkDataLayer = findLayerByName(doc.layers, "PG Ink Data");
		if (pgInkDataLayer) {
			// Track which groups have data (by seq number)
			var groupsWithData = {};

			// Process each separation data item and update corresponding numbered group
			for (var i = 0; i < separationData.length; i++) {
				var sepData = separationData[i];
				var groupName = String(sepData.seq);
				var rowGroup = null;
				for (var j = 0; j < pgInkDataLayer.groupItems.length; j++) {
					if (pgInkDataLayer.groupItems[j].name === groupName) {
						rowGroup = pgInkDataLayer.groupItems[j];
						break;
					}
				}
				if (!rowGroup) {
					errors.push("Group '" + groupName + "' not found in PG Ink Data layer");
					continue;
				}
				try {
					updateTextFrameInGroup(rowGroup, "SEQ", String(sepData.seq));
					updateTextFrameInGroup(rowGroup, "COLOR NAME", sepData.colorName);
					updateTextFrameInGroup(rowGroup, "MESH", sepData.mesh);
					updateTextFrameInGroup(rowGroup, "MICRON", sepData.micron);
					updateTextFrameInGroup(rowGroup, "FLASH", sepData.flash ? "YES" : "NO");
					updateTextFrameInGroup(rowGroup, "COOL", sepData.cool ? "YES" : "NO");
					updateTextFrameInGroup(rowGroup, "WB", sepData.wb ? "YES" : "NO");

					// Make the group visible since it has data
					rowGroup.hidden = false;
					groupsWithData[groupName] = true;

					updatedRows++;
				} catch (e) {
					errors.push("Error updating group '" + groupName + "': " + e.message);
				}
			}

			// Reset and hide remaining groups (groups that don't have data)
			// Check all groups from 1 to 14 and hide those that weren't updated
			var maxGroupsToCheck = 14;
			for (var i = 1; i <= maxGroupsToCheck; i++) {
				var groupName = String(i);

				// Skip groups that have data
				if (groupsWithData[groupName]) {
					continue;
				}

				var rowGroup = null;
				for (var j = 0; j < pgInkDataLayer.groupItems.length; j++) {
					if (pgInkDataLayer.groupItems[j].name === groupName) {
						rowGroup = pgInkDataLayer.groupItems[j];
						break;
					}
				}
				if (!rowGroup) {
					// Group doesn't exist, continue to next
					continue;
				}
				try {
					updateTextFrameInGroup(rowGroup, "SEQ", String(i));
					updateTextFrameInGroup(rowGroup, "COLOR NAME", "COLOR");
					updateTextFrameInGroup(rowGroup, "MESH", "157");
					updateTextFrameInGroup(rowGroup, "MICRON", "XXX");
					updateTextFrameInGroup(rowGroup, "FLASH", "YES");
					updateTextFrameInGroup(rowGroup, "COOL", "YES");
					updateTextFrameInGroup(rowGroup, "WB", "NO");

					// Hide the group since it has no data
					rowGroup.hidden = true;

					clearedRows++;
				} catch (e) {
					errors.push("Error resetting group '" + groupName + "': " + e.message);
				}
			}
		} else {
			errors.push("PG Ink Data layer not found in document");
		}
		var gridLabelResult = updateGridColorLabels(doc, separationData);
		if (gridLabelResult.errors.length > 0) {
			errors = errors.concat(gridLabelResult.errors);
		}

		// ===== SAVE SEPARATION COLORS DATA TO XMP =====
		try {
			var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
			if (xmp.isXmpCreated) {
				xmp.setStructField("LEAPSeparationColorsData", separationData, true, false);
				xmp.commit();
				// Save document to persist XMP data
				try {
					doc.save();
				} catch (saveError) {
					// Could not auto-save document - XMP data committed and will be saved when document is manually saved
				}
			}
		} catch (xmpError) {
			// Continue anyway - XMP storage is not critical
		}

		return JSON.stringify({
			success: true,
			updatedRows: updatedRows,
			clearedRows: clearedRows,
			updatedLabels: gridLabelResult.updatedLabels,
			deletedLabels: gridLabelResult.deletedLabels,
			totalRows: separationData.length,
			errors: errors.length > 0 ? errors : undefined
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetGraphicSwatches(params_string) {
	try {
		var params = JSON.parse(params_string);
		var graphicName = params.graphicName;

		if (!graphicName) {
			return JSON.stringify({
				success: false,
				error: "Graphic name is required"
			});
		}

		// Check if there's an active document
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}

		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docName = docFile.name.replace(/\.[^\.]+$/, ''); // Remove extension
		var docPath = docFile.fsName;

		var rootFolder, league, teamCode, leagueFolder;
		var isSeparatedDocument = docPath.indexOf("09 SEPARATIONS") !== -1;
		var layerNames = null;

		// For separated documents, get layer names from XMP SeparatedLayerNames field
		if (isSeparatedDocument) {
			try {
				var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
				if (sepXmp.isXmpCreated && sepXmp.doesStructFieldExist("SeparatedLayerNames")) {
					layerNames = sepXmp.getStructField("SeparatedLayerNames", true);
				}
			} catch (e) {
				layerNames = null;
			}
		}

		// If SeparatedLayerNames found, use it (for separated documents)
		if (layerNames && layerNames.length > 0) {
			// Path structure for separated documents: .../09 SEPARATIONS/[LEAGUE]/[TEAM_CODE]/[GRAPHIC_NAME]/file.ai
			var graphicFolder = docFile.parent; // GRAPHIC_NAME folder (e.g., CF)
			var teamCodeFolder = graphicFolder.parent; // TEAM_CODE folder
			var leagueSepFolder = teamCodeFolder.parent; // LEAGUE folder
			var separationsFolder = leagueSepFolder.parent; // 09 SEPARATIONS folder
			rootFolder = separationsFolder.parent; // Root folder

			league = leagueSepFolder.name;
			teamCode = teamCodeFolder.name;

			// Use layer names from XMP SeparatedLayerNames
			// These are the actual layer names from SEPARATED_ART layer (swatch names like "PANTONE 189 C", "White UB", etc.)
			var swatchNames = layerNames;

			var swatches = [];

			// For each swatch name from XMP SeparatedLayerNames, fetch CMYK/RGB from document swatches
			// Example: If layer name is "PANTONE 189 C", search for that swatch in the document and get its CMYK values
			for (var i = 0; i < swatchNames.length; i++) {
				var swatchName = swatchNames[i];
				var swatchData = {
					name: swatchName,
					hex: "#808080", // Default gray
					cmyk: null,
					rgb: null
				};

				// Find swatch in document by name
				var docSwatch = null;
				try {
					docSwatch = activeDoc.swatches.getByName(swatchName);
				} catch (e) {
				}

				if (docSwatch && docSwatch.color) {
					var color = docSwatch.color;

					// Get hex color
					swatchData.hex = getColorHex(color);

					// Get CMYK values if available
					if (color.typename === "SpotColor") {
						var spotColor = color.spot.color;
						if (spotColor.typename === "CMYKColor") {
							swatchData.cmyk = {
								c: Math.round(spotColor.cyan),
								m: Math.round(spotColor.magenta),
								y: Math.round(spotColor.yellow),
								k: Math.round(spotColor.black)
							};
						}
					} else if (color.typename === "CMYKColor") {
						swatchData.cmyk = {
							c: Math.round(color.cyan),
							m: Math.round(color.magenta),
							y: Math.round(color.yellow),
							k: Math.round(color.black)
						};
					}

					// Get RGB values
					if (color.typename === "RGBColor") {
						swatchData.rgb = {
							r: Math.round(color.red),
							g: Math.round(color.green),
							b: Math.round(color.blue)
						};
					} else if (swatchData.cmyk) {
						// Convert CMYK to RGB
						var rgb = cmykToRgb(swatchData.cmyk.c, swatchData.cmyk.m, swatchData.cmyk.y, swatchData.cmyk.k);
						swatchData.rgb = rgb;
					}
				}

				swatches.push(swatchData);
			}

			// Check if "White UB" exists in document swatches and add it if not already in the list
			// Also ensure White UB has valid CMYK/RGB data even if swatch doesn't exist
			var whiteUBName = "White UB";
			var hasWhiteUB = false;
			var whiteUBIndex = -1;
			for (var j = 0; j < swatches.length; j++) {
				if (swatches[j].name === whiteUBName ||
					swatches[j].name.toLowerCase() === whiteUBName.toLowerCase()) {
					hasWhiteUB = true;
					whiteUBIndex = j;
					break;
				}
			}

			// If White UB exists but doesn't have CMYK/RGB data, add default values
			if (hasWhiteUB && whiteUBIndex >= 0) {
				var existingWhiteUB = swatches[whiteUBIndex];
				if ((existingWhiteUB.cmyk === null || existingWhiteUB.rgb === null) &&
					!(existingWhiteUB.cmyk && existingWhiteUB.rgb)) {
					// White UB exists but missing color data, add defaults
					existingWhiteUB.hex = existingWhiteUB.hex || "#FFFFFF";
					existingWhiteUB.cmyk = existingWhiteUB.cmyk || { c: 0, m: 0, y: 0, k: 0 };
					existingWhiteUB.rgb = existingWhiteUB.rgb || { r: 255, g: 255, b: 255 };
				}
			}

			if (!hasWhiteUB) {
				try {
					var whiteUBSwatch = activeDoc.swatches.getByName(whiteUBName);
					if (whiteUBSwatch && whiteUBSwatch.color) {
						var whiteUBColor = whiteUBSwatch.color;
						var whiteUBData = {
							name: whiteUBName,
							hex: "#808080", // Default gray
							cmyk: null,
							rgb: null
						};

						// Get hex color
						whiteUBData.hex = getColorHex(whiteUBColor);

						// Get CMYK values if available
						if (whiteUBColor.typename === "SpotColor") {
							var spotColor = whiteUBColor.spot.color;
							if (spotColor.typename === "CMYKColor") {
								whiteUBData.cmyk = {
									c: Math.round(spotColor.cyan),
									m: Math.round(spotColor.magenta),
									y: Math.round(spotColor.yellow),
									k: Math.round(spotColor.black)
								};
							}
						} else if (whiteUBColor.typename === "CMYKColor") {
							whiteUBData.cmyk = {
								c: Math.round(whiteUBColor.cyan),
								m: Math.round(whiteUBColor.magenta),
								y: Math.round(whiteUBColor.yellow),
								k: Math.round(whiteUBColor.black)
							};
						}

						// Get RGB values
						if (whiteUBColor.typename === "RGBColor") {
							whiteUBData.rgb = {
								r: Math.round(whiteUBColor.red),
								g: Math.round(whiteUBColor.green),
								b: Math.round(whiteUBColor.blue)
							};
						} else if (whiteUBData.cmyk) {
							// Convert CMYK to RGB
							var rgb = cmykToRgb(whiteUBData.cmyk.c, whiteUBData.cmyk.m, whiteUBData.cmyk.y, whiteUBData.cmyk.k);
							whiteUBData.rgb = rgb;
						}

						swatches.push(whiteUBData);
					} else {
						// White UB swatch not found in document, but add it anyway with default values
						// This ensures White UB appears in the list even if swatch doesn't exist
						var whiteUBData = {
							name: whiteUBName,
							hex: "#FFFFFF", // White color
							cmyk: { c: 0, m: 0, y: 0, k: 0 }, // Default white CMYK
							rgb: { r: 255, g: 255, b: 255 } // Default white RGB
						};
						swatches.push(whiteUBData);
					}
				} catch (e) {
					// White UB swatch not found in document, but add it anyway with default values
					// This ensures White UB appears in the list even if swatch doesn't exist
					var whiteUBData = {
						name: whiteUBName,
						hex: "#FFFFFF", // White color
						cmyk: { c: 0, m: 0, y: 0, k: 0 }, // Default white CMYK
						rgb: { r: 255, g: 255, b: 255 } // Default white RGB
					};
					swatches.push(whiteUBData);
				}
			}

			return JSON.stringify({
				success: true,
				swatches: swatches
			});
		}

		// Fallback to Graphics JSON file approach for non-separated documents or if SeparatedLayerNames not found
		if (docPath.indexOf("09 SEPARATIONS") !== -1) {
			var graphicFolder = docFile.parent;
			var teamCodeFolder = graphicFolder.parent;
			var leagueSepFolder = teamCodeFolder.parent;
			var separationsFolder = leagueSepFolder.parent;
			rootFolder = separationsFolder.parent;
			league = leagueSepFolder.name;
			teamCode = teamCodeFolder.name;
		} else {
			var aiFolder = docFile.parent;
			leagueFolder = aiFolder.parent;
			var teamOutsFolder = leagueFolder.parent;
			rootFolder = teamOutsFolder.parent;
			var jsonData = findAndReadJSONFile(docName, leagueFolder);
			if (!jsonData) {
				return JSON.stringify({
					success: false,
					error: "JSON file not found or invalid for document: " + docName
				});
			}
			league = findValueInJSON(jsonData, "League");
			teamCode = findValueInJSON(jsonData, "TeamCode");
			if (!league || !teamCode) {
				return JSON.stringify({
					success: false,
					error: "League or TeamCode not found in JSON file"
				});
			}
		}
		var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
		var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
		var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + graphicName.toUpperCase());
		var jsonFolder = new Folder(graphicTypeFolder.fsName + "/JSON");
		if (!jsonFolder.exists) {
			return JSON.stringify({
				success: false,
				error: "JSON folder not found: " + jsonFolder.fsName
			});
		}
		var jsonFiles = jsonFolder.getFiles("*.json");
		var graphicJsonFile = null;
		for (var i = 0; i < jsonFiles.length; i++) {
			var fileName = jsonFiles[i].name;
			if (fileName.indexOf("GRAPHICS") !== -1 && fileName.indexOf(graphicName.toUpperCase()) !== -1) {
				graphicJsonFile = jsonFiles[i];
				break;
			}
		}
		if (!graphicJsonFile) {
			return JSON.stringify({
				success: false,
				error: "Graphics JSON file not found for: " + graphicName
			});
		}
		graphicJsonFile.open('r');
		var jsonContent = graphicJsonFile.read();
		graphicJsonFile.close();
		var graphicJsonData = JSON.parse(jsonContent);
		var decorationColors = graphicJsonData.Decoration_colors || [];
		var swatches = [];
		for (var i = 0; i < decorationColors.length; i++) {
			var swatchName = decorationColors[i].colorName;
			var swatchData = {
				name: swatchName,
				hex: "#808080",
				cmyk: null,
				rgb: null
			};
			var docSwatch = null;
			try {
				docSwatch = activeDoc.swatches.getByName(swatchName);
			} catch (e) {
			}
			if (docSwatch && docSwatch.color) {
				var color = docSwatch.color;
				swatchData.hex = getColorHex(color);
				if (color.typename === "SpotColor") {
					var spotColor = color.spot.color;
					if (spotColor.typename === "CMYKColor") {
						swatchData.cmyk = {
							c: Math.round(spotColor.cyan),
							m: Math.round(spotColor.magenta),
							y: Math.round(spotColor.yellow),
							k: Math.round(spotColor.black)
						};
					}
				} else if (color.typename === "CMYKColor") {
					swatchData.cmyk = {
						c: Math.round(color.cyan),
						m: Math.round(color.magenta),
						y: Math.round(color.yellow),
						k: Math.round(color.black)
					};
				}
				if (color.typename === "RGBColor") {
					swatchData.rgb = {
						r: Math.round(color.red),
						g: Math.round(color.green),
						b: Math.round(color.blue)
					};
				} else if (swatchData.cmyk) {
					var rgb = cmykToRgb(swatchData.cmyk.c, swatchData.cmyk.m, swatchData.cmyk.y, swatchData.cmyk.k);
					swatchData.rgb = rgb;
				}
			}
			swatches.push(swatchData);
		}
		return JSON.stringify({
			success: true,
			swatches: swatches
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleCheckSeparatedDocument(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: true,
				data: {
					hasDocument: false,
					isSeparatedDoc: false
				}
			});
		}

		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docPath = docFile.fsName;

		var _dataFromXMP = {
			hasDocument: true,
			isSeparatedDoc: false,
			profileMetaData: null,
			separatedLayerNames: [],
			docName: docFile.name,
			docPath: docPath
		};

		try {
			var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
			if (xmp.isXmpCreated && xmp.doesStructFieldExist("DocumentType")) {
				var documentType = xmp.getStructField("DocumentType");
				if (documentType && documentType.toString().trim() === "Separation Document") {
					_dataFromXMP.isSeparatedDoc = true;

					// Get profile metadata from XMP
					var _profileMetaData = xmp.getStructField("SeparationProfileMetadata", true);
					if (_profileMetaData) {
						_dataFromXMP.profileMetaData = _profileMetaData;
					}

					// Get SeparatedLayerNames from XMP
					var _separatedLayerNames = xmp.getStructField("SeparatedLayerNames", true);
					if (_separatedLayerNames) {
						_dataFromXMP.separatedLayerNames = _separatedLayerNames;
					}

					// Get LEAPSeparationColorsData from XMP
					var _leapSeparationColorsData = xmp.getStructField("LEAPSeparationColorsData", true);
					if (_leapSeparationColorsData) {
						_dataFromXMP.leapSeparationColorsData = _leapSeparationColorsData;
					}

					// get BodyColor from XMP
					var _bodyColor = xmp.getStructField("BodyColor", true);
					if (_bodyColor) {
						_dataFromXMP.bodyColor = _bodyColor;
					}
				}
			}
		} catch (xmpError) {
			// Error reading DocumentType from XMP - fall back to path check
			if (docPath.indexOf("09 SEPARATIONS") !== -1) {
				_dataFromXMP.isSeparatedDoc = true;
				var graphicFolder = docFile.parent;
				_dataFromXMP.graphicName = graphicFolder.name;
			}
		}

		return JSON.stringify({
			success: true,
			data: _dataFromXMP
		});

	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function getProfilesJsonPath() {
	try {
		var serverBasePath = getServerBasePath();
		if (!serverBasePath) {
			return null;
		}
		var normalizedBasePath = serverBasePath.replace(/\/$/, "");
		var profilesPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Profiles.json";
		return profilesPath;
	} catch (error) {
		return null;
	}
}
function handleGetSeparationProfiles() {
	try {
		var profilesPath = getProfilesJsonPath();
		if (!profilesPath) {
			return JSON.stringify({
				success: false,
				error: "Could not determine profiles file path"
			});
		}
		var profilesFile = new File(profilesPath);
		if (!profilesFile.exists) {
			return JSON.stringify({
				success: true,
				profiles: []
			});
		}
		if (!profilesFile.open("r")) {
			return JSON.stringify({
				success: false,
				error: "Failed to open profiles file"
			});
		}
		var content = profilesFile.read();
		profilesFile.close();
		if (!content || !content.length) {
			return JSON.stringify({
				success: true,
				profiles: []
			});
		}
		var parsed;
		if (typeof JSON !== "undefined" && JSON.parse) {
			parsed = JSON.parse(content);
		} else {
			parsed = eval("(" + content + ")");
		}
		if (!parsed || !(parsed instanceof Array)) {
			return JSON.stringify({
				success: false,
				error: "Profiles file does not contain an array"
			});
		}
		return JSON.stringify({
			success: true,
			profiles: parsed
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleSaveSeparationProfiles(params_string) {
	try {
		var params = JSON.parse(params_string);
		var profiles = params && params.profiles ? params.profiles : null;
		if (!profiles || !(profiles instanceof Array)) {
			return JSON.stringify({
				success: false,
				error: "No profiles data provided or invalid format"
			});
		}
		var profilesPath = getProfilesJsonPath();
		if (!profilesPath) {
			return JSON.stringify({
				success: false,
				error: "Could not determine profiles file path"
			});
		}
		var profilesFile = new File(profilesPath);
		var profilesFolder = profilesFile.parent;
		if (!profilesFolder.exists) {
			profilesFolder.create();
		}
		if (!profilesFile.open("w")) {
			return JSON.stringify({
				success: false,
				error: "Failed to open profiles file for writing"
			});
		}
		var jsonString = JSON.stringify(profiles, null, 2);
		profilesFile.write(jsonString);
		profilesFile.close();
		return JSON.stringify({
			success: true,
			message: "Profiles saved successfully"
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleSaveGraphicsData(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document"
			});
		}

		var params = JSON.parse(params_string);
		var graphicsData = params && params.graphicsData ? params.graphicsData : null;

		if (!graphicsData || !(graphicsData instanceof Array)) {
			return JSON.stringify({
				success: false,
				error: "No graphics data provided or invalid format"
			});
		}

		var activeDoc = app.activeDocument;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

		if (!xmp.isXmpCreated) {
			return JSON.stringify({
				success: false,
				error: "Failed to initialize XMP"
			});
		}

		// Save graphics data to XMP with batch commit (autoCommit = false)
		// This avoids expensive serialization on every write
		xmp.setStructField("GraphicsOrganizationData", graphicsData, true, false);

		// Commit all changes at once (much faster than committing on every setStructField)
		xmp.commit();

		// Save the document to persist XMP data to disk
		// This ensures the data is saved when the document is reopened
		// Only save if document has been saved before (has a file path)
		if (activeDoc.fullName && activeDoc.fullName.fsName) {
			try {
				activeDoc.save();
			} catch (saveError) {
				// If save fails, XMP data is still committed and will be saved when user manually saves
			}
		}

		return JSON.stringify({
			success: true,
			message: "Graphics data saved successfully",
			saved: graphicsData.length
		});

	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleLoadGraphicsData(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: true,
				graphicsData: []
			});
		}

		var activeDoc = app.activeDocument;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

		if (!xmp.isXmpCreated) {
			return JSON.stringify({
				success: true,
				graphicsData: []
			});
		}

		var graphicsData = [];
		if (xmp.doesStructFieldExist("GraphicsOrganizationData")) {
			graphicsData = xmp.getStructField("GraphicsOrganizationData", true);
			if (!graphicsData || !(graphicsData instanceof Array)) {
				graphicsData = [];
			}
		}

		return JSON.stringify({
			success: true,
			graphicsData: graphicsData
		});

	} catch (e) {
		return JSON.stringify({
			success: true,
			graphicsData: []
		});
	}
}
function getProfilesJsonPath() {
	try {
		var serverBasePath = getServerBasePath();
		if (!serverBasePath) {
			return null;
		}
		var normalizedBasePath = serverBasePath.replace(/\/$/, "");
		var profilesPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Profiles.json";
		return profilesPath;
	} catch (error) {
		return null;
	}
}
function getProfileCodeFromName(profileName) {
	try {
		if (!profileName) {
			return null;
		}
		var profilesPath = getProfilesJsonPath();
		if (!profilesPath) {
			return null;
		}
		var profilesFile = new File(profilesPath);
		if (!profilesFile.exists) {
			return null;
		}
		if (!profilesFile.open("r")) {
			return null;
		}
		var content = profilesFile.read();
		profilesFile.close();
		if (!content || !content.length) {
			return null;
		}
		var parsed;
		if (typeof JSON !== "undefined" && JSON.parse) {
			parsed = JSON.parse(content);
		} else {
			parsed = eval("(" + content + ")");
		}
		if (!parsed || !(parsed instanceof Array)) {
			return null;
		}
		var searchName = profileName.toString().trim().toLowerCase();
		for (var i = 0; i < parsed.length; i++) {
			var profile = parsed[i];
			var profileNameInFile = profile['Profile Name'] || profile.profileName || '';
			var normalizedNameInFile = profileNameInFile.toString().trim().toLowerCase();
			if (normalizedNameInFile === searchName) {
				var profileCode = profile['Profile Code'] || profile.code || '';
				if (profileCode) {
					return profileCode.toString().trim();
				}
			}
			if (normalizedNameInFile && searchName &&
				(normalizedNameInFile.indexOf(searchName) !== -1 || searchName.indexOf(normalizedNameInFile) !== -1)) {
				var profileCode = profile['Profile Code'] || profile.code || '';
				if (profileCode) {
					return profileCode.toString().trim();
				}
			}
		}
		return null;
	} catch (e) {
		return null;
	}
}
function handleCheckGraphicFolderExists(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document"
			});
		}
		var params = JSON.parse(params_string);
		var graphicName = params.graphicName;
		if (graphicName !== null && graphicName !== undefined) {
			graphicName = String(graphicName);
		}
		if (!graphicName || graphicName.trim() === "") {
			return JSON.stringify({
				success: false,
				error: "Graphic name is required"
			});
		}
		graphicName = graphicName.trim();
		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docPath = docFile.fsName;
		var rootFolder;
		var league;
		if (docPath.indexOf("09 SEPARATIONS") !== -1) {
			var graphicFolder = docFile.parent;
			var teamCodeFolder = graphicFolder.parent;
			var leagueSepFolder = teamCodeFolder.parent;
			var separationsFolder = leagueSepFolder.parent;
			rootFolder = separationsFolder.parent;
			league = leagueSepFolder.name;
		} else {
			var aiFolder = docFile.parent;
			var leagueFolder = aiFolder.parent;
			league = leagueFolder.name;
			var teamOutsFolder = leagueFolder.parent;
			rootFolder = teamOutsFolder.parent;
		}
		if (!rootFolder || !league) {
			return JSON.stringify({
				success: false,
				error: "Could not determine root folder or league"
			});
		}
		var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
		if (!graphicsFolder.exists) {
			return JSON.stringify({
				success: true,
				folderExists: false
			});
		}
		var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
		if (!leagueGraphicsFolder.exists) {
			return JSON.stringify({
				success: true,
				folderExists: false
			});
		}
		var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + graphicName);
		var folderExists = graphicTypeFolder.exists;
		if (!folderExists) {
			var allFolders = leagueGraphicsFolder.getFiles();
			for (var i = 0; i < allFolders.length; i++) {
				if (allFolders[i] instanceof Folder) {
					if (allFolders[i].name.toLowerCase() === graphicName.toLowerCase()) {
						folderExists = true;
						break;
					}
				}
			}
		}
		return JSON.stringify({
			success: true,
			folderExists: folderExists
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetProfileCodeFromName(params_string) {
	try {
		var params = JSON.parse(params_string);
		var profileName = params.profileName;
		if (!profileName) {
			return JSON.stringify({
				success: false,
				error: "Profile name is required"
			});
		}
		var profileCode = getProfileCodeFromName(profileName);
		return JSON.stringify({
			success: true,
			profileCode: profileCode
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleRemoveSeparationData(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document"
			});
		}

		var activeDoc = app.activeDocument;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

		if (!xmp.isXmpCreated) {
			return JSON.stringify({
				success: false,
				error: "Failed to initialize XMP"
			});
		}

		var removedFields = [];

		if (xmp.doesStructFieldExist("GraphicsOrganizationData")) {
			xmp.deleteStructField("GraphicsOrganizationData", false);
			removedFields.push("GraphicsOrganizationData");
		}

		if (xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
			xmp.deleteStructField("LEAPSeparationProfileData", false);
			removedFields.push("LEAPSeparationProfileData");
		}

		if (removedFields.length > 0) {
			xmp.commit();

			if (activeDoc.fullName && activeDoc.fullName.fsName) {
				try {
					activeDoc.save();
				} catch (saveError) {
				}
			}

			return JSON.stringify({
				success: true,
				message: "Separation data removed successfully",
				removedFields: removedFields
			});
		} else {
			return JSON.stringify({
				success: true,
				message: "No separation data found to remove",
				removedFields: []
			});
		}

	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleLoadSeparationPaths(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: true,
				separationPaths: {}
			});
		}
		var versionDoc = null;
		var activeDoc = app.activeDocument;
		if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
			var activeDocPath = activeDoc.fullName.fsName;
			var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
			var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
			if (isVersionDoc) {
				versionDoc = activeDoc;
			}
		}
		if (!versionDoc) {
			for (var d = 0; d < app.documents.length; d++) {
				var doc = app.documents[d];
				if (doc && doc.fullName && doc.fullName.fsName) {
					var docPath = doc.fullName.fsName;
					var isSeparatedDoc = docPath.indexOf("09 SEPARATIONS") !== -1;
					var isVersionDoc = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
					if (isVersionDoc) {
						versionDoc = doc;
						break;
					}
				}
			}
		}
		if (!versionDoc) {
			return JSON.stringify({
				success: false,
				separationPaths: {},
				error: "No version document found"
			});
		}
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
		if (!xmp.isXmpCreated) {
			return JSON.stringify({
				success: false,
				separationPaths: {},
				error: "XMP not created"
			});
		}
		var loadPathsDebug = [];
		loadPathsDebug.push("Version doc path: " + (versionDoc && versionDoc.fullName ? versionDoc.fullName.fsName : "null"));
		loadPathsDebug.push("XMP created: " + xmp.isXmpCreated);
		var separationPaths = {};
		var fieldExists = xmp.doesStructFieldExist("LEAPSeparationProfileData");
		loadPathsDebug.push("LEAPSeparationProfileData field exists: " + fieldExists);
		if (fieldExists) {
			try {
				var separations = xmp.getStructField("LEAPSeparationProfileData", true);
				loadPathsDebug.push("Separations data type: " + typeof separations);
				loadPathsDebug.push("Is array: " + Array.isArray(separations));
				if (separations) {
					loadPathsDebug.push("Separations length: " + (Array.isArray(separations) ? separations.length : "not array"));
				}
				if (Array.isArray(separations)) {
					for (var i = 0; i < separations.length; i++) {
						var separation = separations[i];
						loadPathsDebug.push("Separation " + i + ": " + JSON.stringify(separation));
						var profileName = null;
						if (separation && separation.profileMetadata && separation.profileMetadata.profileName) {
							profileName = separation.profileMetadata.profileName;
						}
						loadPathsDebug.push("Profile name: " + profileName);
						if (separation && separation.graphicName && separation.separatedDocumentPath) {
							var key = separation.graphicName;
							if (profileName) {
								key = separation.graphicName + "_" + profileName;
							}
							loadPathsDebug.push("Adding path with key: " + key + ", path: " + separation.separatedDocumentPath);
							separationPaths[key] = separation.separatedDocumentPath;
						} else {
							loadPathsDebug.push("Separation missing required fields - graphicName: " + (separation ? separation.graphicName : "null") + ", separatedDocumentPath: " + (separation ? separation.separatedDocumentPath : "null"));
						}
					}
					loadPathsDebug.push("Total paths loaded: " + Object.keys(separationPaths).length);
				} else {
					loadPathsDebug.push("Separations is not an array or is null/undefined");
				}
			} catch (e) {
				loadPathsDebug.push("Error processing separations: " + e.message);
				separationPaths = {};
			}
		} else {
			loadPathsDebug.push("LEAPSeparationProfileData field does not exist in XMP");
		}
		var debugInfo = {
			versionDocFound: versionDoc ? true : false,
			versionDocPath: versionDoc && versionDoc.fullName ? versionDoc.fullName.fsName : null,
			xmpCreated: xmp.isXmpCreated,
			fieldExists: xmp.doesStructFieldExist("LEAPSeparationProfileData"),
			pathsCount: Object.keys(separationPaths).length,
			pathsKeys: Object.keys(separationPaths),
			loadPathsDebug: loadPathsDebug
		};
		try {
			return JSON.stringify({
				success: true,
				separationPaths: separationPaths,
				debug: debugInfo
			});
		} catch (jsonError) {
			return JSON.stringify({
				success: false,
				separationPaths: {},
				error: "Failed to serialize response: " + jsonError.message
			});
		}
	} catch (e) {
		return JSON.stringify({
			success: false,
			separationPaths: {},
			error: e.message || e.toString()
		});
	}
}
function handleOpenSeparationDocument(params_string) {
	try {
		var params = JSON.parse(params_string);
		var filePath = params.filePath;
		if (!filePath) {
			return JSON.stringify({
				success: false,
				error: "File path is required"
			});
		}
		var sepFile = new File(filePath);
		if (!sepFile.exists) {
			return JSON.stringify({
				success: false,
				error: "Separation document not found: " + filePath
			});
		}
		app.open(sepFile);
		return JSON.stringify({
			success: true,
			message: "Separation document opened successfully"
		});
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleGetBodyColor(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document"
			});
		}
		var activeDoc = app.activeDocument;
		var docFile = new File(activeDoc.fullName);
		var docName = docFile.name.replace(/\.[^\.]+$/, '');
		var docPath = docFile.fsName;
		try {
			var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
			if (xmp.isXmpCreated && xmp.doesStructFieldExist("BodyColor")) {
				try {
					var bodyColorData = xmp.getStructField("BodyColor", true);
					if (bodyColorData && bodyColorData.bodyColor) {
						return JSON.stringify({
							success: true,
							bodyColor: bodyColorData.bodyColor,
							colorName: bodyColorData.colorName || "Body",
							cmyk: bodyColorData.cmyk || null,
							rgb: bodyColorData.rgb || null,
							source: "XMP"
						});
					}
				} catch (xmpError) {
				}
			}
		} catch (xmpCheckError) {
		}
		var leagueFolder;
		if (docPath.indexOf("09 SEPARATIONS") !== -1) {
			var graphicFolder = docFile.parent;
			var teamCodeFolder = graphicFolder.parent;
			var leagueSepFolder = teamCodeFolder.parent;
			var separationsFolder = leagueSepFolder.parent;
			var rootFolder = separationsFolder.parent;
			var league = leagueSepFolder.name;
			var teamOutsFolder = new Folder(rootFolder.fsName + "/01 TEAMOUTS");
			leagueFolder = new Folder(teamOutsFolder.fsName + "/" + league);
		} else {
			var aiFolder = docFile.parent;
			leagueFolder = aiFolder.parent;
		}
		var jsonData = findAndReadJSONFile(docName, leagueFolder);
		if (!jsonData) {
			return JSON.stringify({
				success: false,
				error: "JSON file not found or invalid for document: " + docName
			});
		}
		var colorsInfo = jsonData.colors_info || [];
		var bodyColorInfo = null;
		for (var i = 0; i < colorsInfo.length; i++) {
			if (colorsInfo[i].name && colorsInfo[i].name.toLowerCase() === "body") {
				bodyColorInfo = colorsInfo[i];
				break;
			}
		}
		if (!bodyColorInfo || !bodyColorInfo.colorInfo) {
			return JSON.stringify({
				success: true,
				bodyColor: "#ec008c",
				colorName: "Body (Default)",
				cmyk: null,
				rgb: { r: 236, g: 0, b: 140 },
				source: "DEFAULT"
			});
		}
		var cmyk = bodyColorInfo.colorInfo;
		var c = cmyk.C || 0;
		var m = cmyk.M || 0;
		var y = cmyk.Y || 0;
		var k = cmyk.K || 0;
		var rgb = cmykToRgb(c, m, y, k);
		var hexColor = rgbToHex(rgb.r, rgb.g, rgb.b);
		var result = {
			success: true,
			bodyColor: hexColor,
			colorName: bodyColorInfo.ColorName || bodyColorInfo.name || "Body",
			cmyk: {
				c: c,
				m: m,
				y: y,
				k: k
			},
			rgb: rgb,
			source: "JSON"
		};
		return JSON.stringify(result);
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: e.message || e.toString()
		});
	}
}
function handleSwitchToVersionDocument(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No documents open"
			});
		}
		var versionDoc = null;
		var activeDoc = app.activeDocument;
		if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
			var activeDocPath = activeDoc.fullName.fsName;
			var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
			var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
			if (isVersionDoc) {
				return JSON.stringify({
					success: true,
					message: "Already on version document",
					switched: false
				});
			}
		}
		for (var d = 0; d < app.documents.length; d++) {
			var doc = app.documents[d];
			if (doc && doc.fullName && doc.fullName.fsName) {
				var docPath = doc.fullName.fsName;
				var isSeparatedDoc = docPath.indexOf("09 SEPARATIONS") !== -1;
				var isVersionDoc = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
				if (isVersionDoc) {
					versionDoc = doc;
					break;
				}
			}
		}
		if (versionDoc) {
			try {
				app.activeDocument = versionDoc;
				return JSON.stringify({
					success: true,
					message: "Switched to version document",
					switched: true
				});
			} catch (e) {
				return JSON.stringify({
					success: false,
					error: "Error switching to version document: " + e.message
				});
			}
		} else {
			return JSON.stringify({
				success: false,
				error: "No version document found in open documents"
			});
		}
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: "Error switching to version document: " + e.message
		});
	}
}

function handleExportPrintGuidePDF(params_string) {
	try {
		if (!app.documents.length) {
			return JSON.stringify({
				success: false,
				error: "No active document found"
			});
		}

		var doc = app.activeDocument;
		var docFile = new File(doc.fullName);
		var docFolder = docFile.parent;
		var docName = docFile.name.replace(/\.[^\.]+$/, ''); // Remove extension

		// Find the artboard named "PG"
		var pgArtboard = null;
		var pgArtboardIndex = -1;

		for (var i = 0; i < doc.artboards.length; i++) {
			if (doc.artboards[i].name === "PG") {
				pgArtboard = doc.artboards[i];
				pgArtboardIndex = i;
				break;
			}
		}

		if (!pgArtboard || pgArtboardIndex === -1) {
			return JSON.stringify({
				success: false,
				error: "Artboard named 'PG' not found in document"
			});
		}

		var destFile = new File(docFolder.fsName + "/" + docName + "_PrintGuide.pdf");
		var pdfOptions = new PDFSaveOptions();
		pdfOptions.artboardRange = (pgArtboardIndex + 1).toString(); // 1-based index as string
		pdfOptions.compatibility = PDFCompatibility.ACROBAT5;
		pdfOptions.generateThumbnails = true;
		pdfOptions.preserveEditability = false;
		doc.saveAs(destFile, pdfOptions, pgArtboardIndex);

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
			error: "Error exporting Print Guide PDF: " + e.message
		});
	}
}
