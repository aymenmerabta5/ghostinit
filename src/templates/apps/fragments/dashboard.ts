/**
 * Dashboard fragments – control plane (t3.codes inspired)
 * Dark-first, terminal-native, high-contrast, dense but scannable
 * Tiles: border bg-card no shadow, code blocks font-mono, tight tracking DM Sans + JetBrains Mono
 * Shared between Next and TanStack – only Link syntax diverges
 */

export type RouterType = "next" | "tanstack";

/**
 * Legacy grid kept for backwards compat – now uses Tile pattern (border bg-card, no shadow)
 * not generic shadcn Card shadow. Kept as export so external consumers don't break.
 */
export const sharedDashboardGrid = `        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-7 rounded-lg border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Identity</span>
              <Badge variant="secondary" className="capitalize font-mono text-[11px]"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" /> {session.user.role}</span></Badge>
            </div>
            <div className="p-4">
              <p className="font-mono text-xs text-muted-foreground max-w-[60ch]">Signed in as {session.user.email}. Name {session.user.name ?? "not set"}.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/settings">Edit profile</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/billing">Billing</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/admin">Admin</Link></Button>
              </div>
            </div>
          </div>
          <div className="md:col-span-5 rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Quick actions</span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link href="/settings">Security & 2FA <span aria-hidden>→</span></Link></Button>
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link href="/billing">Manage billing <span aria-hidden>→</span></Link></Button>
            </div>
          </div>
        </div>`;

