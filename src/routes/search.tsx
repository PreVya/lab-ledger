import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { useSearch } from "@/lib/queries";
import { PatientFormDialog } from "@/components/patient-form-dialog";
import type { Patient } from "@/lib/types";

export const Route = createFileRoute("/search")({ component: () => <AppShell><SearchPage /></AppShell> });

function SearchPage() {
  const [q, setQ] = useState("");
  const { data = [], isFetching } = useSearch(q);
  const [editing, setEditing] = useState<Patient | null>(null);

  return (
    <div className="p-6">
      <h1 className="mb-4 text-lg font-semibold">Search Patients</h1>
      <Input
        autoFocus
        placeholder="Search by ID, mobile, or name..."
        value={q}
        onChange={e => setQ(e.target.value)}
        className="max-w-md"
      />
      <div className="mt-4 rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Reg #</th>
              <th className="px-3 py-2 text-left">FY</th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Mobile</th>
              <th className="px-3 py-2 text-right">Net</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id} onClick={() => setEditing(p)} className="cursor-pointer border-b hover:bg-secondary/40">
                <td className="px-3 py-2">{new Date(p.entryDate).toLocaleDateString()}</td>
                <td className="px-3 py-2 font-mono">{p.registerNumber ?? p.dailySerial}</td>
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.financialYear ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2">{p.mobile}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(p.net).toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums">₹{Number(p.balance).toFixed(2)}</td>
              </tr>
            ))}
            {!isFetching && q && data.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No matches.</td></tr>
            )}
            {!q && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Type to search.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PatientFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} patient={editing} />
    </div>
  );
}
