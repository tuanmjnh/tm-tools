# Implementation Plan - AI Chat Module with Multi-Provider Support

This plan outlines the changes required to introduce a new AI Chat module in the application with support for multiple AI providers (Google Gemini, OpenRouter, and custom OpenAI-compatible endpoints) and unified database config storage across both MongoDB and Supabase.

## Database Abstraction (Standardization)

> [!IMPORTANT]
> Currently, the system config service in `server/modules/config/service.ts` directly uses MongoDB. We will standardize this by abstracting config storage through the `DatabaseAdapter` interface so that configurations are saved and loaded from either MongoDB (`app_config` collection) or Supabase (`app_config` table) depending on `AUTH_PROVIDER`.

We will add a new Supabase migration:
```sql
CREATE TABLE IF NOT EXISTS public.app_config (
  id text PRIMARY KEY,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);
```

## Proposed Changes

---

### 1. Database & Config Standardization

#### [MODIFY] [server/modules/database/index.ts](file:///d:/Applications/tm-tools/server/modules/database/index.ts)
- Add the following methods to the `DatabaseAdapter` interface:
  - `getSystemConfig(): Promise<Record<string, string>>`
  - `saveSystemConfig(values: Record<string, string>): Promise<void>`

#### [MODIFY] [server/modules/database/mongodb.ts](file:///d:/Applications/tm-tools/server/modules/database/mongodb.ts)
- Implement `getSystemConfig` and `saveSystemConfig` using the `app_config` collection.

#### [MODIFY] [server/modules/database/supabase.ts](file:///d:/Applications/tm-tools/server/modules/database/supabase.ts)
- Implement `getSystemConfig` and `saveSystemConfig` using the `app_config` table.

#### [NEW] [supabase/migrations/20260801_app_config.sql](file:///d:/Applications/tm-tools/supabase/migrations/20260801_app_config.sql)
- SQL migration file to create the `app_config` table in Supabase.

#### [MODIFY] [server/modules/config/service.ts](file:///d:/Applications/tm-tools/server/modules/config/service.ts)
- Update `loadConfigValues` and `saveConfigValues` to call the active database adapter instead of hardcoded MongoDB connection.
- Add `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` to `CONFIG_KEYS` and `KEY_MAP`.

#### [MODIFY] [server/config/index.ts](file:///d:/Applications/tm-tools/server/config/index.ts)
- Add `ai` config section:
  ```typescript
  ai: {
    provider: string
    apiKey: string
    baseUrl: string
    model: string
  }
  ```
- Add `chat` to the list of available modules.

---

### 2. Config UI & Localization

#### [MODIFY] [app/pages/system/config.vue](file:///d:/Applications/tm-tools/app/pages/system/config.vue)
- Add the AI provider fields (`AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`) to the connections config form.
- Provide a dropdown selector for the AI Provider (Google Gemini, OpenRouter, Custom OpenAI).

#### [MODIFY] [i18n/locales/en.json](file:///d:/Applications/tm-tools/i18n/locales/en.json)
- Add translation labels for the new Chat route (`nav.chat`), AI Connections settings, and placeholder texts.

#### [MODIFY] [i18n/locales/vi.json](file:///d:/Applications/tm-tools/i18n/locales/vi.json)
- Translate added strings to Vietnamese.

---

### 3. Route & Role Seeding

#### [MODIFY] [server/modules/auth/seed-data.ts](file:///d:/Applications/tm-tools/server/modules/auth/seed-data.ts)
- Add the `/chat` route under `seedRoutes` at sort: 3 (moving subsequent routes down).
- Grant default `chat` permissions (`read`, `write`) to the `admin` role.

---

### 4. API Endpoint & Chat UI

#### [NEW] [server/api/chat/index.post.ts](file:///d:/Applications/tm-tools/server/api/chat/index.post.ts)
- POST handler to communicate with the chosen AI provider:
  - If Google Gemini, call the Gemini generateContent native endpoint.
  - If OpenRouter or Custom, call the OpenAI-compatible chat completions endpoint (`${baseUrl}/chat/completions`).

#### [NEW] [app/pages/chat.vue](file:///d:/Applications/tm-tools/app/pages/chat.vue)
- AI Chat client page using Nuxt UI v4 chat components (`UChatMessages`, `UChatMessage`, `UChatPrompt`).
- Handle client-side reactive state for message history, loading/waiting indicators, and call the Nitro api endpoint.

## Verification Plan

### Manual Verification
1. Run Supabase migration `20260801_app_config.sql` if using Supabase, or verify MongoDB seeding.
2. Run `pnpm seed:reset` to re-seed routes and roles.
3. Log in, navigate to **System > Config** and enter a valid Google Gemini or OpenRouter API Key.
4. Open the new **AI Chat** module, send prompts, and verify that the AI responds appropriately using Nuxt UI v4 chat styles.
5. Run `pnpm typecheck` and `pnpm lint` to ensure TypeScript compilation and style safety.
