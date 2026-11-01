import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync, spawnSync} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require = createRequire(import.meta.url);
let ts;
function typescript() {
  if (ts) return ts;
  try {ts=require('typescript');return ts} catch {}
  const globalRoot=execFileSync('npm',['root','-g'],{encoding:'utf8'}).trim();
  ts=require(join(globalRoot,'typescript'));
  return ts;
}
const hash = s=>createHash('sha256').update(s).digest('hex');
const id = (...values)=>hash(JSON.stringify(values)).slice(0,24);
function rangeOf(source, startByte, endByte) {
  const bytes = Buffer.from(source,'utf8');
  const line = pos => 1 + bytes.subarray(0,pos).filter(x=>x===10).length;
  return {startByte,endByte,startLine:line(startByte),endLine:line(endByte)};
}
function finish(language,file,source,raw) {
  const contentHash=hash(source);
  function normalize(record,kind) {
    const r={...record,range:rangeOf(source,record.range.startByte,record.range.endByte)};
    return {...r,id:`${kind}:`+id(file,contentHash,r.range.startByte,r.range.endByte,r.kind??r.role,r.name??r.spelling)};
  }
  const declarations=raw.declarations.map(x=>normalize(x,'d')).sort((a,b)=>a.range.startByte-b.range.startByte||a.id.localeCompare(b.id));
  const references=raw.references.map(x=>normalize(x,'r')).sort((a,b)=>a.range.startByte-b.range.startByte||a.id.localeCompare(b.id));
  return {file,language,contentHash,declarations,references,relations:[],diagnostics:raw.diagnostics,
    coverage:{declarations:raw.diagnostics.length && language==='php'?'failed':'partial',references:'partial',calls:'partial'}};
}
function extractTypeScript(file,source) {
  const t=typescript();
  const sk=file.endsWith('.tsx') ? t.ScriptKind.TSX : t.ScriptKind.TS;
  const root=t.createSourceFile(file,source,t.ScriptTarget.Latest,true,sk);
  const declarations=[];const references=[];
  const byteOffset=off=>Buffer.byteLength(source.slice(0,off),'utf8');
  const loc=(start,end)=>({startByte:byteOffset(start),endByte:byteOffset(end)});
  function visit(node) {
    let kind;
    if(t.isInterfaceDeclaration(node)) kind='interface';
    else if(t.isClassDeclaration(node)) kind='class';
    else if(t.isFunctionDeclaration(node)) kind='function';
    else if(t.isMethodDeclaration(node)) kind='method';
    if(kind && node.name) declarations.push({kind,name:node.name.text,
        languageSyntaxKind:t.SyntaxKind[node.kind],range:loc(node.getStart(root),node.end)});
    if(t.isImportDeclaration(node) && node.importClause?.namedBindings && t.isNamedImports(node.importClause.namedBindings)) {
      for(const element of node.importClause.namedBindings.elements) {
        const original=element.propertyName??element.name;
        references.push({role:'import',spelling:original.text,
           alias:element.name.text,module:node.moduleSpecifier.text,range:loc(original.getStart(root),element.name.end)});
      }
    }
    if(t.isCallExpression(node)){
      references.push({role:'call',spelling:node.expression.getText(root),range:loc(node.expression.getStart(root),node.expression.end),
        resolutionStatus:'unresolved'});
    }
    t.forEachChild(node,visit);
  }
  visit(root);
  const diagnostics=root.parseDiagnostics.map(d=>({code:'TS_PARSE_ERROR',message:t.flattenDiagnosticMessageText(d.messageText,' '),startByte:byteOffset(d.start??0)}));
  return finish('typescript',file,source,{declarations,references,diagnostics});
}
function extractPhp(file,source){
  const script=join(dirname(fileURLToPath(import.meta.url)),'php-tokenize.php');
  const p=spawnSync('php',[script],{input:source,encoding:'utf8',maxBuffer:2*1024*1024});
  if(p.error || p.status!==0) throw new Error('PHP_TOKENIZER_UNAVAILABLE: '+(p.error?.message??p.stderr));
  return finish('php',file,source,JSON.parse(p.stdout));
}
export function extract(language,file,source){
  if(language==='typescript')return extractTypeScript(file,source);
  if(language==='php')return extractPhp(file,source);
  throw new Error(`UNSUPPORTED_LANGUAGE:${language}`);
}
