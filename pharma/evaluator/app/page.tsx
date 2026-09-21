"use client"

import { useState } from "react"
import { AppHeader } from "@/components/app-header"
import Evaluator from "@/components/evaluator"
import AnalyticsDashboard from "@/components/analytics-dashboard"
import type { Domain } from "@/lib/constants"

export const dynamic = "force-dynamic"

export default function Home() {
  const [view, setView] = useState<"evaluator" | "analytics">("evaluator")
  const [domain, setDomain] = useState<Domain>("pharma")

  return (
    <>
      <AppHeader view={view} onViewChange={setView} domain={domain} onDomainChange={setDomain} />
      {view === "evaluator" ? <Evaluator domain={domain} /> : <AnalyticsDashboard domain={domain} />}
    </>
  )
}
