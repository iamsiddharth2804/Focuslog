import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pgClient?: postgres.Sql };

/**
 * Drizzle sends every query through postgres.js `unsafe()`, which hard-codes `prepare: false`.
 * Unprepared queries with parameters cost TWO round trips (describe, then execute), which
 * doubles latency against a remote database like Neon. This wrapper opts them back into
 * prepared statements — including inside transactions — so each query is one round trip.
 * Set DB_PREPARE=false if your connection pooler can't handle prepared statements.
 */
function withPreparedStatements(client: postgres.Sql): postgres.Sql {
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "unsafe") {
        return (query: string, args?: postgres.ParameterOrJSON<never>[], options?: postgres.UnsafeQueryOptions) =>
          target.unsafe(query, args, { prepare: true, ...options });
      }
      if (prop === "begin") {
        return (...a: unknown[]) => {
          const fn = a[a.length - 1] as (tx: postgres.TransactionSql) => unknown;
          const rest = a.slice(0, -1);
          return (target.begin as (...x: unknown[]) => Promise<unknown>)(...rest, (tx: postgres.TransactionSql) =>
            fn(withPreparedStatements(tx as unknown as postgres.Sql) as unknown as postgres.TransactionSql),
          );
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  const prepare = process.env.DB_PREPARE !== "false";
  const pg = postgres(url, { max: 10, prepare, idle_timeout: 60 });
  return prepare ? withPreparedStatements(pg) : pg;
}

const pg = globalForDb.pgClient ?? client();
if (process.env.NODE_ENV !== "production") globalForDb.pgClient = pg;

export const db = drizzle(pg, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
