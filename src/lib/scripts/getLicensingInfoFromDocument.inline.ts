/*
 * ExtendScript (host) helper that reads the LICENSING submission sheet embedded in a
 * (non-LEAP) artwork document and returns its label/value pairs as raw strings.
 *
 * Written as an inline host-code string (same pattern as createGraphicFromSelection.inline.ts
 * and the postscript builder) so it runs via evalScript without adding a handler to
 * cep_adapters.jsx. The panel side maps these raw values onto the Standalone form fields.
 *
 * Extraction strategy (robust to two common template layouts):
 *   1) Locate the artboard whose name contains "LICENSING" (falls back to the whole document
 *      when not found) and only consider text frames whose centre sits inside that artboard.
 *   2) For each known label, first try a single-frame "Label: value" match.
 *   3) Otherwise find the label-only frame and pick the nearest text frame to its right on the
 *      same horizontal band (the value column of the two-column submission sheet).
 */
export const getLicensingInfoHostCode = `
/* Known labels on the LICENSING sheet, normalised to lowercase without the trailing colon. */
var LIC_LABELS = [
	{ key: "designName", label: "design name" },
	{ key: "conceptCode", label: "concept code" },
	{ key: "player", label: "player" },
	{ key: "date", label: "date" },
	{ key: "artist", label: "artist" },
	{ key: "productLine", label: "product line" },
	{ key: "teamName", label: "team name" },
	{ key: "style", label: "style" },
	{ key: "color", label: "color" },
	{ key: "orgCode", label: "org code" },
	{ key: "graphicCode", label: "graphic code" },
	{ key: "season", label: "season" },
	{ key: "artRevisions", label: "art revisions" },
	{ key: "placement", label: "placement" }
];

/* Normalise text for label comparison: collapse whitespace, drop trailing colon, lowercase. */
function licNormalize(s) {
	if (s == null) return "";
	var t = String(s).replace(/[\\r\\n]+/g, " ");
	t = t.replace(/^\\s+|\\s+$/g, "");
	t = t.toLowerCase();
	t = t.replace(/:$/, "");
	t = t.replace(/^\\s+|\\s+$/g, "");
	t = t.replace(/\\s+/g, " ");
	return t;
}

/* Clean a value for return: single-line, trimmed (keeps original case). */
function licCleanValue(s) {
	if (s == null) return "";
	var t = String(s).replace(/[\\r\\n]+/g, " ");
	t = t.replace(/^\\s+|\\s+$/g, "");
	return t;
}

/* True when the label matches one of the known labels (used to skip labels as value candidates). */
function licIsKnownLabel(norm) {
	for (var k = 0; k < LIC_LABELS.length; k++) {
		if (norm === LIC_LABELS[k].label) return true;
	}
	return false;
}

function licFindArtboardIndexByName(doc, needle) {
	try {
		for (var i = 0; i < doc.artboards.length; i++) {
			var nm = String(doc.artboards[i].name || "").toLowerCase();
			if (nm.indexOf(needle) !== -1) return i;
		}
	} catch (e) { }
	return -1;
}

/* Vertical overlap test for two geometricBounds ([left, top, right, bottom], top > bottom). */
function licRectsOverlapVertically(a, b) {
	var aTop = a[1], aBottom = a[3], bTop = b[1], bBottom = b[3];
	return !(aBottom > bTop || bBottom > aTop);
}

/* Collect text frames, optionally restricted to those centred inside the artboard bounds. */
function licCollectTextFrames(doc, abBounds) {
	var frames = [];
	try {
		for (var i = 0; i < doc.textFrames.length; i++) {
			var tf = doc.textFrames[i];
			var contents = "";
			try { contents = tf.contents; } catch (e) { contents = ""; }
			var gb;
			try { gb = tf.geometricBounds; } catch (e2) { continue; }
			if (abBounds) {
				var cx = (gb[0] + gb[2]) / 2;
				var cy = (gb[1] + gb[3]) / 2;
				/* artboardRect = [left, top, right, bottom]; top > bottom. */
				if (cx < abBounds[0] || cx > abBounds[2] || cy > abBounds[1] || cy < abBounds[3]) {
					continue;
				}
			}
			frames.push({ contents: contents, bounds: gb });
		}
	} catch (e3) { }
	return frames;
}

function getLicensingInfoRun(params) {
	if (!app.documents.length) {
		return JSON.stringify({ success: false, error: "No active document" });
	}
	var doc = app.activeDocument;

	var abIndex = licFindArtboardIndexByName(doc, "licensing");
	var abBounds = null;
	if (abIndex !== -1) {
		try { abBounds = doc.artboards[abIndex].artboardRect; } catch (e) { abBounds = null; }
	}

	var frames = licCollectTextFrames(doc, abBounds);
	/* Defensive: if artboard-bounded collection found nothing (coordinate quirks), scan all frames. */
	if (!frames.length && abBounds) {
		frames = licCollectTextFrames(doc, null);
	}
	var raw = {};

	for (var li = 0; li < LIC_LABELS.length; li++) {
		var def = LIC_LABELS[li];
		var value = "";

		/* Pass 1 — single frame that holds "Label: value". */
		for (var f = 0; f < frames.length; f++) {
			var full = String(frames[f].contents).replace(/[\\r\\n]+/g, " ").replace(/^\\s+|\\s+$/g, "");
			var lowerFull = full.toLowerCase();
			var idx = lowerFull.indexOf(def.label + ":");
			if (idx !== -1) {
				var after = full.substring(idx + def.label.length + 1).replace(/^\\s+|\\s+$/g, "");
				if (after.length > 0) { value = after; break; }
			}
		}

		/* Pass 2 — label-only frame, then nearest value frame to its right on the same row. */
		if (!value) {
			var labelFrame = null;
			for (var f2 = 0; f2 < frames.length; f2++) {
				if (licNormalize(frames[f2].contents) === def.label) { labelFrame = frames[f2]; break; }
			}
			if (labelFrame) {
				var best = null;
				var bestGap = null;
				for (var f3 = 0; f3 < frames.length; f3++) {
					var cand = frames[f3];
					if (cand === labelFrame) continue;
					var cnorm = licNormalize(cand.contents);
					if (!cnorm || licIsKnownLabel(cnorm)) continue;
					if (!licRectsOverlapVertically(labelFrame.bounds, cand.bounds)) continue;
					var gap = cand.bounds[0] - labelFrame.bounds[2]; /* cand.left - label.right */
					if (gap >= -2) {
						if (best === null || gap < bestGap) { best = cand; bestGap = gap; }
					}
				}
				if (best) value = licCleanValue(best.contents);
			}
		}

		raw[def.key] = value;
	}

	/*
	 * Value frames with their positions. Because the LICENSING labels are OUTLINED (not live
	 * text), the panel maps values to fields by content pattern, using position (top Y) only to
	 * disambiguate the two three-letter codes (Org code vs Artist). x/y are rounded points;
	 * y (top) increases upward, so a larger y is higher on the sheet.
	 */
	var detail = [];
	for (var s = 0; s < frames.length; s++) {
		var b = frames[s].bounds;
		var txt = String(frames[s].contents == null ? "" : frames[s].contents)
			.replace(/[\\r\\n]+/g, " ")
			.replace(/^\\s+|\\s+$/g, "");
		if (!txt.length) continue;
		detail.push({ t: txt, x: Math.round(b[0]), y: Math.round(b[1]) });
	}

	/* Names of all artboards, so we can confirm whether a LICENSING artboard exists. */
	var artboardNames = [];
	try {
		for (var an = 0; an < doc.artboards.length; an++) {
			artboardNames.push(String(doc.artboards[an].name || ""));
		}
	} catch (eAn) { }

	return JSON.stringify({
		success: true,
		artboardFound: abIndex !== -1,
		artboardNames: artboardNames,
		totalTextFrames: doc.textFrames ? doc.textFrames.length : 0,
		frameCount: frames.length,
		frames: detail,
		raw: raw
	});
}
`;
