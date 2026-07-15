import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAppointments, useCreateAppointment, useUpdateAppointment, useLinkAppointmentPatient } from "@/lib/queries";
import type { Appointment, AppointmentStatus, Sex, AgeUnit } from "@/lib/types";
import { PatientFormDialog } from "@/components/patient-form-dialog";
import { toast } from "sonner";
import { CalendarClock, Plus } from "lucide-react";

export const Route = createFileRoute("/appointments")({
  component: () => <AppShell><AppointmentsPage /></AppShell>,
});

const STATUSES: AppointmentStatus[] = ["scheduled", "sample_collected", "cancelled", "rescheduled", "no_show"];

function AppointmentsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(today);
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [convertFrom, setConvertFrom] = useState<Appointment | null>(null);

  const { data = [], refetch } = useAppointments({ date, status: status === "all" ? undefined : status, q });
  const link = useLinkAppointmentPatient();

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground"><CalendarClock className="h-4 w-4" /> Appointments</div>
          <div className="text-lg font-semibold">Scheduled procedures</div>
        </div>
        <Button onClick={() => { setEditing(null); setOpenForm(true); }} className="gap-2"><Plus className="h-4 w-4" /> New Appointment</Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div><Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]"><Label className="text-xs">Search</Label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name / mobile / procedure / doctor" /></div>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50"><tr className="text-left">
            <th className="p-2">Time</th><th className="p-2">Name</th><th className="p-2">Mobile</th><th className="p-2">Procedure</th><th className="p-2">Doctor</th><th className="p-2">Status</th><th className="p-2 text-right">Actions</th>
          </tr></thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No appointments</td></tr>}
            {data.map((a: any) => (
              <tr key={a.id} className="border-t">
                <td className="p-2">{a.appointmentTime ?? "—"}</td>
                <td className="p-2">{a.name}</td>
                <td className="p-2">{a.mobile}</td>
                <td className="p-2">{a.procedure}</td>
                <td className="p-2">{a.referredDoctor ?? "—"}</td>
                <td className="p-2"><span className="rounded bg-secondary px-2 py-0.5 text-xs">{a.status}</span></td>
                <td className="p-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(a); setOpenForm(true); }}>Edit</Button>
                  {!a.linkedPatientId && a.status !== "cancelled" && a.status !== "no_show" && (
                    <Button size="sm" onClick={() => setConvertFrom(a)}>Create Patient Entry</Button>
                  )}
                  {a.linkedPatient && (
                    <span className="text-xs text-muted-foreground">#{a.linkedPatient.registerNumber} · {a.linkedPatient.name}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AppointmentFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        appointment={editing}
        defaultDate={date}
        onSaved={(saved) => {
          const savedDate = saved.appointmentDate.slice(0, 10);
          // Ensure user immediately sees the appointment they just saved.
          if (savedDate !== date) setDate(savedDate);
          if (status !== "all" && saved.status !== status) setStatus("all");
          toast.success(`Saved for ${savedDate}`);
          setOpenForm(false);
        }}
      />

      {convertFrom && (
        <PatientFormDialog
          open={!!convertFrom}
          onOpenChange={(o) => { if (!o) setConvertFrom(null); }}
          entryDate={today}
          prefill={{
            name: convertFrom.name, mobile: convertFrom.mobile,
            ageValue: convertFrom.ageValue, ageUnit: convertFrom.ageUnit as AgeUnit,
            sex: convertFrom.sex as Sex,
            referredDoctor: convertFrom.referredDoctor ?? "",
            notes: convertFrom.procedure ? `From appointment: ${convertFrom.procedure}` : "",
          }}
          onCreated={async (patient: any) => {
            try {
              await link.mutateAsync({ appointmentId: convertFrom.id, patientId: patient.id });
              toast.success("Patient linked to appointment");
              setConvertFrom(null);
              refetch();
            } catch (e: any) { toast.error(e?.message ?? "Failed to link"); }
          }}
        />
      )}
    </div>
  );
}

function AppointmentFormDialog({ open, onOpenChange, appointment, defaultDate, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; appointment: Appointment | null; defaultDate: string; onSaved: (a: Appointment) => void }) {
  const create = useCreateAppointment();
  const update = useUpdateAppointment(appointment?.id ?? "");
  const [name, setName] = useState(""); const [mobile, setMobile] = useState("");
  const [ageValue, setAgeValue] = useState(""); const [ageUnit, setAgeUnit] = useState<AgeUnit>("years");
  const [sex, setSex] = useState<Sex>("M"); const [referredDoctor, setReferredDoctor] = useState("");
  const [procedure, setProcedure] = useState(""); const [appointmentDate, setAppointmentDate] = useState(defaultDate);
  const [appointmentTime, setAppointmentTime] = useState(""); const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");

  // Sync form fields whenever the dialog opens (either for edit or new).
  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setName(appointment.name); setMobile(appointment.mobile);
      setAgeValue(String(appointment.ageValue)); setAgeUnit(appointment.ageUnit as AgeUnit);
      setSex(appointment.sex as Sex); setReferredDoctor(appointment.referredDoctor ?? "");
      setProcedure(appointment.procedure);
      setAppointmentDate(appointment.appointmentDate.slice(0, 10));
      setAppointmentTime(appointment.appointmentTime ?? ""); setNotes(appointment.notes ?? "");
      setStatus(appointment.status);
    } else {
      setName(""); setMobile(""); setAgeValue(""); setAgeUnit("years");
      setSex("M"); setReferredDoctor(""); setProcedure("");
      setAppointmentDate(defaultDate);
      setAppointmentTime(""); setNotes(""); setStatus("scheduled");
    }
  }, [open, appointment, defaultDate]);

  async function save() {
    if (!name || !mobile || !procedure || !appointmentDate) { toast.error("Name, mobile, procedure, date required"); return; }
    const payload = {
      name, mobile, ageValue: Number(ageValue) || 0, ageUnit, sex,
      referredDoctor: referredDoctor || undefined, procedure, appointmentDate,
      appointmentTime: appointmentTime || undefined, notes: notes || undefined, status,
    };
    try {
      const saved = appointment
        ? await update.mutateAsync(payload)
        : await create.mutateAsync(payload);
      onSaved(saved);
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{appointment ? "Edit Appointment" : "New Appointment"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Mobile</Label><Input value={mobile} onChange={(e) => setMobile(e.target.value)} /></div>
          <div><Label>Sex</Label>
            <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="M">M</SelectItem><SelectItem value="F">F</SelectItem><SelectItem value="O">O</SelectItem></SelectContent>
            </Select>
          </div>
          <div><Label>Age</Label><Input type="number" value={ageValue} onChange={(e) => setAgeValue(e.target.value)} /></div>
          <div><Label>Age unit</Label>
            <Select value={ageUnit} onValueChange={(v) => setAgeUnit(v as AgeUnit)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="years">years</SelectItem><SelectItem value="months">months</SelectItem><SelectItem value="days">days</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Procedure / Test</Label><Input value={procedure} onChange={(e) => setProcedure(e.target.value)} placeholder="FNAC, Pap smear, ..." /></div>
          <div><Label>Date</Label><Input type="date" value={appointmentDate} onChange={(e) => setAppointmentDate(e.target.value)} /></div>
          <div><Label>Time</Label><Input type="time" value={appointmentTime} onChange={(e) => setAppointmentTime(e.target.value)} /></div>
          <div className="col-span-2"><Label>Referred by doctor</Label><Input value={referredDoctor} onChange={(e) => setReferredDoctor(e.target.value)} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {appointment && (
            <div className="col-span-2"><Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as AppointmentStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter><Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
