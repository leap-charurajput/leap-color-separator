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

	/*
	 * Flatten live objects IN THE EXPORTED FILE: outline text (Type > Create Outlines) and Expand
	 * Appearance, so the saved asset is plain filled paths — stable for reuse and ready for
	 * splitColors. (Menu commands only: this inline script has no access to the jsx expandObject
	 * helper; the standalone separation run does a final expand pass before splitting anyway.)
	 */
	try {
		app.executeMenuCommand("selectall");
		if (newDoc.selection && newDoc.selection.length) {
			try { app.executeMenuCommand("outline"); } catch (fOut) { }
			try { app.executeMenuCommand("expandStyle"); } catch (fStyle) { }
		}
		newDoc.selection = null;
		app.redraw();
	} catch (fPrep) { }

	/* Fit the artboard to the pasted art. */
	var pasted = [];
	try { for (var p = 0; p < newDoc.pageItems.length; p++) pasted.push(newDoc.pageItems[p]); } catch (e2) { }
	var pb = easUnionBounds(pasted);
	try {
		var ab = newDoc.artboards[newDoc.artboards.getActiveArtboardIndex()];
		if (pb) ab.artboardRect = pb;
	} catch (abErr) { }

	/*
	 * DELETE UNUSED SWATCHES before saving. In a freshly-created document a SPOT swatch exists ONLY
	 * because the pasted art uses it (Illustrator auto-adds spots with the paste), so every spot is
	 * used. Everything else non-bracketed is the new-doc default junk (process White/Black/CMYK
	 * presets) — unused, and process fills never reference a swatch by name anyway. Keep [None] /
	 * [Registration], keep spots, remove the rest.
	 */
	try {
		for (var swi = newDoc.swatches.length - 1; swi >= 0; swi--) {
			var swx = newDoc.swatches[swi];
			var swxName = String(swx && swx.name != null ? swx.name : "");
			if (swxName.charAt(0) === "[") continue;
			var swxColor = null;
			try { swxColor = swx.color; } catch (swcErr) { swxColor = null; }
			if (swxColor && swxColor.typename === "SpotColor") continue;
			try { swx.remove(); } catch (swrErr) { }
		}
	} catch (swErr) { }

	/*
	 * Decoration inks, authoritative pass: the exported doc's remaining SPOT swatches. The manual
	 * selection walk above misses spots used via text, gradient stops, patterns, or deeply nested /
	 * clipped structures — but Illustrator adds a spot swatch to the new doc for EVERY spot the
	 * pasted art actually uses, so the swatches panel is the reliable source. Union (walk kept as
	 * fallback ordering for plain-path art).
	 */
	try {
		for (var dsi = 0; dsi < newDoc.swatches.length; dsi++) {
			var dsw = newDoc.swatches[dsi];
			var dswName = String(dsw && dsw.name != null ? dsw.name : "");
			if (!dswName || dswName.charAt(0) === "[") continue;
			var dswColor = null;
			try { dswColor = dsw.color; } catch (dscErr) { dswColor = null; }
			if (!dswColor || dswColor.typename !== "SpotColor") continue;
			if (easIsExcludedSwatchName(dswName)) continue;
			if (!colorSeen[dswName]) { colorSeen[dswName] = true; colors.push(dswName); }
		}
	} catch (dsErr) { }

	try {
		newDoc.saveAs(aiFile);
	} catch (saveErr) {
		return easErr("Could not save exported AI: " + (saveErr.message || saveErr));
	}

	/*
	 * Close the exported document now that it is saved. Nothing downstream needs it OPEN — the
	 * separation reads the .ai from disk by path (placeAndEmbedGraphicAI), not from the open document.
	 * Leaving it open put an unrelated document in front of the user and fired documentAfterActivate,
	 * which the Standalone tab then had to defend against. SAVECHANGES.DONOTSAVECHANGES because
	 * saveAs above already wrote the file; the original document is re-activated so focus returns to
	 * what the user was working on.
	 */
	try { newDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (closeErr) { }
	try { if (doc) app.activeDocument = doc; } catch (actErr) { }

	return JSON.stringify({
		success: true,
		assetsPath: assets.fsName,
		filePath: aiFile.fsName,
		fileName: aiFile.name,
		colors: colors
	});
}
`;
