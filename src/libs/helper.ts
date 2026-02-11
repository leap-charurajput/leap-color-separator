export const csInterface = new (window as any).CSInterface();

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
