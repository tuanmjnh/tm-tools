import webPush from 'web-push'
import { config } from '../../config/index'

export interface WebPushPayload {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
  data?: Record<string, unknown>
}

function hasVapidKeys(): boolean {
  return !!(config.webPush.publicKey && config.webPush.privateKey && config.webPush.publicKey.length > 20)
}

export async function sendNotification(subscription: PushSubscription, payload: WebPushPayload): Promise<void> {
  if (!hasVapidKeys()) {
    console.warn('[WebPush] VAPID keys not configured')
    return
  }
  webPush.setVapidDetails(config.webPush.subject, config.webPush.publicKey, config.webPush.privateKey)
  await webPush.sendNotification(subscription as any, JSON.stringify(payload), { TTL: 86400 })
}

export async function sendBulkNotifications(subscriptions: PushSubscription[], payload: WebPushPayload): Promise<void> {
  if (!hasVapidKeys()) return
  await Promise.allSettled(subscriptions.map(sub => sendNotification(sub, payload)))
}

export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const keys = webPush.generateVAPIDKeys()
  return { publicKey: keys.publicKey, privateKey: keys.privateKey }
}
