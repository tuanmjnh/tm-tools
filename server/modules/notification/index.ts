import { getDatabase } from '../database/index'
import { config } from '../../config/index'
import type { WebPushPayload } from './web-push'
import { sendFcmPush, initializeFirebaseAdmin } from './firebase'

interface WebPushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

let webPushService: typeof import('./web-push') | null = null

export async function sendPushNotification(subscription: unknown, payload: WebPushPayload): Promise<void> {
  if (!webPushService) {
    webPushService = await import('./web-push')
  }
  await webPushService.sendNotification(subscription as WebPushSubscription, payload)
}

export async function sendBulkPush(subscriptions: unknown[], payload: WebPushPayload): Promise<void> {
  if (!webPushService) {
    webPushService = await import('./web-push')
  }
  await webPushService.sendBulkNotifications(subscriptions as WebPushSubscription[], payload)
}

export function getVapidKeys() {
  return {
    publicKey: config.webPush.publicKey,
    privateKey: config.webPush.privateKey,
    subject: config.webPush.subject
  }
}

export function isPushEnabled(): boolean {
  return !!config.webPush.publicKey && !!config.webPush.privateKey
}

export async function createAndSendNotification(
  userId: string,
  payload: {
    title: string
    body: string
    url?: string
    sender?: { name: string, avatar?: string }
    type?: string
  }
) {
  try {
    const db = await getDatabase()

    // 1. Save notification to DB history
    const saved = await db.saveNotification({
      recipientId: userId,
      sender: payload.sender || { name: 'System' },
      body: payload.body,
      url: payload.url || '',
      type: payload.type || 'system',
      isRead: false
    }) as { id: string } | null

    // 2. Fetch user subscriptions
    const subscriptions = await db.getPushSubscriptions(userId)
    if (!subscriptions || subscriptions.length === 0) return saved

    // 3. Dispatch to all active devices
    const pushPayload = {
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
      icon: '/pwa-192x192.png',
      badge: '/favicon.ico',
      data: {
        notificationId: saved?.id || '',
        type: payload.type || 'system'
      }
    }

    const firebaseAdminInitialized = !!initializeFirebaseAdmin()

    await Promise.allSettled(
      subscriptions.map(async (subVal) => {
        const sub = subVal as Record<string, unknown>
        try {
          const fcmToken = sub.fcmToken as string | undefined
          const endpoint = sub.endpoint as string | undefined
          const keys = sub.keys as Record<string, string> | undefined
          if (fcmToken && firebaseAdminInitialized) {
            // FCM token delivery path
            const stringifiedData: Record<string, string> = {
              notificationId: pushPayload.data.notificationId,
              type: pushPayload.data.type,
              url: pushPayload.url
            }
            await sendFcmPush(fcmToken, {
              title: pushPayload.title,
              body: pushPayload.body,
              url: pushPayload.url,
              data: stringifiedData
            })
          } else if (endpoint && keys?.p256dh) {
            // Standard Web Push path
            await sendPushNotification(sub, pushPayload)
          }
        } catch (error) {
          console.error('[NotificationCoordinator] Push delivery failed for device:', error)
          // Clean up expired/invalid subscription if needed
          const identifier = (sub.fcmToken || sub.endpoint) as string | undefined
          if (identifier) {
            await db.removePushSubscription(userId, identifier).catch(() => {})
          }
        }
      })
    )

    return saved
  } catch (error) {
    console.error('[NotificationCoordinator] createAndSendNotification error:', error)
    return null
  }
}
