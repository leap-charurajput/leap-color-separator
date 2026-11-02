import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

/*
 * "Duplicate Separation File for another Style" + the standalone job helpers the Separations tab needs
 * to show a SEP file link on standalone / NN Pro rows (2026-10-19).
 *
 * Inline host code run via evalScript — NOT a JSX edit — so it ships with a normal panel deploy. It
 * calls JSX globals the loaded extension already defines (xmpModifier, findOpenDocumentByPath,
 * leapSeparationEntryMatches, appendLeapSepLog).
 *
 * Every function returns a JSON string and never throws.
 */
const duplicateSepFileHostCode = `
function dsfErr(m, extra) {
	var out = { success: false, error: String(m) };
	if (extra) { for (var k in extra) { if (extra.hasOwnProperty(k)) out[k] = extra[k]; } }
	return JSON.stringify(out);
}

function dsfTrim(v) { return String(v == null ? "" : v).replace(/^\\s+|\\s+$/g, ""); }

function dsfLog(m) { try { appendLeapSepLog("Duplicate SEP file: " + m); } catch (e) { } }

function dsfNormPath(p) { return dsfTrim(p).split("\\\\").join("/").toLowerCase(); }

/* An open document for this path, or null. */
function dsfOpenDocFor(path) {
	var wanted = dsfNormPath(path);
	for (var d = 0; d < app.documents.length; d++) {
		var doc = app.documents[d];
		try {
			if (doc && doc.fullName && dsfNormPath(doc.fullName.fsName) === wanted) return doc;
		} catch (e) { }
	}
	return null;
}

/* Same version-document lookup the JSX entry handlers use (01 TEAMOUTS, not 09 SEPARATIONS). */
function dsfFindVersionDocument() {
	function isVersion(doc) {
		try {
			var p = doc.fullName.fsName;
			return p.indexOf("01 TEAMOUTS") !== -1 && p.indexOf("09 SEPARATIONS") === -1;
		} catch (e) { return false; }
	}
	if (app.documents.length && isVersion(app.activeDocument)) return app.activeDocument;
	for (var d = 0; d < app.documents.length; d++) {
		if (isVersion(app.documents[d])) return app.documents[d];
	}
	return null;
}

function dsfDocIsSaved(doc) {
	try { return !!(doc && doc.fullName && new File(doc.fullName).exists); } catch (e) { return false; }
}

/* Every page item directly in this layer and in all its sublayers. */
function dsfCollectItems(layer, out) {
	for (var i = 0; i < layer.pageItems.length; i++) out.push(layer.pageItems[i]);
	for (var s = 0; s < layer.layers.length; s++) dsfCollectItems(layer.layers[s], out);
	return out;
}

/* Unlock + show this layer and its sublayers; returns the list to restore. */
function dsfOpenLayers(layer, restore) {
	restore.push({ layer: layer, locked: layer.locked, visible: layer.visible });
	try { if (layer.locked) layer.locked = false; } catch (e1) { }
	try { if (!layer.visible) layer.visible = true; } catch (e2) { }
	for (var s = 0; s < layer.layers.length; s++) dsfOpenLayers(layer.layers[s], restore);
	return restore;
}

/*
 * Scale ALL the given items as ONE unit, anchored at the TOP-CENTRE of their combined bounds (the way
 * Prepare positions art). Each item is scaled, then moved so it keeps its place relative to the
 * anchor — that keeps every plate in register. Strokes scale with the art.
 */
function dsfScaleItemsTogether(items, pct) {
	if (!items.length) return { scaled: 0 };
	var L = null, T = null, R = null, B = null;
	for (var i = 0; i < items.length; i++) {
		var gb = items[i].geometricBounds;
		if (L === null || gb[0] < L) L = gb[0];
		if (T === null || gb[1] > T) T = gb[1];
		if (R === null || gb[2] > R) R = gb[2];
		if (B === null || gb[3] < B) B = gb[3];
	}
	var ax = (L + R) / 2;
	var ay = T;
	var s = pct / 100;
	var before = [R - L, T - B];
	for (var j = 0; j < items.length; j++) {
		var it = items[j];
		var wasLocked = false, wasHidden = false;
		try { wasLocked = !!it.locked; if (wasLocked) it.locked = false; } catch (eL) { }
		try { wasHidden = !!it.hidden; if (wasHidden) it.hidden = false; } catch (eH) { }
		var b0 = it.geometricBounds;
		it.resize(pct, pct, true, true, true, true, pct, Transformation.TOPLEFT);
		var b1 = it.geometricBounds;
		var wantL = ax + (b0[0] - ax) * s;
		var wantT = ay + (b0[1] - ay) * s;
		it.translate(wantL - b1[0], wantT - b1[1]);
		try { if (wasHidden) it.hidden = true; } catch (eH2) { }
		try { if (wasLocked) it.locked = true; } catch (eL2) { }
	}
	return { scaled: items.length, before: before, after: [before[0] * s, before[1] * s] };
}

/*
 * Resize the art in a SEP document: SEPARATED_ART (all plates together) for a generated file; a file
 * that was only Prepared has nothing there yet, so its SIZED_ART > SIZED_GRAPHICS art is scaled instead.
 */
function dsfScaleSepDocArt(doc, pct) {
	var layer = null;
	var items = [];
	try { layer = doc.layers.getByName("SEPARATED_ART"); } catch (e1) { layer = null; }
	if (layer) items = dsfCollectItems(layer, []);
	var which = "SEPARATED_ART";
	if (!items.length) {
		layer = null;
		try { layer = doc.layers.getByName("SIZED_ART").layers.getByName("SIZED_GRAPHICS"); } catch (e2) { layer = null; }
		if (layer) items = dsfCollectItems(layer, []);
		which = "SIZED_GRAPHICS";
	}
	if (!items.length) {
		throw new Error("No artwork found in SEPARATED_ART or SIZED_GRAPHICS to resize");
	}
	/* Open the target layer AND its parents (SIZED_GRAPHICS sits in SIZED_ART). */
	var restore = [];
	var p = layer.parent;
	while (p && p.typename === "Layer") {
		restore.push({ layer: p, locked: p.locked, visible: p.visible });
		try { if (p.locked) p.locked = false; } catch (eP1) { }
		try { if (!p.visible) p.visible = true; } catch (eP2) { }
		p = p.parent;
	}
	dsfOpenLayers(layer, restore);
	var res;
	try {
		res = dsfScaleItemsTogether(items, pct);
	} finally {
		for (var r = restore.length - 1; r >= 0; r--) {
			try { restore[r].layer.visible = restore[r].visible; } catch (eR1) { }
			try { restore[r].layer.locked = restore[r].locked; } catch (eR2) { }
		}
	}
	res.layer = which;
	return res;
}

/*
 * Point the copy at its NEW row, so it stands on its own:
 *   - SeparationProfileMetadata: styleCodes (Export reads them), and for a LEAP row the new row's
 *     separationGroupId + graphicScalePercent — Generate on the copy records into the row these name;
 *     without the group id it overwrote the ORIGINAL row's file path;
 *   - LEAPPreparedContext.styleCodes (what Generate on a prepared copy carries forward).
 * stamp: { groupId?: string, scalePercent?: number|null } — keys absent = leave as they are.
 * Returns the style codes the copy had BEFORE, for the sheet-text swap.
 */
function dsfStampCopyForNewRow(doc, newStyle, stamp) {
	var oldStyles = [];
	try {
		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
		if (!xmp.isXmpCreated) return oldStyles;
		if (xmp.doesStructFieldExist("SeparationProfileMetadata")) {
			var meta = xmp.getStructField("SeparationProfileMetadata", true) || {};
			if (meta.styleCodes instanceof Array) oldStyles = meta.styleCodes.slice(0);
			meta.styleCodes = [newStyle];
			if (stamp && stamp.hasOwnProperty("groupId")) meta.separationGroupId = stamp.groupId;
			if (stamp && stamp.hasOwnProperty("scalePercent")) {
				if (stamp.scalePercent == null) { try { delete meta.graphicScalePercent; } catch (eDel) { meta.graphicScalePercent = null; } }
				else meta.graphicScalePercent = stamp.scalePercent;
			}
			xmp.setStructField("SeparationProfileMetadata", meta, true, false);
		}
		if (xmp.doesStructFieldExist("LEAPPreparedContext")) {
			var ctx = xmp.getStructField("LEAPPreparedContext", true) || {};
			if (!oldStyles.length && ctx.styleCodes instanceof Array) oldStyles = ctx.styleCodes.slice(0);
			ctx.styleCodes = [newStyle];
			xmp.setStructField("LEAPPreparedContext", ctx, true, false);
		}
		xmp.commit();
	} catch (e) { dsfLog("could not update the copy's metadata: " + (e.message || e)); }
	return oldStyles;
}

/*
 * Swap the old style for the new one in the copy's printed text ([STYLE_CODE], item IDs, …) — Prepare
 * wrote those once, so a copy otherwise still printed the old style. Same rule as the file-name swap:
 * the old code at the START of a word, so "CM52-0484" and "CM520484" both change, "ABCM52" does not.
 * Only plain codes (letters, digits, "-", "_") are swapped. Returns the number of text frames changed.
 */
function dsfReplaceStyleText(doc, oldStyles, newStyle) {
	var res = [];
	for (var s = 0; s < oldStyles.length; s++) {
		var code = dsfTrim(String(oldStyles[s] || "").split(",")[0]);
		if (code && /^[A-Za-z0-9_-]+$/.test(code) && code.toLowerCase() !== newStyle.toLowerCase()) {
			res.push(new RegExp("(^|[^A-Za-z0-9])" + code, "gi"));
		}
	}
	if (!res.length) return 0;
	var changed = 0;
	for (var i = 0; i < doc.textFrames.length; i++) {
		var tf = doc.textFrames[i];
		var before = "";
		try { before = String(tf.contents); } catch (eC) { continue; }
		var after = before;
		for (var r = 0; r < res.length; r++) {
			after = after.replace(res[r], function (m, lead) { return lead + newStyle; });
		}
		if (after === before) continue;
		/* Locked / hidden layers and frames refuse edits — open them for the write, then restore. */
		var restore = [];
		var p = tf.layer;
		while (p && p.typename === "Layer") {
			restore.push({ obj: p, locked: p.locked, visible: p.visible, isLayer: true });
			try { if (p.locked) p.locked = false; } catch (eL) { }
			try { if (!p.visible) p.visible = true; } catch (eV) { }
			p = p.parent;
		}
		var wasLocked = false;
		try { wasLocked = !!tf.locked; if (wasLocked) tf.locked = false; } catch (eTl) { }
		try { tf.contents = after; changed++; } catch (eW) { dsfLog("could not update text '" + before + "': " + (eW.message || eW)); }
		try { if (wasLocked) tf.locked = true; } catch (eTl2) { }
		for (var k = restore.length - 1; k >= 0; k--) {
			try { restore[k].obj.visible = restore[k].visible; } catch (eRv) { }
			try { restore[k].obj.locked = restore[k].locked; } catch (eRl) { }
		}
	}
	return changed;
}

function dsfDeepCopy(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }

/*
 * params: { sourcePath, fileName, newStyle, scalePercent (null = no resize),
 *           target: { kind: "leap", graphicName, profileName, groupId }
 *                 | { kind: "standalone", job } }
 * Copies the SEP file (the original is never changed), stamps the new style on the copy, resizes it when
 * asked, and records it as a NEW row. Any failure removes the copy again, so nothing is left half-made.
 */
function dsfDuplicateForStyle(params) {
	var prevActive = null;
	try { prevActive = app.documents.length ? app.activeDocument : null; } catch (eA) { prevActive = null; }
	var destFile = null;
	var copyDoc = null;
	function rollback() {
		try { if (copyDoc) copyDoc.close(SaveOptions.DONOTSAVECHANGES); } catch (eC) { }
		copyDoc = null;
		try { if (destFile && destFile.exists) destFile.remove(); } catch (eD) { }
		try { if (prevActive) prevActive.activate(); } catch (eR) { }
	}
	try {
		var sourcePath = dsfTrim(params.sourcePath);
		var newStyle = dsfTrim(params.newStyle);
		var fileName = dsfTrim(params.fileName);
		var pct = params.scalePercent != null ? Number(params.scalePercent) : null;
		var target = params.target || {};

		if (!newStyle) return dsfErr("Style number is required");
		if (!fileName) return dsfErr("File name is required");
		if (/[\\/\\\\:]/.test(fileName)) return dsfErr("The file name cannot contain / \\\\ or :");
		if (!/\\.ai$/i.test(fileName)) fileName += ".ai";
		if (pct != null && (isNaN(pct) || pct < 10 || pct > 400)) return dsfErr("Invalid scale: " + params.scalePercent);

		var srcFile = new File(sourcePath);
		if (!sourcePath || !srcFile.exists) return dsfErr("Separation file not found: " + sourcePath);
		var openSrc = dsfOpenDocFor(srcFile.fsName);
		if (openSrc && !openSrc.saved) {
			return dsfErr("The separation file is open with unsaved changes. Save it first, then duplicate.");
		}

		/* Find where the new row will be recorded BEFORE touching the disk. */
		var recordDoc = null;
		var entries = null;
		var srcIdx = -1;
		var recordXmp = null;
		var newGroupId = "";
		var combinedScale = null;
		if (target.kind === "leap") {
			if (typeof leapSeparationGroupsSupported !== "function") {
				return dsfErr("The installed LEAP Seps extension is too old for this. Please update it.");
			}
			recordDoc = dsfFindVersionDocument();
			if (!recordDoc) return dsfErr("No version document is open");
			recordXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", recordDoc);
			if (!recordXmp.isXmpCreated || !recordXmp.doesStructFieldExist("LEAPSeparationProfileData")) {
				return dsfErr("No separation data on the version document");
			}
			entries = recordXmp.getStructField("LEAPSeparationProfileData", true);
			if (!(entries instanceof Array)) return dsfErr("Separation data on the version document is not a list");
			for (var i = 0; i < entries.length; i++) {
				if (leapSeparationEntryMatches(entries[i], target.graphicName, target.profileName, target.groupId || "")) { srcIdx = i; break; }
			}
			if (srcIdx < 0) return dsfErr("This separation is not recorded on the version document");
			/* The new row's identity, decided now so the copy and the row carry the SAME values. */
			newGroupId = "g" + (new Date()).getTime().toString(36) + Math.floor(Math.random() * 1296).toString(36);
			/* Scale is a percent of the ORIGINAL art, so a re-Prepare reproduces this size. */
			var srcMeta = entries[srcIdx].profileMetadata || {};
			var baseScale = Number(srcMeta.graphicScalePercent);
			if (isNaN(baseScale) || !(baseScale > 0)) baseScale = 100;
			combinedScale = pct != null ? Math.round(baseScale * pct) / 100 : baseScale;
			if (combinedScale === 100) combinedScale = null;
		} else if (target.kind === "standalone") {
			if (!target.job) return dsfErr("No job given");
			if (!app.documents.length) return dsfErr("No document is open");
			recordDoc = app.activeDocument;
			if (!dsfDocIsSaved(recordDoc)) return dsfErr("Save the document first");
			recordXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", recordDoc);
			if (!recordXmp.isXmpCreated) return dsfErr("Could not open the document XMP");
			entries = [];
			try {
				var raw = recordXmp.getStructField("LEAPStandaloneJobs", true);
				if (raw instanceof Array) entries = raw;
			} catch (eJ) { entries = []; }
		} else {
			return dsfErr("Unknown target");
		}

		destFile = new File(srcFile.parent.fsName + "/" + fileName);
		if (destFile.exists) {
			var taken = destFile;
			destFile = null;
			return dsfErr("A file named \\"" + taken.name + "\\" already exists in this folder. Choose another name.");
		}
		if (!srcFile.copy(destFile) || !destFile.exists) {
			var failed = destFile;
			destFile = null;
			return dsfErr("Could not copy the separation file to " + failed.fsName);
		}
		dsfLog("copied " + srcFile.fsName + " -> " + destFile.fsName);

		/* Stamp the new row (style, group, scale, context) and the printed style text inside the copy. */
		copyDoc = app.open(destFile);
		var oldStyles = dsfStampCopyForNewRow(
			copyDoc,
			newStyle,
			target.kind === "leap" ? { groupId: newGroupId, scalePercent: combinedScale } : null
		);
		var textChanged = dsfReplaceStyleText(copyDoc, oldStyles, newStyle);
		dsfLog("stamped style " + newStyle + " (was " + oldStyles.join(", ") + "), " + textChanged + " text frame(s) updated");
		var scaleInfo = null;
		if (pct != null && pct !== 100) {
			scaleInfo = dsfScaleSepDocArt(copyDoc, pct);
			dsfLog("scaled " + scaleInfo.layer + " to " + pct + "% (" + scaleInfo.scaled + " items)");
		}
		copyDoc.save();
		copyDoc.close(SaveOptions.DONOTSAVECHANGES);
		copyDoc = null;
		try { if (prevActive) prevActive.activate(); } catch (eBack) { }

		/* Record the new row. */
		var destPath = destFile.fsName;
		if (target.kind === "leap") {
			var src = entries[srcIdx];
			var meta = dsfDeepCopy(src.profileMetadata);
			meta.styleCodes = [newStyle];
			meta.separationGroupId = newGroupId;
			if (combinedScale == null) { try { delete meta.graphicScalePercent; } catch (eDel) { meta.graphicScalePercent = null; } }
			else meta.graphicScalePercent = combinedScale;
			entries.push({ graphicName: src.graphicName, profileMetadata: meta, separatedDocumentPath: destPath });
			recordXmp.setStructField("LEAPSeparationProfileData", entries, true, false);
		} else {
			var job = dsfDeepCopy(target.job);
			job.styleCode = newStyle;
			job.separatedDocumentPath = destPath;
			entries.push(job);
			recordXmp.setStructField("LEAPStandaloneJobs", entries, true, false);
		}
		recordXmp.commit();
		try { recordDoc.save(); } catch (eSave) { }

		return JSON.stringify({
			success: true,
			separatedDocumentPath: destPath,
			scaled: scaleInfo
		});
	} catch (e) {
		var msg = e.message || String(e);
		dsfLog("failed: " + msg);
		rollback();
		return dsfErr(msg);
	}
}

/* Do two standalone jobs describe the same row? Compared field by field, case-insensitive. */
function dsfSameJob(a, b) {
	var fields = ["position", "profileName", "styleCode", "exportedFilePath"];
	for (var i = 0; i < fields.length; i++) {
		if (dsfTrim(a && a[fields[i]]).toLowerCase() !== dsfTrim(b && b[fields[i]]).toLowerCase()) return false;
	}
	return true;
}

function dsfReadJobs(doc) {
	var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
	var jobs = [];
	if (xmp.isXmpCreated) {
		try {
			var raw = xmp.getStructField("LEAPStandaloneJobs", true);
			if (raw instanceof Array) jobs = raw;
		} catch (e) { jobs = []; }
	}
	return { xmp: xmp, jobs: jobs };
}

/*
 * DIAGNOSTICS ONLY (2026-10-26) — why a Prepare found no job to link (NN Pro rows lost Duplicate).
 * Reports which document was read (findOpenDocumentByPath falls back to the ACTIVE document, which
 * right after Prepare is the new SEP file), the open documents, the job Prepare sent, and for every
 * job on the document the fields that differ from it. Changes nothing.
 */
function dsfRecordMissDebug(params, doc, jobs) {
	var fields = ["position", "profileName", "styleCode", "exportedFilePath"];
	function pick(j) {
		var o = {};
		for (var f = 0; f < fields.length; f++) o[fields[f]] = j && j[fields[f]] != null ? String(j[fields[f]]) : "(missing)";
		o.sourceDocumentPath = j && j.sourceDocumentPath != null ? String(j.sourceDocumentPath) : "(missing)";
		return o;
	}
	var readPath = "";
	try { readPath = doc.fullName.fsName; } catch (eP) { readPath = "(unsaved)"; }
	var activePath = "";
	try { activePath = app.activeDocument.fullName.fsName; } catch (eA) { activePath = "(none)"; }
	var openDocs = [];
	for (var d = 0; d < app.documents.length; d++) {
		try { openDocs.push(app.documents[d].fullName.fsName); } catch (eO) { openDocs.push("(unsaved)"); }
	}
	var perJob = [];
	for (var i = 0; i < jobs.length; i++) {
		var diff = [];
		for (var k = 0; k < fields.length; k++) {
			var a = dsfTrim(jobs[i] && jobs[i][fields[k]]).toLowerCase();
			var b = dsfTrim(params.job && params.job[fields[k]]).toLowerCase();
			if (a !== b) diff.push(fields[k]);
		}
		perJob.push({ index: i, differs: diff, job: pick(jobs[i]) });
	}
	return {
		requestedDocumentPath: String(params.documentPath || ""),
		readDocumentPath: readPath,
		readIsRequested: !!params.documentPath && dsfNormPath(readPath) === dsfNormPath(params.documentPath),
		activeDocumentPath: activePath,
		openDocuments: openDocs,
		wanted: pick(params.job),
		jobCount: jobs.length,
		jobs: perJob
	};
}

/*
 * After a standalone Prepare: remember the SEP file on the job's row (source document), so the
 * Separations tab can show its link. params: { documentPath, job, separatedDocumentPath }.
 */
function dsfRecordJobSepPath(params) {
	try {
		/* No path = the active document (the Separations tab lists the active document's rows). */
		var doc = params.documentPath ? findOpenDocumentByPath(params.documentPath) : (app.documents.length ? app.activeDocument : null);
		if (!doc) return dsfErr("The source document is not open");
		if (!dsfDocIsSaved(doc)) return dsfErr("The source document is not saved");
		var r = dsfReadJobs(doc);
		if (!r.xmp.isXmpCreated) return dsfErr("Could not open the document XMP");
		var idx = -1;
		for (var i = 0; i < r.jobs.length; i++) {
			if (dsfSameJob(r.jobs[i], params.job)) { idx = i; break; }
		}
		if (idx < 0) return JSON.stringify({ success: true, recorded: false, debug: dsfRecordMissDebug(params, doc, r.jobs) });
		r.jobs[idx].separatedDocumentPath = dsfTrim(params.separatedDocumentPath);
		r.xmp.setStructField("LEAPStandaloneJobs", r.jobs, true, false);
		r.xmp.commit();
		try { doc.save(); } catch (eSave) { }
		return JSON.stringify({ success: true, recorded: true });
	} catch (e) {
		return dsfErr(e.message || e);
	}
}

/* Remove one standalone job row from the ACTIVE document. params: { job }. */
function dsfDeleteStandaloneJob(params) {
	try {
		if (!app.documents.length) return dsfErr("No document is open");
		var doc = app.activeDocument;
		if (!dsfDocIsSaved(doc)) return dsfErr("Save the document first");
		var r = dsfReadJobs(doc);
		if (!r.xmp.isXmpCreated) return dsfErr("Could not open the document XMP");
		var wantPath = dsfNormPath(params.job && params.job.separatedDocumentPath);
		var idx = -1;
		for (var i = 0; i < r.jobs.length; i++) {
			if (dsfSameJob(r.jobs[i], params.job) && dsfNormPath(r.jobs[i].separatedDocumentPath) === wantPath) { idx = i; break; }
		}
		if (idx < 0) return dsfErr("This row is no longer recorded on the document");
		r.jobs.splice(idx, 1);
		r.xmp.setStructField("LEAPStandaloneJobs", r.jobs, true, false);
		r.xmp.commit();
		try { doc.save(); } catch (eSave) { }
		return JSON.stringify({ success: true, jobCount: r.jobs.length });
	} catch (e) {
		return dsfErr(e.message || e);
	}
}
`;

