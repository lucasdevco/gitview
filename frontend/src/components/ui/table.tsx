import * as React from "react"
import { createPortal } from "react-dom"
import { ArrowDown, ArrowUp, ArrowUpDown, Maximize2, Minimize2, RotateCcw } from "lucide-react"

import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type SortDirection = "ascending" | "descending"
type SortRule = { column: number; direction: SortDirection }
type ElementWithChildren = React.ReactElement<{ children?: React.ReactNode }>
type TableHeadElement = React.ReactElement<React.ComponentProps<"th">>

type TableProps = React.ComponentProps<"table"> & {
  sortable?: boolean
}

function Table({ className, children, sortable = true, ...props }: TableProps) {
  const { t, locale } = useI18n()
  const [sortRules, setSortRules] = React.useState<SortRule[]>([])
  const [isExpanded, setIsExpanded] = React.useState(false)
  const collator = React.useMemo(
    () => new Intl.Collator(locale, { numeric: true, sensitivity: "base" }),
    [locale],
  )

  React.useEffect(() => {
    if (!isExpanded) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsExpanded(false)
    }
    document.body.style.overflow = "hidden"
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [isExpanded])

  const childList = React.Children.toArray(children)
  const headerIndex = childList.findIndex((child) => React.isValidElement(child) && child.type === TableHeader)
  const bodyIndex = childList.findIndex((child) => React.isValidElement(child) && child.type === TableBody)
  const header = headerIndex >= 0 ? childList[headerIndex] as ElementWithChildren : null
  const body = bodyIndex >= 0 ? childList[bodyIndex] as ElementWithChildren : null

  const headerRows = header ? React.Children.toArray(header.props.children) : []
  const firstHeaderRow = headerRows.find((row) => React.isValidElement(row) && row.type === TableRow) as ElementWithChildren | undefined
  const columnCount = firstHeaderRow ? countTableHeads(firstHeaderRow.props.children) : 0
  const canSort = sortable && Boolean(header && body && columnCount)

  const updateSort = (column: number, additive: boolean) => {
    setSortRules((current) => {
      const existing = current.find((rule) => rule.column === column)
      if (!additive) {
        if (!existing || current.length > 1) return [{ column, direction: "ascending" }]
        return existing.direction === "ascending"
          ? [{ column, direction: "descending" }]
          : []
      }
      if (!existing) return [...current, { column, direction: "ascending" }]
      if (existing.direction === "ascending") {
        return current.map((rule) => rule.column === column ? { ...rule, direction: "descending" } : rule)
      }
      return current.filter((rule) => rule.column !== column)
    })
  }

  const renderedHeader = canSort && header
    ? React.cloneElement(header, {}, React.Children.map(header.props.children, (row) => {
      if (!React.isValidElement(row) || row.type !== TableRow) return row
      const typedRow = row as ElementWithChildren
      let column = 0
      const decorateCells = (nodes: React.ReactNode): React.ReactNode => React.Children.map(nodes, (cell) => {
        if (!React.isValidElement(cell)) return cell
        if (cell.type === React.Fragment) {
          const fragment = cell as ElementWithChildren
          return React.cloneElement(fragment, {}, decorateCells(fragment.props.children))
        }
        if (cell.type !== TableHead) return cell
        const currentColumn = column++
        const typedCell = cell as TableHeadElement
        const ruleIndex = sortRules.findIndex((rule) => rule.column === currentColumn)
        const rule = ruleIndex >= 0 ? sortRules[ruleIndex] : undefined
        return React.cloneElement(typedCell, { "aria-sort": rule?.direction ?? "none" }, <button
            type="button"
            className={cn(
              "group/sort inline-flex w-full items-center gap-1 rounded-sm py-1 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50",
              typedCell.props.className?.includes("text-right") && "justify-end",
            )}
            title={t("Click to sort; hold Shift to sort by multiple columns")}
            onClick={(event) => updateSort(currentColumn, event.shiftKey)}
          >
            <span>{typedCell.props.children}</span>
            {rule?.direction === "ascending" ? <ArrowUp className="size-3 text-primary" />
              : rule?.direction === "descending" ? <ArrowDown className="size-3 text-primary" />
                : <ArrowUpDown className="size-3 opacity-30 group-hover/sort:opacity-70" />}
            {rule && sortRules.length > 1 && <span className="text-[9px] text-primary">{ruleIndex + 1}</span>}
          </button>)
      })
      return React.cloneElement(typedRow, {}, decorateCells(typedRow.props.children))
    }))
    : header

  const renderedBody = canSort && body && sortRules.length
    ? React.cloneElement(body, {}, React.Children.toArray(body.props.children)
      .map((row, originalIndex) => ({ row, originalIndex }))
      .sort((left, right) => {
        for (const rule of sortRules) {
          const result = compareRows(left.row, right.row, rule.column, collator)
          if (result) return rule.direction === "ascending" ? result : -result
        }
        return left.originalIndex - right.originalIndex
      })
      .map(({ row }) => row))
    : body

  const renderedChildren = childList.map((child, index) => {
    if (index === headerIndex) return renderedHeader
    if (index === bodyIndex) return renderedBody
    return child
  })

  const content = <div
    data-slot="table-shell"
    className={cn(
      "relative flex min-h-0 w-full flex-col bg-background",
      isExpanded && "h-full",
    )}
  >
    <div className="flex h-8 shrink-0 items-center justify-end gap-1 border-b bg-muted/20 px-2">
      {canSort && <span className="mr-auto text-[9px] text-muted-foreground">
        {sortRules.length > 1
          ? t("Sorted by {count} columns", { count: sortRules.length })
          : t("Click a column to sort · Shift-click for multiple columns")}
      </span>}
      {sortRules.length > 0 && <button
        type="button"
        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        title={t("Clear sorting")}
        aria-label={t("Clear sorting")}
        onClick={() => setSortRules([])}
      ><RotateCcw className="size-3" /></button>}
      <button
        type="button"
        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        title={isExpanded ? t("Exit full screen") : t("View table full screen")}
        aria-label={isExpanded ? t("Exit full screen") : t("View table full screen")}
        onClick={() => setIsExpanded((value) => !value)}
      >{isExpanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}</button>
    </div>
    <div
      data-slot="table-container"
      className={cn("relative w-full overflow-auto", isExpanded && "min-h-0 flex-1")}
    >
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom text-sm",
          isExpanded && "[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-background",
          className,
        )}
        {...props}
      >{renderedChildren}</table>
    </div>
  </div>

  if (isExpanded) {
    return createPortal(<div
      className="fixed inset-x-0 bottom-0 top-11 z-[100] bg-background"
      style={{ position: "fixed", top: "2.75rem", right: 0, bottom: 0, left: 0 }}
      role="dialog"
      aria-modal="true"
    >
      {content}
    </div>, document.body)
  }
  return content
}

