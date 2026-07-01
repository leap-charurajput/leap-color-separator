export const csInterface = new (window as any).CSInterface();
export const fs = new (window as any).cep_node.require('fs');

function compactEvalResult(res: unknown): string | undefined {
  if (res == null) return undefined;
  if (typeof res !== 'string') return undefined;
  const trimmed = res.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed;
  }
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object') {
      const summary: Record<string, unknown> = { success: parsed['success'] };
      if (parsed['error']) summary['error'] = parsed['error'];
      if (parsed['message']) summary['message'] = parsed['message'];
      if (Array.isArray(parsed['layerNames'])) {
        summary['plates'] = (parsed['layerNames'] as unknown[]).length;
      }
      if (parsed['separatedDocumentPath']) {
        summary['sepFile'] = String(parsed['separatedDocumentPath']).split('/').pop();
      }
      return JSON.stringify(summary);
    }
  } catch {
    /* not JSON */
  }
  return trimmed.length > 120 ? trimmed.slice(0, 120) + '…' : trimmed;
}

function leapSepsLogEval(level: string, message: string, detail?: unknown): void {
  const w = (window as any).leapSepsWrite;
  if (typeof w === 'function') {
    w(level, 'ExtendScript', message, detail);
  }
}

function evalScriptLabel(script: unknown): string {
  if (typeof script !== 'string') return 'evalScript';
  if (script.indexOf('unusedsw') !== -1 || script.indexOf('swtchdel') !== -1) {
    return 'removeUnusedSwatches';
  }
  if (script.indexOf('checkSeparatedDocument') !== -1 || script.indexOf('handleCheckSeparatedDocument') !== -1) {
    return 'checkSeparatedDocument';
  }
  if (script.indexOf('handlePerformSeparation') !== -1) {
    return 'performSeparation';
  }
  if (script.indexOf('09 SEPARATIONS') !== -1) {
    return 'openSeparationDocument';
  }
  return 'evalScript';
}

export async function evalScript(script: any) {
  const label = evalScriptLabel(script);
  leapSepsLogEval('PROCESS', label + ' start');

  let res: unknown;
  try {
    res = await new Promise((resolve, reject) => {
      csInterface.evalScript(script, function (result: any) {
        if (result !== 'null') {
          resolve(result);
        } else {
          resolve(null);
        }
      });
    });
    leapSepsLogEval('PROCESS', label + ' done', compactEvalResult(res));
  } catch (err) {
    leapSepsLogEval('ERROR', label + ' failed', err instanceof Error ? err.message : err);
    throw err;
  }
  return res;
}

const getAllFilesRecursively = (dir: string, baseDir: string): string[] => {
  const results: string[] = [];
  const entries: string[] = fs.readdirSync(dir);
  for (const entry of entries) {
    const fullPath = dir + '/' + entry;
    const relativePath = fullPath.replace(baseDir + '/', '');
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...getAllFilesRecursively(fullPath, baseDir));
    } else {
      results.push(relativePath);
    }
  }
  return results;
};

export const checkForJSXUpdates = async (
  origin: string
): Promise<'no_update' | 'update_available' | 'update_done' | 'update_error'> => {
  try {
    let updateStatus: 'no_update' | 'update_available' | 'update_done' | 'update_error' = 'no_update';
    const normalizedOrigin = String(origin || '').replace(/\/+$/, '');
    const remoteVersionFileURL = normalizedOrigin + '/jsx/version.json';
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
    if (remoteJsxVersion > localJsxVersion) {
      updateStatus = 'update_available';

      let filesToUpdate: string[];
      if (updatedFiles === 'all') {
        filesToUpdate = getAllFilesRecursively(localJSXRoot, localJSXRoot);
      } else {
        filesToUpdate = updatedFiles as string[];
      }

      for (const file of filesToUpdate) {
        const remoteFileURL = normalizedOrigin + '/jsx/' + file;
        const remoteFile = await fetch(remoteFileURL);
        const remoteFileContent = await remoteFile.text();
        const localFilePath = localJSXRoot + '/' + file;
        const localFileDir = localFilePath.substring(0, localFilePath.lastIndexOf('/'));
        if (!fs.existsSync(localFileDir)) {
          fs.mkdirSync(localFileDir, { recursive: true });
        }
        fs.writeFileSync(localFilePath, remoteFileContent, 'utf8');
      }

      jsonData = JSON.stringify({ jsxVersion: remoteJsxVersion }, null, 2);
      fs.writeFileSync(localJSXRoot + '/version.json', jsonData, 'utf8');
      updateStatus = 'update_done';
    } else {
      console.log(
        'remote version is same or less than local version',
        remoteJsxVersion,
        localJsxVersion
      );
    }
    return updateStatus;
  } catch (err) {
    console.error('check update status ref', { err });
    return 'update_error';
  }
};
