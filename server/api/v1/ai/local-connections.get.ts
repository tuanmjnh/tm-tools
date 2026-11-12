import { describeLocalConnections } from '#server/utils/aiGateway'

/**
 * Read-only view of the local AI connections configured on this machine.
 *
 * Never returns a key: `hasKey` is all the settings surface needs, and the
 * config slot name (`apiKeyEnv`) is not a credential.
 */
export default defineEventHandler((event) => {
  const { connections, errors } = describeLocalConnections(event)
  return {
    success: true,
    data: {
      connections,
      errors,
      envVar: 'AI_LOCAL_CONNECTIONS'
    }
  }
})