async function runHost(call: string, params: any): Promise<any> {
	const script =
		polyfillsCode +
		duplicateSepFileHostCode +
		`
(function () {
	try {
		return ${call}(${JSON.stringify(params || {})});
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || String(e) });
	}
})();
`;
	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') {
			return { success: false, error: call + ' returned no result' };
		}
		if (String(result).indexOf('EvalScript error') !== -1) {
			return { success: false, error: String(result) };
		}
		return JSON.parse(String(result));
	} catch (e: any) {
		return { success: false, error: e?.message || String(e) };
	}
}

export interface DuplicateSepFileParams {
	sourcePath: string;
	fileName: string;
	newStyle: string;
	/* Percent of the CURRENT file's size; null = no resize. */
	scalePercent: number | null;
	target:
	| { kind: 'leap'; graphicName: string; profileName: string; groupId?: string }
	| { kind: 'standalone'; job: any };
}

export function duplicateSepFileForStyle(params: DuplicateSepFileParams): Promise<any> {
	return runHost('dsfDuplicateForStyle', params);
}

export function recordStandaloneJobSepPath(documentPath: string, job: any, separatedDocumentPath: string): Promise<any> {
	return runHost('dsfRecordJobSepPath', { documentPath, job, separatedDocumentPath });
}

export function deleteStandaloneJobRow(job: any): Promise<any> {
	return runHost('dsfDeleteStandaloneJob', { job });
}
