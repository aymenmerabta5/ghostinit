import { describe, expect, test } from "bun:test";
import { agentsComposerFiles } from "../../src/templates/modes/monorepo/agents-composer.js";
import { desktopRouteSettingsContent } from "../../src/templates/apps/desktop/index.js";
import { startDatabaseFiles } from "../../src/templates/database.js";
import { skillGhostinitWorkflow } from "../../src/templates/eve/skills/workflow.js";
import { readmeSingle } from "../../src/templates/modes/single/fragments/docs.js";

describe("portable generated guidance", () => {
  test("never overwrites generated secrets or embeds a contributor drive", () => {
    const guidance = [
      ...agentsComposerFiles("portable-app", [], false, false).map(({ content }) => content),
      skillGhostinitWorkflow().content,
      readmeSingle("portable-app").content,
    ].join("\n");

    expect(guidance).not.toContain("cp .env.example .env.local");
    expect(guidance).not.toContain("D:/MyWork");
    expect(guidance).toContain("without overwriting");
    expect(guidance).toContain("docker compose --env-file .env.local up -d");
    expect(guidance).not.toContain("docker compose up -d");
    expect(guidance).not.toMatch(/(?:^|\n)\s*\.\/start-database\.sh/m);
  });

  test("binds every generated development Postgres launcher to loopback", () => {
    const startDatabase = startDatabaseFiles("portable-app")[0]?.content ?? "";

    expect(startDatabase).toContain('-p "127.0.0.1:$DB_PORT:5432"');
    expect(startDatabase).not.toContain('-p "$DB_PORT:5432"');
    expect(startDatabase).toContain('-v "${PROJECT}_postgres_data:/var/lib/postgresql"');
    expect(startDatabase).not.toContain("/var/lib/postgresql/data");
    expect(startDatabase).toContain("Postgres 18+ owns a versioned PGDATA");
  });

  test("keeps desktop recovery inside its typed renderer router", () => {
    const withEmail = desktopRouteSettingsContent(false, true);
    expect(withEmail).toContain('<Link to="/forgot-password"');
    expect(withEmail).not.toContain("http://localhost:3000/forgot-password");
    expect(withEmail).not.toContain("shellOpenExternal");

    expect(desktopRouteSettingsContent(false, false)).not.toContain('<Link to="/forgot-password"');
  });
});
