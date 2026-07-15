import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useEmployees, useCreateEmployee, useUpdateEmployee, useDeactivateEmployee, useEmployeeAadhaar,
  useAttendanceByDate, useSaveAttendanceBulk,
  useSalarySummary, useSalaryAdvances, useCreateSalaryAdvance, useDeleteSalaryAdvance,
  useHolidays, useCreateHoliday, useDeleteHoliday,
} from "@/lib/queries";
import type { AttendanceStatus, Employee } from "@/lib/types";
import { toast } from "sonner";

export const Route = createFileRoute("/attendance")({
  component: () => <AppShell><AttendancePage /></AppShell>,
});

function AttendancePage() {
  return (
    <div className="p-6">
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="advances">Advances</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        <TabsContent value="employees"><EmployeesTab /></TabsContent>
        <TabsContent value="salary"><SalaryTab /></TabsContent>
        <TabsContent value="advances"><AdvancesTab /></TabsContent>
        <TabsContent value="holidays"><HolidaysTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// -------- Attendance tab --------
function AttendanceTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const { data } = useAttendanceByDate(date);
  const save = useSaveAttendanceBulk();
  const createHoliday = useCreateHoliday();
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; notes?: string }>>({});
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayName, setHolidayName] = useState("");

  const rows = data?.rows ?? [];
  const isHoliday = !!data?.isHoliday;

  const entries = rows.map((r) => ({
    ...r,
    current: draft[r.employee.id] ?? (r.attendance ? { status: r.attendance.status, notes: r.attendance.notes ?? undefined } : undefined),
  }));

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-end gap-3 flex-wrap">
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setDraft({}); }} /></div>
        <Button onClick={async () => {
          const list = Object.entries(draft).map(([employeeId, v]) => ({ employeeId, status: v.status, notes: v.notes }));
          if (!list.length) { toast.info("No changes"); return; }
          try { await save.mutateAsync({ date, entries: list }); toast.success("Attendance saved"); setDraft({}); }
          catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}>Save</Button>
        {!isHoliday && (
          <Button variant="outline" onClick={() => setHolidayOpen(true)}>Mark as Holiday</Button>
        )}
        {isHoliday && data?.holiday && (
          <div className="rounded-md bg-amber-50 border border-amber-300 px-3 py-1.5 text-sm text-amber-900">
            Holiday: <span className="font-medium">{data.holiday.name}</span> ({data.holiday.type})
            <span className="ml-2 text-xs text-amber-700">Salary is credited automatically; manual marking optional.</span>
          </div>
        )}
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Employee</th><th className="p-2">Status</th><th className="p-2">Notes</th></tr></thead>
          <tbody>
            {entries.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">No active employees</td></tr>}
            {entries.map((r) => (
              <tr key={r.employee.id} className="border-t">
                <td className="p-2">
                  {r.employee.name}
                  {r.employee.designation && <span className="ml-2 text-xs text-muted-foreground">{r.employee.designation}</span>}
                  {r.employee.alwaysPresent && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-800">Always present</span>}
                </td>
                <td className="p-2">
                  <Select value={r.current?.status ?? ""} onValueChange={(v) => setDraft(d => ({ ...d, [r.employee.id]: { status: v as AttendanceStatus, notes: d[r.employee.id]?.notes } }))}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder={r.effectiveStatus ? `auto: ${r.effectiveStatus}` : "unmarked"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="half_day">Half day</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="leave">Leave</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-2"><Input value={r.current?.notes ?? ""} onChange={(e) => setDraft(d => ({ ...d, [r.employee.id]: { status: (d[r.employee.id]?.status ?? r.attendance?.status ?? "present") as AttendanceStatus, notes: e.target.value } }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={holidayOpen} onOpenChange={setHolidayOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark {date} as Holiday</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Holiday name</Label>
            <Input value={holidayName} onChange={(e) => setHolidayName(e.target.value)} placeholder="Diwali / Republic Day / ..." />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHolidayOpen(false)}>Cancel</Button>
            <Button onClick={async () => {
              if (!holidayName.trim()) { toast.error("Name required"); return; }
              try {
                await createHoliday.mutateAsync({ date, name: holidayName.trim() });
                toast.success("Marked holiday"); setHolidayOpen(false); setHolidayName("");
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// -------- Employees tab --------
function EmployeesTab() {
  const { data = [] } = useEmployees();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const deact = useDeactivateEmployee();
  const getAadhaar = useEmployeeAadhaar();

  return (
    <div className="mt-4 space-y-3">
      <div className="flex justify-end"><Button onClick={() => { setEditing(null); setOpen(true); }}>New Employee</Button></div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Name</th><th className="p-2">Designation</th><th className="p-2">Mobile</th><th className="p-2">Monthly Salary</th><th className="p-2">Aadhaar</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th></tr></thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="p-2">
                  {e.name}
                  {e.alwaysPresent && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-800">Always present</span>}
                </td>
                <td className="p-2">{e.designation ?? "—"}</td>
                <td className="p-2">{e.mobile ?? "—"}</td>
                <td className="p-2">₹{e.monthlySalary}</td>
                <td className="p-2">
                  {e.aadhaarDocument ? (
                    <Button size="sm" variant="link" onClick={async () => {
                      try { const r = await getAadhaar.mutateAsync(e.id); window.open(r.signedUrl, "_blank"); }
                      catch (err: any) { toast.error(err?.message ?? "Failed"); }
                    }}>View</Button>
                  ) : <span className="text-xs text-muted-foreground">not uploaded</span>}
                </td>
                <td className="p-2">{e.active ? "Active" : "Inactive"}</td>
                <td className="p-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(e); setOpen(true); }}>Edit</Button>
                  {e.active && <Button size="sm" variant="ghost" onClick={() => deact.mutate(e.id)}>Deactivate</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <EmployeeFormDialog open={open} onOpenChange={setOpen} employee={editing} />
    </div>
  );
}

function EmployeeFormDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee: Employee | null }) {
  const create = useCreateEmployee(); const update = useUpdateEmployee(employee?.id ?? "");
  const [name, setName] = useState(""); const [mobile, setMobile] = useState("");
  const [designation, setDesignation] = useState(""); const [monthlySalary, setMonthlySalary] = useState("");
  const [alwaysPresent, setAlwaysPresent] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    if (employee) {
      setName(employee.name); setMobile(employee.mobile ?? "");
      setDesignation(employee.designation ?? ""); setMonthlySalary(String(employee.monthlySalary));
      setAlwaysPresent(!!employee.alwaysPresent);
      setFile(null);
    } else {
      setName(""); setMobile(""); setDesignation(""); setMonthlySalary("");
      setAlwaysPresent(false); setFile(null);
    }
  }, [open, employee]);

  async function save() {
    if (!name.trim()) { toast.error("Name required"); return; }
    const fd = new FormData();
    fd.set("name", name); fd.set("mobile", mobile); fd.set("designation", designation);
    fd.set("monthlySalary", monthlySalary || "0");
    fd.set("alwaysPresent", alwaysPresent ? "true" : "false");
    if (file) fd.set("aadhaar", file);
    try {
      if (employee) await update.mutateAsync(fd); else await create.mutateAsync(fd);
      toast.success("Saved"); onOpenChange(false);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{employee ? "Edit Employee" : "New Employee"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
            <div><Label>Designation</Label><Input value={designation} onChange={(e) => setDesignation(e.target.value)} /></div>
          </div>
          <div><Label>Monthly Salary</Label><Input type="number" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} /></div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={alwaysPresent} onChange={(e) => setAlwaysPresent(e.target.checked)} />
            <span>Always present (auto-credit attendance for every working day)</span>
          </label>
          <div>
            <Label>Aadhaar (JPG/PNG/WEBP/PDF, ≤ 5 MB) {employee?.aadhaarDocument && <span className="ml-2 text-xs text-muted-foreground">current: {employee.aadhaarDocument.originalName}</span>}</Label>
            <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            {file && <div className="text-xs text-muted-foreground mt-1">Selected: {file.name}</div>}
          </div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------- Salary tab --------
function SalaryTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data = [] } = useSalarySummary(year, month);
  const create = useCreateSalaryAdvance();
  const [advFor, setAdvFor] = useState<string | null>(null);
  const [amount, setAmount] = useState(""); const [notes, setNotes] = useState("");

  const holidayCount = useMemo(() => (data[0]?.holidays ?? 0), [data]);

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2 items-end">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-24" /></div>
        <div><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value) || month)} className="w-20" /></div>
        {data.length > 0 && (
          <div className="ml-auto text-xs text-muted-foreground">
            Days: {data[0].daysInMonth} · Holidays: {holidayCount} (Sundays: {data[0].sundays}, Custom: {data[0].customHolidays})
          </div>
        )}
      </div>
      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left">
            <th className="p-2">Employee</th><th className="p-2">Monthly</th><th className="p-2">Days</th><th className="p-2">Hol</th><th className="p-2">P</th><th className="p-2">½</th><th className="p-2">A</th><th className="p-2">L</th><th className="p-2">Unmarked</th><th className="p-2">Attended</th><th className="p-2">Gross</th><th className="p-2">Advance</th><th className="p-2">Net</th><th className="p-2 text-right">Add advance</th>
          </tr></thead>
          <tbody>
            {data.map((s) => (
              <tr key={s.employee.id} className="border-t">
                <td className="p-2">
                  {s.employee.name}
                  {s.employee.alwaysPresent && <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-800">AP</span>}
                </td>
                <td className="p-2">₹{s.employee.monthlySalary}</td>
                <td className="p-2">{s.daysInMonth}</td>
                <td className="p-2 text-amber-700">{s.holidays}</td>
                <td className="p-2">{s.counts.present}</td>
                <td className="p-2">{s.counts.half_day}</td>
                <td className="p-2">{s.counts.absent}</td>
                <td className="p-2">{s.counts.leave}</td>
                <td className="p-2 text-amber-700">{s.unmarked}</td>
                <td className="p-2">{s.attendedDays}</td>
                <td className="p-2">₹{s.gross}</td>
                <td className="p-2">₹{s.advances}</td>
                <td className="p-2 font-semibold">₹{s.netPayable}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setAdvFor(s.employee.id)}>+</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!advFor} onOpenChange={(o) => { if (!o) { setAdvFor(null); setAmount(""); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Salary Advance</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Amount</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button onClick={async () => {
              if (!advFor || !amount) return;
              try {
                await create.mutateAsync({ employeeId: advFor, date: new Date().toISOString().slice(0, 10), amount: Number(amount), notes });
                toast.success("Advance recorded"); setAdvFor(null); setAmount(""); setNotes("");
              } catch (e: any) { toast.error(e?.message ?? "Failed"); }
            }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdvancesTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data = [] } = useSalaryAdvances({ year, month });
  const del = useDeleteSalaryAdvance();
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2 items-end">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-24" /></div>
        <div><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value) || month)} className="w-20" /></div>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Date</th><th className="p-2">Employee</th><th className="p-2">Amount</th><th className="p-2">Notes</th><th className="p-2 text-right">Actions</th></tr></thead>
          <tbody>
            {data.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.date.slice(0, 10)}</td>
                <td className="p-2">{a.employee?.name}</td>
                <td className="p-2">₹{a.amount}</td>
                <td className="p-2">{a.notes ?? "—"}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => del.mutate(a.id)}>Delete</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -------- Holidays tab --------
function HolidaysTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const { data = [] } = useHolidays(year, month);
  const create = useCreateHoliday();
  const del = useDeleteHoliday();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [name, setName] = useState("");

  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2 items-end flex-wrap">
        <div><Label>Year</Label><Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} className="w-24" /></div>
        <div><Label>Month</Label><Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value) || month)} className="w-20" /></div>
        <div className="ml-auto text-xs text-muted-foreground">Sundays are treated as holidays automatically.</div>
      </div>
      <div className="rounded-md border p-3 flex flex-wrap gap-2 items-end">
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="flex-1 min-w-[200px]"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diwali, Republic Day, ..." /></div>
        <Button onClick={async () => {
          if (!name.trim()) { toast.error("Name required"); return; }
          try { await create.mutateAsync({ date, name: name.trim() }); toast.success("Saved"); setName(""); }
          catch (e: any) { toast.error(e?.message ?? "Failed"); }
        }}>Add holiday</Button>
      </div>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left"><th className="p-2">Date</th><th className="p-2">Name</th><th className="p-2">Type</th><th className="p-2 text-right">Actions</th></tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">No custom holidays for this month</td></tr>}
            {data.map((h) => (
              <tr key={h.id} className="border-t">
                <td className="p-2">{h.date.slice(0, 10)}</td>
                <td className="p-2">{h.name}</td>
                <td className="p-2">{h.type}</td>
                <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => del.mutate(h.id)}>Delete</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
