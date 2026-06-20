import { drizzle } from "drizzle-orm/mysql2";
import mysql, { Pool } from "mysql2/promise";
import * as schema from "./schema";
import { env } from "../env";

// ✅ Explicitly type the pool
const pool: Pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// ✅ Typed Drizzle instance
export const db = drizzle(pool, {
  schema,
  mode: "default",
});
