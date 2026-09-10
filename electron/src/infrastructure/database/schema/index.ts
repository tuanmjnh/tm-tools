import { relations } from 'drizzle-orm'
import { browsers } from './browsers'
import { profileGroups } from './groups'
import { tags, profileTags } from './tags'
import { proxies } from './proxies'
import { profiles } from './profiles'
import { workflows } from './workflows'
import { tasks } from './tasks'

export * from './browsers'
export * from './groups'
export * from './tags'
export * from './proxies'
export * from './profiles'
export * from './workflows'
export * from './tasks'
export * from './settings'
export * from './audit_logs'

export const profilesRelations = relations(profiles, ({ one, many }) => ({
  browser: one(browsers, {
    fields: [profiles.browserId],
    references: [browsers.id]
  }),
  proxy: one(proxies, {
    fields: [profiles.proxyId],
    references: [proxies.id]
  }),
  group: one(profileGroups, {
    fields: [profiles.groupId],
    references: [profileGroups.id]
  }),
  tags: many(profileTags),
  tasks: many(tasks)
}))

export const profileTagsRelations = relations(profileTags, ({ one }) => ({
  profile: one(profiles, {
    fields: [profileTags.profileId],
    references: [profiles.id]
  }),
  tag: one(tags, {
    fields: [profileTags.tagId],
    references: [tags.id]
  })
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  profile: one(profiles, {
    fields: [tasks.profileId],
    references: [profiles.id]
  }),
  workflow: one(workflows, {
    fields: [tasks.workflowId],
    references: [workflows.id]
  })
}))
