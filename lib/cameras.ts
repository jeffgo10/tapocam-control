import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import type { CameraDraft, CameraPatch, SavedCamera } from "@/lib/types";

export type CameraRecord = SavedCamera & {
  password: string;
};

export class DatabaseUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseUnavailable";
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cameras (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(64) NOT NULL,
    ip VARCHAR(128) NOT NULL,
    username VARCHAR(128) NOT NULL,
    password VARCHAR(128) NOT NULL,
    created_at VARCHAR(32) NOT NULL,
    updated_at VARCHAR(32) NOT NULL
  )
`;

let pool: mysql.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): mysql.Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "tapocam",
    password: process.env.MYSQL_PASSWORD ?? "tapocam",
    database: process.env.MYSQL_DATABASE ?? "tapocam",
    waitForConnections: true,
    connectionLimit: 10,
  });
  return pool;
}

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw unavailable(error);
      });
  }
  return schemaReady;
}

export function toPublic(camera: CameraRecord): SavedCamera {
  return {
    id: camera.id,
    name: camera.name,
    ip: camera.ip,
    username: camera.username,
  };
}

export async function listCameras(): Promise<SavedCamera[]> {
  const [rows] = await execute(
    "SELECT id, name, ip, username FROM cameras ORDER BY created_at ASC, name ASC",
  );
  return (rows as SavedCamera[]).map((row) => ({
    id: row.id,
    name: row.name,
    ip: row.ip,
    username: row.username,
  }));
}

export async function getCamera(id: string): Promise<CameraRecord | null> {
  const [rows] = await execute(
    "SELECT id, name, ip, username, password FROM cameras WHERE id = ?",
    [id],
  );
  const row = (rows as CameraRecord[])[0];
  return row ?? null;
}

export async function createCamera(input: CameraDraft): Promise<CameraRecord> {
  const camera: CameraRecord = {
    id: randomUUID(),
    name: input.name,
    ip: input.ip,
    username: input.username,
    password: input.password,
  };
  const now = new Date().toISOString();
  await execute(
    `INSERT INTO cameras (id, name, ip, username, password, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [camera.id, camera.name, camera.ip, camera.username, camera.password, now, now],
  );
  return camera;
}

export async function updateCamera(
  id: string,
  patch: CameraPatch,
): Promise<CameraRecord | null> {
  const current = await getCamera(id);
  if (!current) return null;
  const next: CameraRecord = {
    id,
    name: patch.name ?? current.name,
    ip: patch.ip ?? current.ip,
    username: patch.username ?? current.username,
    password: patch.password ?? current.password,
  };
  await execute(
    `UPDATE cameras
     SET name = ?, ip = ?, username = ?, password = ?, updated_at = ?
     WHERE id = ?`,
    [next.name, next.ip, next.username, next.password, new Date().toISOString(), id],
  );
  return next;
}

export async function deleteCamera(id: string): Promise<boolean> {
  const [result] = await execute("DELETE FROM cameras WHERE id = ?", [id]);
  return (result as mysql.ResultSetHeader).affectedRows > 0;
}

async function execute(sql: string, params: string[] = []) {
  try {
    await ensureSchema();
    return await getPool().execute(sql, params);
  } catch (error) {
    if (error instanceof DatabaseUnavailable) throw error;
    throw unavailable(error);
  }
}

function unavailable(error: unknown): DatabaseUnavailable {
  const message = error instanceof Error ? error.message : "";
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|PROTOCOL_CONNECTION_LOST/.test(message)) {
    return new DatabaseUnavailable(
      "MySQL is not reachable. Start it with docker compose up -d.",
    );
  }
  return new DatabaseUnavailable("Could not use the camera database.");
}
