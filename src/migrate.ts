import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Dedicated connection — multipleStatements OFF, one statement at a time
async function getConnection() {
  return mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'santocerdo',
    charset:  'utf8mb4',
    timezone: 'Z',
  });
}

function splitStatements(sql: string): string[] {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')  // strip /* */ block comments
    .replace(/^--[^\n]*$/gm, '')        // strip -- line comments
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

async function ensureMigrationsTable(conn: mysql.Connection): Promise<void> {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id         INT          NOT NULL AUTO_INCREMENT,
      name       VARCHAR(255) NOT NULL,
      applied_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_migration_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function getAppliedMigrations(conn: mysql.Connection): Promise<Set<string>> {
  const [rows] = await conn.query(
    'SELECT name FROM schema_migrations ORDER BY name'
  ) as any[];
  return new Set((rows as any[]).map((r: any) => r.name));
}

function getMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();
}

async function runMigration(conn: mysql.Connection, filename: string): Promise<void> {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql      = fs.readFileSync(filepath, 'utf8');
  const stmts    = splitStatements(sql);

  for (const stmt of stmts) {
    await conn.query(stmt);
  }

  await conn.query(
    'INSERT INTO schema_migrations (name) VALUES (?)',
    [filename]
  );

  console.log(`  ✅  ${filename}`);
}

async function migrate(): Promise<void> {
  const conn = await getConnection();
  try {
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);
    const pending = getMigrationFiles().filter(f => !applied.has(f));

    if (pending.length === 0) {
      console.log('[migrate] All migrations up to date.');
      return;
    }

    console.log(`[migrate] Applying ${pending.length} migration(s)...`);
    for (const file of pending) {
      await runMigration(conn, file);
    }
    console.log('[migrate] Done.');
  } finally {
    await conn.end();
  }
}

// --bootstrap: marks all existing migration files as applied without running them.
// Use this once on an existing database that already has the schema.
async function bootstrap(): Promise<void> {
  const conn = await getConnection();
  try {
    await ensureMigrationsTable(conn);
    const applied = await getAppliedMigrations(conn);
    const files   = getMigrationFiles().filter(f => !applied.has(f));

    if (files.length === 0) {
      console.log('[migrate:bootstrap] Nothing to bootstrap.');
      return;
    }

    for (const file of files) {
      await conn.query(
        'INSERT IGNORE INTO schema_migrations (name) VALUES (?)',
        [file]
      );
      console.log(`  📌  ${file} (marcado como aplicado sin ejecutar)`);
    }
    console.log('[migrate:bootstrap] Done.');
  } finally {
    await conn.end();
  }
}

const isBootstrap = process.argv.includes('--bootstrap');
(isBootstrap ? bootstrap : migrate)()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[migrate] Error:', err);
    process.exit(1);
  });
