import { file, type TemplateFile } from "../shared.js";

// Stagio-inspired quality gates — adapted for ghostinit monorepo/single + nextjs/tanstack/expo/desktop

function checkFeatureFolderContent(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function resolveRoots() {
  const candidates = [
    path.join(process.cwd(), "src", "app"),
    path.join(process.cwd(), "apps", "web", "src", "app"),
    path.join(process.cwd(), "apps", "web", "src"),
  ];
  const roots = [];
  for (const r of candidates) if (fs.existsSync(r)) roots.push(r);
  if (roots.length === 0) {
    const alt = path.join(process.cwd(), "src");
    if (fs.existsSync(alt)) roots.push(alt);
  }
  return roots.length ? roots : [path.join(process.cwd(), "src")];
}

const MAX_STANDALONE_LINES = 150;
const MAX_ORCHESTRATOR_LINES = 120;
const MAX_SECTION_LINES = 200;

function listTsxFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { listTsxFiles(fp, files); continue; }
    if (!e.isFile() || !e.name.endsWith(".tsx")) continue;
    if (e.name.endsWith(".test.tsx")) continue;
    files.push(fp);
  }
  return files;
}
function rel(p) { return p.replaceAll("\\\\", "/").replace(process.cwd().replaceAll("\\\\","/")+"/",""); }
function linesOf(fp) { return fs.readFileSync(fp,"utf8").split(/\\r?\\n/).length; }
function isOrchestrator(fp) { const c = fs.readFileSync(fp,"utf8"); return (c.match(/import .*from.*_components/g) || []).length >= 3 || /SearchFilters|Dashboard|View/.test(path.basename(fp)); }

