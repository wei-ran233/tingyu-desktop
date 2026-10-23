/** Keep untrusted manifest labels inside one host-owned confirmation field. */
export const pluginDisplayLabel = (value: string): string => value
  // eslint-disable-next-line no-control-regex -- hostile labels must not control confirmation layout.
  .replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
