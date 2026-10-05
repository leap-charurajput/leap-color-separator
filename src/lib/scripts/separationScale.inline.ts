/*
 * ExtendScript (host) helpers for the Edit dialog's "Scale graphic to … %" option.
 *
 * Inline host code run via evalScript — NOT a JSX edit — so this ships with a normal panel deploy
 * (docs/TODO.md → "prefer INLINE host code"). It calls JSX globals the loaded extension already
 * defines (xmpModifier, getSeparationStatusFromDoc, SEP_STATUS_PREPARED).
 *
 * WHY THIS EXISTS (2026-10-02): the scale was collected by the Edit dialog and stored on the version
 * document as profileMetadata.graphicScalePercent, but nothing ever read it back — no step of the
 * separation scaled the art, and reopening Edit always showed the box unticked at 100. It was a
 * write-only field.
 *
 * MEANING: the value is a percent OF THE ORIGINAL SIZE — 100 = unchanged, 120 = 20% larger,
 * 80 = 20% smaller. That is what Illustrator's own Object > Transform > Scale uses, what the
 * dialog's default of 100 already implied, and what Illustrator's resize() takes.
 *
 * Every function returns a JSON string and never throws.
 */
export const separationScaleHostCode = `
function ssErr(m) { return JSON.stringify({ success: false, error: String(m) }); }

function ssTrim(v) { return String(v == null ? "" : v).replace(/^\\s+|\\s+$/g, ""); }

/*
 * The saved settings of every separation group recorded on the ACTIVE (version) document, from
 * LEAPSeparationProfileData. The JSX handleLoadSeparationPaths drops profileMetadata, so the scale
 * is not available to the panel any other way without a JSX change.
 */
function ssReadSeparationEntries() {
	try {
		if (!app.documents.length) {
			return JSON.stringify({ success: true, entries: [] });
		}
		var doc = app.activeDocument;
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
		if (!xmp.isXmpCreated || !xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
			return JSON.stringify({ success: true, entries: [] });
		}
		var raw = xmp.getStructField("LEAPSeparationProfileData", true);
		var out = [];
		if (raw && raw.length) {
			for (var i = 0; i < raw.length; i++) {
				var e = raw[i];
				if (!e) continue;
				var meta = e.profileMetadata || {};
				var scale = meta.graphicScalePercent;
				out.push({
					graphicName: ssTrim(e.graphicName),
					profileName: ssTrim(meta.profileName),
					/* Separate same-profile group id ("" = the primary group). */
					groupId: ssTrim(meta.separationGroupId),
					graphicScalePercent: (scale != null && !isNaN(Number(scale))) ? Number(scale) : null,
					separatedDocumentPath: ssTrim(e.separatedDocumentPath)
				});
			}
		}
		return JSON.stringify({ success: true, entries: out });
	} catch (e) {
		return ssErr(e.message || e);
	}
}

/*
 * Scale the art Prepare just placed: the SIZED_ART > SIZED_GRAPHICS item named after the graphic, in
 * the ACTIVE document, which must be a PREPARED SEP document — never the version document, never a
 * finished separation.
 *
 * Anchored at TOP-CENTRE, because that is how Prepare positions the art: horizontally centred on the
 * SEP_ART guide with its top edge on the guide's top (placeLiveArtGraphicIntoSepDoc). Scaling about
 * the centre would push the top of a scaled-up graphic above the print area. Stroke widths scale with
 * the art, so the result looks like the original, just larger or smaller — strokes are outlined at
 * Generate, and unscaled strokes would come out relatively thinner or thicker.
 */
function ssScalePreparedGraphic(params) {
	try {
		var name = ssTrim(params && params.graphicName);
		var pct = Number(params && params.percent);
		if (!name) return ssErr("No graphic name");
		if (!(pct > 0)) return ssErr("Invalid scale: " + (params && params.percent));
		if (pct === 100) return JSON.stringify({ success: true, skipped: true, reason: "100% = original size" });
		if (!app.documents.length) return ssErr("No document open");

		var doc = app.activeDocument;
		var status = "";
		try { status = getSeparationStatusFromDoc(doc); } catch (eStatus) { status = ""; }
		if (status !== SEP_STATUS_PREPARED) {
			return ssErr("The active document is not a prepared SEP document (status: " + (status || "none") + ")");
		}

		var sizedArt = null;
		var sizedGraphics = null;
		try { sizedArt = doc.layers.getByName("SIZED_ART"); } catch (eSa) { return ssErr("SIZED_ART layer not found"); }
		try { sizedGraphics = sizedArt.layers.getByName("SIZED_GRAPHICS"); } catch (eSg) { return ssErr("SIZED_GRAPHICS layer not found"); }

		var target = null;
		for (var i = 0; i < sizedGraphics.pageItems.length; i++) {
			var it = sizedGraphics.pageItems[i];
			if (it && ssTrim(it.name) === name) { target = it; break; }
		}
		if (!target) return ssErr("No item named '" + name + "' in SIZED_GRAPHICS");

		/* Unlock just long enough to transform, then put every flag back as it was. */
		var restore = [];
		function unlock(obj) {
			try {
				if (obj && obj.locked) { restore.push(obj); obj.locked = false; }
			} catch (eL) { }
		}
		unlock(sizedArt);
		unlock(sizedGraphics);
		var targetWasLocked = false;
		try { targetWasLocked = !!target.locked; if (targetWasLocked) target.locked = false; } catch (eTl) { }

		var before = [target.width, target.height];
		try {
			/*
			 * Mask-safe: a scripted resize() scaled the art but NOT its opacity masks, so a graphic with a
			 * distress/transparency mask came out with the mask at its old size. lcsMaskSafeTransform scales
			 * through a symbol instance and returns the new item (same name, same place in the stack).
			 */
			target = lcsMaskSafeTransform(doc, target, 0, 0, pct, Transformation.TOP);
		} finally {
			try { if (targetWasLocked) target.locked = true; } catch (eTr) { }
			for (var r = restore.length - 1; r >= 0; r--) {
				try { restore[r].locked = true; } catch (eR) { }
			}
		}
		var after = [target.width, target.height];

		try { doc.save(); } catch (eSave) { }
		try { appendLeapSepLog("Prepare: scaled '" + name + "' to " + pct + "% (" + Math.round(before[0]) + "x" + Math.round(before[1]) + " -> " + Math.round(after[0]) + "x" + Math.round(after[1]) + " pt)"); } catch (eLog) { }
		return JSON.stringify({ success: true, percent: pct, before: before, after: after });
	} catch (e) {
		return ssErr(e.message || e);
	}
}
`;
