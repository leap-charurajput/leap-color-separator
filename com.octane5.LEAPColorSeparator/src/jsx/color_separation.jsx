

#include "./utilities.jsx"


function splitColors(_graphicName) {
	try {
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


function generateUnderbase(_graphicName) {
	try {
		
		var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);

		
		var _sizedArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
		var _sizedGraphicLayer = _sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
		var _graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);

		
		var whiteUBLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.WHITE_UB, _separatedArtLayer);

		
		var copiedItems = [];
		duplicateItemToLayer(_graphicItem, whiteUBLayer, copiedItems);

		app.selection = null;
		app.activeDocument.activeLayer = whiteUBLayer;
		app.activeDocument.activeLayer.hasSelectedArtwork = true;
		app.redraw();

		
		
		
		
		

		
		applySwatchToFill(app.activeDocument, CONSTANTS.SWATCH_NAMES.WHITE_UB);
		app.executeMenuCommand('sendToBack')
		pathFinderAdd();
		app.executeMenuCommand('group')

		
		generateChoke(whiteUBLayer, _separatedArtLayer);
		app.activeDocument.selection = null;
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: "Underbase generation failed: " + (e.message || e.toString())
		});
	}
}


function generateChoke(whiteUBLayer, separatedArtLayer) {
	
	var chokeLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.CHOKE, separatedArtLayer);

	
	app.activeDocument.activeLayer = whiteUBLayer;
	app.activeDocument.activeLayer.hasSelectedArtwork = true;
	app.selection[0].duplicate(chokeLayer, ElementPlacement.PLACEATBEGINNING);

	app.selection = null;
	app.activeDocument.activeLayer = chokeLayer;
	app.activeDocument.activeLayer.hasSelectedArtwork = true;

	
	var noneSwatch = getSwatchByName(app.activeDocument, CONSTANTS.SWATCH_NAMES.NONE);
	if (noneSwatch) {
		app.activeDocument.defaultFilled = true;
		app.activeDocument.defaultFillColor = noneSwatch.color;
		app.redraw();
	}

	
	applyStroke(app.activeDocument, CONSTANTS.SWATCH_NAMES.GARMENT_EXAMPLE, CONSTANTS.STYLES.CHOKE_STROKE_WIDTH);
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
