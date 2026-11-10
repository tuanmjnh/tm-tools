import { detectRuntime } from '#server/modules/document/runtime'
import { hasAccessTokenVerificationMaterial } from '#server/utils/jwt'

/**
 * Public connection status. This is the only unauthenticated answer about the
 * device: whether the runtime exists and whether Hub tokens can be verified.
 * Hub URL, App ID and every credential stay behind `/api/system/connection`,
 * which requires a root session.
 */
export default defineEventHandler(() => {
  return {
    success: true,
    data: {
      runtime: detectRuntime(),
      configured: hasAccessTokenVerificationMaterial()
    }
  }
})
