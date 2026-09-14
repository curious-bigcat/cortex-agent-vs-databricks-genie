"use client"

import Image from "next/image"
import { APP_TITLE, LOGO_SRC } from "@/lib/constants"
import { ThemeToggle } from "@/components/theme-toggle"

export type AppTab = "evaluator" | "analytics"

interface AppHeaderProps {
  activeTab?: AppTab
  onTabChange?: (tab: AppTab) => void
}

export function AppHeader({ activeTab, onTabChange }: AppHeaderProps) {
  const tabs: { id: AppTab; label: string }[] = [
    { id: "evaluator", label: "Evaluator" },
    { id: "analytics", label: "Analytics" },
  ]

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background text-foreground">
      <div className="w-full px-4 h-14 flex items-center gap-4">
        {LOGO_SRC && (
          <Image
            src={LOGO_SRC}
            alt={`${APP_TITLE} logo`}
            width={28}
            height={28}
            className="shrink-0"
          />
        )}
        <span className="text-sm font-semibold tracking-tight">
          {APP_TITLE}
        </span>

        {onTabChange && (
          <nav className="flex gap-1 ml-6 bg-muted/50 rounded-lg p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )}

        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
