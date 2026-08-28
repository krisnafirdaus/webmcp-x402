import { afterEach, describe, expect, it, vi } from 'vitest'
import { getModelContext, createToolRegistrar, type ModelContext, type ModelContextTool } from '../src/webmcp'

afterEach(() => vi.unstubAllGlobals())

function fakeMc() {
  const tools = new Map<string, ModelContextTool>()
  const mc: ModelContext = { registerTool: (t) => void tools.set(t.name, t) }
  return { mc, tools }
}

describe('getModelContext', () => {
  it('prefers navigator.modelContext', () => {
    const { mc } = fakeMc()
    // Node 22 exposes navigator as a getter-only global. vi.stubGlobal uses
    // property descriptors, so this test stays portable across runtimes.
    vi.stubGlobal('navigator', { modelContext: mc })
    vi.stubGlobal('document', { modelContext: fakeMc().mc })
    expect(getModelContext()).toBe(mc)
  })
  it('falls back to document.modelContext', () => {
    const { mc } = fakeMc()
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('document', { modelContext: mc })
    expect(getModelContext()).toBe(mc)
  })
  it('returns null when absent', () => {
    vi.stubGlobal('navigator', undefined)
    vi.stubGlobal('document', undefined)
    expect(getModelContext()).toBeNull()
  })
})

describe('createToolRegistrar', () => {
  it('registers tools once by name', () => {
    const { mc, tools } = fakeMc()
    const reg = createToolRegistrar(mc)
    const tool = { name: 't1', description: 'd', inputSchema: {}, execute: async () => ({ content: [{ type: 'text' as const, text: '{}' }] }) }
    expect(reg.register(tool)).toBe(true)
    expect(reg.register(tool)).toBe(false)
    expect(tools.size).toBe(1)
    expect(reg.names()).toEqual(['t1'])
  })
  it('mirrors execute into a bag when provided', async () => {
    const { mc } = fakeMc()
    const bag: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {}
    const reg = createToolRegistrar(mc, bag)
    reg.register({ name: 't2', description: 'd', inputSchema: {}, execute: async () => ({ content: [{ type: 'text' as const, text: '"ok"' }] }) })
    const out = (await bag.t2({})) as { content: Array<{ text: string }> }
    expect(out.content[0].text).toBe('"ok"')
  })
  it('works against a null context (no-op, names stay empty)', () => {
    const reg = createToolRegistrar(null)
    expect(reg.register({ name: 't3', description: 'd', inputSchema: {}, execute: async () => ({ content: [{ type: 'text' as const, text: '{}' }] }) })).toBe(false)
    expect(reg.names()).toEqual([])
  })
})
