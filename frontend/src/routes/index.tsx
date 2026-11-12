import { createFileRoute } from "@tanstack/react-router"
import { Workbench } from "@/features/workbench/workbench"

export const Route = createFileRoute("/")({
  component: Workbench,
})
