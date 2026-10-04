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
  spaLoadingTemplate: 'spa-loading-template.html',

  imports: {
    dirs: [
      'shared/utils'
    ]
  },

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

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

  // PWA: tm-tools has custom service worker (push-sw.js, registered by
  // app/plugins/sw.client.ts - web push/Firebase) -> DO NOT add
  // @vite-pwa/nuxt (generates sw.js at scope '/', conflicting with push-sw.js).
  // manifest.webmanifest (public/) provides PWA metadata: name, icons,
  // theme_color; service worker already in place -> full PWA support.

  runtimeConfig: {
    public: {
      hubUrl: process.env.NUXT_PUBLIC_HUB_URL || process.env.NUXT_PUBLIC_HUB_API_URL || 'http://localhost:4000',
      hubAppId: process.env.NUXT_PUBLIC_HUB_APP_ID || process.env.NUXT_PUBLIC_APP_ID || 'tm-tools'
    }
  },

  alias: {
    '@tm/hub-client': fileURLToPath(new URL('./packages/hub-client/src/index.ts', import.meta.url))
  },

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
    optimizeDeps: {
      include: [
        '@nuxt/ui > prosemirror-state',
        '@nuxt/ui > prosemirror-transform',
        '@nuxt/ui > prosemirror-model',
        '@nuxt/ui > prosemirror-view',
        '@nuxt/ui > prosemirror-gapcursor',
        '@nuxt/ui > @tiptap/core',
        '@nuxt/ui > @tiptap/vue-3',
        '@nuxt/ui > @tiptap/pm'
      ]
    },
    resolve: {
      alias: {
        '@tm/hub-client': fileURLToPath(new URL('./packages/hub-client/src/index.ts', import.meta.url)),
        'striptags': 'striptags/src/striptags.js'
      },
      dedupe: [
        'vue'
      ]
    }
  },

  typescript: {
    typeCheck: true,
    strict: true,
    tsConfig: {
      include: [
        '../types/**/*.ts',
        '../types/**/*.d.ts'
      ]
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
  }
})
