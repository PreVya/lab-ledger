import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useTests, qk } from "@/lib/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { TestCatalog } from "@/lib/types";

export const Route = createFileRoute("/tests")({ component: () => <AppShell><TestCatalogPage /></AppShell> });

const KNOWN_LABS = ["Metropolis", "Lupin"] as const;

function TestCatalogPage() {
  const { data = [] } = useTests();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [outsourced, setOutsourced] = useState(false);
  const [lab, setLab] = useState("");
  const [testCode, setTestCode] = useState("");

  const create = useMutation({
    mutationFn: (b: Record<string, unknown>) => api("/tests", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tests });
      toast.success("Test added");
      setName(""); setRate(""); setLab(""); setTestCode(""); setOutsourced(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build tab set: In-house + Metropolis + Lupin + any other discovered outsourced lab.
  const discoveredLabs = useMemo(() => {
    const set = new Set<string>();
    for (const t of data) {
      if (t.outsourced && t.outsourcedLab) set.add(t.outsourcedLab.trim());
    }
    // Ensure known labs always show, even with 0 rows.
    KNOWN_LABS.forEach(l => set.add(l));
    return Array.from(set).sort((a, b) => {
      const ai = KNOWN_LABS.indexOf(a as typeof KNOWN_LABS[number]);
      const bi = KNOWN_LABS.indexOf(b as typeof KNOWN_LABS[number]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.localeCompare(b);
    });
  }, [data]);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Test Catalog</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        In-house and outsourced tests are shown in separate views. <strong>Test Code</strong> is used only for outsourced labs (e.g. Metropolis <em>M1234</em>, Lupin <em>L9876</em>) and is optional for now.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({
            name,
            rate: Number(rate),
            outsourced,
            outsourcedLab: outsourced ? lab : null,
            testCode: outsourced ? (testCode || null) : null,
          });
        }}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-md border bg-card p-3"
      >
        <div><label className="text-xs text-muted-foreground">Name</label><Input value={name} onChange={e => setName(e.target.value)} required className="h-8 w-56" /></div>
        <div><label className="text-xs text-muted-foreground">Rate</label><Input value={rate} onChange={e => setRate(e.target.value)} required inputMode="decimal" className="h-8 w-28" /></div>
        <div className="flex items-center gap-2 pb-1"><Switch checked={outsourced} onCheckedChange={setOutsourced} /><span className="text-sm">Outsourced</span></div>
        {outsourced && (
          <>
            <div>
              <label className="text-xs text-muted-foreground">Provider / Lab</label>
              <Input value={lab} onChange={e => setLab(e.target.value)} className="h-8 w-48" placeholder="e.g. Metropolis" required />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Test Code (optional)</label>
              <Input value={testCode} onChange={e => setTestCode(e.target.value)} className="h-8 w-40" placeholder="e.g. M1234" />
            </div>
          </>
        )}
        <Button type="submit" size="sm">Add Test</Button>
      </form>

      <Tabs defaultValue="inhouse">
        <TabsList>
          <TabsTrigger value="inhouse">In-house Tests</TabsTrigger>
          {discoveredLabs.map(l => (
            <TabsTrigger key={l} value={`lab:${l}`}>{l} Tests</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="inhouse">
          <InHouseView tests={data.filter(t => !t.outsourced)} />
        </TabsContent>
        {discoveredLabs.map(l => (
          <TabsContent key={l} value={`lab:${l}`}>
            <OutsourcedView
              lab={l}
              tests={data.filter(t => t.outsourced && (t.outsourcedLab ?? "").trim().toLowerCase() === l.toLowerCase())}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function InHouseView({ tests }: { tests: TestCatalog[] }) {
  const [q, setQ] = useState("");
  const filtered = tests.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{filtered.length} in-house tests</div>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name…" className="h-8 w-64" />
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="border-b">
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">In-house</span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(t.rate).toFixed(2)}</td>
                <td className="px-3 py-2 text-center">{t.active ? "✓" : "✗"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No in-house tests found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OutsourcedView({ lab, tests }: { lab: string; tests: TestCatalog[] }) {
  const [q, setQ] = useState("");
  const filtered = tests.filter(t => {
    if (!q) return true;
    const s = q.toLowerCase();
    return t.name.toLowerCase().includes(s) || (t.testCode ?? "").toLowerCase().includes(s);
  });
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{filtered.length} {lab} tests</div>
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${lab} by name or code…`} className="h-8 w-72" />
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Lab</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <tr key={t.id} className="border-b">
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2">
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t.outsourcedLab || lab}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {t.testCode
                    ? <span className="rounded bg-secondary px-1.5 py-0.5">{t.testCode}</span>
                    : <span className="text-muted-foreground italic">Not added</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(t.rate).toFixed(2)}</td>
                <td className="px-3 py-2 text-center">{t.active ? "✓" : "✗"}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">No {lab} tests found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