function main() {
  const roots = resolveRoots();
  const files = [];
  for (const r of roots) listTsxFiles(r, files);
  if (files.length === 0) { console.log("feature-folder check passed (no files)."); return; }
  const violations = [];
  for (const fp of files) {
    const loc = linesOf(fp);
    const isOrch = isOrchestrator(fp);
    const limit = isOrch ? MAX_ORCHESTRATOR_LINES : MAX_STANDALONE_LINES;
    // allow larger for page orchestrators with sections
    const effective = /page\\.tsx$|layout\\.tsx$/.test(fp) ? MAX_SECTION_LINES : limit;
    if (loc > effective) violations.push({ file: rel(fp), lines: loc, limit: effective });
  }
  if (violations.length === 0) { console.log("feature-folder check passed."); return; }
  console.error("Feature-folder size violations (<150 standalone, <120 orchestrator, <200 section):");
  for (const v of violations) console.error(\`  \${v.file}: \${v.lines} lines (limit \${v.limit})\`);
  process.exit(1);
}
main();
`;
}

function checkServerOnlyContent(): string {
  return `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ROOTS = [path.join(process.cwd(),"src","server"), path.join(process.cwd(),"packages","services","src"), path.join(process.cwd(),"src","server","services")];
const EXT = /\\.(ts|js)$/;
function collect(dir, out) { if (!fs.existsSync(dir)) return; for (const e of fs.readdirSync(dir,{withFileTypes:true})) { const p=path.join(dir,e.name); if(e.isDirectory()) collect(p,out); else if(e.isFile() && EXT.test(e.name) && !e.name.endsWith(".test.ts")) out.push(p); } }
function hasServerOnly(c) { return /^import\\s+["'](?:server-only|@tanstack\\/react-start\\/server-only)["']/m.test(c); }
function main() {
  const files=[]; for(const r of ROOTS) collect(r, files);
  if(files.length===0){ console.log("server-only check passed (no service files)."); return; }
  const violations=[];
  for(const fp of files){ const c=fs.readFileSync(fp,"utf8"); if(!hasServerOnly(c)) violations.push(path.relative(process.cwd(),fp).replaceAll("\\\\","/")); }
  if(violations.length===0){ console.log("server-only import check passed."); return; }
  console.error("Missing 'import \\"server-only\\"' in service files:"); for(const v of violations) console.error("  "+v);
  process.exit(1);
}
main();
`;
}

function checkImportAliasesContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
let ts; try{ ts=require("typescript"); } catch{ console.log("Import alias check skipped (typescript not installed)."); process.exit(0); }
function roots(){ const cands=[path.join(process.cwd(),"src"), path.join(process.cwd(),"apps","web","src")]; return cands.filter(fs.existsSync); }
const TARGET=new Set([".ts",".tsx"]); const STYLE=[".css",".scss",".sass",".less"];
function toPosix(p){return p.replaceAll("\\\\","/");}
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile() && TARGET.has(path.extname(e.name))) out.push(p);} return out; }
function isRel(s){return s.startsWith("./")||s.startsWith("../");}
function isStyle(s){return STYLE.some(e=>s.endsWith(e));}
function kind(fp){return fp.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS;}
function add(node,sf,text,fp,root,viol){ if(!node||!ts.isStringLiteral(node)) return; const spec=node.text; if(!isRel(spec)||isStyle(spec)) return; const target=path.resolve(path.dirname(fp),spec); const relTarget=path.relative(root,target); if(relTarget===""||(!relTarget.startsWith("..")&&!path.isAbsolute(relTarget))) return; const {line,character}=sf.getLineAndCharacterOfPosition(node.getStart(sf)); viol.push({file:toPosix(path.relative(process.cwd(),fp)), line:line+1, column:character+1, spec:text.slice(node.getStart(sf),node.getEnd())});}
function main(){
  const dirs=roots(); if(dirs.length===0){console.error("Missing src root");process.exit(1);}
  const files=dirs.flatMap(d=>list(d)); const viol=[];
  for(const fp of files){ const root=dirs.find(d=>fp===d||fp.startsWith(d+path.sep)); const txt=fs.readFileSync(fp,"utf8"); const sf=ts.createSourceFile(fp,txt,ts.ScriptTarget.Latest,true,kind(fp)); function visit(n){ if(ts.isImportDeclaration(n)) add(n.moduleSpecifier,sf,txt,fp,root,viol); else if(ts.isExportDeclaration(n) && n.moduleSpecifier) add(n.moduleSpecifier,sf,txt,fp,root,viol); ts.forEachChild(n,visit);} visit(sf); }
  if(viol.length===0){console.log("Import alias check passed."); return;}
  console.error("Relative imports may not escape their source root. Use a declared package alias:"); for(const v of viol) console.error(\`\${v.file}:\${v.line}:\${v.column} \${v.spec}\`);
  process.exit(1);
}
main();
`;
}

function checkNextParityContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
let ts; try{ ts=require("typescript"); } catch{ console.log("Next parity check skipped (typescript not installed)."); process.exit(0); }
const APP_ROOTS=[path.join(process.cwd(),"src","app"), path.join(process.cwd(),"apps","web","src","app")].filter(fs.existsSync);
if(APP_ROOTS.length===0){ console.log("Next parity check passed (no app dir)."); process.exit(0); }
const EXT=new Set([".ts",".tsx"]);
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&&EXT.has(path.extname(e.name))) out.push(p);} return out; }
function toPosix(p){return p.replaceAll("\\\\","/");}
function rel(p){return toPosix(path.relative(process.cwd(),p));}
function kind(fp){return fp.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS;}
function tagName(n){ if(ts.isIdentifier(n)) return n.text; if(ts.isJsxNamespacedName(n)) return n.namespace.text+":"+n.name.text; return null; }
function attr(attrs, name){ for(const a of attrs.properties){ if(!ts.isJsxAttribute(a)) continue; if(a.name.text===name) return a; } return null; }
function strVal(a){ if(!a?.initializer) return null; if(ts.isStringLiteral(a.initializer)) return a.initializer.text; if(!ts.isJsxExpression(a.initializer)) return null; const e=a.initializer.expression; if(!e) return null; if(ts.isStringLiteral(e)||ts.isNoSubstitutionTemplateLiteral(e)) return e.text; return null; }
function main(){
const files=APP_ROOTS.flatMap(r=>list(r));
const violations=[];
for(const fp of files){
  const txt=fs.readFileSync(fp,"utf8");
  const sf=ts.createSourceFile(fp,txt,ts.ScriptTarget.Latest,true,kind(fp));
  function visit(n){
    if(ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)){
      const tag = ts.isJsxElement(n)? tagName(n.openingElement.tagName): tagName(n.tagName);
      if(tag==="img"){
        const allowList = new Set();
        const relPath=rel(fp);
        if(!allowList.has(relPath)) violations.push({file:relPath, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1, msg: "Use next/image <Image> instead of <img> for optimization"});
      }
      if(tag==="a"){
        const hrefAttr = ts.isJsxElement(n)? attr(n.openingElement.attributes,"href"): attr(n.attributes,"href");
        const href = hrefAttr? strVal(hrefAttr): null;
        if(href && href.startsWith("/") && !href.startsWith("//") && !fp.includes("global-error")) violations.push({file:rel(fp), line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1, msg: "Use Link from @/i18n/routing instead of <a href=\\""+href+"\\"> for locale-aware routing"});
      }
    }
    ts.forEachChild(n, visit);
  }
  visit(sf);
}
if(violations.length===0){ console.log("Next parity check passed."); return; }
console.error("Next parity violations:"); for(const v of violations) console.error(\`  \${v.file}:\${v.line} \${v.msg}\`);
process.exit(1);
}
main();
`;
}

function checkNavigationImportsContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
let ts; try{ ts=require("typescript"); } catch{ console.log("Navigation imports check skipped (typescript not installed)."); process.exit(0); }
function roots(){ const cands=[path.join(process.cwd(),"src"), path.join(process.cwd(),"apps","web","src")]; return cands.filter(fs.existsSync); }
const ALLOWED=new Set(["useSearchParams","useParams","redirect","permanentRedirect","notFound","usePathname"]);
const ALLOWLIST=new Set(["src/i18n/routing.ts","src/i18n/request.ts","src/app/[locale]/layout.tsx","src/app/layout.tsx","apps/web/src/i18n/routing.ts","apps/web/src/i18n/request.ts","apps/web/src/app/[locale]/layout.tsx","apps/web/src/app/layout.tsx"]);
function toPosix(p){return p.replaceAll("\\\\","/");}
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&& (p.endsWith(".ts")||p.endsWith(".tsx"))) out.push(p);} return out; }
function kind(fp){return fp.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS;}
function getSpec(node){ if(!ts.isImportDeclaration(node)) return null; const ms=node.moduleSpecifier; if(!ts.isStringLiteral(ms)) return null; const src=ms.text; const b=node.importClause?.namedBindings; if(!b||!ts.isNamedImports(b)) return {source:src,names:[]}; const names=b.elements.map(el=>el.propertyName?.text ?? el.name.text); return {source:src,names}; }
function main(){
  const dirs=roots(); if(dirs.length===0){ console.log("navigation imports check passed (no src)."); return; }
  const hasI18n=dirs.some(d=>fs.existsSync(path.join(d,"i18n","routing.ts"))); if(!hasI18n){ console.log("Navigation imports check passed (i18n disabled)."); return; }
  const files=dirs.flatMap(d=>list(d)); const viol=[];
  for(const fp of files){
    const rel=toPosix(path.relative(process.cwd(),fp)); if(ALLOWLIST.has(rel)) continue;
    const txt=fs.readFileSync(fp,"utf8"); const sf=ts.createSourceFile(fp,txt,ts.ScriptTarget.Latest,true,kind(fp));
    ts.forEachChild(sf, node=>{
      const info=getSpec(node); if(!info) return;
      if(info.source==="next/link") viol.push({file:rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1, msg: 'Import from "next/link". Use "@/i18n/routing" instead'});
      if(info.source==="next/navigation"){ for(const n of info.names){ if(!ALLOWED.has(n)) viol.push({file:rel, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line+1, msg: 'Import "'+n+'" from "next/navigation" should come from "@/i18n/routing"'}); } }
    });
  }
  if(viol.length===0){ console.log("Navigation imports check passed."); return; }
  console.error("Navigation import violations:"); for(const v of viol) console.error(\`  \${v.file}:\${v.line} \${v.msg}\`);
  process.exit(1);
}
main();
`;
}

function checkRtlLogicalContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
function roots(){ return [path.join(process.cwd(),"src","components"), path.join(process.cwd(),"src","app","[locale]"), path.join(process.cwd(),"apps","web","src","components"), path.join(process.cwd(),"apps","web","src","app","[locale]")].filter(fs.existsSync); }
const EXT=/\\.(tsx|ts|jsx|js)$/;
const PATTERNS=[{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*text-left(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*text-right(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*border-l(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*border-r(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*rounded-l(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*rounded-r(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*-?ml-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*-?mr-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*pl-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s)(?:[^\\s"'\\x60]+:)*pr-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/}];
const EXCEPT=[/data-\\[side=(left|right)\\]/];
function hasToken(l){ return PATTERNS.some(tp=>tp.pattern.test(l)); }
function hasExcept(l){ return EXCEPT.some(p=>p.test(l)); }
function collect(dir,out){ if(!fs.existsSync(dir)) return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) collect(p,out); else if(e.isFile()&&EXT.test(e.name)) out.push(p);} }
function main(){
  const rootsList=roots(); if(rootsList.length===0){ console.log("RTL logical check passed (no dirs)."); return; }
  const files=[]; for(const d of rootsList) collect(d,files);
  const viol=[];
  for(const fp of files){ const lines=fs.readFileSync(fp,"utf8").split(/\\r?\\n/); for(let i=0;i<lines.length;i++){ const l=lines[i]; if(!hasToken(l)||hasExcept(l)) continue; viol.push({file:path.relative(process.cwd(),fp).replaceAll("\\\\","/"), line:i+1, text:l.trim().slice(0,120)}); }}
  if(viol.length===0){ console.log("RTL logical direction check passed."); return; }
  console.error("RTL violations (use logical properties text-start/end, ms/me, ps/pe, border-s/e):"); for(const v of viol) console.error(\`  \${v.file}:\${v.line} \${v.text}\`);
  process.exit(1);
}
main();
`;
}

function checkAnimationImportsContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
function roots(){ return [path.join(process.cwd(),"src","components"), path.join(process.cwd(),"src","app","[locale]"), path.join(process.cwd(),"apps","web","src","components"), path.join(process.cwd(),"apps","web","src","app","[locale]")].filter(fs.existsSync); }
const EXT=/\\.(tsx|ts|jsx|js)$/;
const PATTERNS=[/initial=\\{\\{\\s*opacity\\s*:\\s*0\\s*,\\s*y\\s*:\\s*\\d+\\s*\\}\\}/, /animate=\\{\\{\\s*opacity\\s*:\\s*1\\s*,\\s*y\\s*:\\s*0\\s*\\}\\}/];
const EXCEPT=new Set(["src/lib/animations.ts","apps/web/src/lib/animations.ts"]);
function shouldSkip(fp){ const n=path.relative(process.cwd(),fp).replaceAll("\\\\","/"); if(EXCEPT.has(n)) return true; if(n.endsWith(".test.tsx")||n.endsWith(".test.ts")) return true; return false; }
function collect(dir,out){ if(!fs.existsSync(dir)) return; for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) collect(p,out); else if(e.isFile()&&EXT.test(e.name)) out.push(p);} }
function hasImport(c){ return /from\\s+["']@\\/lib\\/animations["']/.test(c); }
function findInline(c){ for(const p of PATTERNS){ const m=p.exec(c); if(m) return m[0]; } return null; }
function main(){
  const rootsList=roots(); if(rootsList.length===0){ console.log("Animation imports check passed."); return; }
  const files=[]; for(const d of rootsList) collect(d,files);
  const viol=[];
  for(const fp of files){ if(shouldSkip(fp)) continue; const c=fs.readFileSync(fp,"utf8"); if(hasImport(c)) continue; const inl=findInline(c); if(!inl) continue; const lines=c.split(/\\r?\\n/); let ln=1; for(let i=0;i<lines.length;i++) if(lines[i].includes(inl.slice(0,20))){ ln=i+1; break; } viol.push({file:path.relative(process.cwd(),fp).replaceAll("\\\\","/"), line:ln, snippet: inl.slice(0,60)}); }
  if(viol.length===0){ console.log("Animation imports check passed."); return; }
  console.error("Animation violations (use @/lib/animations reveal instead of inline):"); for(const v of viol) console.error(\`  \${v.file}:\${v.line} \${v.snippet}\`);
  process.exit(1);
}
main();
`;
}

export function lintScriptFiles(): TemplateFile[] {
  return [
    file("scripts/check-feature-folder.cjs", checkFeatureFolderContent()),
    file("scripts/check-server-only.cjs", checkServerOnlyContent()),
    file("scripts/check-import-aliases.cjs", checkImportAliasesContent()),
    file("scripts/check-next-parity.cjs", checkNextParityContent()),
    file("scripts/check-navigation-imports.cjs", checkNavigationImportsContent()),
    file("scripts/check-rtl-logical.cjs", checkRtlLogicalContent()),
    file("scripts/check-animation-imports.cjs", checkAnimationImportsContent()),
  ];
}
