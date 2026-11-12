import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseAILocalConnections, findAILocalConnection } from '../../shared/utils/aiLocalConnections'

describe('AI local connections config', () => {
  it('accepts an explicit JSON array and normalizes the base URL', () => {
    const { connections, errors } = parseAILocalConnections(JSON.stringify([
      {
        connectionId: 'free-local',
        provider: 'openai-compatible',
        baseUrl: 'http://127.0.0.1:31415/v1///',
        apiKey: 'sk-local',
        models: ['auto', { id: 'gpt-4o-mini', displayName: 'GPT-4o mini' }]
      }
    ]))
    assert.deepEqual(errors, [])
    assert.equal(connections.length, 1)
    assert.equal(connections[0]!.baseUrl, 'http://127.0.0.1:31415/v1')
    assert.equal(connections[0]!.apiKey, 'sk-local')
    assert.deepEqual(connections[0]!.models?.map(model => model.modelId), ['auto', 'gpt-4o-mini'])
    assert.equal(connections[0]!.models?.[1]?.displayName, 'GPT-4o mini')
  })

  it('rejects malformed entries instead of partially accepting them', () => {
    const { connections, errors } = parseAILocalConnections([
      { connectionId: '', baseUrl: 'http://localhost:11434/v1' },
      { connectionId: 'no-url' },
      { connectionId: 'bad-url', baseUrl: 'file:///etc/passwd' },
      { connectionId: 'ok', baseUrl: 'http://localhost:11434/v1' },
      { connectionId: 'ok', baseUrl: 'http://localhost:11434/v1' }
    ])
    assert.equal(connections.length, 1)
    assert.equal(connections[0]!.connectionId, 'ok')
    assert.equal(errors.length, 4)
  })

  it('treats empty config as no local connections', () => {
    for (const value of ['', '   ', undefined, null]) {
      assert.deepEqual(parseAILocalConnections(value), { connections: [], errors: [] })
    }
  })

  it('reports invalid JSON without throwing', () => {
    const { connections, errors } = parseAILocalConnections('{not json')
    assert.deepEqual(connections, [])
    assert.equal(errors.length, 1)
    assert.match(errors[0]!, /not valid JSON/)
  })

  it('finds a connection by id and never by empty id', () => {
    const { connections } = parseAILocalConnections([
      { connectionId: 'a', baseUrl: 'http://localhost:11434/v1' }
    ])
    assert.equal(findAILocalConnection(connections, 'a')?.connectionId, 'a')
    assert.equal(findAILocalConnection(connections, ''), undefined)
    assert.equal(findAILocalConnection(connections, 'missing'), undefined)
  })
})
