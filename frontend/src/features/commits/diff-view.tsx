export function diffFiles(patch: string): string[] {
  const files: string[] = []
  for (const line of patch.split("\n")) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line)
    if (match) files.push(match[2])
  }
  return files
}

export function patchForFile(patch: string, file: string): string {
  if (!file) return patch
  return patch
    .split(/(?=^diff --git )/m)
    .find((section) => /^diff --git a\/(.+) b\/(.+)$/m.exec(section)?.[2] === file) ?? ""
}

export function DiffView({ patch, file = "", className = "max-h-[calc(100vh-19rem)]" }: { patch: string; file?: string; className?: string }) {
  const visiblePatch = patchForFile(patch, file)
  return <div className={`${className} overflow-auto bg-muted/20 font-mono text-[11px] leading-5`}>
    <pre className="min-w-max py-2">{parseDiffLines(visiblePatch).map((line, index) => <div key={index} className={lineClass(line.text)}><span className="inline-block w-10 select-none border-r pr-2 text-right text-muted-foreground/60">{line.oldLine ?? ""}</span><span className="mr-3 inline-block w-10 select-none border-r pr-2 text-right text-muted-foreground/60">{line.newLine ?? ""}</span><span className="pr-4">{line.text || " "}</span></div>)}</pre>
  </div>
}

function parseDiffLines(patch: string) {
  let oldLine: number | undefined
  let newLine: number | undefined
  return patch.split("\n").map((text) => {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      return { text }
    }
    if (oldLine === undefined || newLine === undefined || text.startsWith("\\")) return { text }
    if (text.startsWith("+") && !text.startsWith("+++")) return { text, newLine: newLine++ }
    if (text.startsWith("-") && !text.startsWith("---")) return { text, oldLine: oldLine++ }
    if (text.startsWith(" ")) return { text, oldLine: oldLine++, newLine: newLine++ }
    return { text }
  })
}

function lineClass(line: string) {
  if (line.startsWith("diff --git ")) return "bg-primary/10 font-semibold text-primary"
  if (line.startsWith("@@")) return "bg-chart-3/10 text-chart-3"
  if (line.startsWith("+") && !line.startsWith("+++")) return "bg-success/10 text-success"
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-destructive/10 text-destructive"
  return "text-foreground"
}
