/** Coalesce refresh bursts: one pending load, latest input/result wins. */
export const createLatestLoader = <Input, Output>(load: (input: Input) => Promise<Output>, publish: (output: Output) => void, failed: (error: unknown) => void) => {
  let revision = 0
  let running = false
  let disposed = false
  let pending: { input: Input, revision: number } | undefined
  const drain = async() => {
    running = true
    try {
      while (pending) {
        if (disposed) break
        const job = pending
        pending = undefined
        try {
          const result = await load(job.input)
          if (!disposed && job.revision === revision) publish(result)
        } catch (error) { if (!disposed && job.revision === revision) failed(error) }
      }
    } finally { running = false }
  }
  const cancel = () => { revision++; pending = undefined }
  return {
    request: (input: Input) => { if (disposed) return; pending = { input, revision: ++revision }; if (!running) void drain() },
    cancel,
    dispose: () => { disposed = true; cancel() },
  }
}

/** Share an awaited load and repeat once for changes arriving during that load. */
export const createCoalescedLoader = <Output>(load: () => Promise<Output>) => {
  let running: Promise<Output> | undefined
  let queued = false
  return async(): Promise<Output> => {
    queued = true
    running ??= Promise.resolve().then(async() => {
      try {
        let result: Output
        do { queued = false; result = await load() } while (queued)
        return result
      } finally { running = undefined }
    })
    return running
  }
}
