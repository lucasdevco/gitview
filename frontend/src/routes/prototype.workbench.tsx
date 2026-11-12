import { createFileRoute } from "@tanstack/react-router"
import { Workbench } from "@/prototype/workbench/workbench"

// PROTOTYPE — Sourcetree-style workbench with in-memory mock data. Throwaway route.
export const Route = createFileRoute("/prototype/workbench")({
  component: Workbench,
})
