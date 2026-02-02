// get-spot-swatches.jsx
function getAllSpotSwatches() {
 var doc = app.activeDocument;
 var result = [];

 for (var i = 0; i < doc.swatches.length; i++) {
  var swatch = doc.swatches[i];

  if (!swatch.color) continue;

  // Only Spot Colors
  if (swatch.color.typename === 'SpotColor') {
   var name = swatch.name;

   // Exclude compound inks like UB, White UB, etc.
   if (!isCompoundInk(name)) {
    result.push(name);
   }
  }
 }

 return result.join(',');
}

function isCompoundInk(name) {
 // Customize this if needed
 return /\bUB\b/i.test(name);
}

getAllSpotSwatches();

$.writeln('Spot Swatches:', spotcolors);
