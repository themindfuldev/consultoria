/** "5.9 MB" for ≥1 MB, otherwise "823 KB". */
export function fmtBytes(mb: number): string {
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(mb * 1024).toFixed(0)} KB`;
}
