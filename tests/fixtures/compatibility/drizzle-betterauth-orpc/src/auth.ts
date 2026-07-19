import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/index.js";
import { accounts, sessions, users, verifications } from "./db/schema.js";

export const auth = betterAuth({
  // This fixture is for compatibility checks only. In a real app set these via
  // environment variables and never commit the secret.
  secret: process.env.BETTER_AUTH_SECRET ?? "DO_NOT_USE_IN_PRODUCTION",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
});

export type Auth = typeof auth;
