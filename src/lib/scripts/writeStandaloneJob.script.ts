import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

/*
 * INLINE replacement for the JSX handleWriteStandaloneJobToXmp — same contract, FIXED upsert
 * identity. The shipped JSX matches an existing entry only when exportedFilePath is NON-EMPTY
 * (`if (key) { ... }`), so Done-flow jobs (exportedFilePath "") were appended on every Done —
 * duplicate rows on the Separations tab. Identity here:
 *   - exportedFilePath present  -> exportedFilePath + profileName   (unchanged legacy behavior)
 *   - exportedFilePath empty    -> position + profileName           (Done-flow jobs)
 * Inline so it ships with the panel (no ZXP); it reuses the JSX globals findOpenDocumentByPath
 * and xmpModifier, exactly like the other inline host code.
 */
export async function writeStandaloneJobDedup(job: any, documentPath?: string): Promise<any> {
	const paramsJson = JSON.stringify({ job: job || {}, documentPath: documentPath || '' });
	const script =
		polyfillsCode +
		`
(function () {
	try {
		var params = ${paramsJson};
		var job = params.job || {};
		var doc = null;
		try {
			if (params.documentPath && typeof findOpenDocumentByPath === "function") {
				doc = findOpenDocumentByPath(params.documentPath);
			}
		} catch (eFind) { doc = null; }
		if (!doc) {
			if (app.documents.length === 0) {
				return JSON.stringify({ success: false, error: "No document is open" });
			}
			doc = app.activeDocument;
		}
		var docFile = null;
		try { docFile = doc.fullName ? new File(doc.fullName) : null; } catch (eF) { docFile = null; }
		if (!docFile || !docFile.exists) {
			return JSON.stringify({
				success: false,
				unsaved: true,
				error: "The document must be saved before a standalone job can be recorded on it."
			});
		}

		var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
		if (!xmp.isXmpCreated) {
			return JSON.stringify({ success: false, error: "Could not open the document XMP" });
		}
		var jobs = [];
		try {
			var raw = xmp.getStructField("LEAPStandaloneJobs", true);
			if (raw && raw instanceof Array) jobs = raw;
		} catch (eRead) { jobs = []; }

		var keyFile = job.exportedFilePath != null ? String(job.exportedFilePath) : "";
		var keyPos = job.position != null ? String(job.position) : "";
		var keyProfile = job.profileName != null ? String(job.profileName) : "";
		var replacedAt = -1;
		for (var i = 0; i < jobs.length; i++) {
			var existing = jobs[i] || {};
			var exFile = existing.exportedFilePath != null ? String(existing.exportedFilePath) : "";
			var exPos = existing.position != null ? String(existing.position) : "";
			var exProfile = existing.profileName != null ? String(existing.profileName) : "";
			var matched = keyFile !== ""
				? (exFile === keyFile && exProfile === keyProfile)
				: (exFile === "" && exPos === keyPos && exProfile === keyProfile);
			if (matched) { replacedAt = i; break; }
		}
		if (replacedAt >= 0) { jobs[replacedAt] = job; } else { jobs.push(job); }

		xmp.setStructField("LEAPStandaloneJobs", jobs, true, false);
		xmp.commit();
		var saved = false;
		try { doc.save(); saved = true; } catch (eSave) { }
		return JSON.stringify({
			success: true,
			documentPath: doc.fullName.fsName,
			jobCount: jobs.length,
			replaced: replacedAt >= 0,
			documentSaved: saved
		});
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || String(e) });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') {
			return { success: false, error: 'writeStandaloneJobDedup returned no result' };
		}
		return JSON.parse(String(result));
	} catch (e: any) {
		return { success: false, error: e?.message || String(e) };
	}
}