export function dashboardInnerContent(router: RouterType): string {
  const toSettings = router === "tanstack" ? 'to="/settings"' : 'href="/settings"';
  const toBilling = router === "tanstack" ? 'to="/billing"' : 'href="/billing"';
  const toAdmin = router === "tanstack" ? 'to="/admin"' : 'href="/admin"';
  const toDashboard = router === "tanstack" ? 'to="/dashboard"' : 'href="/dashboard"';

  // identity interpolations differ per router because the page shells bind `session` vs `user`
  const emailExpr = router === "tanstack" ? "{String(user?.email ?? '')}" : "{session.user.email}";
  const nameExpr =
    router === "tanstack"
      ? "{String(user?.name ?? 'not set')}"
      : '{session.user.name ?? "not set"}';
  const roleExpr = router === "tanstack" ? "{String(user?.role ?? 'user')}" : "{session.user.role}";

  if (router === "tanstack") {
    return `        {/* control plane header — mono label + live dot, tight tracking */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)] animate-pulse" aria-hidden />
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">ghostinit — control plane</span>
                <span className="hidden sm:inline-flex items-center rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">monorepo</span>
              </div>
              <h1 className="font-sans text-2xl font-semibold tracking-tight tracking-[-0.035em]">Dashboard</h1>
              <p className="font-mono text-xs leading-relaxed text-muted-foreground max-w-[65ch]">Monorepo control plane — architecture layers, module health, and verification. Built for the builder at 2am, not the manager.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" /> system live</span>
              <Button variant="ghost" size="sm" className="font-mono text-xs" asChild><Link ${toSettings}>Settings</Link></Button>
              <SignOutButton />
            </div>
          </div>
          {/* env + command hint — terminal native */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1"><span className="size-1.5 rounded-full bg-emerald-500" /> env: local</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-[#09090b] px-2 py-1 text-zinc-300"><span className="text-muted-foreground">$</span> bunx ghostinit check</span>
            <span className="hidden sm:inline text-muted-foreground">— architecture, typecheck, lint</span>
          </div>
        </div>

        <Separator className="bg-white/[0.08] dark:bg-white/[0.08]" />

        {/* row 1: architecture layers (8) + checks (4) — dense, scannable */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* architecture tile — 6-layer chain, no upward deps */}
          <div className="md:col-span-8 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Architecture — 6 layers</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" /> PASS</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {/* layered chain */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                <span className="rounded-md border bg-background px-2 py-1">L1 UI</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L2 Transport</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L3 Domain</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L4 Capabilities</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L5 Vendors</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L6 Supporting</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 font-mono text-xs">
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L1</span><span className="text-zinc-200">apps/web</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L2</span><span className="text-zinc-200">packages/api · oRPC</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L3</span><span className="text-zinc-200">domain · packages/core</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L4</span><span className="text-zinc-200">services · billing</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L5</span><span className="text-zinc-200">providers · SDKs</span><span className="size-1.5 rounded-full bg-zinc-600" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L6</span><span className="text-zinc-200">database · config · kernel</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">No upward imports. Enforced by <span className="text-foreground">oxc-parser</span> via <span className="rounded bg-muted px-1 py-0.5">ghostinit check</span>. See <span className="underline decoration-dotted">tooling/architecture</span>.</p>
            </div>
          </div>

          {/* checks tile — ghostinit check + typecheck + lint */}
          <div className="md:col-span-4 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Checks</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="rounded-md border bg-[#09090b] p-3 font-mono text-xs leading-relaxed">
                <div className="flex items-center justify-between text-zinc-300"><span><span className="text-muted-foreground">$</span> ghostinit check</span><span className="text-emerald-400">✓</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400">0 blockers</span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400">0 highs</span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">3 mediums</span>
                </div>
                <div className="mt-3 grid gap-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">architecture</span><span className="text-emerald-400">PASS</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">typecheck</span><span className="text-emerald-400">PASS</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">oxlint / oxfmt</span><span className="text-emerald-400">PASS</span></div>
                </div>
              </div>
              <div className="rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <div className="text-foreground font-medium">Next steps</div>
                <div className="mt-1 flex flex-col gap-1">
                  <span><span className="text-muted-foreground">$</span> bun run typecheck</span>
                  <span><span className="text-muted-foreground">$</span> bun run check</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-between font-mono text-xs" asChild><Link ${toAdmin}>Open admin <span aria-hidden>→</span></Link></Button>
            </div>
          </div>
        </div>

        {/* row 2: identity (7) + ops / quick actions (5) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-7 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Identity — Profile</span>
              <Badge variant="secondary" className="capitalize font-mono text-[11px] tracking-wide"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" /> ${roleExpr}</span></Badge>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Email</span>
                  <span className="font-mono text-sm truncate tracking-tight">${emailExpr}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Name</span>
                  <span className="font-mono text-sm truncate">${nameExpr}</span>
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">Signed in as ${emailExpr} — ${nameExpr}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link ${toSettings}>Edit profile</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link ${toBilling}>Billing</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link ${toAdmin}>Admin</Link></Button>
              </div>
              <pre className="overflow-x-auto rounded-md border bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-300"><span className="text-muted-foreground">// session — Better Auth</span>{"\\n"}<span className="text-zinc-500">await</span> auth<span className="text-muted-foreground">.</span>api<span className="text-muted-foreground">.</span>getSession<span className="text-muted-foreground">({"{"} headers {"}"})</span></pre>
            </div>
          </div>

          <div className="md:col-span-5 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Quick actions</span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link ${toSettings}>Security & 2FA <span aria-hidden>→</span></Link></Button>
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link ${toBilling}>Manage billing <span aria-hidden>→</span></Link></Button>
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link ${toDashboard}>Back to dashboard <span aria-hidden>→</span></Link></Button>
            </div>
            <div className="mt-auto border-t bg-[#09090b] p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Command</div>
              <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300"><span className="text-muted-foreground">$</span> bunx ghostinit sync{"\\n"}<span className="text-muted-foreground">$</span> bunx ghostinit add module identity</pre>
            </div>
          </div>
        </div>

        {/* row 3: modules — dense list with status dots, terminal-native */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Modules — workspace packages</span>
            <span className="font-mono text-[11px] text-muted-foreground">4 active · 1 optional</span>
          </div>
          <div className="divide-y divide-white/[0.06] dark:divide-white/[0.06]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/ui</span>
              <span className="hidden sm:inline text-muted-foreground">L1 · tokens + theme.css</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/auth</span>
              <span className="hidden sm:inline text-muted-foreground">L6 · Better Auth</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/database</span>
              <span className="hidden sm:inline text-muted-foreground">L6 · Drizzle / Convex</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-zinc-500" /> @repo/billing</span>
              <span className="hidden sm:inline text-muted-foreground">L4 · stripe · chargily · paddle · polar</span>
              <span className="rounded border bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">optional</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> apps/web</span>
              <span className="hidden sm:inline text-muted-foreground">L1 · Next / TanStack</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
          </div>
          <div className="border-t bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-zinc-300">turbo.json</span> <span className="text-muted-foreground">globalEnv — 50+ vars · hoist:true</span>
            <pre className="mt-2 overflow-x-auto text-zinc-300">{"{"} <span className="text-muted-foreground">"pipeline": {"{"} "check": {"{"} "dependsOn": ["^check"] {"}"} {"}"}</span> {"}"}</pre>
          </div>
        </div>`;
  }
  return `        {/* control plane header — mono label + live dot, tight tracking */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.45)] animate-pulse" aria-hidden />
                <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">ghostinit — control plane</span>
                <span className="hidden sm:inline-flex items-center rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">monorepo</span>
              </div>
              <h1 className="font-sans text-2xl font-semibold tracking-tight tracking-[-0.035em]">Dashboard</h1>
              <p className="font-mono text-xs leading-relaxed text-muted-foreground max-w-[65ch]">Monorepo control plane — architecture layers, module health, and verification. Built for the builder at 2am, not the manager.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 font-mono text-[11px] text-muted-foreground"><span className="size-1.5 rounded-full bg-emerald-500" /> system live</span>
              <Button variant="ghost" size="sm" className="font-mono text-xs" asChild>
                <Link href="/settings">Settings</Link>
              </Button>
              <SignOutButton />
            </div>
          </div>
          {/* env + command hint — terminal native */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1"><span className="size-1.5 rounded-full bg-emerald-500" /> env: local</span>
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-[#09090b] px-2 py-1 text-zinc-300"><span className="text-muted-foreground">$</span> bunx ghostinit check</span>
            <span className="hidden sm:inline text-muted-foreground">— architecture, typecheck, lint</span>
          </div>
        </div>

        <Separator className="bg-white/[0.08] dark:bg-white/[0.08]" />

        {/* row 1: architecture layers (8) + checks (4) — dense, scannable */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {/* architecture tile — 6-layer chain, no upward deps */}
          <div className="md:col-span-8 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Architecture — 6 layers</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400"><span className="size-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]" /> PASS</span>
            </div>
            <div className="p-4 flex flex-col gap-4">
              {/* layered chain */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                <span className="rounded-md border bg-background px-2 py-1">L1 UI</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L2 Transport</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L3 Domain</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L4 Capabilities</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L5 Vendors</span>
                <span className="text-muted-foreground">→</span>
                <span className="rounded-md border bg-background px-2 py-1">L6 Supporting</span>
              </div>
              <div className="grid grid-cols-1 gap-1.5 font-mono text-xs">
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L1</span><span className="text-zinc-200">apps/web</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L2</span><span className="text-zinc-200">packages/api · oRPC</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L3</span><span className="text-zinc-200">domain · packages/core</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L4</span><span className="text-zinc-200">services · billing</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L5</span><span className="text-zinc-200">providers · SDKs</span><span className="size-1.5 rounded-full bg-zinc-600" /></div>
                <div className="flex items-center justify-between rounded-md border bg-[#09090b] px-3 py-2"><span className="text-muted-foreground">L6</span><span className="text-zinc-200">database · config · kernel</span><span className="size-1.5 rounded-full bg-emerald-500" /></div>
              </div>
              <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">No upward imports. Enforced by <span className="text-foreground">oxc-parser</span> via <span className="rounded bg-muted px-1 py-0.5">ghostinit check</span>. See <span className="underline decoration-dotted">tooling/architecture</span>.</p>
            </div>
          </div>

          {/* checks tile — ghostinit check + typecheck + lint */}
          <div className="md:col-span-4 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Checks</span>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="rounded-md border bg-[#09090b] p-3 font-mono text-xs leading-relaxed">
                <div className="flex items-center justify-between text-zinc-300"><span><span className="text-muted-foreground">$</span> ghostinit check</span><span className="text-emerald-400">✓</span></div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400">0 blockers</span>
                  <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-400">0 highs</span>
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-400">3 mediums</span>
                </div>
                <div className="mt-3 grid gap-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">architecture</span><span className="text-emerald-400">PASS</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">typecheck</span><span className="text-emerald-400">PASS</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">oxlint / oxfmt</span><span className="text-emerald-400">PASS</span></div>
                </div>
              </div>
              <div className="rounded-md border bg-card p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                <div className="text-foreground font-medium">Next steps</div>
                <div className="mt-1 flex flex-col gap-1">
                  <span><span className="text-muted-foreground">$</span> bun run typecheck</span>
                  <span><span className="text-muted-foreground">$</span> bun run check</span>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full justify-between font-mono text-xs" asChild><Link href="/admin">Open admin <span aria-hidden>→</span></Link></Button>
            </div>
          </div>
        </div>

        {/* row 2: identity (7) + ops / quick actions (5) */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-7 rounded-lg border bg-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Identity — Profile</span>
              <Badge variant="secondary" className="capitalize font-mono text-[11px] tracking-wide"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-500" /> ${roleExpr}</span></Badge>
            </div>
            <div className="p-4 flex flex-col gap-4">
              <div className="grid gap-3">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Email</span>
                  <span className="font-mono text-sm truncate tracking-tight">${emailExpr}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Name</span>
                  <span className="font-mono text-sm truncate">${nameExpr}</span>
                </div>
              </div>
              <p className="font-mono text-xs text-muted-foreground">Signed in as ${emailExpr} — ${nameExpr}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/settings">Edit profile</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/billing">Billing</Link></Button>
                <Button variant="outline" size="sm" className="font-mono text-xs" asChild><Link href="/admin">Admin</Link></Button>
              </div>
              <pre className="overflow-x-auto rounded-md border bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-zinc-300"><span className="text-muted-foreground">// session — Better Auth</span>{"\\n"}<span className="text-zinc-500">await</span> auth<span className="text-muted-foreground">.</span>api<span className="text-muted-foreground">.</span>getSession<span className="text-muted-foreground">({"{"} headers {"}"})</span></pre>
            </div>
          </div>

          <div className="md:col-span-5 rounded-lg border bg-card overflow-hidden flex flex-col">
            <div className="border-b px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Quick actions</span>
            </div>
            <div className="flex flex-col gap-2 p-4">
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link href="/settings">Security & 2FA <span aria-hidden>→</span></Link></Button>
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link href="/billing">Manage billing <span aria-hidden>→</span></Link></Button>
              <Button variant="outline" size="sm" className="justify-between font-mono text-xs" asChild><Link href="/admin">Admin <span aria-hidden>→</span></Link></Button>
            </div>
            <div className="mt-auto border-t bg-[#09090b] p-3">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Command</div>
              <pre className="mt-2 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300"><span className="text-muted-foreground">$</span> bunx ghostinit sync{"\\n"}<span className="text-muted-foreground">$</span> bunx ghostinit add module identity</pre>
            </div>
          </div>
        </div>

        {/* row 3: modules — dense list with status dots, terminal-native */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Modules — workspace packages</span>
            <span className="font-mono text-[11px] text-muted-foreground">4 active · 1 optional</span>
          </div>
          <div className="divide-y divide-white/[0.06] dark:divide-white/[0.06]">
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/ui</span>
              <span className="hidden sm:inline text-muted-foreground">L1 · tokens + theme.css</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/auth</span>
              <span className="hidden sm:inline text-muted-foreground">L6 · Better Auth</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> @repo/database</span>
              <span className="hidden sm:inline text-muted-foreground">L6 · Drizzle / Convex</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-zinc-500" /> @repo/billing</span>
              <span className="hidden sm:inline text-muted-foreground">L4 · stripe · chargily · paddle · polar</span>
              <span className="rounded border bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">optional</span>
            </div>
            <div className="flex items-center justify-between gap-3 px-4 py-3 font-mono text-xs">
              <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" /> apps/web</span>
              <span className="hidden sm:inline text-muted-foreground">L1 · Next / TanStack</span>
              <span className="rounded border bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">ok</span>
            </div>
          </div>
          <div className="border-t bg-[#09090b] p-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-zinc-300">turbo.json</span> <span className="text-muted-foreground">globalEnv — 50+ vars · hoist:true</span>
            <pre className="mt-2 overflow-x-auto text-zinc-300">{"{"} <span className="text-muted-foreground">"pipeline": {"{"} "check": {"{"} "dependsOn": ["^check"] {"}"} {"}"}</span> {"}"}</pre>
          </div>
        </div>`;
}

