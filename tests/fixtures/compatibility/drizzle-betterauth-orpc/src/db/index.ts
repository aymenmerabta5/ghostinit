import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

/**
 * Mock pool for fixture type-checking only.
 * No real database is required; the driver methods are no-ops so imports and
 * type inference can be verified without a live Postgres server.
 */
class NoopPool extends pg.Pool {
  constructor() {
    super({ connectionString: "postgresql://noop" });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(): any {
    return Promise.resolve({ rows: [] });
  }

  connect(): any {
    return Promise.resolve({
      query: () => Promise.resolve({ rows: [] }),
      release: () => {},
    });
  }

  end(): any {
    return Promise.resolve();
  }

  on(): any {
    return this;
  }
}

export const pool = new NoopPool();
export const db = drizzle(pool, { schema });
