import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

/*
 * NN Pro XMP compatibility repair, run on the ACTIVE document after one of OUR XMP writes.
 *
 * NN Pro writes its metadata as RAW ELEMENTS spliced into doc.XMPString
 * (<xmp:LEAP_XMP_META>{json}</xmp:LEAP_XMP_META>, plus colorSepsConfig / LEAP_PLAYER_META /
 * factoryFileConfig / prototypeRotations / Exported_timestamp) and reads them back with plain
 * string search — NOT the XMP toolkit. Our xmpModifier commits (Graphics Done, standalone-job
 * write) re-serialize the whole packet in COMPACT RDF, which turns those simple properties into
 * rdf:Description ATTRIBUTES (xmp:LEAP_XMP_META="...") — invisible to NN Pro's reader (and to
 * our own element regex).
 *
 * This script converts each such attribute BACK to the element form NN Pro wrote: it removes the
 * attribute, unescapes the attribute-level XML escaping (restoring the exact string NN Pro
 * spliced, including LEAP_PLAYER_META's own pre-escaping), and re-inserts the element before the
 * first </rdf:Description> — the same insertion point NN Pro's setXMPMetadata uses. No-op when
 * every key is already in element form (e.g. on LEAP documents), so callers can run it blindly.
 *
 * Saves the document only when something actually changed.
 */
export async function restoreNNProXmpElements(): Promise<any> {
	const script =
		polyfillsCode +
		`
(function () {
	function decodeAttr(text) {
		return String(text)
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&");
	}
	try {
		if (app.documents.length === 0) {
			return JSON.stringify({ success: true, changed: false, reason: "no document" });
		}
		var doc = app.activeDocument;
		var xmpString = "";
		try { xmpString = doc.XMPString || ""; } catch (eX) { xmpString = ""; }
		if (!xmpString) {
			return JSON.stringify({ success: true, changed: false, reason: "no XMP" });
		}
		var keys = [
			"LEAP_XMP_META",
			"colorSepsConfig",
			"LEAP_PLAYER_META",
			"factoryFileConfig",
			"prototypeRotations",
			"Exported_timestamp"
		];
		var restored = [];
		for (var i = 0; i < keys.length; i++) {
			var key = keys[i];
			if (xmpString.indexOf("<xmp:" + key + ">") !== -1) continue; /* element form intact */
			var attrRe = new RegExp("\\\\s?xmp:" + key + '="([^"]*)"');
			var m = xmpString.match(attrRe);
			if (!m) continue; /* key not present at all */
			var value = decodeAttr(m[1]);
			xmpString = xmpString.replace(attrRe, "");
			var closeIdx = xmpString.indexOf("</rdf:Description>");
			if (closeIdx === -1) continue;
			xmpString =
				xmpString.substring(0, closeIdx) +
				"<xmp:" + key + ">" + value + "</xmp:" + key + ">" +
				xmpString.substring(closeIdx);
			restored.push(key);
		}
		if (restored.length === 0) {
			return JSON.stringify({ success: true, changed: false });
		}
		doc.XMPString = xmpString;
		try { doc.save(); } catch (eSave) { }
		return JSON.stringify({ success: true, changed: true, restored: restored });
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || String(e) });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') {
			return { success: false, error: 'restoreNNProXmpElements returned no result' };
		}
		return JSON.parse(String(result));
	} catch (e: any) {
		return { success: false, error: e?.message || String(e) };
	}
}
