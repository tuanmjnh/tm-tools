// R145 (§207): the ONE definition of "which config slots hold API keys".
// R139–R143 kept two byte-identical literals (main.cjs masks/decrypts,
// key-migrate.cjs filters) with a grep-pin spec as the drift alarm. The
// pin proved the rule mattered but was always a step behind: an edit
// that broke one copy turned a test red AFTER the divergence shipped in
// review. One module, three consumers (main, key-migrate, ai-gateway
// docs/tests) — drift becomes impossible, not just detected.
'use strict'

// API secrets use the full slot shape; configuration values that are not
// credentials (such as AI_BASE_URL and AI_MODEL) are never encrypted.
// The bare `AI_API_KEY` global
// slot MUST match (the surface suffix is optional — this exact subtlety
// is what §206.2 audited in the old inline capture).
//
// The Hub connection stores the shared JWT secret and the App Secret in the
// same file, so they join the vault: encrypted with the OS keychain at rest,
// masked to '********' on read. Public identifiers (NUXT_PUBLIC_HUB_URL,
// NUXT_PUBLIC_HUB_APP_ID) stay readable — they are not credentials.
const SECRET_SLOT_RE = /^(AI_API_KEY(_.+)?|TMCUT_GEMINI_API_KEY|AUTH_JWT_SECRET|AUTH_REFRESH_TOKEN_SECRET|NUXT_HUB_APP_SECRET|SUPABASE_SERVICE_ROLE_KEY|CLOUDINARY_API_SECRET|FIREBASE_PRIVATE_KEY|WEB_PUSH_PRIVATE_KEY|MONGODB_URI)$/

/** True when a config key is a credential slot (encrypted at rest, masked
 *  to the renderer, re-encrypted by the migration). */
function isSecretSlot(key) {
  return SECRET_SLOT_RE.test(key)
}

module.exports = { SECRET_SLOT_RE, isSecretSlot }
