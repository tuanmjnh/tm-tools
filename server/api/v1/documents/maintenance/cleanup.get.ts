import { sweepRetention } from '#server/modules/document/maintenance'

/** Retention sweep for schedulers that issue GET (Vercel Cron). */
export default defineEventHandler(event => sweepRetention(event))
