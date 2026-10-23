/**
 * Legacy COS upload helper.
 *
 * Tingyu distribution and update metadata live in GitHub Releases. The old COS
 * path and SDK are intentionally not used so stale assets cannot be published.
 */
module.exports = async() => {
  throw new Error('Legacy COS publishing is disabled; use GitHub Releases after main CI.')
}
