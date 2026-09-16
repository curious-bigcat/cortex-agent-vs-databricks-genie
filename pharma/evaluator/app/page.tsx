"use client"

import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import Evaluator from "@/components/evaluator"
import AnalyticsDashboard from "@/components/analytics-dashboard"

export const dynamic = "force-dynamic"

export default function Home() {
  const [view, setView] = useState<"evaluator" | "analytics">("evaluator")

  return (
    <>
      <AppHeader view={view} onViewChange={setView} />
      {view === "evaluator" ? <Evaluator /> : <AnalyticsDashboard />}
    </>
  )
}
