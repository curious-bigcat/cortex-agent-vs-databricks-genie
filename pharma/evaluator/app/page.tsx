"use client"

import { useState } from "react"
import { AppHeader, type AppTab } from "@/components/app-header"
import Evaluator from "@/components/evaluator"
import AnalyticsDashboard from "@/components/analytics-dashboard"

export const dynamic = "force-dynamic"

export default function Home() {
  const [activeTab, setActiveTab] = useState<AppTab>("evaluator")

  return (
    <>
      <AppHeader activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === "evaluator" ? <Evaluator /> : <AnalyticsDashboard />}
    </>
  )
}
