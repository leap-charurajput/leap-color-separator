export const csInterface = new (window as any).CSInterface();
export const fs = new (window as any).cep_node.require('fs');

export async function evalScript(script: any) {
 let res = await new Promise((resolve, reject) => {
  // console.log("executing evalscript")
  csInterface.evalScript(script, function (result: any) {
   if (result !== 'null') {
    resolve(result);
   } else {
    resolve(null);
   }
  });
 });
 return res;
}

export const checkForJSXUpdates = async (
 origin: string
): Promise<'no_update' | 'update_available' | 'update_done' | 'update_error'> => {
 try {
  let updateStatus: 'no_update' | 'update_available' | 'update_done' | 'update_error' = 'update_available';
  const remoteVersionFileURL = origin + 'jsx/version.json';
  const remoteVersionFile = await fetch(remoteVersionFileURL);
  const { jsxVersion: remoteJsxVersion = 0, updatedFiles = [] } = await remoteVersionFile.json();
  //  console.log('remote version:', remoteJsxVersion);
  // @ts-ignore
  const localJSXRoot = csInterface.getSystemPath(SystemPath.EXTENSION) + '/jsx';
  //@ts-ignore
  var jsonData = '{}';
  try {
   jsonData = fs.readFileSync(localJSXRoot + '/version.json', 'utf8');
  } catch (e) { }
  var { jsxVersion: localJsxVersion = 0 } = JSON.parse(jsonData);
  //  console.log('local version:', localJsxVersion);
  // Always sync jsx files on panel startup/load, regardless of local version.
  for (const file of updatedFiles) {
   const remoteFileURL = origin + '/jsx/' + file;
   const remoteFile = await fetch(remoteFileURL);
   const remoteFileContent = await remoteFile.text();
   fs.writeFileSync(localJSXRoot + '/' + file, remoteFileContent, 'utf8');
  }

  jsonData = JSON.stringify({ jsxVersion: remoteJsxVersion }, null, 2);
  fs.writeFileSync(localJSXRoot + '/version.json', jsonData, 'utf8');

  console.log('jsx sync completed on startup', {
   remoteJsxVersion,
   localJsxVersion,
   syncedFiles: updatedFiles.length
  });
  updateStatus = 'update_done';
  return updateStatus;
 } catch (err) {
  console.error('check update status ref', { err });
  return 'update_error';
 }
};