export function dashboardPageContent(router: RouterType): string {
  if (router === "tanstack") {
    return `import * as React from 'react'
import { cache } from 'react'
import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'
import { auth } from '@repo/auth'
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SignOutButton } from '../components/sign-out-button.js'
import { Skeleton } from "@/components/ui/skeleton";

const getCachedSession = cache(async () => {
  const headers = getRequestHeaders() as unknown as Headers
  const session = await (auth as unknown as { api: { getSession: (opts: { headers: Headers }) => Promise<{ user?: { email?: string; name?: string | null; role?: string } } | null> } }).api.getSession({ headers })
  return session ?? null
})

const getSessionFn = createServerFn({ method: 'GET' }).handler(getCachedSession)

export const Route = createFileRoute('/dashboard')({
  beforeLoad: async () => {
    const session = await getSessionFn()
    if (!session?.user) {
      throw redirect({ to: '/sign-in' })
    }
    return { session }
  },
  component: DashboardPage,
})

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}

function DashboardPage(): React.JSX.Element {
  const { session } = Route.useRouteContext() as { session: { user: { email: string; name?: string | null; role?: string } } }
  const user = session?.user

  return (
    <main className="min-h-screen bg-background text-foreground">
      <React.Suspense fallback={<DashboardSkeleton />}>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
${dashboardInnerContent("tanstack")}
        </div>
      </React.Suspense>
    </main>
  )
}
`;
  }
  return `import * as React from "react";
import { cache } from "react";
import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@repo/auth";
import { SignOutButton } from "../../components/sign-out-button.js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

export const getCachedSession = cache(async () => {
  const h = await headers();
  return auth.api.getSession({ headers: h });
});

async function DashboardContent(): Promise<React.JSX.Element> {
  const session = await getCachedSession();
  if (!session?.user) {
    redirect("/sign-in");
  }
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
${dashboardInnerContent("next")}
    </div>
  );
}

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6 md:p-8 lg:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default async function DashboardPage(): Promise<React.JSX.Element> {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
`;
}

export const sharedSettingsNav = [
  { label: "Settings", href: "/settings", to: "/settings" },
  { label: "Billing", href: "/billing", to: "/billing" },
  { label: "Admin", href: "/admin", to: "/admin" },
];
