"use client"

import { AppHeader } from "@/components/app-header"
import Evaluator from "@/components/evaluator"

export const dynamic = "force-dynamic"

export default function Home() {
  return (
    <>
      <AppHeader />
      <Evaluator />
    </>
  )
}
