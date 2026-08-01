import { config } from '../../config/index'
import type { WebPushPayload } from './web-push'

let webPushService: typeof import('./web-push') | null = null

export async function sendPushNotification(subscription: PushSubscription, payload: WebPushPayload): Promise<void> {
  if (!webPushService) {
    webPushService = await import('./web-push')
  }
  await webPushService.sendNotification(subscription, payload)
}

export async function sendBulkPush(subscriptions: PushSubscription[], payload: WebPushPayload): Promise<void> {
  if (!webPushService) {
    webPushService = await import('./web-push')
  }
  await webPushService.sendBulkNotifications(subscriptions, payload)
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
