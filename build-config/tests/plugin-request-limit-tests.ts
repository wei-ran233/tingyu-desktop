import assert from 'node:assert/strict'
import { PluginRequestLimit } from '@main/modules/plugin/requestLimit'
export const pluginRequestLimitTests = async(test: (name: string, run: () => void | Promise<void>) => Promise<void>) => {
  await test('request slots are reserved before reads and reject excess work without queueing', async() => {
    const gate = new PluginRequestLimit(2, () => new Error('busy'))
    const releases: Array<() => void> = []; let reads = 0
    const load = async() => { reads++; await new Promise<void>(resolve => { releases.push(resolve) }) }
    const first = gate.run('a', load); const second = gate.run('a', load)
    await assert.rejects(gate.run('a', load), /busy/)
    assert.equal(reads, 2)
    releases[0](); await first
    const third = gate.run('a', load); assert.equal(reads, 3)
    releases[1](); releases[2](); await Promise.all([second, third])
    assert.equal(await gate.run('a', async() => 'reused'), 'reused')
  })
  await test('request limits are per plugin and release after synchronous and asynchronous errors', async() => {
    const gate = new PluginRequestLimit(1, () => new Error('busy')); let release: () => void = () => {}
    const a = gate.run('a', async() => new Promise<void>(resolve => { release = resolve }))
    assert.equal(await gate.run('b', async() => 'independent'), 'independent')
    await assert.rejects(gate.run('a', async() => 'excess'), /busy/)
    release(); await a
    await assert.rejects(gate.run('a', () => { throw new Error('sync failure') }), /sync failure/)
    await assert.rejects(gate.run('a', async() => { throw new Error('async failure') }), /async failure/)
    assert.equal(await gate.run('a', async() => 'healthy'), 'healthy')
  })
}
