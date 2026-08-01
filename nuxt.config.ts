export default defineNuxtConfig({
  ssr: false,

  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt',
    '@nuxtjs/i18n',
    '@nuxt/image'
  ],

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
    },
  },

  devtools: {
    enabled: false
  },

  css: ['~/assets/css/main.css'],

  routeRules: {
    '/api/**': {
      cors: true
    }
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

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
        striptags: 'striptags/src/striptags.js'
      },
      dedupe: [
        'vue'
      ]
    }
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

  typescript: {
    typeCheck: true,
    strict: true
  }
})
