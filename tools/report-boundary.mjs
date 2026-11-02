/** Keep all acceptance evidence in regular files under the repository's reports/ tree.
 * Reject existing symlinks, including safe-looking ones: evidence writes must not
 * follow caller-controlled filesystem aliases. This is a static guard, not a
 * guarantee against hostile filesystem replacement races. */
import { lstatSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const invalid=message=>Object.assign(new Error(`UNSAFE_REPORT_PATH: ${message}`),{code:'UNSAFE_REPORT_PATH'});

export function assertSafeReportDestination(projectRoot,requestedOutput){
 const root=resolve(projectRoot),target=resolve(root,requestedOutput);
 const rel=relative(root,target);
 const segments=rel.split(sep);
 if(!rel || isAbsolute(rel) || segments[0]!=='reports' || segments.length<2 || segments.some(x=>x==='..'))
   throw invalid('Report output must be a file beneath reports/');
 let current=root;
 for(let i=0;i<segments.length;i++){
   current=join(current,segments[i]);
   let st;
   try{st=lstatSync(current);}catch(e){if(e.code==='ENOENT')continue;throw e;}
   if(st.isSymbolicLink())throw invalid(`Symlinked output component: ${segments[i]}`);
   if(i<segments.length-1 && !st.isDirectory())throw invalid(`Non-directory output component: ${segments[i]}`);
   if(i===segments.length-1 && !st.isFile())throw invalid('Output must be a regular file');
 }
 return target;
}
