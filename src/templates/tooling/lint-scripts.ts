import { file, type TemplateFile } from "../shared.js";
import { checkServerOnlyContent } from "./server-only-lint.js";
import { testEnvironmentFile } from "./test-env.js";
import { frontendOwnershipLintFiles } from "./frontend-lint.js";

// @allow-long 550: seven generated checks and their shared parser boundary remain auditable together
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
function parseOwned(file, source, lang = language(file)) {
  const result = parseSync(file, source, { sourceType: "module", lang });
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
    if (node.type === "TSImportType") {
      const specifier = stringValue(node.source);
      if (specifier) references.push({ node, specifier, kind: "TSImportType" });
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
  return `#!/usr/bin/env bun
const fs = require("node:fs");
const path = require("node:path");

function resolveRoots() {
  const candidates = [path.join(process.cwd(), "src"), path.join(process.cwd(), "app")];
  const apps = path.join(process.cwd(), "apps");
  if (fs.existsSync(apps)) {
    for (const entry of fs.readdirSync(apps, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(path.join(apps, entry.name, "src"), path.join(apps, entry.name, "app"));
    }
  }
  return candidates.filter((root) => fs.existsSync(root));
}

const MAX_STANDALONE_LINES = 150;
const MAX_ORCHESTRATOR_LINES = 120;
const MAX_SECTION_LINES = 200;

// Only intrinsic backend roots are outside the frontend size contract.
// Nested route/feature folders named server remain frontend sources.
function isIntrinsicServerRoot(fp) {
  const parts = path.relative(process.cwd(), fp).split(path.sep);
  return (parts.length === 2 && parts[0] === "src" && parts[1] === "server") ||
    (parts.length === 4 && parts[0] === "apps" && parts[2] === "src" && parts[3] === "server");
}

function listTsxFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) { if (!isIntrinsicServerRoot(fp)) listTsxFiles(fp, files); continue; }
    if (!e.isFile() || !e.name.endsWith(".tsx")) continue;
    if (e.name.endsWith(".test.tsx")) continue;
    files.push(fp);
  }
  return files;
}
function rel(p) { return p.replaceAll("\\\\", "/").replace(process.cwd().replaceAll("\\\\","/")+"/",""); }
function linesOf(fp) { return fs.readFileSync(fp,"utf8").split(/\\r?\\n/).length; }
function isOrchestrator(fp) { const c = fs.readFileSync(fp,"utf8"); return (c.match(/import .*from.*_components/g) || []).length >= 3 || /SearchFilters|Dashboard|View/.test(path.basename(fp)); }
function physicalFileKey(fp) {
  const info = fs.statSync(fp, { bigint: true });
  if (info.ino !== 0n) return String(info.dev) + ":" + String(info.ino);
  const real = fs.realpathSync.native(fp);
  return process.platform === "win32" ? real.toLowerCase() : real;
}

function main() {
  const roots = resolveRoots();
  const discovered = roots.flatMap((root) => listTsxFiles(root));
  discovered.sort((left, right) => rel(left).localeCompare(rel(right)));
  const filesByPhysicalPath = new Map();
  for (const fp of discovered) {
    const key = physicalFileKey(fp);
    if (!filesByPhysicalPath.has(key)) filesByPhysicalPath.set(key, fp);
  }
  const files = [...filesByPhysicalPath.values()];
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

function checkImportAliasesContent(): string {
  return `#!/usr/bin/env bun
const fs=require("node:fs"), path=require("node:path");
const {moduleReferences,parseOwned,positionOf,relative}=require("./lib/oxc.cjs");
function roots(){ const cands=[path.join(process.cwd(),"src"), path.join(process.cwd(),"apps","web","src")]; return cands.filter(fs.existsSync); }
const TARGET=new Set([".ts",".tsx"]); const STYLE=[".css",".scss",".sass",".less"];
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile() && TARGET.has(path.extname(e.name))) out.push(p);} return out; }
function isRel(s){return s.startsWith("./")||s.startsWith("../");}
function isStyle(s){return STYLE.some(e=>s.endsWith(e));}
function isInside(root,target){ const rel=path.relative(root,target); return rel===""||(!rel.startsWith(".."+path.sep)&&rel!==".."&&!path.isAbsolute(rel)); }
function isGeneratedConvexTarget(target){ return isInside(path.join(process.cwd(),"convex","_generated"),target); }
function main(){
  const dirs=roots(); if(dirs.length===0){console.error("Missing src root");process.exit(1);}
  const viol=[];
  for(const root of dirs){
    for(const fp of list(root)){
      const source=fs.readFileSync(fp,"utf8"); const program=parseOwned(fp,source);
      for(const reference of moduleReferences(program)){
        if(!isRel(reference.specifier)||isStyle(reference.specifier)) continue;
        const target=path.resolve(path.dirname(fp),reference.specifier);
        if(isInside(root,target)||isGeneratedConvexTarget(target)) continue;
        const {line,column}=positionOf(source,reference.node);
        viol.push({file:relative(fp),line,column,spec:JSON.stringify(reference.specifier)});
      }
    }
  }
  if(viol.length===0){console.log("Import boundary check passed."); return;}
  console.error("Relative imports may not escape their source root. Use @/ or @repo/* aliases (styles and root convex/_generated targets exempt):"); for(const v of viol) console.error(\`\${v.file}:\${v.line}:\${v.column} \${v.spec}\`);
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
  return `#!/usr/bin/env bun
const fs=require("node:fs"), path=require("node:path");
const {jsxAttributeString,jsxName,jsxOpenings,parseOwned,positionOf,relative}=require("./lib/oxc.cjs");
const EXT=new Set([".ts",".tsx"]);
function list(dir, out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&&EXT.has(path.extname(e.name))) out.push(p);} return out; }
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
          violations.push({file:relative(fp),line,column,msg:'Use next/link instead of <a href="'+href+'"> for internal navigation'});
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
  return `#!/usr/bin/env bun
const fs=require("node:fs"), path=require("node:path");
const {parseOwned,jsxOpenings,jsxName,jsxAttributeString}=require("./lib/oxc.cjs");
function roots(){ return [path.join(process.cwd(),"src"),path.join(process.cwd(),"apps","web","src")].filter(fs.existsSync); }
function list(dir,out=[]){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) list(p,out); else if(e.isFile()&&(p.endsWith(".ts")||p.endsWith(".tsx"))) out.push(p); } return out; }
function read(file){ return fs.existsSync(file)?fs.readFileSync(file,"utf8"):""; }
function count(source,token){ return source.split(token).length-1; }
function leaves(value,prefix="",out=[]){ if(!value||typeof value!=="object") return out; for(const [key,child] of Object.entries(value)){ const next=prefix?prefix+"."+key:key; if(typeof child==="string") out.push(next); else leaves(child,next,out); } return out.sort(); }
function catalogDir(root){ const candidates=[path.join(root,"messages"),path.join(path.dirname(root),"messages"),path.join(root,"i18n","messages")]; return candidates.find(dir=>["en","fr","ar"].every(locale=>fs.existsSync(path.join(dir,locale+".json")))); }
function flatten(value,prefix="",out={}){ if(!value||typeof value!=="object") return out; for(const [key,child] of Object.entries(value)){ const next=prefix?prefix+"."+key:key; if(typeof child==="string") out[next]=child; else flatten(child,next,out); } return out; }
function placeholders(message){ return [...message.matchAll(/[{]([A-Za-z_][A-Za-z0-9_]*)[}]/g)].map(match=>match[1]).sort(); }
function checkCatalogs(root,violations){ const dir=catalogDir(root); if(!dir){ violations.push("missing en/fr/ar message catalogs under "+root); return; } const catalogs=Object.fromEntries(["en","fr","ar"].map(locale=>[locale,JSON.parse(read(path.join(dir,locale+".json")))])); const expected=leaves(catalogs.en); const flat=Object.fromEntries(Object.entries(catalogs).map(([locale,catalog])=>[locale,flatten(catalog)])); if(!expected.some(key=>key.startsWith("adminUsers."))) violations.push("English catalog is missing adminUsers keys"); for(const locale of ["fr","ar"]){ if(JSON.stringify(leaves(catalogs[locale]))!==JSON.stringify(expected)) violations.push(locale+" catalog keys differ from English"); for(const key of expected){ if(JSON.stringify(placeholders(flat[locale][key]||""))!==JSON.stringify(placeholders(flat.en[key]||""))) violations.push(locale+" catalog placeholders differ for "+key); } } }
function requireText(source,token,label,violations){ if(!source.includes(token)) violations.push(label+" is missing "+token); }
function readEntry(root,file,seen=new Set()){ const resolved=path.resolve(root,file); if(seen.has(resolved)||seen.size>=8||(!resolved.startsWith(path.resolve(root)+path.sep))) throw new Error("Invalid header re-export: "+file); seen.add(resolved); const source=read(resolved); const body=parseOwned(resolved,source).body.filter(node=>node.type!=="EmptyStatement"); if(body.length!==1||body[0].type!=="ExportNamedDeclaration"||!body[0].source) return source; const target=body[0].source.value; const base=target.startsWith("@/")?path.join(root,target.slice(2)):target.startsWith(".")?path.resolve(path.dirname(resolved),target):null; if(!base) throw new Error("Header re-export must resolve to owned source"); const next=[base,base+".tsx",base+".ts"].find(candidate=>fs.existsSync(candidate)); if(!next) throw new Error("Missing header re-export: "+target); return readEntry(root,path.relative(root,next),seen); }
function headerParts(root){ return Object.fromEntries(Object.entries({root:"header.tsx",shell:"app-shell.tsx",actions:"header-actions.tsx",menu:"header-user-menu.tsx",navigation:"workspace-navigation.tsx",sidebar:"workspace-sidebar.tsx",trigger:"workspace-navigation-trigger.tsx",identity:"workspace-identity.ts",status:"workspace-identity-status.tsx"}).map(([name,file])=>[name,readEntry(root,path.join("components",file))])); }
function openings(source){ return jsxOpenings(parseOwned("header-part.tsx",source)); }
function requireMount(source,tag,label,violations){ if(openings(source).filter(opening=>jsxName(opening.name)===tag).length!==1) violations.push(label+" must mount "+tag+" exactly once"); }
function checkHeader(parts,root,layout,violations){
  const queries=read(path.join(root,"features","app-shell","queries.ts"));
  const controller=read(path.join(root,"features","app-shell","use-app-shell.ts"));
  const navigationModel=read(path.join(root,"features","app-shell","navigation-model.ts"));
  const header=Object.values(parts).join("\\n");
  requireText(header,'from "@/lib/translations"',"Translated header",violations);
  requireMount(layout,"AppShell","Root layout",violations);
  requireMount(parts.shell,"Header","AppShell",violations);
  requireMount(parts.root,"header","Header",violations);
  const controls=[...openings(parts.root),...openings(parts.actions)].filter(opening=>jsxName(opening.name)==="LocaleSwitcher");
  if(controls.length!==1) violations.push("Translated header must mount LocaleSwitcher exactly once");
  for(const control of controls){ if((jsxAttributeString(control,"className")||"").split(/\\s+/).includes("hidden")) violations.push("Locale switcher must remain reachable on mobile"); }
  const authenticated=Boolean(parts.actions||parts.menu||parts.navigation||parts.shell.includes("useAuth"));
  if(authenticated){
    for(const [source,tag,label] of [[parts.shell,"HeaderActions","AppShell"],[parts.shell,"WorkspaceSidebar","AppShell"],[parts.shell,"WorkspaceNavigationTrigger","AppShell"],[parts.actions,"HeaderUserMenu","Header actions"],[parts.sidebar,"WorkspaceNavigation","Workspace sidebar"],[parts.trigger,"WorkspaceNavigation","Workspace trigger"],[parts.navigation,"WorkspaceIdentityStatus","Workspace navigation"],[parts.trigger,"Sheet","Workspace trigger"],[parts.trigger,"SheetTrigger","Workspace trigger"],[parts.trigger,"SheetContent","Workspace trigger"]]) requireMount(source,tag,label,violations);
    for(const token of ["useQueryAuthSession()","canonical?.hasCanonicalApi","canonical.currentRequest?.user","canonical?.retry"]) requireText(queries,token,"Canonical workspace identity",violations);
    for(const token of ['from "./queries"',"useShellIdentitySource()","resolveWorkspaceIdentity(source)"]) requireText(controller,token,"Canonical workspace identity",violations);
    for(const token of ['from "./use-app-shell"',"useAppShell()","identity={identity}"]) requireText(parts.shell,token,"Canonical workspace identity",violations);
    for(const token of ['from "@/features/app-shell/navigation-model"',"WORKSPACE_NAVIGATION"]) requireText(parts.navigation,token,"Workspace navigation model",violations);
    const identity=parts.identity.replace(/\\s+/g,"");
    for(const token of ["if(input.pending)","if(input.error)","if(input.user)",'status:"pending"','status:"error",retry:input.retry','status:"authenticated",user:input.user','status:"anonymous"']) requireText(identity,token,"Workspace identity states",violations);
    if(identity.indexOf("if(input.pending)")>identity.indexOf("if(input.error)")||identity.indexOf("if(input.error)")>identity.indexOf("if(input.user)")) violations.push("Workspace identity must settle pending and error before exposing its user");
    requireText(parts.navigation,'identity.status !== "authenticated"',"Private workspace navigation",violations);
    requireText(parts.actions,'identity.status === "authenticated"',"Private account controls",violations);
    for(const source of [parts.sidebar,parts.trigger]) requireText(source,"identity={identity}","Workspace identity handoff",violations);
    for(const token of ['t("accountLoading")','t("accountUnavailable")','t("notSignedIn")',"onClick={identity.retry}"]) requireText(parts.status,token,"Workspace identity status",violations);
    requireText(parts.navigation,'useSurfaceTranslations("header")',"Workspace navigation",violations);
    requireText(parts.navigation,"{t(label)}","Workspace navigation",violations);
    requireText(parts.trigger,'t("openNavigation")',"Workspace trigger",violations);
    for(const key of ["dashboard","settings","signIn","signUp","signOut"]) requireText(header,'t("'+key+'")',"Translated header",violations);
  }
  const labels=[...navigationModel.matchAll(/label:\\s*"([A-Za-z][A-Za-z0-9]*)"/g)].map(match=>match[1]);
  if(authenticated){
    for(const label of ["dashboard","settings"]) if(!labels.includes(label)) violations.push("Workspace navigation is missing "+label);
    if(labels.includes("admin")){
      requireText(parts.navigation,'item.label !== "admin" || isAdmin',"Workspace admin admission",violations);
      requireText(parts.navigation,'identity.user.role === "admin"',"Workspace admin admission",violations);
      requireText(parts.menu,'t("users")',"Translated admin menu",violations);
    }
    if(labels.includes("billing")&&!/path:\\s*"\\/billing"[^}]*match:\\s*"exact"/.test(navigationModel)) violations.push("Billing navigation must preserve public checkout return pages");
  }
  const keys=new Set([...labels,...[...header.matchAll(/\\bt\\("([A-Za-z][A-Za-z0-9]*)"\\)/g)].map(match=>match[1])]);
  const dir=catalogDir(root);
  if(dir) for(const locale of ["en","fr","ar"]){ const catalog=JSON.parse(read(path.join(dir,locale+".json"))); for(const key of keys){ const value=catalog.header?.[key]; if(typeof value!=="string"||!value.trim()) violations.push(locale+" header catalog is missing "+key); } }
}
function main(){
  const sourceRoots=roots(); if(sourceRoots.length===0){ console.log("I18n runtime check passed (no src)."); return; }
  const violations=[];
  for(const root of sourceRoots){
    const files=list(root); for(const file of files) parseOwned(file,read(file)); const combined=files.map(read).join("\\n");
    const nextRequest=path.join(root,"i18n","request.ts");
    const tanstackRuntime=path.join(root,"lib","i18n.ts");
    const hasNext=fs.existsSync(nextRequest); const hasTanstack=fs.existsSync(tanstackRuntime);
    if(hasNext&&hasTanstack) violations.push(root+" mixes Next and TanStack i18n runtimes");
    if(hasNext){
      const layout=read(path.join(root,"app","layout.tsx"));
      const routing=read(path.join(root,"i18n","routing.ts"));
      const request=read(nextRequest);
      const switcher=read(path.join(root,"components","locale-switcher.tsx"));
      const header=headerParts(root);
      const proxy=read(path.join(root,"proxy.ts"))||read(path.join(root,"middleware.ts"));
      for(const token of ["NextIntlClientProvider","getLocale","getMessages","lang=","dir="]) requireText(layout,token,"Next root layout",violations);
      for(const token of ["localeCookieName","accept-language","cookies()","headers()"]) requireText(request,token,"Next request config",violations);
      requireText(routing,'localePrefix: "never"',"Next routing config",violations);
      for(const token of ["localeCookieName","router.refresh","<Select","<SelectGroup>"]) requireText(switcher,token,"Next locale switcher",violations);
      checkHeader(header,root,layout,violations);
      if(proxy.includes("next-intl/middleware")||proxy.includes("[locale]")) violations.push("Next proxy must keep non-prefixed routes and avoid locale middleware");
      requireText(proxy,'new URL("/sign-in", request.url)',"Next proxy",violations);
      if(combined.includes('from "@/lib/i18n"')) violations.push("Next source imports the TanStack i18n runtime");
      checkCatalogs(root,violations);
    } else if(hasTanstack){
      const providers=read(path.join(root,"components","providers.tsx"));
      const rootRoute=read(path.join(root,"routes","__root.tsx"));
      const runtime=read(tanstackRuntime);
      const switcher=read(path.join(root,"components","locale-switcher.tsx"));
      const header=headerParts(root);
      requireText(providers,'from "@/lib/i18n"',"TanStack providers",violations);
      if(count(providers,"<I18nProvider ")!==1||count(providers,"</I18nProvider>")!==1) violations.push("TanStack AppProviders must mount I18nProvider exactly once");
      for(const token of ["getLocaleFromHeaders","Route.useLoaderData()",'lang={locale} dir={localeDirection[locale]}',"initialLocale={locale}"]) requireText(rootRoute,token,"TanStack root locale handoff",violations);
      for(const token of ["document.documentElement.lang","document.documentElement.dir","localeCookieName"]) requireText(runtime,token,"TanStack i18n runtime",violations);
      for(const token of ["<Select","<SelectGroup>"]) requireText(switcher,token,"TanStack locale switcher",violations);
      checkHeader(header,root,rootRoute,violations);
      if(combined.includes("next-intl")) violations.push("TanStack source must never import next-intl");
      checkCatalogs(root,violations);
    } else if(combined.includes('from "next-intl')||combined.includes('from "@/lib/i18n"')){
      violations.push(root+" leaks an i18n runtime while the capability is disabled");
    }
  }
  if(violations.length===0){ console.log("I18n runtime check passed."); return; }
  console.error("I18n runtime violations:"); for(const violation of violations) console.error("  "+violation);
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
  return `#!/usr/bin/env bun
