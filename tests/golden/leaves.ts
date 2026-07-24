interface LeavesOptions {
  /** Drops leaves whose path contains this fragment. Used to skip the User-Agent header. */
  skipPathsContaining?: string
  /** Treats an empty array as an empty object, the way PHP serializes an empty map. */
  emptyArrayIsObject?: boolean
}

function normalize(value: unknown, options: LeavesOptions): unknown {
  if (options.emptyArrayIsObject === true && Array.isArray(value) && value.length === 0) return {}
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
    Object.keys(value).every((key) => /^\d+$/.test(key))
  ) {
    return Object.keys(value)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => (value as Record<string, unknown>)[key])
  }
  return value
}

function flatten(
  prefix: string,
  value: unknown,
  target: Record<string, unknown>,
  options: LeavesOptions,
): void {
  const normalized = normalize(value, options)
  if (Array.isArray(normalized)) {
    normalized.forEach((item, index) => flatten(`${prefix}[${index}]`, item, target, options))
  } else if (typeof normalized === 'object' && normalized !== null) {
    for (const [key, item] of Object.entries(normalized)) {
      flatten(`${prefix}.${key}`, item, target, options)
    }
  } else {
    target[prefix] = normalized
  }
}

/** Flattens a payload into a path-to-leaf map, so a mismatch names the exact field. */
export function leaves(payload: Record<string, unknown>, options: LeavesOptions = {}): Record<string, unknown> {
  const target: Record<string, unknown> = {}
  flatten('', payload, target, options)
  const skip = options.skipPathsContaining
  if (skip === undefined) return target
  return Object.fromEntries(Object.entries(target).filter(([key]) => !key.includes(skip)))
}
