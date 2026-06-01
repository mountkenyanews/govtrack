import dotenv from "dotenv";
dotenv.config();

import pg from "pg";
const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
const cleanUrl = databaseUrl ? databaseUrl.replace(/[?&]sslmode=require/i, "") : undefined;
console.log("Attempting to connect to:", cleanUrl ? cleanUrl.split("@")[1] : "undefined");

const pool = new Pool({
  connectionString: cleanUrl,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    const res = await pool.query("SELECT version();");
    console.log("[Postgres test] Connection successful!");
    console.log("[Postgres test] Database version:", res.rows[0].version);
  } catch (err) {
    console.error("[Postgres test] Connection failed:", err);
  } finally {
    await pool.end();
  }
}

main();
