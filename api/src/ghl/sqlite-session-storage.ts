import { DatabaseSync } from 'node:sqlite'
import { dirname, resolve } from 'node:path'
import { mkdirSync } from 'node:fs'
import { SessionStorage, type ISessionData } from '@gohighlevel/api-client'

type StoredSessionRow = {
  session_json: string
}

type AccessTokenRow = {
  access_token: string | null
}

type RefreshTokenRow = {
  refresh_token: string | null
}

export class SQLiteSessionStorage extends SessionStorage {
  private clientId = ''
  private db: DatabaseSync | null = null
  private readonly dbPath: string
  private readonly tableName: string

  constructor(dbPath: string, tableName = 'application_sessions') {
    super()
    this.dbPath = resolve(dbPath)
    this.tableName = tableName
  }

  setClientId(clientId: string) {
    if (!clientId) {
      throw new Error('ClientId is required for session storage')
    }

    this.clientId = clientId
  }

  async init() {
    if (this.db) {
      return
    }

    mkdirSync(dirname(this.dbPath), { recursive: true })
    this.db = new DatabaseSync(this.dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    await this.createCollection(this.tableName)
  }

  async disconnect() {
    this.db?.close()
    this.db = null
  }

  async createCollection(collectionName: string) {
    const db = this.getDb()

    db.exec(`
      CREATE TABLE IF NOT EXISTS ${this.quoteIdentifier(collectionName)} (
        application_id TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        session_json TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        expire_at INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (application_id, resource_id)
      )
    `)
  }

  async getCollection(collectionName: string) {
    await this.createCollection(collectionName)
    return this.getDb()
  }

  async setSession(resourceId: string, sessionData: ISessionData) {
    const db = this.getDb()
    const applicationId = this.getApplicationId()
    const now = new Date().toISOString()
    const expireAt = this.calculateExpireAt(sessionData.expires_in)
    const sessionWithExpiry: ISessionData = {
      ...sessionData,
      expire_at: expireAt,
    }

    db.prepare(`
      INSERT INTO ${this.quoteIdentifier(this.tableName)} (
        application_id,
        resource_id,
        session_json,
        access_token,
        refresh_token,
        expire_at,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(application_id, resource_id) DO UPDATE SET
        session_json = excluded.session_json,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        expire_at = excluded.expire_at,
        updated_at = excluded.updated_at
    `).run(
      applicationId,
      resourceId,
      JSON.stringify(sessionWithExpiry),
      sessionWithExpiry.access_token ?? null,
      sessionWithExpiry.refresh_token ?? null,
      sessionWithExpiry.expire_at ?? null,
      now,
      now
    )
  }

  async getSession(resourceId: string) {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT session_json
          FROM ${this.quoteIdentifier(this.tableName)}
          WHERE application_id = ? AND resource_id = ?
        `
      )
      .get(this.getApplicationId(), resourceId) as StoredSessionRow | undefined

    if (!row) {
      return null
    }

    return JSON.parse(row.session_json) as ISessionData
  }

  async deleteSession(resourceId: string) {
    const db = this.getDb()

    db.prepare(
      `
        DELETE FROM ${this.quoteIdentifier(this.tableName)}
        WHERE application_id = ? AND resource_id = ?
      `
    ).run(this.getApplicationId(), resourceId)
  }

  async getAccessToken(resourceId: string) {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT access_token
          FROM ${this.quoteIdentifier(this.tableName)}
          WHERE application_id = ? AND resource_id = ?
        `
      )
      .get(this.getApplicationId(), resourceId) as AccessTokenRow | undefined

    return row?.access_token ?? null
  }

  async getRefreshToken(resourceId: string) {
    const db = this.getDb()
    const row = db
      .prepare(
        `
          SELECT refresh_token
          FROM ${this.quoteIdentifier(this.tableName)}
          WHERE application_id = ? AND resource_id = ?
        `
      )
      .get(this.getApplicationId(), resourceId) as RefreshTokenRow | undefined

    return row?.refresh_token ?? null
  }

  override async getSessionsByApplication() {
    const db = this.getDb()
    const rows = db
      .prepare(
        `
          SELECT session_json
          FROM ${this.quoteIdentifier(this.tableName)}
          WHERE application_id = ?
          ORDER BY updated_at DESC
        `
      )
      .all(this.getApplicationId()) as StoredSessionRow[]

    return rows.map((row) => JSON.parse(row.session_json) as ISessionData)
  }

  getDatabasePath() {
    return this.dbPath
  }

  private getApplicationId() {
    if (!this.clientId) {
      throw new Error('ClientId not set. Make sure HighLevel has a valid clientId configured.')
    }

    return this.clientId.split('-')[0]
  }

  private getDb() {
    if (!this.db) {
      throw new Error('SQLiteSessionStorage is not initialized')
    }

    return this.db
  }

  private quoteIdentifier(identifier: string) {
    return `"${identifier.replaceAll('"', '""')}"`
  }
}
