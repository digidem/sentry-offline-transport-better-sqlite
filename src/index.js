/** @import { Envelope, OfflineStore, Transport, OfflineTransportOptions } from '@sentry/core' */
/** @import { Statement, Database } from 'better-sqlite3' */

/** @typedef {Parameters<typeof makeNodeTransport>[0]} NodeTransportOptions */
/**
 * @typedef {Omit<OfflineTransportOptions, 'createStore'> & NodeTransportOptions & {
 *   db: Database
 *   table?: string
 * }} OfflineSqliteTransportOptions
 */

/** @typedef {{time: number, envelope: string | Uint8Array, id: number}} Record */

import { makeNodeTransport } from '@sentry/node'
import {
  makeOfflineTransport,
  parseEnvelope,
  serializeEnvelope,
} from '@sentry/core'
export const DEFAULT_TABLE = 'sentry_envelopes'
/**
 * @param {OfflineSqliteTransportOptions} opts
 * @returns {Transport}
 */
export function makeOfflineSqliteTransport({
  db,
  table = DEFAULT_TABLE,
  ...opts
}) {
  return makeOfflineTransport(makeNodeTransport)({
    createStore: () => new SqliteOfflineStore(db, table),
    ...opts,
  })
}

/** @implements {OfflineStore} */
export class SqliteOfflineStore {
  #db
  #insert
  #getOldest
  #deleteOldest
  /**
   * @param {Database} db
   * @param {string} [table=DEFAULT_TABLE]
   */
  constructor(db, table = DEFAULT_TABLE) {
    this.#db = db
    db.exec(`
CREATE TABLE IF NOT EXISTS ${table} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  time UNSIGNED BIGINT NOT NULL,
  envelope TEXT NOT NULL
);`)
    this.#getOldest = db.prepare(
      `SELECT * FROM ${table} ORDER BY Time ASC LIMIT 1`,
    )
    this.#deleteOldest = db.prepare(
      `DELETE FROM ${table} ORDER BY Time ASC LIMIT 1`,
    )
    this.#insert = db.prepare(
      `INSERT INTO ${table} (time, envelope) VALUES (?, ?)`,
    )
  }
  /**
   * @param {Envelope} env
   * @returns {Promise<void>}
   */
  async push(env) {
    this.#insert.run(Date.now(), serializeEnvelope(env))
  }
  /**
   * @param {Envelope} env
   * @returns {Promise<void>}
   */
  async unshift(env) {
    const record = /** @type {Record | undefined}*/ (this.#getOldest.get())
    if (record === undefined) {
      return await this.push(env)
    }
    this.#insert.run(record.time - 1, serializeEnvelope(env))
  }
  /**
   * @returns {Promise<Envelope | undefined>}
   */
  async shift() {
    try {
      const record = /** @type {Record}*/ (this.#getOldest.get())
      this.#deleteOldest.run()
      return parseEnvelope(record.envelope)
    } catch {
      return undefined
    }
  }
}
