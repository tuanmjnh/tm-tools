import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
    '@nuxt/image',
    '@pinia/nuxt'
  ],
  ssr: false,
  imports: {
    dirs: [
      'shared/utils'
    ]
  },

  devtools: {
    enabled: false
  },

  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/manifest.webmanifest' }
      ]
    }
  },

  css: ['~/assets/css/main.css'],
  spaLoadingTemplate: 'spa-loading-template.html',

  runtimeConfig: {
    // Server-only: proves tm-tools to the hub AI relay (X-App-Secret). The
    // renderer never holds it — chat goes through local /api/v1/chat routes.
    // The default MUST stay empty: reading the env here would bake the secret
    // into `.output` and ship it inside the public installer. Nitro applies
    // `NUXT_HUB_APP_SECRET` from the runtime environment instead (host env on
    // the web, userData/config.env in the desktop app).
    hubAppSecret: '',
    // Server-only: explicit local AI connections (Hybrid AI mode `local`),
    // a JSON array. Empty by default so a hosted build never calls a loopback
    // endpoint; the desktop app can set AI_LOCAL_CONNECTIONS at runtime.
    aiLocalConnections: '',
    public: {
      hubUrl: process.env.NUXT_PUBLIC_HUB_URL || 'http://localhost:4000',
      hubAppId: process.env.NUXT_PUBLIC_HUB_APP_ID || 'tm-tools'
    }
  },

  // PWA: tm-tools has custom service worker (push-sw.js, registered by
  // app/plugins/sw.client.ts - web push/Firebase) -> DO NOT add
  // @vite-pwa/nuxt (generates sw.js at scope '/', conflicting with push-sw.js).
  // manifest.webmanifest (public/) provides PWA metadata: name, icons,
  // theme_color; service worker already in place -> full PWA support.

  alias: {},

  build: {
    transpile: [
      '@tiptap/vue-3',
      '@tiptap/pm',
      '@tiptap/extension-drag-handle-vue-3',
      '@unovis/vue',
      '@unovis/ts',
      'firebase',
      'firebase/app',
      'shiki',
      '@shikijs/core',
      'sortablejs'
    ]
  },

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2026-06-30',

  vite: {
    ssr: {
      external: [
        'mongoose',
        'firebase-admin',
        '@google-cloud/firestore'
      ],
      noExternal: [
        '@unovis/vue',
        '@unovis/ts'
      ]
    },
    server: {
      fs: {
        // tm-ui and tm-core are linked from a sibling repo, so Vite dev must
        // serve them from outside this project root.
        allow: [
          fileURLToPath(new URL('../tm-platform/packages/tm-ui', import.meta.url)),
          fileURLToPath(new URL('../tm-platform/packages/tm-core', import.meta.url))
        ]
      }
    },
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor',
        '@nuxt/ui > @tiptap/core',
        '@nuxt/ui > @tiptap/vue-3',
        '@nuxt/ui > @tiptap/pm',
        'tm-hub-client',
        'zod'
      ]
    },
    resolve: {
      alias: {
        striptags: 'striptags/src/striptags.js'
      },
      dedupe: [
        'vue'
      ]
    },
    build: {
      chunkSizeWarningLimit: 1500
    }
  },

  typescript: {
    typeCheck: true,
    strict: true,
    tsConfig: {
      include: [
        '../types/**/*.ts',
        '../types/**/*.d.ts'
      ],
      // tm-ui is linked from a sibling repo and brings its own `vue` install.
      // Its published types re-import `vue`, and TypeScript then loads the
      // package's copy next to this app's — two module identities, so Nuxt's
      // own augmentations ($t, useI18n, and every auto-import global) stop
      // applying and every component reports "Property '$t' does not exist".
      // Pinning the specifier to this app's install keeps one identity.
      compilerOptions: {
        paths: {
          vue: ['../node_modules/vue'],
          'vue/*': ['../node_modules/vue/*']
        }
      }
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    locales: [
      { code: 'en', language: 'en', name: 'English', file: 'en.json' },
      { code: 'vi', language: 'vi', name: 'Tiếng Việt', file: 'vi.json' }
    ],
    defaultLocale: 'vi',
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'i18n_locale',
      redirectOn: 'root'
    }
  },

  // Include TypeScript icon maps so local controls do not depend on runtime API requests.
  icon: {
    clientBundle: {
      scan: {
        globInclude: ['app/**/*.{vue,ts,jsx,tsx,md,json}', 'shared/**/*.ts']
      }
    }
  },

  image: {
    domains: [
      'res.cloudinary.com',
      'images.unsplash.com',
      'plus.unsplash.com',
      'loremflickr.com',
      'api.dicebear.com',
      'images.pexels.com',
      'cdn.pixabay.com',
      'cdn.stocksnap.io',
      'elements.envato.com'
    ],
    alias: {
      cloudinary: 'https://res.cloudinary.com',
      unsplashPlus: 'https://plus.unsplash.com',
      unsplashImages: 'https://images.unsplash.com',
      loremflickr: 'https://loremflickr.com',
      dicebear: 'https://api.dicebear.com',
      pexels: 'https://images.pexels.com',
      pixabay: 'https://cdn.pixabay.com',
      stocksnap: 'https://cdn.stocksnap.io',
      envato: 'https://elements.envato.com'
    }
  },
  devServer: {
    port: 4002,
    host: '0.0.0.0' // Allow access from other devices on the same network
  },
})
