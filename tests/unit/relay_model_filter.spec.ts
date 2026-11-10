import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { bareModelId, chatModelsFromCatalog, isTextModel } from '../../server/utils/relayModels'

describe('relay model catalogue', () => {
  it('strips the models/ prefix the relay reports', () => {
    assert.equal(bareModelId('models/gemini-2.5-pro'), 'gemini-2.5-pro')
    assert.equal(bareModelId('gemini-2.5-pro'), 'gemini-2.5-pro')
    assert.equal(bareModelId('  models/gpt-4o  '), 'gpt-4o')
  })

  it('rejects models that cannot answer a chat prompt', () => {
    for (const id of [
      'text-embedding-004',
      'models/gemini-2.5-flash-live',
      'gpt-4o-audio-preview',
      'gpt-4o-mini-tts',
      'imagen-4.0-generate-001',
      'veo-3.0-generate-001'
    ]) {
      assert.equal(isTextModel(id), false, `${id} must be rejected`)
    }
  })

  it('rejects vendor-prefixed and compound non-chat ids seen in the live catalogue', () => {
    for (const id of [
      'nvidia/embed-qa-4',
      'nvidia/llama-3.2-nv-embedqa-1b-v1',
      'nvidia/nvclip',
      'models/lyria-3.5',
      'models/gemini-nano-banana-2.1',
      'google/diffusiongemma-26b-a4b-it',
      'models/gemini-3.5-transcribe',
      'OmniVoice',
      'nvidia/ai-synthetic-video-detector'
    ]) {
      assert.equal(isTextModel(id), false, `${id} must be rejected`)
    }
  })

  it('keeps ordinary chat and vision models', () => {
    for (const id of [
      'models/gemini-2.5-pro',
      'gemini-2.5-flash',
      'gpt-4o',
      'claude-sonnet-4-5',
      'deepseek-chat',
      'meta/llama-3.1-nemotron-70b-instruct',
      'MiniCPM-V-4.7-35B-A3B',
      'nvidia/nemotron-3-super-120b-a12b',
      'mistralai/mistral-large',
      'models/gemini-omni-1.1-flash'
    ]) {
      assert.equal(isTextModel(id), true, `${id} must be offered`)
    }
  })
})

describe('chat model catalogue', () => {
  it('drops non-text models and connections without a key', () => {
    const data = chatModelsFromCatalog([
      {
        connectionId: 'conn-gemini',
        provider: 'google',
        name: 'Gemini',
        adapterType: 'google',
        hasKey: true,
        model: 'models/gemini-2.5-pro',
        models: [
          { modelId: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
          { modelId: 'models/text-embedding-004', displayName: 'Embedding' },
          { modelId: 'models/gemini-2.5-flash-live', displayName: 'Live' }
        ]
      },
      {
        connectionId: 'conn-openai',
        provider: 'openai',
        name: 'OpenAI',
        adapterType: 'openai',
        hasKey: false,
        model: null,
        models: [{ modelId: 'gpt-4o', displayName: 'GPT-4o' }]
      }
    ])

    assert.deepEqual(data.map(model => model.modelId), ['models/gemini-2.5-pro'])
    assert.equal(data[0]!.connectionName, 'Gemini')
    assert.equal(data[0]!.displayName, 'Gemini 2.5 Pro')
    assert.equal(data[0]!.isPrimary, true)
  })

  it('falls back to the model id for a missing display name', () => {
    const data = chatModelsFromCatalog([{
      connectionId: 'conn-1',
      provider: 'openai',
      name: 'Primary',
      adapterType: 'openai',
      hasKey: true,
      model: 'gpt-4o',
      models: [{ modelId: 'gpt-4o', displayName: '' }]
    }])

    assert.equal(data[0]!.displayName, 'gpt-4o')
    assert.equal(data[0]!.isPrimary, true)
  })
})
