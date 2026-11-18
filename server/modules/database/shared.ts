import type { Db, MongoClient } from 'mongodb'
import mongoose, { type Connection } from 'mongoose'
import { createMongoConnectionManager } from '@tuanmjnh/tm-mongo'
import { config } from '../../config/index'

const manager = createMongoConnectionManager<Connection>({
  createConnection: (uri, options) => mongoose.createConnection(uri, options)
})

export async function getSharedConnection(): Promise<{ client: MongoClient, db: Db }> {
  const conn = await manager.get(config.mongodb.uri, config.mongodb.dbName, 'tm-tools')
  if (!conn || !conn.db) throw new Error('MongoDB is not reachable')
  return { client: conn.getClient(), db: conn.db }
}

export async function closeSharedConnection(): Promise<void> {
  await manager.close('tm-tools')
}
