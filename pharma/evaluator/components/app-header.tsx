"use client"

import Image from "next/image"
import { APP_TITLE, LOGO_SRC, DOMAIN_CONFIG, type Domain } from "@/lib/constants"
import { ThemeToggle } from "@/components/theme-toggle"

interface AppHeaderProps {
  view?: "evaluator" | "analytics"
  onViewChange?: (view: "evaluator" | "analytics") => void
  domain?: Domain
  onDomainChange?: (domain: Domain) => void
}

export function AppHeader({ view = "evaluator", onViewChange, domain = "pharma", onDomainChange }: AppHeaderProps) {
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

        {/* Domain switcher */}
        {onDomainChange && (
          <div className="flex items-center gap-1 ml-2 bg-muted/50 rounded-lg p-0.5">
            {(Object.keys(DOMAIN_CONFIG) as Domain[]).map((d) => (
              <button
                key={d}
                onClick={() => onDomainChange(d)}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors font-medium ${
                  domain === d
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {d === "pharma" ? "Pharma" : "Retail"}
              </button>
            ))}
          </div>
        )}

        {/* View tabs */}
        {onViewChange && (
          <nav className="flex items-center gap-1 ml-4">
            <button
              onClick={() => onViewChange("evaluator")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                view === "evaluator"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Evaluator
            </button>
            <button
              onClick={() => onViewChange("analytics")}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                view === "analytics"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Analytics
            </button>
          </nav>
        )}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
