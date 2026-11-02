/** M1.4.1: Git-aware byte-verified eligible-source inventory. No parser or repository mutations. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve, relative, sep, extname } from 'node:path';
const run = promisify(execFile);
const sha = buf => createHash('sha256').update(buf).digest('hex');
const LANGUAGE = Object.freeze({'.php':'php','.ts':'typescript','.mts':'typescript','.cts':'typescript','.tsx':'tsx'});
const fail = (code, reason) => Object.assign(new Error(`${code}: ${reason}`), {code});

export function classifySource(path) {
  if (path.endsWith('.blade.php')) return null; // template parser not supported in this spike
  const parts = path.split('/');
  if (parts.some(p => ['node_modules','.git','vendor','dist','.next','coverage'].includes(p))) return null;
  return LANGUAGE[extname(path).toLowerCase()] ?? null;
}
function validateRelative(path) {
  if (!path || path.includes('\\') || path.includes('\0') || isAbsolute(path) || /^[A-Za-z]:/.test(path) || path.split('/').some(s=>!s || s==='.' || s==='..')) throw fail('INVALID_SOURCE_PATH', path);
  return path;
}
async function git(args, cwd, encoding='utf8') {
  try {
    const {stdout} = await run('git', args, {cwd, encoding, maxBuffer: 16 * 1024 * 1024});
    return stdout;
  } catch (err) {
    throw fail('GIT_INVENTORY_UNAVAILABLE', `${err.code || err.message}`);
  }
}
export async function inventoryGitCheckout(checkoutRoot) {
  const root = await realpath(resolve(checkoutRoot));
  const top = (await git(['rev-parse', '--show-toplevel'],root)).trim();
  if (await realpath(top) !== root) throw fail('NOT_CHECKOUT_ROOT', root);
  // Tracked, staged, modified and eligible untracked files; excludes ignored untracked files.
  // Git's NUL-delimited paths protect spaces, tabs, and literal newlines in names.
  const output = await git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'],root,'buffer');
  const paths = [...new Set(output.toString('utf8').split('\0').filter(Boolean))].sort((a,b)=>Buffer.compare(Buffer.from(a),Buffer.from(b)));
  const files=[];
  for (const path of paths) {
    validateRelative(path);
    const language = classifySource(path);
    if (!language) continue;
    const abs=join(root,path);
    let stat;
    try {stat=await lstat(abs);} catch (err) {
      if(err.code==='ENOENT')continue; // staged but deleted from worktree: not currently indexable
      throw err;
    }
    if(!stat.isFile() || stat.isSymbolicLink())continue; // no symlink targets, even inside repo
    const actual=await realpath(abs);
    const rel=relative(root,actual);
    if(rel.startsWith('..'+sep) || rel==='..' || isAbsolute(rel)) throw fail('SOURCE_ESCAPE',path);
    let bytes;
    try {bytes=await readFile(actual);} catch(err) {
      if(err.code==='ENOENT')throw fail('SOURCE_CHANGED_DURING_SCAN',path);
      throw err;
    }
    try {new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {throw fail('INVALID_UTF8_SOURCE',path);}
    files.push({file:path,language,contentHash:sha(bytes),bytes});
  }
  return {root,files};
}
export async function verifySourceInventory(initial) {
  const later=await inventoryGitCheckout(initial.root);
  const a=initial.files.map(f=>[f.file,f.language,f.contentHash]);
  const b=later.files.map(f=>[f.file,f.language,f.contentHash]);
  if(JSON.stringify(a)!==JSON.stringify(b))throw fail('SOURCE_CHANGED_DURING_INDEX','working-tree source inventory changed before publication');
  return {files:later.files.length,assurance:'content-hash-verified-at-check'};
}
