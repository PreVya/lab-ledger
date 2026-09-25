import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnalyticsSummary, todayKey } from "@/lib/queries";
import type { AnalyticsSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { CollectionReports } from "@/components/collection-reports";

function AdminGate() {
  const { hasRole } = useAuth();
  if (!hasRole("admin")) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Access denied. Analytics is available to admin users only.
        </div>
      </div>
    );
  }
  return <AnalyticsPage />;
}

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Pratham — Collection Analytics" },
      { name: "description", content: "Collection, patient business, discount and payment-mode analytics for any date range." },
      { property: "og:title", content: "Pratham — Collection Analytics" },
      { property: "og:description", content: "Daily, weekly and monthly collection reports with cash, UPI and card split." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <AppShell><AdminGate /></AppShell>,
});

const rupee = (n: number) => `₹ ${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctLabel = (n: number) => `${(n || 0).toFixed(1)}%`;

/** Quick ranges are derived from today's IST business date — never hard-coded. */
function quickRange(kind: "today" | "week" | "month") {
  const today = todayKey();
  if (kind === "today") return { from: today, to: today };
  const d = new Date(`${today}T00:00:00.000Z`);
  if (kind === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // Monday-based
    const start = new Date(d);
    start.setUTCDate(start.getUTCDate() - dow);
    return { from: start.toISOString().slice(0, 10), to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

type Preset = "today" | "week" | "month" | "custom";

/** True when the API answered successfully but with no records at all. */
const isEmpty = (d: AnalyticsSummary) =>
  !d.netCollection && !d.totalPatientBusiness && !d.totalDiscount && !d.patientCount;

function AnalyticsPage() {
  const initial = quickRange("month");
  const [preset, setPreset] = useState<Preset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [range, setRange] = useState(initial);

  const applyPreset = (p: Preset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = quickRange(p);
    setFrom(r.from);
    setTo(r.to);
    setRange(r);
  };

  const { data, isLoading, error } = useAnalyticsSummary(range.from, range.to);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Collection is money actually received. Patient business is the value of tests after discount.
          </p>
        </div>
      </div>

      {/* A. Date filter bar */}
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="flex gap-1">
          {([["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["custom", "Custom"]] as const).map(([k, label]) => (
            <Button
              key={k}
              size="sm"
              variant={preset === k ? "default" : "outline"}
              onClick={() => applyPreset(k)}
            >
              {label}
            </Button>
          ))}
        </div>
        {preset === "custom" && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From date</Label>
              <Input type="date" className="h-9 w-40" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To date</Label>
              <Input type="date" className="h-9 w-40" value={to} onChange={e => setTo(e.target.value)} />
            </div>
            <Button size="sm" disabled={!from || !to || to < from} onClick={() => setRange({ from, to })}>
              Apply
            </Button>
          </div>
        )}
        <div className="ml-auto text-sm text-muted-foreground">
          Showing {range.from} to {range.to}
        </div>
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Could not load analytics data. {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && data && isEmpty(data) && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          No payment or patient records were returned for {range.from} to {range.to}. If your records live in the lab
          server database, make sure that server is running and that you signed in with a real lab user — a demo login
          only shows an empty offline dataset.
        </div>
      )}

      {!isLoading && !error && data && <AnalyticsBody data={data} />}
    </div>
  );
}

function AnalyticsBody({ data }: { data: AnalyticsSummary }) {
  const showCard = data.cardCollection > 0 || data.paymentModeSplit.some(m => m.mode === "card");
  return (
    <div className="space-y-6">
      {/* B. Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Net Collection" value={rupee(data.netCollection)} accent />
        <Stat label="Cash Collection" value={rupee(data.cashCollection)} />
        <Stat label="UPI Collection" value={rupee(data.upiCollection)} />
        {showCard && <Stat label="Card Collection" value={rupee(data.cardCollection)} />}
        <Stat label="Total Patient Business" value={rupee(data.totalPatientBusiness)} hint={`${data.patientCount} patients`} />
        <Stat label="Total Discount" value={rupee(data.totalDiscount)} />
        <Stat label="Advance Received" value={rupee(data.advanceReceived)} />
        <Stat label="Balance Received" value={rupee(data.balanceReceived)} />
      </div>

      {/* C. Business vs collection */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Business vs Collection</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Business Generated" value={rupee(data.totalPatientBusiness)} />
          <Stat label="Actual Collection" value={rupee(data.netCollection)} />
          <Stat label="Collection Gap for Selected Period" value={rupee(data.collectionGap)} />
        </div>
      </section>

      {/* D. Payment mode split */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Payment Mode Split</h2>
        <div className="space-y-3">
          {data.paymentModeSplit
            .filter(m => m.mode !== "other" || m.amount > 0)
            .map(m => (
              <Bar key={m.mode} label={m.mode.toUpperCase()} amount={m.amount} percent={m.percent} />
            ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Percentages are of net collection. Opening and closing cash balances are not included.
        </p>
      </section>

      {/* E. Advance vs balance */}
      <section className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Advance vs Balance Received</h2>
        <div className="space-y-3">
          {data.advanceBalanceSplit.map(s => (
            <Bar key={s.kind} label={s.kind === "advance" ? "Advance" : "Balance"} amount={s.amount} percent={s.percent} />
          ))}
        </div>
      </section>

      {/* F. Daily / Monthly collection reports */}
      <CollectionReports />
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={cn("rounded-lg border bg-background p-4", accent && "border-primary/40 bg-primary/5")}>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Bar({ label, amount, percent }: { label: string; amount: number; percent: number }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {rupee(amount)} · {pctLabel(percent)}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}
