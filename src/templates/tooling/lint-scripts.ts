import { file, type TemplateFile } from "../shared.js";

// @allow-long 430: seven generated checks and their shared parser boundary remain auditable together
// Stagio-inspired quality gates — adapted for ghostinit monorepo/single + nextjs/tanstack/expo/desktop

function oxcContent(): string {
  return `const { parseSync } = require("oxc-parser");
const path = require("node:path");

function toPosix(value) {
  return value.replaceAll("\\\\", "/");
}
function relative(file) {
  return toPosix(path.relative(process.cwd(), file));
}
function language(file) {
  if (file.endsWith(".tsx")) return "tsx";
  if (file.endsWith(".jsx")) return "jsx";
  return undefined;
}
function parseOwned(file, source) {
  const result = parseSync(file, source, { sourceType: "module", lang: language(file) });
  if (result.errors.length > 0) {
    const details = result.errors.map((error) => error.message).join("; ");
    throw new Error(\`Parser diagnostics in \${relative(file)}: \${details}\`);
  }
  return result.program;
}
function walk(root, visit) {
  const stack = [root];
  const seen = new Set();
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
      continue;
    }
    visit(node);
    for (const [key, child] of Object.entries(node)) {
      if (["loc", "range", "start", "end"].includes(key)) continue;
      if (child && typeof child === "object") stack.push(child);
    }
  }
}
function stringValue(node) {
  return node && typeof node === "object" && typeof node.value === "string" ? node.value : null;
}
function sourceValue(node) {
  return stringValue(node?.source);
}
function positionOf(source, node) {
  const end = Number.isInteger(node?.start) ? node.start : 0;
  let line = 1;
  let column = 1;
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else column += 1;
  }
  return { line, column };
}
function importDeclarations(program) {
  const imports = [];
  walk(program, (node) => {
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      sourceValue(node)
    )
      imports.push(node);
  });
  return imports;
}
function moduleReferences(program) {
  const references = [];
  walk(program, (node) => {
    const declarationSource = sourceValue(node);
    if (
      ["ImportDeclaration", "ExportAllDeclaration", "ExportNamedDeclaration"].includes(node.type) &&
      declarationSource
    )
      references.push({ node, specifier: declarationSource, kind: node.type });
    if (node.type === "ImportExpression") {
      const specifier = stringValue(node.source);
      if (specifier) references.push({ node, specifier, kind: "ImportExpression" });
    }
    if (node.type === "CallExpression") {
      const first = node.arguments?.[0];
      const specifier = stringValue(first);
      const isRequire = node.callee?.type === "Identifier" && node.callee.name === "require";
      const isImport = node.callee?.type === "Import";
      if (specifier && (isRequire || isImport)) {
        references.push({ node, specifier, kind: isRequire ? "require" : "import()" });
      }
    }
  });
  return references;
}
function importedNames(node) {
  return (node.specifiers ?? [])
    .filter((specifier) => specifier.type === "ImportSpecifier")
    .map(
      (specifier) => specifier.imported?.name ?? specifier.imported?.value ?? specifier.local?.name,
    )
    .filter((name) => typeof name === "string");
}
function jsxName(node) {
  if (node?.type === "JSXIdentifier") return node.name;
  if (node?.type === "JSXNamespacedName") return \`\${node.namespace.name}:\${node.name.name}\`;
  return null;
}
function jsxAttribute(opening, name) {
  return (
    (opening?.attributes ?? []).find(
      (attribute) => attribute.type === "JSXAttribute" && jsxName(attribute.name) === name,
    ) ?? null
  );
}
function jsxAttributeString(opening, name) {
  const attribute = jsxAttribute(opening, name);
  const value = attribute?.value;
  if (!value) return null;
  if (typeof value.value === "string") return value.value;
  const expression = value.type === "JSXExpressionContainer" ? value.expression : null;
  if (typeof expression?.value === "string") return expression.value;
  if (expression?.type !== "TemplateLiteral" || expression.expressions.length > 0) return null;
  const quasiValue = expression.quasis.length === 1 ? expression.quasis[0]?.value : null;
  return typeof quasiValue?.cooked === "string" ? quasiValue.cooked : (quasiValue?.raw ?? null);
}
function jsxOpenings(program) {
  const openings = [];
  walk(program, (node) => {
    if (node.type === "JSXOpeningElement") openings.push(node);
  });
  return openings;
}
module.exports = {
  importDeclarations,
  importedNames,
  jsxAttribute,
  jsxAttributeString,
  jsxName,
  jsxOpenings,
  parseOwned,
  positionOf,
  relative,
  sourceValue,
  moduleReferences,
  toPosix,
  walk,
};
`;
}

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
function hasServerOnly(c) { return /^import\\s+["']server-only["']/m.test(c); }
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
const {moduleReferences,parseOwned,positionOf,relative}=require("./lib/oxc.cjs");
function roots(){ const cands=[path.join(process.cwd(),"src"), path.join(process.cwd(),"apps","web","src")]; return cands.filter(fs.existsSync); }
const TARGET=new Set([".ts",".tsx"]); const STYLE=[".css",".scss",".sass",".less"];
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile() && TARGET.has(path.extname(e.name))) out.push(p);} return out; }
function isRel(s){return s.startsWith("./")||s.startsWith("../");}
function isStyle(s){return STYLE.some(e=>s.endsWith(e));}
function main(){
  const dirs=roots(); if(dirs.length===0){console.error("Missing src root");process.exit(1);}
  const files=dirs.flatMap(d=>list(d)); const viol=[];
  for(const fp of files){
    const source=fs.readFileSync(fp,"utf8"); const program=parseOwned(fp,source);
    for(const reference of moduleReferences(program)){
      if(!isRel(reference.specifier)||isStyle(reference.specifier)) continue;
      const {line,column}=positionOf(source,reference.node);
      viol.push({file:relative(fp),line,column,spec:JSON.stringify(reference.specifier)});
    }
  }
  if(viol.length===0){console.log("Import alias check passed."); return;}
  console.error("Relative imports forbidden in src/**/*.{ts,tsx}. Use @/ aliases (styles exempt):"); for(const v of viol) console.error(\`\${v.file}:\${v.line}:\${v.column} \${v.spec}\`);
  process.exit(1);
}
try { main(); } catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
`;
}

function checkNextParityContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
const {jsxAttributeString,jsxName,jsxOpenings,parseOwned,positionOf,relative,toPosix}=require("./lib/oxc.cjs");
const EXT=new Set([".ts",".tsx"]);
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&&EXT.has(path.extname(e.name))) out.push(p);} return out; }
function sourceRootFor(file){ const normalized=toPosix(file); const marker=normalized.includes("/apps/web/src/")?"/apps/web/src/":"/src/"; return normalized.slice(0,normalized.indexOf(marker)+marker.length-1); }
function hasI18nRouting(file){ return fs.existsSync(path.join(sourceRootFor(file),"i18n","routing.ts")); }
function main(){
  const appRoots=[path.join(process.cwd(),"src","app"),path.join(process.cwd(),"apps","web","src","app")].filter(fs.existsSync);
  if(appRoots.length===0){ console.log("Next parity check passed (no app dir)."); return; }
  const files=appRoots.flatMap(r=>list(r)); const violations=[];
  for(const fp of files){
    const source=fs.readFileSync(fp,"utf8"); const program=parseOwned(fp,source);
    for(const opening of jsxOpenings(program)){
      const tag=jsxName(opening.name); const {line,column}=positionOf(source,opening);
      if(tag==="img") violations.push({file:relative(fp),line,column,msg:"Use next/image <Image> instead of <img> for optimization"});
      if(tag==="a"){
        const href=jsxAttributeString(opening,"href");
        if(href&&href.startsWith("/")&&!href.startsWith("//")&&!fp.includes("global-error")){
          const remedy=hasI18nRouting(fp)?'"@/i18n/routing"':"next/link";
          violations.push({file:relative(fp),line,column,msg:'Use '+remedy+' instead of <a href="'+href+'"> for internal navigation'});
        }
      }
    }
  }
  if(violations.length===0){ console.log("Next parity check passed."); return; }
  console.error("Next parity violations:"); for(const v of violations) console.error(\`  \${v.file}:\${v.line}:\${v.column} \${v.msg}\`);
  process.exit(1);
}
try { main(); } catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
`;
}

function checkNavigationImportsContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
const {importDeclarations,importedNames,parseOwned,positionOf,relative,sourceValue,toPosix}=require("./lib/oxc.cjs");
function roots(){ const cands=[path.join(process.cwd(),"src"), path.join(process.cwd(),"apps","web","src")]; return cands.filter(fs.existsSync); }
const ALLOWED=new Set(["useSearchParams","useParams","redirect","permanentRedirect","notFound","usePathname"]);
const ALLOWLIST=new Set(["src/i18n/routing.ts","src/i18n/request.ts","src/app/[locale]/layout.tsx","src/app/layout.tsx","apps/web/src/i18n/routing.ts","apps/web/src/i18n/request.ts","apps/web/src/app/[locale]/layout.tsx","apps/web/src/app/layout.tsx"]);
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&& (p.endsWith(".ts")||p.endsWith(".tsx"))) out.push(p);} return out; }
function sourceRootFor(file){ const normalized=toPosix(file); const marker=normalized.includes("/apps/web/src/")?"/apps/web/src/":"/src/"; return normalized.slice(0,normalized.indexOf(marker)+marker.length-1); }
function hasI18nRouting(file){ return fs.existsSync(path.join(sourceRootFor(file),"i18n","routing.ts")); }
function main(){
  const dirs=roots(); if(dirs.length===0){ console.log("navigation imports check passed (no src)."); return; }
  const files=dirs.flatMap(d=>list(d)); const viol=[];
  for(const fp of files){
    const rel=relative(fp); const source=fs.readFileSync(fp,"utf8"); const program=parseOwned(fp,source);
    if(ALLOWLIST.has(rel)) continue;
    if(!hasI18nRouting(fp)) continue;
    for(const node of importDeclarations(program)){
      if(node.type!=="ImportDeclaration") continue;
      const specifier=sourceValue(node); const {line,column}=positionOf(source,node);
      if(specifier==="next/link") viol.push({file:rel,line,column,msg:'Import from "next/link". Use "@/i18n/routing" instead'});
      if(specifier==="next/navigation"){ for(const name of importedNames(node)){ if(!ALLOWED.has(name)) viol.push({file:rel,line,column,msg:'Import "'+name+'" from "next/navigation" should come from "@/i18n/routing"'}); } }
    }
  }
  if(viol.length===0){ console.log("Navigation imports check passed."); return; }
  console.error("Navigation import violations:"); for(const v of viol) console.error(\`  \${v.file}:\${v.line}:\${v.column} \${v.msg}\`);
  process.exit(1);
}
try { main(); } catch (error) {
  const message = error instanceof Error ? error.message : "Unknown parser failure";
  console.error(message);
  process.exit(2);
}
`;
}

function checkRtlLogicalContent(): string {
  return `#!/usr/bin/env node
const fs=require("node:fs"), path=require("node:path");
function roots(){ return [path.join(process.cwd(),"src","components"), path.join(process.cwd(),"src","app","[locale]"), path.join(process.cwd(),"apps","web","src","components"), path.join(process.cwd(),"apps","web","src","app","[locale]")].filter(fs.existsSync); }
const EXT=/\\.(tsx|ts|jsx|js)$/;
const PATTERNS=[{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*text-left(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*text-right(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*border-l(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*border-r(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*rounded-l(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*rounded-r(?:-[^\\s"'\\x60]+)?(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*-?ml-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*-?mr-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*pl-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/},{pattern:/(?:^|\\s|["'\\x60])(?:[^\\s"'\\x60]+:)*pr-[^\\s"'\\x60]+(?=$|\\s|["'\\x60])/}];
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
    file("scripts/lib/oxc.cjs", oxcContent()),
  ];
}
