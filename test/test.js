/** @import { Envelope } from '@sentry/core' */

import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { createEnvelope } from '@sentry/core'
import { makeOfflineSqliteTransport, SqliteOfflineStore } from '../src/index.js'
import Database from 'better-sqlite3'

await describe('SqliteOfflineStore', async () => {
  await test('push should insert an envelope into the database', async () => {
    const db = new Database(':memory:')
    const store = new SqliteOfflineStore(db)

    const env = newEnv()
    await store.push(env)
    const record = await store.shift()
    assert.deepStrictEqual(record, env)
  })
  await test('unshift should insert an envelope at the beginning of the queue', async () => {
    const db = new Database(':memory:')
    const store = new SqliteOfflineStore(db)

    const firstEnv = newEnv('a')
    const secondEnv = newEnv('b')
    await store.unshift(firstEnv)
    await store.unshift(secondEnv)
    const record1 = await store.shift()
    assert.deepStrictEqual(record1, secondEnv)
    const record2 = await store.shift()
    assert.deepStrictEqual(record2, firstEnv)
  })
  await test('shift should remove and return the oldest envelope', async () => {
    const db = new Database(':memory:')
    const store = new SqliteOfflineStore(db)

    const env = newEnv()
    await store.push(env)
    const record = await store.shift()
    assert.deepStrictEqual(record, env)
    const isQueueEmpty = (await store.shift()) === undefined
    assert(isQueueEmpty)
  })
})

await test('makeOfflineSqliteTransport stores to db', async () => {
  const db = new Database(':memory:')
  const table = 'test'
  let hasCalled = false
  function request(args, cb) {
    hasCalled = true
    cb(new Error('Fake failure'))
  }
  const transport = makeOfflineSqliteTransport({
    url: 'http://example.com/whatever',
    db,
    table,
    flushAtStartup: true,
    httpModule: {
      request,
    },
  })
  await transport.send(newEnv())
  await waitUntil(() => hasCalled, 1000)
  const tables = db
    .prepare(
      `
      SELECT name FROM sqlite_schema WHERE
      type ='table' AND name NOT LIKE 'sqlite_%';
    `,
    )
    .all()
  assert.deepStrictEqual(tables, [{ name: 'test' }], 'table got created')
  const rows = db.prepare('SELECT * from test').all()
  assert.equal(rows.length, 1, 'item got added')
})

/**
 * @param {string} [prefix='a']
 * @returns {Envelope}
 */
function newEnv(prefix = 'a') {
  const id = `${prefix}a3ff046696b4bc6b609ce6d28fde9e2`
  return createEnvelope({ event_id: id, sent_at: '123' }, [
    [{ type: 'event' }, { event_id: id }],
  ])
}

/**
 * @param {() => boolean} fn
 * @param {number} timeout
 * @returns {Promise<void>}
 */
async function waitUntil(fn, timeout) {
  return await new Promise((resolve) => {
    let runtime = 0
    const interval = setInterval(() => {
      runtime += 100
      if (fn() || runtime >= timeout) {
        clearTimeout(interval)
        resolve()
      }
    }, 100)
  })
}