function compareRows(left: React.ReactNode, right: React.ReactNode, column: number, collator: Intl.Collator) {
  const leftValue = getCellValue(left, column)
  const rightValue = getCellValue(right, column)
  const leftNumber = parseNumericValue(leftValue)
  const rightNumber = parseNumericValue(rightValue)
  if (leftNumber !== null && rightNumber !== null) return leftNumber - rightNumber
  return collator.compare(leftValue, rightValue)
}

function countTableHeads(nodes: React.ReactNode): number {
  return React.Children.toArray(nodes).reduce<number>((count, node) => {
    if (!React.isValidElement(node)) return count
    if (node.type === TableHead) return count + 1
    if (node.type === React.Fragment) return count + countTableHeads((node as ElementWithChildren).props.children)
    return count
  }, 0)
}

function getCellValue(row: React.ReactNode, column: number) {
  if (!React.isValidElement(row)) return ""
  const cells = flattenFragments((row as ElementWithChildren).props.children)
  return collectText(cells[column]).trim()
}

function flattenFragments(nodes: React.ReactNode): React.ReactNode[] {
  return React.Children.toArray(nodes).flatMap((node) => {
    if (React.isValidElement(node) && node.type === React.Fragment) {
      return flattenFragments((node as ElementWithChildren).props.children)
    }
    return [node]
  })
}

function collectText(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (!React.isValidElement(node)) return ""
  const props = node.props as Record<string, unknown>
  const explicitValue = props.sortValue ?? props["data-sort-value"]
  if (typeof explicitValue === "string" || typeof explicitValue === "number") return String(explicitValue)
  const children = props.children as React.ReactNode
  if (children !== undefined) return React.Children.toArray(children).map(collectText).join(" ")
  for (const key of ["name", "path", "value", "title"]) {
    if (typeof props[key] === "string" || typeof props[key] === "number") return String(props[key])
  }
  return ""
}

function parseNumericValue(value: string) {
  const normalized = value.trim().replaceAll(",", "").replace("−", "-").replace(/%$/, "")
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return <tfoot data-slot="table-footer" className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted", className)} {...props} />
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return <th data-slot="table-head" className={cn("h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props} />
}

type TableCellProps = React.ComponentProps<"td"> & { sortValue?: string | number }

function TableCell({ className, sortValue, ...props }: TableCellProps) {
  return <td data-slot="table-cell" data-sort-value={sortValue} className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", className)} {...props} />
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-4 text-sm text-muted-foreground", className)} {...props} />
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
