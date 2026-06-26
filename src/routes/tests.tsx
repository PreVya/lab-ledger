import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useTests } from "@/lib/queries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/queries";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/tests")({ component: () => <AppShell><TestCatalog /></AppShell> });

function TestCatalog() {
  const { data = [] } = useTests();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [rate, setRate] = useState("");
  const [outsourced, setOutsourced] = useState(false);
  const [lab, setLab] = useState("");

  const create = useMutation({
    mutationFn: (b: any) => api("/tests", { method: "POST", body: JSON.stringify(b) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tests });
      toast.success("Test added");
      setName(""); setRate(""); setLab(""); setOutsourced(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <h1 className="mb-1 text-lg font-semibold">Test Catalog</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        Same test name is allowed across different outsourced labs (e.g. <em>Vitamin D — Lupin ₹1200</em> and <em>Vitamin D — Metropolis ₹1500</em>). Exact duplicates (same name + same provider) are blocked.
      </p>
      <form
        onSubmit={(e) => { e.preventDefault(); create.mutate({ name, rate: Number(rate), outsourced, outsourcedLab: outsourced ? lab : null }); }}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-md border bg-card p-3"
      >
        <div><label className="text-xs text-muted-foreground">Name</label><Input value={name} onChange={e => setName(e.target.value)} required className="h-8 w-56" /></div>
        <div><label className="text-xs text-muted-foreground">Rate</label><Input value={rate} onChange={e => setRate(e.target.value)} required inputMode="decimal" className="h-8 w-28" /></div>
        <div className="flex items-center gap-2 pb-1"><Switch checked={outsourced} onCheckedChange={setOutsourced} /><span className="text-sm">Outsourced</span></div>
        {outsourced && <div><label className="text-xs text-muted-foreground">Provider / Lab</label><Input value={lab} onChange={e => setLab(e.target.value)} className="h-8 w-48" placeholder="e.g. Metropolis" /></div>}
        <Button type="submit" size="sm">Add Test</Button>
      </form>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Provider</th>
              <th className="px-3 py-2 text-right">Rate</th>
              <th className="px-3 py-2 text-center">Active</th>
            </tr>
          </thead>
          <tbody>
            {data.map(t => (
              <tr key={t.id} className="border-b">
                <td className="px-3 py-2 font-medium">{t.name}</td>
                <td className="px-3 py-2">
                  {t.outsourced ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">{t.outsourcedLab || "Outsourced"}</span>
                  ) : (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">In-house</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(t.rate).toFixed(2)}</td>
                <td className="px-3 py-2 text-center">{t.active ? "✓" : "✗"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
