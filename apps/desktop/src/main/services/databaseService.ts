import fs from "node:fs";
import path from "node:path";
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from "sql.js";

export class DatabaseService {
  private sql!: SqlJsStatic;
  private db!: Database;
  private transactionDepth = 0;

  constructor(private readonly dbPath: string) {}

  async init(): Promise<void> {
    const sqlWasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const wasmDir = path.dirname(sqlWasmPath);

    this.sql = await initSqlJs({
      locateFile: (file: string) => path.join(wasmDir, file)
    });

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new this.sql.Database(fileBuffer);
    } else {
      this.db = new this.sql.Database();
    }

    this.applySchema();
    this.persist();
  }

  close(): void {
    this.persist();
    this.db.close();
  }

  run(sql: string, params: SqlValue[] = []): void {
    this.db.run(sql, params);
    if (this.transactionDepth === 0) {
      this.persist();
    }
  }

  query<T>(sql: string, params: SqlValue[] = []): T[] {
    const stmt = this.db.prepare(sql, params);
    const rows: T[] = [];

    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }

    stmt.free();
    return rows;
  }

  transaction(fn: () => void): void {
    const isOuterTransaction = this.transactionDepth === 0;
    if (isOuterTransaction) {
      this.db.run("BEGIN TRANSACTION");
    }

    this.transactionDepth += 1;
    try {
      fn();
      this.transactionDepth -= 1;

      if (isOuterTransaction) {
        this.db.run("COMMIT");
        this.persist();
      }
    } catch (error) {
      this.transactionDepth = Math.max(this.transactionDepth - 1, 0);

      if (isOuterTransaction) {
        try {
          this.db.run("ROLLBACK");
        } catch (_rollbackError) {
          // Preserve original error when rollback fails or transaction already closed.
        }
        this.persist();
      }

      throw error;
    }
  }

  private applySchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS profiles (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_title TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile_secrets (
        profile_id TEXT PRIMARY KEY,
        keychain_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(profile_id) REFERENCES profiles(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        state TEXT NOT NULL,
        config_json TEXT NOT NULL,
        broadcast_id TEXT,
        stream_id TEXT,
        error_code TEXT,
        error_message TEXT,
        FOREIGN KEY(profile_id) REFERENCES profiles(id)
      );

      CREATE TABLE IF NOT EXISTS session_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        ts TEXT NOT NULL,
        level TEXT NOT NULL,
        code TEXT NOT NULL,
        message TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_profile_id ON sessions(profile_id);
      CREATE INDEX IF NOT EXISTS idx_session_events_session_id ON session_events(session_id);
      CREATE INDEX IF NOT EXISTS idx_session_events_ts ON session_events(ts);
    `);
  }

  private persist(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }
}
