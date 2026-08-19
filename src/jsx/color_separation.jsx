

#include "./utilities.jsx"

function splitColors(_graphicName, cleanupOpts) {
	/*
	 * Step trace. Returned to the panel as a single STRING (not an array) so it survives the panel
	 * logger, which truncates arrays to "[N items]" — and so it reaches leap_seps.log even on machines
	 * where the JSX-side file write never lands (a failing run there produced zero [JSX] lines).
	 */
	var _steps = [];
	function _step(msg) {
		_steps.push(msg);
		appendLeapSepLog("splitColors: " + msg);
	}
	function _selCount() {
		try {
			return app.selection && app.selection.length != null ? app.selection.length : -1;
		} catch (eSel) {
			return -1;
		}
	}
	function _stepsText() {
		return _steps.join(" | ");
	}

	try {
		var runLeftover = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
		_step("start graphic=\"" + _graphicName + "\" doc=\"" + (app.documents.length ? app.activeDocument.name : "(none)") + "\"");

		var _sizedArtLayer = app.activeDocument.layers.getByName("SIZED_ART");
		var _sizedGraphicLayer = _sizedArtLayer.layers.getByName("SIZED_GRAPHICS");
		_step("SIZED_GRAPHICS items=" + (_sizedGraphicLayer.pageItems ? _sizedGraphicLayer.pageItems.length : -1));

		var _graphicItem = null;
		try {
			_graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);
		} catch (nameErr) {
			if (_sizedGraphicLayer.pageItems && _sizedGraphicLayer.pageItems.length > 0) {
				_graphicItem = _sizedGraphicLayer.pageItems[0];
				_step("graphic \"" + _graphicName + "\" not found; using first item \"" + _graphicItem.name + "\"");
			}
		}
		if (!_graphicItem) {
			throw new Error(
				"Graphic \"" + _graphicName + "\" not found in SIZED_GRAPHICS (place graphic AI first)"
			);
		}
		_step("item=\"" + _graphicItem.name + "\" type=" + _graphicItem.typename);

		prepareSizedArtGraphicForProcessing(app.activeDocument, _graphicItem);
		_graphicItem.selected = true;
		app.redraw();
		app.executeMenuCommand('copy');
		app.executeMenuCommand('pasteInPlace');
		app.redraw();
		_step("after copy+pasteInPlace sel=" + _selCount());
		if (app.selection && app.selection.length > 0) {
			for (var selIdx = 0; selIdx < app.selection.length; selIdx++) {
				unlockPageItemTreeForProcessing(app.selection[selIdx]);
			}
		}
		expandObject();
		_step("after expand sel=" + _selCount());
		app.executeMenuCommand('group');
		_step("after group sel=" + _selCount());
		/* Remember the grouped art: Divide is what loses the selection on some machines, and this
			 reference is the only way back to the same art afterwards. */
		var _groupItem = null;
		var _groupParent = null;
		try {
			_groupItem = app.selection && app.selection.length > 0 ? app.selection[0] : null;
			_groupParent = _groupItem ? _groupItem.parent : null;
		} catch (eGroupRef) { }

		/*
		 * Pathfinder Divide runs the "LEAP Color Seps" ACTION SET. If that set is not installed on the
		 * machine, doScript throws — previously the failure only showed up later as a bare
		 * "undefined is not an object" when the empty selection was dereferenced.
		 */
		try {
			pathFinderDivide();
		} catch (divideErr) {
			throw new Error(
				"Pathfinder Divide action failed (is the \"LEAP Color Seps\" action set installed?): " +
				(divideErr.message || divideErr)
			);
		}
		_step("after divide sel=" + _selCount());

		var _processItem = app.selection && app.selection.length > 0 ? app.selection[0] : null;

		/*
		 * Recovery: an empty selection after Divide used to be fatal one line later, inside
		 * collectItemsByColor (undefined.typename -> "undefined is not an object") — and only AFTER
		 * SEPARATED_ART had been created, which is exactly the half-made document users reported. The
		 * art is still on the page; only the selection was lost, so fall back to the group captured
		 * before Divide. Guarded: a stale reference throws on first property access and we report it.
		 */
		if (!_processItem && _groupItem) {
			try {
				var _probeType = _groupItem.typename;
				var _groupChildren = -1;
				try { _groupChildren = _groupItem.pageItems ? _groupItem.pageItems.length : -1; } catch (eKids) { }
				/*
				 * On the machine that surfaced this, BOTH the action and the menu command divide leave
				 * app.selection empty (trace: "after divide sel=0 … fallback sel=0"), so selection cannot
				 * be trusted at all here. If the pre-divide group is a live object with children, re-divide
				 * it via the menu; either way, re-acquire the RESULT from document structure below.
				 */
				if (_groupChildren > 0) {
					app.selection = null;
					_groupItem.selected = true;
					app.redraw();
					app.executeMenuCommand('Live Pathfinder Divide');
					app.executeMenuCommand('expandStyle');
					app.redraw();
					_processItem = app.selection && app.selection.length > 0 ? app.selection[0] : null;
				}
				_step("action divide lost selection; group (" + _probeType + ", children=" + _groupChildren + ") menu fallback sel=" + _selCount());
			} catch (eStale) {
				_step("selection empty after divide; pre-divide group unusable: " + (eStale.message || eStale));
			}

			/*
			 * Selection-free re-acquire: pasteInPlace put our copy at the TOP of its container, and both
			 * Divide paths replace the object IN PLACE — so the divided result is the container's topmost
			 * page item, selected or not. This is the branch that actually recovers on machines where
			 * every pathfinder operation deselects.
			 */
			if (!_processItem && _groupParent) {
				try {
					if (_groupParent.pageItems && _groupParent.pageItems.length > 0) {
						var _topmost = _groupParent.pageItems[0];
						var _topChildren = -1;
						try { _topChildren = _topmost.pageItems ? _topmost.pageItems.length : -1; } catch (eTopKids) { }
						_step("re-acquired topmost of parent: " + _topmost.typename + " children=" + _topChildren);
						_processItem = _topmost;
					} else {
						_step("parent has no page items — divided art not found in container");
					}
				} catch (eParent) {
					_step("could not re-acquire from parent: " + (eParent.message || eParent));
				}
			}
		}

		if (!_processItem) {
			throw new Error(
				"Pathfinder Divide left nothing selected for \"" + _graphicName +
				"\" — the art may be empty, locked, or the \"LEAP Color Seps\" action set is missing."
			);
		}
		_step("processItem type=" + _processItem.typename);
		app.selection = null;


		var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);
		_step("SEPARATED_ART ready");


		var colorGroups = {};
		collectItemsByColor(_processItem, colorGroups);
		var _groupNames = [];
		for (var _cg in colorGroups) {
			if (colorGroups.hasOwnProperty(_cg)) { _groupNames.push(_cg); }
		}
		_step("colors found (" + _groupNames.length + "): " + (_groupNames.length ? _groupNames.join(", ") : "NONE"));

		/*
		 * Zero colour groups must FAIL, not succeed. Proceeding used to build only Choke + White UB and
		 * report "Separation performed successfully" — a separation with no ink plates that looks done.
		 * Reached two ways: art with no filled vector paths (embedded raster, outlined masks), or the
		 * post-Divide recovery above grabbing a group Divide had already consumed.
		 */
		if (_groupNames.length === 0) {
			throw new Error(
				"No ink colors found in the processed art for \"" + _graphicName +
				"\" — no plates can be made. The graphic may be an embedded image / masked art with no " +
				"filled vector paths, or Pathfinder Divide did not run (check the \"LEAP Color Seps\" action set)."
			);
		}


		for (var colorName in colorGroups) {
			if (colorGroups.hasOwnProperty(colorName)) {

				var colorSubLayer = getOrCreateLayer(app.activeDocument, colorName, _separatedArtLayer);


				var items = colorGroups[colorName];
				for (var j = 0; j < items.length; j++) {
					items[j].move(colorSubLayer, ElementPlacement.PLACEATBEGINNING);
				}


				app.selection = null;
				unlockLayerContentsForSelection(colorSubLayer);
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
		return JSON.stringify({ success: true, steps: _stepsText() });

	} catch (e) {
		var msg = e.message || e.toString();
		_steps.push("ERROR " + msg);
		appendLeapSepLog("splitColors error: " + msg + " | steps: " + _stepsText());
		return JSON.stringify({
			success: false,
			error: msg,
			steps: _stepsText()
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

function isProfileFlagEnabled(value) {
	if (value === true || value === 1) return true;
	if (typeof value === "string") {
		var normalized = value.replace(/^\s+|\s+$/g, "").toUpperCase();
		return normalized === "Y" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
	}
	return false;
}

/** How many profile underbase passes are enabled (1–4), with fallback flags when underbaseEnabled[] is missing. */
function getProfileUnderbasePassCount(profileMetadata) {
	try {
		var count = 1;
		if (isProfileFlagEnabled(profileMetadata && profileMetadata.underbase4Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.ub4Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.underbase4)
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["Underbase 4"]))
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["UB 4"]))) {
			count = Math.max(count, 4);
		}
		if (isProfileFlagEnabled(profileMetadata && profileMetadata.underbase3Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.ub3Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.underbase3)
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["Underbase 3"]))
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["UB 3"]))) {
			count = Math.max(count, 3);
		}
		if (isProfileFlagEnabled(profileMetadata && profileMetadata.underbase2Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.ub2Enabled)
			|| isProfileFlagEnabled(profileMetadata && profileMetadata.underbase2)
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["Underbase 2"]))
			|| (profileMetadata && isProfileFlagEnabled(profileMetadata["UB 2"]))) {
			count = Math.max(count, 2);
		}
		var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
			? profileMetadata.underbaseEnabled
			: null;
		if (enabled && enabled.length > 0) {
			var arrayCount = enabled[0] !== false ? 1 : 0;
			for (var i = 1; i < enabled.length && i < 4; i++) {
				if (enabled[i] === true) arrayCount = i + 1;
			}
			if (arrayCount < 1) arrayCount = 1;
			count = Math.max(count, arrayCount);
		}
		return count;
	} catch (e) {
		return 1;
	}
}

