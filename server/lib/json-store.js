import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { serverConfig } from "../config.js";

const { Pool } = pg;

const ENTITY_TABLE = "app_entity_records";
const FILE_TABLE = "app_file_records";

let pool = null;
let schemaPromise = null;

const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
};

const readJson = async (filePath, fallback) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
};

const writeJson = async (filePath, data) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const compareValues = (left, right) => {
  if (left === right) {
    return 0;
  }
  if (left === undefined || left === null) {
    return -1;
  }
  if (right === undefined || right === null) {
    return 1;
  }
  return left > right ? 1 : -1;
};

const applySort = (items, sort) => {
  if (!sort) {
    return [...items];
  }

  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;

  return [...items].sort((a, b) => {
    const result = compareValues(a?.[field], b?.[field]);
    return desc ? -result : result;
  });
};

const applyLimit = (items, limit) => {
  if (!limit) {
    return items;
  }

  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return items;
  }

  return items.slice(0, parsed);
};

const matchesFilter = (item, filter = {}) => {
  return Object.entries(filter).every(([key, value]) => item?.[key] === value);
};

// Sort fields whose values are ISO-timestamp shaped strings ("2026-07-05…").
// For these, jsonb string ordering equals the JS comparator regardless of the
// database collation (ASCII, fixed structure), so ORDER BY can move into SQL.
// Anything else (name, full_name…) is collation-sensitive or type-mixed and
// keeps sorting in JS.
const SQL_SAFE_SORT_FIELD = /(^date$|_date$|_at$)/;

const parseSqlSafeSort = (sort) => {
  if (typeof sort !== "string" || sort.length === 0) {
    return null;
  }
  const desc = sort.startsWith("-");
  const field = desc ? sort.slice(1) : sort;
  if (!/^[\w-]+$/.test(field) || !SQL_SAFE_SORT_FIELD.test(field)) {
    return null;
  }
  return { field, desc };
};

const parseLimitCount = (limit) => {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.floor(parsed);
};

const isPostgresEnabled = () => Boolean(serverConfig.databaseUrl);

const getPool = () => {
  if (!isPostgresEnabled()) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: serverConfig.databaseUrl,
      ssl: serverConfig.databaseSsl
        ? {
            rejectUnauthorized: false,
          }
        : undefined,
    });
  }

  return pool;
};

