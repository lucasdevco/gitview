import { Link } from "@tanstack/react-router"
import { useI18n } from "@/lib/i18n"
import type { OverviewRouteSearch } from "@/lib/url-filters"

export function AppNav({ search }: { search: OverviewRouteSearch }) {
  const { t } = useI18n()
  const linkClass = "inline-flex w-14 justify-center rounded px-1 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
  return <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-0.5 lg:flex" aria-label={t("Analysis pages")}>
    <Link to="/" search={search} className={linkClass} activeOptions={{ exact: true }}>{t("Overview")}</Link>
    <Link to="/hotspots" search={search} className={linkClass}>{t("Hotspots")}</Link>
    <Link to="/ownership" search={search} className={linkClass}>{t("Ownership")}</Link>
    <Link to="/functions" search={search} className={linkClass}>{t("Functions")}</Link>
    <Link to="/compare" search={search} className={linkClass}>{t("Compare")}</Link>
    <Link to="/explain" search={{ path: search.path }} className={linkClass}>{t("Explain")}</Link>
  </nav>
}
