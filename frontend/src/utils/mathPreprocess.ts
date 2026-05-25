// Match a LaTeX command sequence, including braced args and subscript/superscript.
const LATEX_CMD = /\\[a-zA-Z]+(?:\{(?:[^{}]|\{[^{}]*\})*\})*(?:[_^](?:\{(?:[^{}]|\{[^{}]*\})*\}|[a-zA-Z0-9*+\-]+))*/g
const CJK = /[぀-鿿＀-￯　-〿]/

// Add $...$ / $$...$$ delimiters to raw LaTeX that lacks them.
export function preprocessMath(raw: string): string {
  let inCode = false
  return raw
    .split('\n')
    .map(line => {
      const trimStart = line.trimStart()
      if (trimStart.startsWith('```')) { inCode = !inCode; return line }
      if (inCode) return line

      const tr = line.trim()
      if (!tr || tr.startsWith('#') || tr.startsWith('|')) return line

      // Already delimited → skip
      if (tr.startsWith('$$') || tr.startsWith('$') || tr.startsWith('\\[') || tr.startsWith('\\(')) return line

      if (!LATEX_CMD.test(tr)) return line
      LATEX_CMD.lastIndex = 0

      const hasCJK = CJK.test(tr)
      const indent = /^(\s*)/.exec(line)![1]

      if (!hasCJK) {
        return `${indent}$$${tr}$$`
      }

      return line.replace(LATEX_CMD, m => `$${m}$`)
    })
    .join('\n')
}