const ensurePostgresSchema = async () => {
  const activePool = getPool();
  if (!activePool) {
    return;
  }

  if (!schemaPromise) {
    schemaPromise = (async () => {
      await activePool.query(`
        CREATE TABLE IF NOT EXISTS ${ENTITY_TABLE} (
          entity_name TEXT NOT NULL,
          record_id TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (entity_name, record_id)
        )
      `);
      await activePool.query(`
        CREATE INDEX IF NOT EXISTS ${ENTITY_TABLE}_entity_name_idx
        ON ${ENTITY_TABLE} (entity_name)
      `);
      // Accelerates the most common query shape: tenant-scoped listing/filtering
      // by organization_id (see buildTenantFilter). Without it, filtering large
      // entities (Invoice, Intervention…) degrades to a per-entity seq scan.
      await activePool.query(`
        CREATE INDEX IF NOT EXISTS ${ENTITY_TABLE}_entity_org_idx
        ON ${ENTITY_TABLE} (entity_name, (payload->>'organization_id'))
      `);
      await activePool.query(`
        CREATE TABLE IF NOT EXISTS ${FILE_TABLE} (
          store_key TEXT PRIMARY KEY,
          payload JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    })().catch((error) => {
      schemaPromise = null;
      throw error;
    });
  }

  await schemaPromise;
};

const insertEntityRecord = async (entityName, record) => {
  const activePool = getPool();
  await activePool.query(
    `
      INSERT INTO ${ENTITY_TABLE} (
        entity_name,
        record_id,
        payload,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3::jsonb, $4::timestamptz, $5::timestamptz)
      ON CONFLICT (entity_name, record_id)
      DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `,
    [
      entityName,
      String(record.id),
      JSON.stringify(record),
      record.created_date || new Date().toISOString(),
      record.updated_date || new Date().toISOString(),
    ]
  );
};

const createPostgresEntityStore = (entityName, filePath) => {
  let migrationPromise = null;

  const ensureMigrated = async () => {
    await ensurePostgresSchema();

    if (!migrationPromise) {
      migrationPromise = (async () => {
        const activePool = getPool();
        const countResult = await activePool.query(
          `SELECT COUNT(*)::int AS count FROM ${ENTITY_TABLE} WHERE entity_name = $1`,
          [entityName]
        );
        const count = countResult.rows[0]?.count || 0;

        if (count > 0) {
          return;
        }

        const legacyRecords = await readJson(filePath, []);
        if (!Array.isArray(legacyRecords) || legacyRecords.length === 0) {
          return;
        }

        for (const record of legacyRecords) {
          await insertEntityRecord(entityName, record);
        }
      })().catch((error) => {
        migrationPromise = null;
        throw error;
      });
    }

    await migrationPromise;
  };

  const readAll = async () => {
    await ensureMigrated();
    const activePool = getPool();
    const result = await activePool.query(
      `SELECT payload FROM ${ENTITY_TABLE} WHERE entity_name = $1`,
      [entityName]
    );
    return result.rows.map((row) => row.payload).filter(Boolean);
  };

  // Reads rows for this entity, pushing string-valued equality filters into SQL
  // so we don't transfer/scan the whole entity in Node. Only string equality is
  // pushed down (key and value are parameterised — no SQL injection via keys);
  // the `id` filter maps to the PK column `record_id` (= String(payload.id)).
  // Callers still re-apply matchesFilter in JS, so non-string filters and exact
  // typed semantics are preserved even though they aren't pushed down.
  //
  // Phase 2: ORDER BY + LIMIT are also pushed into SQL, so limit:1 lookups and
  // "latest N by date" queries stop transferring the whole entity. ORDER BY is
  // only pushed for SQL_SAFE_SORT_FIELD fields (ISO-timestamp shaped values:
  // ASCII, fixed structure, so jsonb string ordering equals the JS comparator
  // under any collation; NULLS FIRST/LAST mirrors compareValues' null-first-asc
  // rule, and jsonb null — the lowest jsonb type — lands on the same side).
  // Collation-sensitive fields (name, full_name…) keep sorting in JS. When a
  // sort is requested but not SQL-safe, LIMIT is not pushed either (the top-N
  // can only be known after the JS sort). Returns { rows, truncated }:
  // truncated=true means SQL LIMIT may have cut off further matching rows, so
  // filter() falls back to an unbounded fetch if the JS re-filter drops rows.
  const readScoped = async (filter = {}, { sort, limit } = {}) => {
    await ensureMigrated();
    const activePool = getPool();

    const conditions = ["entity_name = $1"];
    const params = [entityName];
    for (const [key, value] of Object.entries(filter || {})) {
      if (typeof value !== "string") {
        continue;
      }
      if (key === "id") {
        params.push(value);
        conditions.push(`record_id = $${params.length}`);
        continue;
      }
      params.push(key);
      const keyIndex = params.length;
      params.push(value);
      conditions.push(`payload->>$${keyIndex} = $${params.length}`);
    }

    const parsedSort = parseSqlSafeSort(sort);
    const parsedLimit = parseLimitCount(limit);
    const canPushLimit = parsedLimit !== null && (!sort || parsedSort !== null);

    let orderClause = "";
    if (canPushLimit && parsedSort) {
      params.push(parsedSort.field);
      // Cast disambiguates jsonb->text from jsonb->integer for the parameter.
      orderClause = ` ORDER BY payload->($${params.length}::text) ${
        parsedSort.desc ? "DESC NULLS LAST" : "ASC NULLS FIRST"
      }`;
    }

    let limitClause = "";
    if (canPushLimit) {
      params.push(parsedLimit);
      limitClause = ` LIMIT $${params.length}`;
    }

    const result = await activePool.query(
      `SELECT payload FROM ${ENTITY_TABLE} WHERE ${conditions.join(
        " AND "
      )}${orderClause}${limitClause}`,
      params
    );
    const rows = result.rows.map((row) => row.payload).filter(Boolean);
    return {
      rows,
      truncated: canPushLimit && rows.length >= parsedLimit,
    };
  };

  return {
    async list({ sort, limit } = {}) {
      const { rows } = await readScoped({}, { sort, limit });
      return applyLimit(applySort(rows, sort), limit);
    },
    async filter({ filter = {}, sort, limit } = {}) {
      const { rows, truncated } = await readScoped(filter, { sort, limit });
      const filtered = rows.filter((item) => matchesFilter(item, filter));

      // SQL equality on payload->>key can over-match typed values (JSON number
      // 5 vs filter "5"). If that trimmed a full page, matching rows may hide
      // beyond the LIMIT — refetch without it for exact semantics.
      if (truncated && filtered.length < rows.length) {
        const full = await readScoped(filter);
        const exact = full.rows.filter((item) => matchesFilter(item, filter));
        return applyLimit(applySort(exact, sort), limit);
      }

      return applyLimit(applySort(filtered, sort), limit);
    },
    async create(data) {
      await ensureMigrated();
      const now = new Date().toISOString();
      const record = {
        id: data?.id || randomUUID(),
        created_date: data?.created_date || now,
        updated_date: now,
        ...data,
      };

      await insertEntityRecord(entityName, record);
      return record;
    },
    async update(id, patch) {
      await ensureMigrated();
      const activePool = getPool();
      const existingResult = await activePool.query(
        `
          SELECT payload
          FROM ${ENTITY_TABLE}
          WHERE entity_name = $1 AND record_id = $2
          LIMIT 1
        `,
        [entityName, String(id)]
      );
      const existing = existingResult.rows[0]?.payload || null;

      if (!existing) {
        return null;
      }

      const updated = {
        ...existing,
        ...patch,
        id,
        updated_date: new Date().toISOString(),
      };

      await insertEntityRecord(entityName, updated);
      return updated;
    },
    async delete(id) {
      await ensureMigrated();
      const activePool = getPool();
      const result = await activePool.query(
        `
          DELETE FROM ${ENTITY_TABLE}
          WHERE entity_name = $1 AND record_id = $2
        `,
        [entityName, String(id)]
      );

      return result.rowCount > 0;
    },
    async upsertSeed(seedRecords) {
      await ensureMigrated();
      const existing = await readAll();
      if (existing.length > 0) {
        return existing;
      }

      for (const record of seedRecords) {
        await insertEntityRecord(entityName, record);
      }

      return seedRecords;
    },
  };
};

const createPostgresFileStore = (relativeFilePath, filePath, fallbackValue) => {
  let migrationPromise = null;

  const ensureMigrated = async () => {
    await ensurePostgresSchema();

    if (!migrationPromise) {
      migrationPromise = (async () => {
        const activePool = getPool();
        const result = await activePool.query(
          `SELECT store_key FROM ${FILE_TABLE} WHERE store_key = $1 LIMIT 1`,
          [relativeFilePath]
        );

        if (result.rows[0]?.store_key) {
          return;
        }

        const legacyValue = await readJson(filePath, fallbackValue);
        await activePool.query(
          `
            INSERT INTO ${FILE_TABLE} (store_key, payload, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (store_key)
            DO NOTHING
          `,
          [relativeFilePath, JSON.stringify(legacyValue)]
        );
      })().catch((error) => {
        migrationPromise = null;
        throw error;
      });
    }

    await migrationPromise;
  };

  return {
    async read() {
      await ensureMigrated();
      const activePool = getPool();
      const result = await activePool.query(
        `SELECT payload FROM ${FILE_TABLE} WHERE store_key = $1 LIMIT 1`,
        [relativeFilePath]
      );
      return result.rows[0]?.payload ?? fallbackValue;
    },
    async write(data) {
      await ensureMigrated();
      const activePool = getPool();
      await activePool.query(
        `
          INSERT INTO ${FILE_TABLE} (store_key, payload, updated_at)
          VALUES ($1, $2::jsonb, NOW())
          ON CONFLICT (store_key)
          DO UPDATE SET
            payload = EXCLUDED.payload,
            updated_at = NOW()
        `,
        [relativeFilePath, JSON.stringify(data)]
      );
      return data;
    },
  };
};

const createLocalEntityStore = (entityName, filePath) => {
  const readAll = async () => {
    const records = await readJson(filePath, []);
    return Array.isArray(records) ? records : [];
  };

  const writeAll = async (records) => {
    await writeJson(filePath, records);
  };

  return {
    async list({ sort, limit } = {}) {
      const records = await readAll();
      return applyLimit(applySort(records, sort), limit);
    },
    async filter({ filter = {}, sort, limit } = {}) {
      const records = await readAll();
      const filtered = records.filter((item) => matchesFilter(item, filter));
      return applyLimit(applySort(filtered, sort), limit);
    },
    async create(data) {
      const records = await readAll();
      const now = new Date().toISOString();
      const record = {
        id: data?.id || randomUUID(),
        created_date: data?.created_date || now,
        updated_date: now,
        ...data,
      };
      records.push(record);
      await writeAll(records);
      return record;
    },
    async update(id, patch) {
      const records = await readAll();
      const index = records.findIndex((item) => item.id === id);

      if (index === -1) {
        return null;
      }

      const updated = {
        ...records[index],
        ...patch,
        id,
        updated_date: new Date().toISOString(),
      };

      records[index] = updated;
      await writeAll(records);
      return updated;
    },
    async delete(id) {
      const records = await readAll();
      const next = records.filter((item) => item.id !== id);
      const removed = next.length !== records.length;

      if (removed) {
        await writeAll(next);
      }

      return removed;
    },
    async upsertSeed(seedRecords) {
      const records = await readAll();
      if (records.length > 0) {
        return records;
      }
      await writeAll(seedRecords);
      return seedRecords;
    },
  };
};

const createLocalFileStore = (filePath, fallbackValue) => {
  return {
    async read() {
      return readJson(filePath, fallbackValue);
    },
    async write(data) {
      await writeJson(filePath, data);
      return data;
    },
  };
};

export const initializeStoreBackend = async () => {
  if (!isPostgresEnabled()) {
    return;
  }

  await ensurePostgresSchema();
};

export const createJsonEntityStore = (entityName) => {
  const filePath = path.join(serverConfig.dataDir, "entities", `${entityName}.json`);

  if (isPostgresEnabled()) {
    return createPostgresEntityStore(entityName, filePath);
  }

  return createLocalEntityStore(entityName, filePath);
};

export const createJsonFileStore = (relativeFilePath, fallbackValue = {}) => {
  const filePath = path.join(serverConfig.dataDir, relativeFilePath);

  if (isPostgresEnabled()) {
    return createPostgresFileStore(relativeFilePath, filePath, fallbackValue);
  }

  return createLocalFileStore(filePath, fallbackValue);
};
