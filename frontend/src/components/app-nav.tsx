import { Link } from "@tanstack/react-router"
import type { OverviewRouteSearch } from "@/lib/url-filters"

export function AppNav({ search }: { search: OverviewRouteSearch }) {
  const linkClass = "rounded px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
  return <nav className="hidden items-center gap-0.5 md:flex" aria-label="Analysis pages">
    <Link to="/" search={search} className={linkClass} activeOptions={{ exact: true }}>Overview</Link>
    <Link to="/hotspots" search={search} className={linkClass}>Hotspots</Link>
    <Link to="/ownership" search={search} className={linkClass}>Ownership</Link>
    <Link to="/functions" search={search} className={linkClass}>Functions</Link>
    <Link to="/compare" search={search} className={linkClass}>Compare</Link>
    <Link to="/explain" search={{ path: search.path }} className={linkClass}>Explain</Link>
  </nav>
}