function getEnabledUnderbaseIndices(profileMetadata) {
	try {
		var passCount = getProfileUnderbasePassCount(profileMetadata);
		var indices = [];
		for (var j = 0; j < passCount; j++) {
			indices.push(j);
		}
		return indices.length > 0 ? indices : [0];
	} catch (e) {
		return [0];
	}
}

/** Resolve swatch name to the document's exact spelling (case-insensitive lookup). */
function resolveDocumentSwatchName(doc, preferredName) {
	if (!doc || !preferredName) return preferredName;
	var swatch = getSwatchByName(doc, preferredName);
	if (swatch && swatch.name) return swatch.name;
	try {
		var search = String(preferredName).replace(/^\s+|\s+$/g, "").toUpperCase();
		for (var i = 0; i < doc.swatches.length; i++) {
			var candidate = doc.swatches[i];
			if (candidate && candidate.name && String(candidate.name).replace(/^\s+|\s+$/g, "").toUpperCase() === search) {
				return candidate.name;
			}
		}
	} catch (e) { }
	return String(preferredName).replace(/^\s+|\s+$/g, "");
}

function getOrCreateSeparatedArtSubLayer(doc, layerName, separatedArtLayer) {
	var existing = findSeparatedArtSubLayerByName(separatedArtLayer, layerName);
	if (existing) return existing;
	var layer = separatedArtLayer.layers.add();
	layer.name = layerName;
	return layer;
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

/** Graphics-page Underbase 2 swatch name, or auto-picked document white when unset. */
function getUnderbase2SwatchName(profileMetadata, doc) {
	try {
		var raw = profileMetadata && profileMetadata.underbase2Swatch != null
			? String(profileMetadata.underbase2Swatch).replace(/^\s+|\s+$/g, "")
			: "";
		if (raw) return raw;
		return getDefaultUnderbaseWhiteSwatchName(doc || app.activeDocument);
	} catch (e) {
		return CONSTANTS.SWATCH_NAMES.WHITE_UB;
	}
}

/**
 * Custom name entered for a UB pass in the profile Underbase Settings (UB1-4), trimmed.
 * Empty string means "use the default White UB N naming".
 */
function getUnderbaseCustomName(profileMetadata, ubIndex) {
	try {
		if (
			profileMetadata &&
			profileMetadata.underbaseNames &&
			profileMetadata.underbaseNames[ubIndex] != null
		) {
			return String(profileMetadata.underbaseNames[ubIndex]).replace(/^\s+|\s+$/g, "");
		}
	} catch (e) { }
	return "";
}

/** All non-empty custom underbase names configured on the profile (lowercased set for matching). */
function collectCustomUnderbaseNames(profileMetadata) {
	var names = [];
	try {
		var arr = profileMetadata && profileMetadata.underbaseNames ? profileMetadata.underbaseNames : [];
		for (var i = 0; i < arr.length; i++) {
			var nm = arr[i] != null ? String(arr[i]).replace(/^\s+|\s+$/g, "") : "";
			if (nm) names.push(nm);
		}
	} catch (e) { }
	return names;
}

/**
 * When UB1 (the base white) is given a custom name, REUSE the existing "White UB" swatch by renaming
 * it to the custom name instead of letting ensureUnderbaseSwatch copy it — otherwise both "White UB"
 * and the custom swatch end up in the Swatches panel. No-op if the target already exists or there is
 * no "White UB" swatch to reuse.
 */
function renameBaseWhiteUnderbaseSwatch(doc, toName) {
	try {
		if (!toName) return false;
		var target = String(toName).replace(/^\s+|\s+$/g, "");
		if (!target || target === CONSTANTS.SWATCH_NAMES.WHITE_UB) return false;
		if (getSwatchByName(doc, target)) return false;              // custom swatch already exists
		var sw = getSwatchByName(doc, CONSTANTS.SWATCH_NAMES.WHITE_UB);
		if (!sw) return false;                                       // no White UB swatch to reuse
		try {
			if (sw.color && sw.color.typename === "SpotColor" && sw.color.spot) {
				sw.color.spot.name = target;
			}
		} catch (e1) { }
		try { sw.name = target; } catch (e2) { }
		return true;
	} catch (e) {
		return false;
	}
}

/*
 * Name of the existing white plate swatch that UB2+ should SHARE, tolerant of ink-name formatting.
 *
 * When a profile enables formatInkNameLabel, renameFormattedInks() renames the "PANTONE White C"
 * plate (and its swatch) to the formatted label (e.g. "SL White"). On the first separation the
 * underbase is built BEFORE that rename, so the canonical name still matches; but on "Generate
 * underbase from existing inks" the inks are already formatted, so we must also try the formatted
 * white name. resolveFormattedInkName (from cep_adapters.jsx) is the exact inverse of the rename, so
 * it reproduces the current swatch name precisely. Returns the actual swatch name, or "" if none.
 */
function resolveSharedWhitePlateSwatchName(doc, profileMetadata) {
	var candidates = [];
	try {
		if (profileMetadata && profileMetadata.formatInkNameLabel) {
			var fmt = String(profileMetadata.colorNameLabelFormat || "").replace(/^\s+|\s+$/g, "");
			if (fmt) {
				/* Exact inverse of the rename (handles e.g. "SL ###" -> "SL White"). */
				if (typeof resolveFormattedInkName === "function") {
					candidates.push(resolveFormattedInkName("PANTONE White C", fmt));
					candidates.push(resolveFormattedInkName("PANTONE White", fmt));
				}
				/* Fallback: swap the numeric/placeholder token for "White" (e.g. "LS XXX C" -> "LS White C"). */
				candidates.push(fmt.replace(/#+/g, "White").replace(/X{2,}/g, "White"));
			}
		}
	} catch (eFmt) { }
	/* Canonical (unformatted) white plate names — win on the first separation, before any rename. */
	candidates.push("PANTONE White C");
	candidates.push("PANTONE White");
	candidates.push("White");
	for (var i = 0; i < candidates.length; i++) {
		var nm = candidates[i] ? getSwatchNameCaseInsensitive(doc, candidates[i]) : "";
		if (nm) return nm;
	}
	return "";
}

/** Resolve SEPARATED_ART layer + fill swatch for a profile underbase pass index. */
function resolveUnderbaseLayerAndSwatch(ubIndex, profileMetadata, doc) {
	// A custom name (when entered) is used for BOTH the underbase swatch and the layer name.
	var customName = getUnderbaseCustomName(profileMetadata, ubIndex);

	if (ubIndex === 0) {
		return {
			layerName: customName || CONSTANTS.LAYER_NAMES.WHITE_UB,
			swatchName: customName || getProfileUnderbaseSwatchName(profileMetadata),
			clearBeforeCopy: true
		};
	}
	var layerName = getUnderbaseLayerNameForIndex(ubIndex);

	// UB2 (ubIndex === 1) precedence (per product decision):
	//   1) If a white plate swatch already exists (PANTONE White C -> PANTONE White -> White),
	//      SHARE it as the fill; the layer takes the custom name when entered, else "White UB 2".
	//   2) Else, if a custom name was entered, use it for the layer + swatch.
	//   3) Else, fall back to the dedicated "White UB 2" swatch (unchanged behavior).
	if (ubIndex === 1) {
		/* Format-aware: when ink-name formatting is on, the white plate swatch may already be
			 renamed (e.g. "PANTONE White C" -> "SL White") — as happens on "Generate underbase from
			 existing inks", where inks are already formatted. resolveSharedWhitePlateSwatchName finds
			 the formatted name too so UB2 still SHARES the real white plate instead of falling back. */
		var whiteSwatchName = resolveSharedWhitePlateSwatchName(doc, profileMetadata);
		if (whiteSwatchName) {
			return {
				// Custom name (when entered) renames the layer; the swatch still shares the existing
				// white plate (PANTONE White C -> PANTONE White -> White). Falls back to "White UB 2"
				// when no custom name is set (unchanged behavior).
				layerName: customName || layerName,
				swatchName: whiteSwatchName,
				clearBeforeCopy: true
			};
		}
		if (customName) {
			return {
				layerName: customName,
				swatchName: customName,
				clearBeforeCopy: true
			};
		}
		// else: no white plate swatch found -> fall through to dedicated "White UB 2" swatch.
	}

	// UB3/UB4 (and UB2 fallback): a custom name wins; otherwise each extra underbase pass gets its
	// own dedicated white swatch named after the plate (e.g. "White UB 3"). finalizeUnderbaseLayer
	// creates the swatch white from the "White UB" swatch when it does not exist yet.
	return {
		layerName: customName || layerName,
		swatchName: customName || layerName,
		clearBeforeCopy: true
	};
}

/**
 * Layer belongs in the underbase stack (White UB variants, or a profile custom underbase name).
 * When profileMetadata carries custom UB names, those are treated as underbase layers too.
 */
function isUnderbaseStackLayerName(layerName, profileMetadata, doc) {
	if (!layerName) return false;
	if (String(layerName).indexOf(CONSTANTS.LAYER_NAMES.WHITE_UB) === 0) return true;
	var custom = collectCustomUnderbaseNames(profileMetadata);
	var target = String(layerName).replace(/^\s+|\s+$/g, "").toLowerCase();
	for (var i = 0; i < custom.length; i++) {
		if (String(custom[i]).toLowerCase() === target) return true;
	}
	return false;
}

/** Plate list uses live SEPARATED_ART layer names (no filtering). */
function filterPlateLayerNamesForUi(layerNames, profileMetadata) {
	return layerNames || [];
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
				fallbackSpot.colorType = ColorModel.SPOT;
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

/** Case-insensitive swatch lookup; returns the actual swatch name, or "" if none. */
function getSwatchNameCaseInsensitive(doc, wanted) {
	var target = String(wanted || "").replace(/^\s+|\s+$/g, "").toUpperCase();
	if (!target) return "";
	try {
		for (var i = 0; i < doc.swatches.length; i++) {
			var nm = doc.swatches[i].name;
			if (nm && String(nm).replace(/^\s+|\s+$/g, "").toUpperCase() === target) return nm;
		}
	} catch (e) { }
	return "";
}

/** Build a CMYK color object from a {c,m,y,k} literal (values clamped 0..100). */
function makeCmykColor(cmyk) {
	var color = new CMYKColor();
	color.cyan = Math.max(0, Math.min(100, Number(cmyk.c) || 0));
	color.magenta = Math.max(0, Math.min(100, Number(cmyk.m) || 0));
	color.yellow = Math.max(0, Math.min(100, Number(cmyk.y) || 0));
	color.black = Math.max(0, Math.min(100, Number(cmyk.k) || 0));
	return color;
}

/** Base (non-spot) color of a swatch, resolving a spot to its alternate color. Null if none. */
function getUnderbaseBaseColorFromSwatch(doc, swatchName) {
	if (!swatchName) return null;
	var sw = getSwatchByName(doc, swatchName);
	if (!sw || !sw.color) return null;
	if (sw.color.typename === "SpotColor" && sw.color.spot) return sw.color.spot.color;
	return sw.color;
}

/**
 * Ensure the swatch that fills an underbase plate exists, with the right display color.
 * Colors are on-screen only — every underbase prints white. Each plate is created as its
 * own SPOT so it separates independently.
 *   White UB 2  -> copy "White", else "PANTONE White C", else tint C0 M20 Y20 K0
 *   White UB 3  -> tint C20 M0 Y20 K0
 *   White UB 4+ -> tint C20 M20 Y20 K0
 *   White UB / Blocker / other -> copy the "White UB" swatch color
 * No-op when the swatch already exists.
 */
function ensureUnderbaseSwatch(doc, swatchName) {
	if (!doc || !swatchName) return;
	if (getSwatchByName(doc, swatchName)) return;

	var match = String(swatchName).match(/white\s*ub\s+(\d+)\s*$/i);
	var ubNumber = match ? parseInt(match[1], 10) : 1;

	// White UB (UB1), Blocker, and any non-numbered name: keep existing behavior.
	if (ubNumber < 2) {
		ensureSwatchExistsFromSource(CONSTANTS.SWATCH_NAMES.WHITE_UB, swatchName, { c: 0, m: 0, y: 0, k: 0 });
		return;
	}

	// Resolve this pass's display color.
	var color = null;
	if (ubNumber === 2) {
		var whiteName = getSwatchNameCaseInsensitive(doc, "White");
		if (!whiteName) whiteName = getSwatchNameCaseInsensitive(doc, "PANTONE White C");
		color = getUnderbaseBaseColorFromSwatch(doc, whiteName);
	}
	if (!color) {
		var cmyk = ubNumber === 2
			? { c: 5, m: 0, y: 0, k: 0 }
			: (ubNumber === 3 ? { c: 10, m: 0, y: 0, k: 0 } : { c: 15, m: 0, y: 0, k: 0 });
		color = makeCmykColor(cmyk);
	}

	// Every underbase plate is its own spot so it separates independently. A new spot
	// defaults to process, so colorType must be set to SPOT explicitly.
	try {
		var spot = doc.spots.add();
		spot.name = swatchName;
		spot.colorType = ColorModel.SPOT;
		spot.color = color;
	} catch (e) { }
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

function applySpotFillToContainer(container, color) {
	if (!container || !color) return;
	try {
		if (container.typename === "PathItem") {
			if (container.filled) container.fillColor = color;
			return;
		}
		if (container.typename === "CompoundPathItem" && container.pathItems) {
			for (var p = 0; p < container.pathItems.length; p++) {
				if (container.pathItems[p].filled) container.pathItems[p].fillColor = color;
			}
			return;
		}
		if (container.pageItems) {
			for (var i = 0; i < container.pageItems.length; i++) {
				applySpotFillToContainer(container.pageItems[i], color);
			}
		}
	} catch (e) { }
}

function finalizeUnderbaseLayer(underbaseLayer, runLeftoverUb, swatchName) {
	try {
		var doc = app.activeDocument;
		var resolvedSwatch = resolveDocumentSwatchName(
			doc,
			(swatchName && String(swatchName).replace(/^\s+|\s+$/g, "") !== "")
				? String(swatchName)
				: CONSTANTS.SWATCH_NAMES.WHITE_UB
		);
		// Ensure the underbase swatch exists so the plate can be filled and appears in the
		// Swatches panel. UB2 copies White/PANTONE White C, UB3/UB4 get distinct tints.
		ensureUnderbaseSwatch(doc, resolvedSwatch);
		app.selection = null;
		unlockLayerContentsForSelection(underbaseLayer);
		doc.activeLayer = underbaseLayer;
		doc.activeLayer.hasSelectedArtwork = true;
		app.redraw();
		applySwatchToFill(doc, resolvedSwatch);
		var swatch = getSwatchByName(doc, resolvedSwatch);
		if (swatch && swatch.color) {
			applySpotFillToContainer(underbaseLayer, swatch.color);
		}
		app.executeMenuCommand('sendToBack');
		pathFinderAdd();
		if (runLeftoverUb) {
			deleteLeftoverPathsInLayer(underbaseLayer);
		}
		app.selection = null;
	} catch (e) { }
}

/** Local case-insensitive lookup of a direct SEPARATED_ART sublayer by name. */
function findSeparatedArtSubLayerByName(separatedArtLayer, layerName) {
	if (!separatedArtLayer || !layerName) return null;
	var search = String(layerName).replace(/^\s+|\s+$/g, "").toUpperCase();
	try {
		for (var i = 0; i < separatedArtLayer.layers.length; i++) {
			var candidate = separatedArtLayer.layers[i];
			if (candidate && candidate.name && String(candidate.name).replace(/^\s+|\s+$/g, "").toUpperCase() === search) {
				return candidate;
			}
		}
	} catch (e) { }
	return null;
}

/**
 * Build localized extra-pass underbase layers from per-ink ink-exception counts.
 *
 * profileMetadata.inkLocalizedUnderbase is [{ level, layers:[plateNames] }] (set by
 * mergeInkExceptionUnderbaseIntoProfileMetadata). For level N (1-based) we create
 * "White UB N" filled from ONLY the geometry of the listed ink plates, so the extra
 * white pass sits under just those inks. All inks needing pass N share one "White UB N"
 * layer; finalizeUnderbaseLayer() unions overlaps via pathfinder and recolors to white.
 */
function applyLocalizedInkUnderbaseLayers(profileMetadata, separatedArtLayer, runLeftoverUb, forceClearBeforeCopy) {
	try {
		var localized = profileMetadata && profileMetadata.inkLocalizedUnderbase instanceof Array
			? profileMetadata.inkLocalizedUnderbase
			: null;
		if (!localized || localized.length === 0) return;

		for (var e = 0; e < localized.length; e++) {
			var entry = localized[e];
			if (!entry || !(entry.layers instanceof Array) || entry.layers.length === 0) continue;

			var levelIndex = entry.level - 1; // 0-based for layer naming (UB N -> index N-1)
			var resolved = resolveUnderbaseLayerAndSwatch(levelIndex, profileMetadata, app.activeDocument);
			var ubLayerName = resolved.layerName;
			var ubLayer = getOrCreateSeparatedArtSubLayer(app.activeDocument, ubLayerName, separatedArtLayer);
			var existingCount = 0;
			try { existingCount = ubLayer.pageItems ? ubLayer.pageItems.length : 0; } catch (ecErr) { }
			if (resolved.clearBeforeCopy || forceClearBeforeCopy === true) {
				clearLayerPageItems(ubLayer);
			}

			var copied = 0;
			for (var s = 0; s < entry.layers.length; s++) {
				var sourceInkLayer = findSeparatedArtSubLayerByName(separatedArtLayer, entry.layers[s]);
				if (!sourceInkLayer) continue;
				copied += duplicateLayerItems(sourceInkLayer, ubLayer);
			}

			if (copied === 0) {
				if (existingCount === 0) {
					try { ubLayer.remove(); } catch (rmErr) { }
				}
				continue;
			}

			finalizeUnderbaseLayer(ubLayer, runLeftoverUb, resolved.swatchName);
			appendLeapSepLog(
				"localized " + ubLayerName + " built from " + entry.layers.join(" + ") + " (" + copied + " items)"
			);
		}
	} catch (e) { }
}

/** Choke, Blocker, and numbered White UB layers removed before regenerating underbase from inks. */
function isChokeBlockerOrRemovableUnderbaseLayerName(layerName, profileMetadata, doc) {
	if (!layerName) return false;
	var n = String(layerName).replace(/^\s+|\s+$/g, "");
	var up = n.toUpperCase();
	if (up === String(CONSTANTS.LAYER_NAMES.CHOKE).toUpperCase()) return true;
	if (up === String(CONSTANTS.LAYER_NAMES.BLOCKER).toUpperCase()) return true;
	if (/^BLOCKER(\s+\d+)?$/i.test(n)) return true;
	if (up === String(CONSTANTS.LAYER_NAMES.WHITE_UB).toUpperCase()) return true;
	if (n.indexOf(CONSTANTS.LAYER_NAMES.WHITE_UB + " ") === 0) return true;
	return false;
}

/** Ink color plates in SEPARATED_ART (excludes choke / underbase stack layers). */
function isInkPlateLayerNameForUnderbaseMerge(layerName, profileMetadata, doc) {
	if (!layerName || layerName === "__TEMP_WHITE_UB") return false;
	return !isChokeBlockerOrRemovableUnderbaseLayerName(layerName, profileMetadata, doc);
}

function removeChokeAndUnderbaseLayers(separatedArtLayer, profileMetadata, doc) {
	if (!separatedArtLayer || !separatedArtLayer.layers) return 0;
	var removed = 0;
	for (var i = separatedArtLayer.layers.length - 1; i >= 0; i--) {
		var layer = separatedArtLayer.layers[i];
		if (!layer || !layer.name) continue;
		if (layer.name === "__TEMP_WHITE_UB") {
			try { layer.remove(); removed++; } catch (tempErr) { }
			continue;
		}
		if (isChokeBlockerOrRemovableUnderbaseLayerName(layer.name, profileMetadata, doc)) {
			try { layer.remove(); removed++; } catch (rmErr) { }
		}
	}
	appendLeapSepLog(
		"regenerate underbase: removed " + removed + " choke/underbase layer(s); ink plates kept"
	);
	return removed;
}

function populateTempLayerFromExistingInkPlates(separatedArtLayer, profileMetadata, doc, tempWhiteUBLayer, runUnpainted) {
	clearLayerPageItems(tempWhiteUBLayer);
	var inksCopied = 0;
	var inkNames = [];
	for (var i = 0; i < separatedArtLayer.layers.length; i++) {
		var inkLayer = separatedArtLayer.layers[i];
		if (!inkLayer || !inkLayer.name) continue;
		if (!isInkPlateLayerNameForUnderbaseMerge(inkLayer.name, profileMetadata, doc)) continue;
		var dup = duplicateLayerItems(inkLayer, tempWhiteUBLayer);
		if (dup > 0) {
			inksCopied += dup;
			inkNames.push(inkLayer.name);
		}
	}
	if (inksCopied < 1) {
		throw new Error("No ink plate artwork found in SEPARATED_ART to build underbase from");
	}
	appendLeapSepLog(
		"underbase from existing inks: merged " + inkNames.length + " layer(s): " + inkNames.join(", ")
	);
	app.selection = null;
	unlockLayerContentsForSelection(tempWhiteUBLayer);
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
}

/**
 * Persist the set of SEPARATED_ART underbase layer names to the document XMP
 * (struct field "UnderbaseLayerNames", ordered ascending by pass). The Plates panel reads this so
 * custom-named underbase plates are still recognized/grouped as underbase even though their name no
 * longer starts with "White UB".
 */
function writeUnderbaseLayerNamesXmp(doc, orderedNames) {
	try {
		if (typeof xmpModifier !== "object") return;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
		if (!xmp.isXmpCreated) return;
		var clean = [];
		for (var i = 0; i < orderedNames.length; i++) {
			var nm = orderedNames[i] != null ? String(orderedNames[i]).replace(/^\s+|\s+$/g, "") : "";
			if (nm) clean.push(nm);
		}
		xmp.setStructField("UnderbaseLayerNames", clean, true, false);
		xmp.commit();
	} catch (e) { }
}

/**
 * Persist the swatch each underbase pass is filled with (struct field "UnderbaseSwatchNames",
 * ordered by pass). The Plates panel flags a plate as underbase when its swatch matches one of these,
 * so a shared white (e.g. UB2 sharing "PANTONE White") groups with the underbase.
 */
function writeUnderbaseSwatchNamesXmp(doc, orderedSwatches) {
	try {
		if (typeof xmpModifier !== "object") return;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
		if (!xmp.isXmpCreated) return;
		var clean = [];
		for (var i = 0; i < orderedSwatches.length; i++) {
			var nm = orderedSwatches[i] != null ? String(orderedSwatches[i]).replace(/^\s+|\s+$/g, "") : "";
			if (nm) clean.push(nm);
		}
		xmp.setStructField("UnderbaseSwatchNames", clean, true, false);
		xmp.commit();
	} catch (e) { }
}

/**
 * Record every SEPARATED_ART underbase layer to XMP: the layer names (UnderbaseLayerNames) and each
 * layer's ACTUAL fill swatch (UnderbaseSwatchNames), ordered by pass. The fill-swatch record catches
 * a shared white (e.g. a localized "White UB 2" filled with "PANTONE White" that is also a real ink
 * plate) so that ink plate groups with the underbase. MUST be called AFTER any formatted-ink rename
 * so the recorded swatch names match the final plate names the panel sees.
 */
function recordUnderbaseLayersToXmp(doc, profileMetadata) {
	try {
		var separatedArtLayer = null;
		try { separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART); } catch (e0) { return; }
		if (!separatedArtLayer || !separatedArtLayer.layers) return;

		var ubPassRows = []; // { layer, swatch, pass }
		for (var si = 0; si < separatedArtLayer.layers.length; si++) {
			var slayer = separatedArtLayer.layers[si];
			if (!slayer || !slayer.name) continue;
			if (!isUnderbaseStackLayerName(slayer.name, profileMetadata, doc)) continue;
			var ubPass = underbasePassNumberForLayer(slayer.name, profileMetadata);
			var ubFill = getFirstFillColorFromSeparatedArtSublayer(doc, slayer.name);
			var ubFillSwatch = null;
			if (ubFill && ubFill.typename === "SpotColor" && ubFill.spot && ubFill.spot.name) {
				ubFillSwatch = String(ubFill.spot.name).replace(/^\s+|\s+$/g, "");
			}
			ubPassRows.push({ layer: slayer.name, swatch: ubFillSwatch, pass: ubPass });
		}
		ubPassRows.sort(function (a, b) { return a.pass - b.pass; });

		var ubNamesForXmp = [];
		var ubSwatchesForXmp = [];
		var seenUbSwatch = {};
		for (var pr = 0; pr < ubPassRows.length; pr++) {
			ubNamesForXmp.push(ubPassRows[pr].layer);
			var sw = ubPassRows[pr].swatch;
			if (sw && !seenUbSwatch[sw.toLowerCase()]) {
				seenUbSwatch[sw.toLowerCase()] = true;
				ubSwatchesForXmp.push(sw);
			}
		}
		writeUnderbaseLayerNamesXmp(doc, ubNamesForXmp);
		writeUnderbaseSwatchNamesXmp(doc, ubSwatchesForXmp);
		appendLeapSepLog("[UB_ORDER] UnderbaseLayerNames=[" + ubNamesForXmp.join(" | ") + "] UnderbaseSwatchNames=[" + ubSwatchesForXmp.join(" | ") + "]");
	} catch (ubXmpErr) {
		appendLeapSepLog("[UB_ORDER] underbase XMP record error: " + (ubXmpErr.message || ubXmpErr));
	}
}

function generateUnderbase(_graphicName, cleanupOpts, profileMetadata, genOptions) {
	genOptions = genOptions || {};
	var fromExistingInks = genOptions.fromExistingInks === true;
	var forceClearUnderbases = fromExistingInks === true;
	try {
		var runUnpainted = cleanupOpts == null || cleanupOpts.deleteUnpaintedPaths === true;
		var runLeftoverUb = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
		var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);

		if (fromExistingInks) {
			removeChokeAndUnderbaseLayers(_separatedArtLayer, profileMetadata, app.activeDocument);
		} else {
			var _sizedArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
			var _sizedGraphicLayer = _sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
			var _graphicItem = null;
			try {
				_graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);
			} catch (nameErr) {
				if (_sizedGraphicLayer.pageItems && _sizedGraphicLayer.pageItems.length > 0) {
					_graphicItem = _sizedGraphicLayer.pageItems[0];
				}
			}
			if (!_graphicItem) {
				throw new Error(
					"Graphic \"" + _graphicName + "\" not found in SIZED_GRAPHICS (place graphic AI first)"
				);
			}
			prepareSizedArtGraphicForProcessing(app.activeDocument, _graphicItem);
		}

		var tempWhiteUBLayer = getOrCreateLayer(app.activeDocument, "__TEMP_WHITE_UB", _separatedArtLayer);
		if (fromExistingInks) {
			populateTempLayerFromExistingInkPlates(
				_separatedArtLayer,
				profileMetadata,
				app.activeDocument,
				tempWhiteUBLayer,
				runUnpainted
			);
		} else {
			clearLayerPageItems(tempWhiteUBLayer);
			duplicateItemToLayer(_graphicItem, tempWhiteUBLayer);

			app.selection = null;
			unlockLayerContentsForSelection(tempWhiteUBLayer);
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
		}

		// pass number (1-based) -> the swatch each underbase pass is filled with, so the panel can
		// flag a plate as underbase when it SHARES an underbase swatch (e.g. UB2 sharing PANTONE White).
		var ubResolvedSwatchByPass = {};
		var enabledUnderbaseIndices = getEnabledUnderbaseIndices(profileMetadata);
		for (var ub = 0; ub < enabledUnderbaseIndices.length; ub++) {
			var ubIndex = enabledUnderbaseIndices[ub];
			var resolved = resolveUnderbaseLayerAndSwatch(ubIndex, profileMetadata, app.activeDocument);
			var ubLayerName = resolved.layerName;
			var ubLayer = getOrCreateSeparatedArtSubLayer(app.activeDocument, ubLayerName, _separatedArtLayer);
			var ubSwatchName = resolved.swatchName;
			if (ubSwatchName) ubResolvedSwatchByPass[ubIndex + 1] = ubSwatchName;
			// UB1 with a custom name: reuse the base "White UB" swatch (rename it) so the Swatches
			// panel does not keep both "White UB" and the custom swatch.
			if (ubIndex === 0) {
				var ubBaseCustomName = getUnderbaseCustomName(profileMetadata, 0);
				if (ubBaseCustomName) {
					renameBaseWhiteUnderbaseSwatch(app.activeDocument, ubBaseCustomName);
				}
			}
			var existingCount = 0;
			try { existingCount = ubLayer.pageItems ? ubLayer.pageItems.length : 0; } catch (ecErr) { }
			if (resolved.clearBeforeCopy || forceClearUnderbases) {
				clearLayerPageItems(ubLayer);
			} else if (existingCount > 0) {
				appendLeapSepLog(
					"UB" + (ubIndex + 1) + " preserving " + existingCount + " existing item(s) on '" + ubLayerName + "'"
				);
			}
			var dupCount = duplicateLayerItems(tempWhiteUBLayer, ubLayer);
			removeKnockoutFilledItemsFromUnderbaseLayer(ubLayer, profileMetadata, ubIndex);
			finalizeUnderbaseLayer(ubLayer, runLeftoverUb, ubSwatchName);
			var ubItemCount = 0;
			try { ubItemCount = ubLayer.pageItems ? ubLayer.pageItems.length : 0; } catch (cntErr) { }
			appendLeapSepLog(
				"UB" + (ubIndex + 1) + " layer '" + ubLayerName + "': duplicated=" + dupCount + ", items=" + ubItemCount
			);
		}

		// Extra underbase passes required only by specific inks (ink-exception underbase_count
		// beyond the profile-global count) are built localized — from just those inks' shapes.
		applyLocalizedInkUnderbaseLayers(profileMetadata, _separatedArtLayer, runLeftoverUb, forceClearUnderbases);

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
		generateChoke(tempWhiteUBLayer, _separatedArtLayer, profileMetadata);
		reorderGeneratedUnderbaseLayers(_separatedArtLayer, profileMetadata);

		// Record the underbase passes to XMP so the Plates panel can recognize them. NOTE: this runs
		// again after any formatted-ink rename (see recordUnderbaseLayersToXmp caller in
		// handlePerformSeparation) so the recorded swatch names match the FINAL plate names.
		recordUnderbaseLayersToXmp(app.activeDocument, profileMetadata);

		try { tempWhiteUBLayer.remove(); } catch (tempRemoveErr) { }
		app.activeDocument.selection = null;
	} catch (e) {
		return JSON.stringify({
			success: false,
			error: "Underbase generation failed: " + (e.message || e.toString())
		});
	}
}


function generateChoke(sourceLayer, separatedArtLayer, profileMetadata) {

	var chokeLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.CHOKE, separatedArtLayer);
	try {
		var topMostUnderbaseLayer = null;
		var topMostUnderbaseIndex = 999999;
		for (var layerIndex = 0; layerIndex < separatedArtLayer.layers.length; layerIndex++) {
			var candidateLayer = separatedArtLayer.layers[layerIndex];
			if (
				candidateLayer &&
				candidateLayer.name &&
				isUnderbaseStackLayerName(candidateLayer.name, profileMetadata, app.activeDocument)
			) {
				if (layerIndex < topMostUnderbaseIndex) {
					topMostUnderbaseIndex = layerIndex;
					topMostUnderbaseLayer = candidateLayer;
				}
			}
		}

		if (topMostUnderbaseLayer) {
			chokeLayer.move(topMostUnderbaseLayer, ElementPlacement.PLACEBEFORE);
		} else {
			chokeLayer.move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);
		}
	} catch (layerMoveErr) {
		chokeLayer.move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);
	}
	clearLayerPageItems(chokeLayer);

	unlockLayerContentsForSelection(sourceLayer);
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
	unlockLayerContentsForSelection(chokeLayer);
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

