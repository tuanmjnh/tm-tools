import type { Db } from 'mongodb'
import type { User, Mail, Member, Notification } from '../../../types'
import { getSharedConnection } from './shared'

export interface AppDatabase {
  getCustomers(): Promise<User[]>
  getMails(): Promise<Mail[]>
  getMembers(): Promise<Member[]>
  getNotifications(): Promise<Notification[]>
  saveFeedback(data: {
    email: string
    type: string
    title: string
    description: string
    screenshot?: string
    userId?: string
  }): Promise<void>
}

export class AppMongoDB implements AppDatabase {
  private db: Db | null = null

  async connect(): Promise<void> {
    const conn = await getSharedConnection()
    this.db = conn.db
    await this.ensureIndexes()
  }

  async disconnect(): Promise<void> {
    // shared — don't close here
  }

  private getDb(): Db {
    if (!this.db) throw new Error('App MongoDB not connected')
    return this.db
  }

  private async ensureIndexes(): Promise<void> {
    await this.getDb().collection('customers').createIndex({ email: 1 }, { unique: true })
    await this.getDb().collection('mails').createIndex({ id: 1 }, { unique: true })
  }

  async getCustomers(): Promise<User[]> {
    return (await this.getDb().collection('customers').find().toArray()) as unknown as User[]
  }

  async getMails(): Promise<Mail[]> {
    return (await this.getDb().collection('mails').find().sort({ date: -1 }).toArray()) as unknown as Mail[]
  }

  async getMembers(): Promise<Member[]> {
    return (await this.getDb().collection('members').find().toArray()) as unknown as Member[]
  }

  async getNotifications(): Promise<Notification[]> {
    return (await this.getDb().collection('notifications').find().sort({ date: -1 }).toArray()) as unknown as Notification[]
  }

  async saveFeedback(data: {
    email: string
    type: string
    title: string
    description: string
    screenshot?: string
    userId?: string
  }): Promise<void> {
    await this.getDb().collection('feedbacks').insertOne({
      ...data,
      createdAt: new Date()
    })
  }
}