const fs=require("node:fs"), path=require("node:path");
const {parseOwned,positionOf,walk}=require("./lib/oxc.cjs");
const ROOTS=[
  "src/app", "src/routes", "src/components", "src/features", "src/renderer", "src/styles", "app",
  "apps/web/src/app", "apps/web/src/routes", "apps/web/src/components", "apps/web/src/features", "apps/web/src/styles",
  "apps/desktop/src/renderer", "apps/mobile/app", "apps/mobile/src",
  "packages/ui/src",
];
const FILES=["global.css", "apps/mobile/global.css"];
const EXT=/\\.(css|tsx|ts|jsx|js)$/;
const PHYSICAL_UTILITY=/(?:^|\\s|["'\\x60])((?:[^\\s"'\\x60]+:)*-?(?:text-(?:left|right)|border-(?:l|r)(?:-[^\\s"'\\x60]+)?|rounded-(?:l|r)(?:-[^\\s"'\\x60]+)?|(?:left|right|ml|mr|pl|pr)-[^\\s"'\\x60]+))(?=$|\\s|["'\\x60])/g;
const PHYSICAL_CSS=/(?:^|[;{]\\s*)((?:(?:margin|padding|border)-(?:left|right)|left|right)\\s*:|text-align\\s*:\\s*(?:left|right)(?=\\s*[;}]))/g;
const PHYSICAL_STYLE_KEYS=new Set(["left","right","marginLeft","marginRight","paddingLeft","paddingRight","borderLeft","borderRight"]);
const REGISTERED_EXCEPTIONS=[
  {
    id:"base-ui-side-state",
    file:/(?:^|\\/)components\\/ui\\/(?:dropdown-menu|hover-card|popover|tooltip)\\.tsx$/,
    token:/^data-\\[side=(?:left|right)\\]:slide-in-from-(?:left|right)-(?:[0-9]+(?:\\/[0-9]+)?|\\[[^\\]]+\\])$/,
    reason:"Base UI collision-side state names are physical API values, not document alignment.",
  },
];
function roots(){ return ROOTS.map(root=>path.join(process.cwd(),root)).filter(fs.existsSync); }
function standaloneFiles(){ return FILES.map(file=>path.join(process.cwd(),file)).filter(fs.existsSync); }
function registeredException(file,token){ return REGISTERED_EXCEPTIONS.find(entry=>entry.file.test(file)&&entry.token.test(token)); }
function collect(dir,out){ for(const e of fs.readdirSync(dir,{withFileTypes:true})){ const p=path.join(dir,e.name); if(e.isDirectory()) collect(p,out); else if(e.isFile()&&EXT.test(e.name)) out.push(p);} }
function matches(line,extension){
  const found=[];
  PHYSICAL_UTILITY.lastIndex=0;
  for(const match of line.matchAll(PHYSICAL_UTILITY)) found.push({kind:"utility",token:match[1]});
  if(extension===".css"){
    PHYSICAL_CSS.lastIndex=0;
    for(const match of line.matchAll(PHYSICAL_CSS)) found.push({kind:"css",token:match[1].trim()});
  }
  return found;
}
function styleKey(property){
  const key=property.key;
  if(!property.computed&&key?.type==="Identifier") return key.name;
  if(typeof key?.value==="string") return key.value;
  return key?.type==="TemplateLiteral"&&key.expressions.length===0?key.quasis.map(part=>part.value.cooked??part.value.raw).join(""):null;
}
function styleMatches(file,source){
  const found=[];
  walk(parseOwned(file,source,file.endsWith(".js")?"jsx":undefined),(node)=>{
    if(node.type!=="ObjectExpression") return;
    for(const property of node.properties){
      if(property.type!=="Property"||property.method||property.kind!=="init") continue;
      const key=styleKey(property);
      if(PHYSICAL_STYLE_KEYS.has(key)) found.push({kind:"style",token:key+":",line:positionOf(source,property.key).line});
    }
  });
  return found;
}
function main(){
  const rootsList=roots(); const files=standaloneFiles();
  if(rootsList.length===0&&files.length===0){ console.log("RTL logical check passed (no sources)."); return; }
  for(const d of rootsList) collect(d,files);
  const viol=[];
  for(const fp of files){
    const file=path.relative(process.cwd(),fp).replaceAll("\\\\","/");
    const extension=path.extname(fp);
    const source=fs.readFileSync(fp,"utf8"), lines=source.split(/\\r?\\n/);
    if(extension!==".css") for(const match of styleMatches(fp,source)) viol.push({file,...match});
    for(let i=0;i<lines.length;i++) for(const match of matches(lines[i],extension)){
      if(registeredException(file,match.token)) continue;
      viol.push({file,line:i+1,kind:match.kind,token:match.token});
    }
  }
  if(viol.length===0){ console.log("RTL logical direction check passed."); return; }
  console.error("RTL violations (use start/end, text-start/end, ms/me, ps/pe, border-s/e):"); for(const v of viol) console.error(\`  \${v.file}:\${v.line} [\${v.kind}] \${v.token}\`);
  process.exit(1);
}
try { main(); } catch (error) { console.error(error instanceof Error ? error.message : "Unknown parser failure"); process.exit(2); }
`;
}

function checkAnimationImportsContent(): string {
  return `#!/usr/bin/env bun
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
    testEnvironmentFile(),
    ...frontendOwnershipLintFiles(),
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
