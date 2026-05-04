function getSpotSwatchNames() {
 if (app.documents.length === 0) {
  return [];
 }

 var doc = app.activeDocument;
 var result = [];

 for (var i = 0; i < doc.swatches.length; i++) {
  var sw = doc.swatches[i];

  if (sw.color && sw.color.typename === 'SpotColor') {
   result.push(sw.name);
  }
 }

 return result.join(', ');
}

// Example usage:
var spotSwatchNames = getSpotSwatchNames();
$.writeln('Spot swatches:', spotSwatchNames);
