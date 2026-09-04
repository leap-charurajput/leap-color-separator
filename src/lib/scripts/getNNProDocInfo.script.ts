import { evalScript } from '../../libs/helper';
import { polyfillsCode } from './polyfills';

/*
 * NN Pro document detection + color-seps config, read from the ACTIVE document's XMP.
 *
 * NN Pro writes its metadata as RAW elements spliced into doc.XMPString (namespace prefix "xmp:"),
 * e.g.  <xmp:LEAP_XMP_META>{"Plugin":"LEAP NN",...,"Document_Type":"NN Pro Product",...}</xmp:LEAP_XMP_META>
 *       <xmp:colorSepsConfig>{"positions":[{"artboard":"FRONT","position":"FRONT","abbv":"FT"},...]}</xmp:colorSepsConfig>
 *       <xmp:LEAP_PLAYER_META>...player row JSON, XML-escaped (&amp; &lt; &gt; only)...</xmp:LEAP_PLAYER_META>
 * That is a DIFFERENT mechanism from this panel's xmpModifier struct fields (namespace
 * http://my.LEAPColorSeparator), so we read it with a regex over XMPString — the same way NN Pro
 * itself writes it — rather than through xmpModifier.
 *
 * Returns (JSON): {
 *   success, hasDocument,
 *   isNNProProduct,            // Document_Type === "NN Pro Product"
 *   documentType,              // raw Document_Type when LEAP_XMP_META exists ("" otherwise)
 *   meta,                      // parsed LEAP_XMP_META object or null
 *   colorSepsConfig,           // parsed colorSepsConfig object or null (old products: absent)
 *   playerMeta,                // parsed LEAP_PLAYER_META row or null (old products: absent —
 *                              //   fall back to Metadata/<product>.json, see readNNProMetadata)
 *   documentPath, documentName // fsName + basename (documentPath "" for never-saved docs)
 * }
 */
export async function getNNProDocInfo(): Promise<any> {
	const script =
		polyfillsCode +
		`
(function () {
	function decodeXmlEntities(text) {
		return String(text)
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'")
			.replace(/&lt;/g, "<")
			.replace(/&gt;/g, ">")
			.replace(/&amp;/g, "&");
	}
	function readXmpElement(xmpString, tagName) {
		try {
			var re = new RegExp("<xmp:" + tagName + ">([\\\\s\\\\S]*?)</xmp:" + tagName + ">");
			var m = String(xmpString || "").match(re);
			if (!m || !m[1]) return null;
			var raw = decodeXmlEntities(m[1]);
			try { return JSON.parse(raw); } catch (eParse) { return null; }
		} catch (e) { return null; }
	}
	/*
	 * Read an NN Pro value in EITHER form. NN Pro splices RAW ELEMENTS — but after any of OUR
	 * xmpModifier commits (Graphics Done, standalone-job write) the packet is re-serialized in
	 * COMPACT RDF, which turns simple properties into rdf:Description ATTRIBUTES
	 * (xmp:LEAP_XMP_META="..."). The regex only sees the element form; the XMP toolkit reads both,
	 * so it is the fallback. LEAP_PLAYER_META is double-handled: NN Pro pre-escapes its JSON, so a
	 * failed parse is retried after entity-decoding.
	 */
	function readNNProValue(xmpString, key) {
		var fromElement = readXmpElement(xmpString, key);
		if (fromElement !== null) return fromElement;
		try {
			if (ExternalObject.AdobeXMPScript == undefined) {
				ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
			}
			var xmpMeta = new XMPMeta(String(xmpString || ""));
			var prop = xmpMeta.getProperty("http://ns.adobe.com/xap/1.0/", key);
			if (!prop || prop.value == null || String(prop.value) === "") return null;
			var raw = String(prop.value);
			try { return JSON.parse(raw); } catch (e1) { }
			try { return JSON.parse(decodeXmlEntities(raw)); } catch (e2) { }
			return null;
		} catch (eXmp) { return null; }
	}
	try {
		if (app.documents.length === 0) {
			return JSON.stringify({ success: true, hasDocument: false, isNNProProduct: false });
		}
		var doc = app.activeDocument;
		var xmpString = "";
		try { xmpString = doc.XMPString || ""; } catch (eX) { xmpString = ""; }
		var meta = readNNProValue(xmpString, "LEAP_XMP_META");
		var colorSepsConfig = readNNProValue(xmpString, "colorSepsConfig");
		var playerMeta = readNNProValue(xmpString, "LEAP_PLAYER_META");
		var documentType = meta && meta.Document_Type != null ? String(meta.Document_Type) : "";
		var documentPath = "";
		try { documentPath = doc.fullName ? doc.fullName.fsName : ""; } catch (eP) { documentPath = ""; }
		return JSON.stringify({
			success: true,
			hasDocument: true,
			isNNProProduct: documentType === "NN Pro Product",
			documentType: documentType,
			meta: meta,
			colorSepsConfig: colorSepsConfig,
			playerMeta: playerMeta,
			documentPath: documentPath,
			documentName: doc.name
		});
	} catch (e) {
		return JSON.stringify({ success: false, error: e.message || String(e) });
	}
})();
`;

	try {
		const result = await evalScript(script);
		if (!result || String(result).trim() === '') {
			return { success: false, error: 'getNNProDocInfo returned no result' };
		}
		return JSON.parse(String(result));
	} catch (e: any) {
		return { success: false, error: e?.message || String(e) };
	}
}
