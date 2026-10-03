import type { Db } from 'mongodb'
import { MongoClient } from 'mongodb'
import { config } from '../../config/index'

let client: MongoClient | null = null
let db: Db | null = null

export async function getSharedConnection(): Promise<{ client: MongoClient, db: Db }> {
  if (client && db) return { client, db }

  client = new MongoClient(config.mongodb.uri)
  await client.connect()
  db = client.db(config.mongodb.dbName)
  return { client, db }
}

export async function closeSharedConnection(): Promise<void> {
  await client?.close()
  client = null
  db = null
}
