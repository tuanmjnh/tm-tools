import { sweepRetention } from '#server/modules/document/maintenance'

/** Retention sweep for schedulers that issue POST. */
export default defineEventHandler(event => sweepRetention(event))
