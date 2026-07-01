/**
 * ES6/ES5 polyfills for ExtendScript (ES3 host).
 */
export const polyfillsCode = `
try {
	if (typeof app !== "undefined" && app !== null && typeof UserInteractionLevel !== "undefined") {
		app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
	}
} catch (e) {}

if (typeof String.prototype.trim !== 'function') {
	String.prototype.trim = function() {
		return this.replace(/^[\\s\\uFEFF\\xA0]+|[\\s\\uFEFF\\xA0]+$/g, '');
	};
}

if (typeof Array.isArray !== 'function') {
	Array.isArray = function(arg) {
		return Object.prototype.toString.call(arg) === '[object Array]';
	};
}

if (typeof JSON === "undefined") {
	var JSON = {};
}

if (typeof JSON.stringify !== "function") {
	JSON.stringify = function(value) {
		function quote(str) {
			return '"' + String(str).replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"') + '"';
		}
		if (value === null) return "null";
		if (typeof value === "string") return quote(value);
		if (typeof value === "number" || typeof value === "boolean") return String(value);
		if (Object.prototype.toString.call(value) === "[object Array]") {
			var arr = [];
			for (var i = 0; i < value.length; i++) arr.push(JSON.stringify(value[i]));
			return "[" + arr.join(",") + "]";
		}
		if (typeof value === "object") {
			var parts = [];
			for (var k in value) {
				if (value.hasOwnProperty(k)) parts.push(quote(k) + ":" + JSON.stringify(value[k]));
			}
			return "{" + parts.join(",") + "}";
		}
		return "null";
	};
}

if (typeof JSON.parse !== "function") {
	JSON.parse = function(str) {
		return eval("(" + str + ")");
	};
}
`;
