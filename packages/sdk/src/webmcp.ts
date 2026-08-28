export interface ModelContextTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  /** Optional agent hints (e.g. readOnlyHint, untrustedContentHint). Hints only — never security enforcement. */
  annotations?: Record<string, unknown>
  execute(
    args: Record<string, unknown>,
    context?: { signal?: AbortSignal },
  ): Promise<{ content: Array<{ type: 'text'; text: string }> }>
}

export interface ModelContext {
  registerTool(tool: ModelContextTool): unknown
}

/** ChatGPT's in-app browser and Chrome may expose the API on different globals. */
export function getModelContext(): ModelContext | null {
  const g = globalThis as Record<string, any>
  return g.navigator?.modelContext ?? g.document?.modelContext ?? null
}

export interface ToolRegistrar {
  /** Registers unless the name is already registered or mc is null. Returns whether it registered. */
  register(tool: ModelContextTool): boolean
  names(): string[]
}

/**
 * Tracks registered names (hosts may not dedupe) and optionally mirrors
 * execute fns into `bag` so tests/e2e can drive tools without a WebMCP host.
 */
export function createToolRegistrar(
  mc: ModelContext | null,
  bag?: Record<string, (args: Record<string, unknown>) => Promise<unknown>>,
): ToolRegistrar {
  const registered = new Set<string>()
  return {
    register(tool) {
      if (!mc || registered.has(tool.name)) return false
      mc.registerTool(tool)
      registered.add(tool.name)
      if (bag) bag[tool.name] = (args) => tool.execute(args)
      return true
    },
    names() {
      return [...registered]
    },
  }
}
