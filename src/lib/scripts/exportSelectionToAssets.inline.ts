/*
 * ExtendScript (host) helper for the standalone (non-LEAP) flow: export the current selection to
 * an ASSETS folder that sits next to the active document, WITHOUT modifying the active document.
 *
 * Inline host-code string (same pattern as createGraphicFromSelection / the postscript builder),
 * run via evalScript. It copies the selection into a new document sized to the selection bounds,
 * saves it as <activeDocFolder>/ASSETS/<name>.ai, and leaves that exported document open and
 * frontmost so the panel can proceed to separations.
 */
export const exportSelectionToAssetsHostCode = `
function easErr(m) { return JSON.stringify({ success: false, error: m }); }

/*
 * Make a value safe for a file name. Uses a WHITELIST (keep letters, digits, dot, underscore,
 * hyphen; turn any run of other characters into "_"). This deliberately avoids putting a forward
 * slash inside a regex character class — the ExtendScript regex-literal parser mishandles "/" in
 * "[...]" and throws "Expected: )".
 */
function easSanitize(s) {
	s = String(s == null ? "" : s);
	s = s.replace(/[^A-Za-z0-9._-]+/g, "_");
	s = s.replace(/^_+|_+$/g, "");
	return s;
}

/*
 * Decoration-ink extraction: names of SPOT swatches actually used by the artwork, excluding
 * underbase / white-base / reserved swatches. These are the colors shown in the separation group.
 */
function easIsExcludedSwatchName(name) {
	var n = String(name == null ? "" : name).replace(/^\\s+|\\s+$/g, "").toLowerCase();
	if (!n) return true;
	if (n === "[registration]" || n === "registration") return true;
	if (n === "[none]" || n === "none") return true;
	if (n.indexOf("white ub") === 0) return true; /* White UB, White UB 2/3/4 */
	if (n.indexOf("underbase") !== -1) return true;
	return false;
}

/* Return the spot swatch name for a color, or null if it is not a (non-registration) spot. */
function easSpotName(color) {
	try {
		if (color && color.typename === "SpotColor" && color.spot) {
			try {
				if (color.spot.colorType === ColorType.REGISTRATION) return null;
			} catch (e1) { }
			return String(color.spot.name);
		}
	} catch (e) { }
	return null;
}

/* Recursively collect unique decoration-ink spot names from a list of page items. */
function easCollectSpots(items, seen, out) {
	if (!items) return;
	for (var i = 0; i < items.length; i++) {
		var it = items[i];
		try {
			var tn = it.typename;
			if (tn === "PathItem") {
				if (it.filled && it.fillColor) {
					var nf = easSpotName(it.fillColor);
					if (nf && !easIsExcludedSwatchName(nf) && !seen[nf]) { seen[nf] = true; out.push(nf); }
				}
				if (it.stroked && it.strokeColor) {
					var ns = easSpotName(it.strokeColor);
					if (ns && !easIsExcludedSwatchName(ns) && !seen[ns]) { seen[ns] = true; out.push(ns); }
				}
			} else if (tn === "CompoundPathItem" && it.pathItems) {
				easCollectSpots(it.pathItems, seen, out);
			} else if (tn === "GroupItem" && it.pageItems) {
				easCollectSpots(it.pageItems, seen, out);
			} else if (it.pageItems && it.pageItems.length) {
				easCollectSpots(it.pageItems, seen, out);
			}
		} catch (e2) { }
	}
}

/* Union of geometricBounds for a list of page items -> [left, top, right, bottom] (top > bottom). */
function easUnionBounds(items) {
	var L = null, T = null, R = null, B = null;
	for (var i = 0; i < items.length; i++) {
		var b;
		try { b = items[i].geometricBounds; } catch (e) { continue; }
		if (b == null) continue;
		if (L === null || b[0] < L) L = b[0];
		if (T === null || b[1] > T) T = b[1];
		if (R === null || b[2] > R) R = b[2];
		if (B === null || b[3] < B) B = b[3];
	}
	if (L === null) return null;
	return [L, T, R, B];
}

function exportSelectionToAssetsRun(params) {
	if (!app.documents.length) return easErr("No active document");
	var doc = app.activeDocument;
	if (!app.selection || !app.selection.length) return easErr("Nothing is selected");

	var docHasPath = false;
	try { docHasPath = !!(doc.fullName && doc.fullName.fsName); } catch (e) { docHasPath = false; }
	if (!docHasPath) return easErr("Save the document first so an ASSETS folder can be created next to it");

	var docFile = new File(doc.fullName);
	var docBase = docFile.name.replace(/\\.[^\\.]+$/, "");
	var parent = docFile.parent;
	if (!parent || !parent.exists) return easErr("Cannot resolve the document folder");

	var assets = new Folder(parent.fsName + "/ASSETS");
	if (!assets.exists) assets.create();

	/* Derive the file name from the metadata (no manual Name field in standalone mode). */
	var nameParts = [];
	if (params && params.teamCode) nameParts.push(easSanitize(params.teamCode));
	if (params && params.styleCode) nameParts.push(easSanitize(params.styleCode));
	if (params && params.position) nameParts.push(easSanitize(params.position));
	var base = nameParts.length ? nameParts.join("_") : easSanitize(docBase);
	if (!base) base = "ASSET";
	var aiFile = new File(assets.fsName + "/" + base + ".ai");

	/* Measure the selection so the new document + artboard can be sized to it. */
	var selItems = [];
	for (var s = 0; s < app.selection.length; s++) selItems.push(app.selection[s]);

	/* Decoration inks used by the selection (for the separation grouping display). */
	var colorSeen = {};
	var colors = [];
	easCollectSpots(selItems, colorSeen, colors);

	var bounds = easUnionBounds(selItems);
	if (!bounds) return easErr("Could not measure the selection bounds");
	var w = Math.abs(bounds[2] - bounds[0]);
	var h = Math.abs(bounds[1] - bounds[3]);
	if (!(w > 0) || !(h > 0)) { w = 72; h = 72; }

	/* Copy the selection. This does not modify the source document. */
	app.redraw();
	app.executeMenuCommand("copy");

	var newDoc = app.documents.add(null, w, h);
	newDoc.activate();
	try { app.preferences.setBooleanPreference("layers/pastePreserve", true); } catch (prefErr) { }
	app.executeMenuCommand("pasteInPlace");
	app.redraw();

	/* Fit the artboard to the pasted art. */
	var pasted = [];
	try { for (var p = 0; p < newDoc.pageItems.length; p++) pasted.push(newDoc.pageItems[p]); } catch (e2) { }
	var pb = easUnionBounds(pasted);
	try {
		var ab = newDoc.artboards[newDoc.artboards.getActiveArtboardIndex()];
		if (pb) ab.artboardRect = pb;
	} catch (abErr) { }

	try {
		newDoc.saveAs(aiFile);
	} catch (saveErr) {
		return easErr("Could not save exported AI: " + (saveErr.message || saveErr));
	}

	/* Keep the exported document open and frontmost (do NOT close it). */
	try { newDoc.activate(); } catch (actErr) { }

	return JSON.stringify({
		success: true,
		assetsPath: assets.fsName,
		filePath: aiFile.fsName,
		fileName: aiFile.name,
		colors: colors
	});
}
`;
