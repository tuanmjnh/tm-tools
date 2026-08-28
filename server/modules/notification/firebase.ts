import { initializeApp, cert, getApps, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
import { config } from '../../config/index'

export function initializeFirebaseAdmin(): App | null {
  const globalFirebase = globalThis as typeof globalThis & { __firebaseAdminApp?: App }
  if (globalFirebase.__firebaseAdminApp) return globalFirebase.__firebaseAdminApp

  const projectId = config.firebase.projectId
  const clientEmail = config.firebase.clientEmail
  let privateKey = config.firebase.privateKey

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[FirebaseAdmin] Credentials missing in configuration')
    return null
  }

  // Clean the private key formatting
  privateKey = privateKey.replace(/\\n/g, '\n').replace(/\n/g, '\n').trim().replace(/^['"]|['"]$/g, '')

  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error('[FirebaseAdmin] Invalid Private Key format. Missing headers.')
    return null
  }

  try {
    if (getApps().length > 0) {
      const existingApp = getApps().find(app => app.name === 'tm_tools_firebase_app')
      if (existingApp) {
        globalFirebase.__firebaseAdminApp = existingApp
        return existingApp
      }
    }

    globalFirebase.__firebaseAdminApp = initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey
      })
    }, 'tm_tools_firebase_app')

    console.log(`[FirebaseAdmin] Initialized successfully for project: ${projectId}`)
    return globalFirebase.__firebaseAdminApp
  } catch (error) {
    console.error('[FirebaseAdmin] Failed to initialize Firebase Admin:', error)
    return null
  }
}

export async function sendFcmPush(token: string, payload: { title: string, body: string, url?: string, data?: Record<string, string> }) {
  const app = initializeFirebaseAdmin()
  if (!app) {
    console.warn('[FirebaseAdmin] Firebase Admin is not initialized. Skipping FCM push.')
    return null
  }

  try {
    const messaging = getMessaging(app)
    const response = await messaging.send({
      token,
      notification: {
        title: payload.title,
        body: payload.body
      },
      data: payload.data || {},
      webpush: {
        fcmOptions: {
          link: payload.url || '/'
        }
      }
    })
    return response
  } catch (error) {
    console.error('[FirebaseAdmin] FCM push failed:', error)
    throw error
  }
}
