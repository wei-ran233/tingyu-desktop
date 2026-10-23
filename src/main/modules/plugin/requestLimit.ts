/** Reserve capacity before starting asynchronous work, without an unbounded queue. */
export class PluginRequestLimit {
  private readonly active = new Map<string, number>()
  constructor(private readonly limit: number, private readonly busy: () => Error) {}
  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const count = this.active.get(key) ?? 0
    if (count >= this.limit) throw this.busy()
    this.active.set(key, count + 1)
    try { return await task() } finally {
      const remaining = (this.active.get(key) ?? 1) - 1
      if (remaining) this.active.set(key, remaining)
      else this.active.delete(key)
    }
  }
}
