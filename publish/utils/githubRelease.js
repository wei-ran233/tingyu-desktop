/**
 * Legacy terminal release helper.
 *
 * Tingyu releases are created through the authenticated GitHub connector after
 * the main branch CI passes. Keeping network publishing out of this script also
 * prevents an accidental release from a machine without reviewed credentials.
 */
module.exports = async() => {
  throw new Error('Legacy GitHub release helper is disabled; use the GitHub connector after main CI.')
}
