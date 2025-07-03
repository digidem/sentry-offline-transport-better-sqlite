import { makeNodeTransport } from '@sentry/node'
import { makeOfflineTransport, parseEnvelope, serializeEnvelope } from '@sentry/core'

import type { Envelope, OfflineStore, Transport } from '@sentry/core'
import type { NodeTransportOptions } from '@sentry/node/transports'
import type Database, { Statement } from 'better-sqlite3'

export const DEFAULT_TABLE = 'sentry_envelopes'

export type OfflineSqliteTransportOptions = Omit<OfflineTransportOptions, 'createStore'> & NodeTransportOptions & {
  db: Database
  table?: string
}

export function makeOfflineSqliteTransport ({ db, table = DEFAULT_TABLE, ...opts }: OfflineSqliteTransportOptions): Transport {
  return makeOfflineTransport(makeNodeTransport)({
    createStore: () => new SqliteOfflineStore(db, table),
    ...opts
  })
}

export class SqliteOfflineStore implements OfflineStore {
  #db: Database
  #insert: Statement
  #getOldest: Statement
  #deleteOldest: Statement
  constructor (db: Database, table: string = DEFAULT_TABLE) {
    this.#db = db
    db.exec(`
CREATE TABLE IF NOT EXISTS ${table} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time UNSIGNED BIGINT NOT NULL,
  envelope TEXT NOT NULL
);`)
    this.#getOldest = db.prepare(`SELECT * FROM ${table} ORDER BY Time ASC LIMIT 1`)
    this.#deleteOldest = db.prepare(`DELETE FROM ${table} ORDER BY Time ASC LIMIT 1`)
    this.#insert = db.prepare(`INSERT INTO ${table} (time, envelope) VALUES (?, ?)`)
  }

  async push (env: Envelope): Promise<void> {
    this.#insert.run(Date.now(), serializeEnvelope(env))
  }

  async unshift (env: Envelope): Promise<void> {
    const record = this.#getOldest.get()
    if (record === undefined) return await this.push(env)
    this.#insert.run(record.time - 1, serializeEnvelope(env))
  }

  async shift (): Promise<Envelope | undefined> {
    try {
      const record = this.#getOldest.get()
      this.#deleteOldest.run()

      return parseEnvelope(record.envelope)
    } catch {
      return undefined
    }
  }
}