/**
 * Underbase pass number (1-based) for a layer. Uses the "White UB N" number when present, else
 * the position of a matching custom underbase name in the profile (so custom-named passes stack in
 * the same order as UB1..UB4). Falls back to 1.
 */
function underbasePassNumberForLayer(layerName, profileMetadata) {
	var n = getWhiteUbLayerNumber(layerName);
	if (n >= 1) return n;
	try {
		var arr = profileMetadata && profileMetadata.underbaseNames ? profileMetadata.underbaseNames : [];
		var target = String(layerName || "").replace(/^\s+|\s+$/g, "").toLowerCase();
		for (var i = 0; i < arr.length; i++) {
			var nm = arr[i] != null ? String(arr[i]).replace(/^\s+|\s+$/g, "").toLowerCase() : "";
			if (nm && nm === target) return i + 1;
		}
	} catch (e) { }
	return 1;
}

function reorderGeneratedUnderbaseLayers(separatedArtLayer, profileMetadata) {
	try {
		if (!separatedArtLayer || !separatedArtLayer.layers) return;

		var chokeLayer = null;
		var blockerLayer = null;
		var whiteUbLayers = [];

		for (var i = 0; i < separatedArtLayer.layers.length; i++) {
			var layer = separatedArtLayer.layers[i];
			if (!layer || !layer.name) continue;
			if (layer.name === CONSTANTS.LAYER_NAMES.CHOKE) chokeLayer = layer;
			else if (layer.name === CONSTANTS.LAYER_NAMES.BLOCKER) blockerLayer = layer;
			else if (isUnderbaseStackLayerName(layer.name, profileMetadata, app.activeDocument)) whiteUbLayers.push(layer);
		}

		whiteUbLayers.sort(function (a, b) {
			// Descending so the stack is UB4, UB3, UB2, UB1 (top -> bottom), including custom-named passes.
			return underbasePassNumberForLayer(b.name, profileMetadata) - underbasePassNumberForLayer(a.name, profileMetadata);
		});

		var tailOrdered = [];
		if (chokeLayer) tailOrdered.push(chokeLayer);
		for (var u = 0; u < whiteUbLayers.length; u++) {
			tailOrdered.push(whiteUbLayers[u]);
		}
		if (blockerLayer) tailOrdered.push(blockerLayer);

		if (tailOrdered.length === 0) return;

		for (var t = tailOrdered.length - 1; t >= 0; t--) {
			try {
				if (t === tailOrdered.length - 1) {
					tailOrdered[t].move(separatedArtLayer, ElementPlacement.PLACEATEND);
				} else {
					tailOrdered[t].move(tailOrdered[t + 1], ElementPlacement.PLACEBEFORE);
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
