function getAppVersion() {
 var settingsFolder = Folder(Folder.myDocuments + '/LEAP Settings');
 var filePath = settingsFolder + '/ColorSep_Folder_Paths.json';
 var file = new File(filePath);

 if (file.exists && file.open('r')) {
  var content = file.read();
  file.close();

  try {
   // Wrap content in parentheses so eval returns the object
   var data = eval('(' + content + ')');
   return data.origin || '';
  } catch (e) {
   return '';
  }
 } else {
  return '';
 }
}

var vk = getAppVersion();
$.writeln('App Version: ' + vk);
