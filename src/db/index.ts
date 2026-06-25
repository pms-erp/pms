// src/db/index.ts
import { drizzle } from "drizzle-orm/mysql2";
import type { MySql2Database } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";
import { env } from "../env";

if (!env.DB_HOST) throw new Error("DB_HOST is not set");
if (!env.DB_USER) throw new Error("DB_USER is not set");
if (!env.DB_PASSWORD) throw new Error("DB_PASSWORD is not set");
if (!env.DB_NAME) throw new Error("DB_NAME is not set");

// ── Single connection for serverless ─────────────────────────────────────────
// mysql2's Connection has an internal `_closing` flag but it is not exposed
// in the public type definitions. We define a minimal interface that describes
// only the internal shape we rely on — no `any` needed.
interface Mysql2ConnectionInternal {
  connection: {
    _closing: boolean;
  };
}

let connection: mysql.Connection | null = null;

async function getConnection(): Promise<mysql.Connection> {
  const isClosing =
    connection !== null &&
    (connection as unknown as Mysql2ConnectionInternal).connection?._closing;

  if (!connection || isClosing) {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
      connectTimeout: 10_000,
    });
  }

  return connection;
}

// Lazy drizzle initialization
type ConnectionDb = MySql2Database<typeof schema> & {
  $client: mysql.Connection;
};
let _db: ConnectionDb | null = null;

export async function getDb(): Promise<ConnectionDb> {
  const conn = await getConnection();
  if (!_db) {
    _db = drizzle(conn, { schema, mode: "default" }) as ConnectionDb;
  }
  return _db;
}

// ── Pool-based db (primary export — connectionLimit:1 for Vercel safety) ─────
export const db = drizzle(
  mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: 1,
    waitForConnections: true,
    queueLimit: 5,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 10_000,
  }),
  { schema, mode: "default" },
);
