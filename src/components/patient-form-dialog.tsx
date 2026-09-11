import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useTests, useCreatePatient, useUpdatePatient,
  usePatientPayments, useRecordPayment, useUpdatePayment, useDeletePayment,
} from "@/lib/queries";
import type { AgeUnit, Patient, PaymentInput, PaymentKind, PaymentMode, PaymentRow, Sex, UpsertPatientInput } from "@/lib/types";
import { Switch } from "@/components/ui/switch";
import { Check, X, Plus, Pencil, Trash2, AlertTriangle, MessageCircle, FileCheck2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { BillActions } from "@/components/bill-dialog";

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

/** Salutations are NOT stored separately — they are prefixed onto the patient name. */
const SALUTATIONS = ["Mast.", "Mr.", "Miss.", "Mrs."] as const;
type Salutation = (typeof SALUTATIONS)[number];
const NO_SALUTATION = "none";

/** Split a stored name into { salutation, rest } when it already starts with one. */
function splitSalutation(full: string): { salutation: Salutation | null; rest: string } {
  const trimmed = full.trim();
  for (const s of SALUTATIONS) {
    const bare = s.replace(".", "");
    const re = new RegExp(`^${bare}\\.?\\s+`, "i");
    if (re.test(trimmed)) return { salutation: s, rest: trimmed.replace(re, "").trim() };
  }
  return { salutation: null, rest: trimmed };
}

/** Combine salutation + typed name without ever duplicating the prefix. */
function combineName(salutation: Salutation | null, typed: string): string {
  const { rest } = splitSalutation(typed);
  const base = rest || typed.trim();
  return salutation ? `${salutation} ${base}`.trim() : base;
}

const LEDGER_START = "2026-08-01";
const isSundayISO = (d: string) => !!d && new Date(d + "T00:00:00Z").getUTCDay() === 0;

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/** Validate a user-picked payment date. Returns an error message or null. */
function paymentDateError(date: string): string | null {
  if (!date) return "Please select the payment date.";
  if (date < LEDGER_START) return "Date must be on/after 01-Aug-2026.";
  if (isSundayISO(date)) return "Sunday is a clinic holiday — pick another date.";
  return null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient?: Patient | null;
  /** For new entries, the date to record the patient on. Never defaulted. */
  entryDate?: string;
  /** Optional prefill for demographic fields (used by appointment conversion). */
  prefill?: Partial<Pick<UpsertPatientInput, "name" | "mobile" | "ageValue" | "ageUnit" | "sex" | "referredDoctor" | "notes">>;
  /** Called after a NEW patient is successfully created. */
  onCreated?: (patient: Patient) => void | Promise<void>;
}

export function PatientFormDialog({ open, onOpenChange, patient, entryDate, prefill, onCreated }: Props) {
  const { data: tests = [] } = useTests();
  const create = useCreatePatient();
  const update = useUpdatePatient(patient?.id ?? "");

  const [salutation, setSalutation] = useState<Salutation | null>(null);
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [whatsappReportRequired, setWhatsappReportRequired] = useState(false);
  const [outsourcedReportReady, setOutsourcedReportReady] = useState(false);
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState<AgeUnit>("years");
  const [sex, setSex] = useState<Sex>("M");
  const [referredDoctor, setReferredDoctor] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testFilter, setTestFilter] = useState("");
  const [discount, setDiscount] = useState("");

  /** Payment transactions for a patient that has not been saved yet. */
  const [draftPayments, setDraftPayments] = useState<PaymentInput[]>([]);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (patient) {
      const parsed = splitSalutation(patient.name);
      setSalutation(parsed.salutation); setName(parsed.rest);
      setWhatsappReportRequired(!!patient.whatsappReportRequired);
      setOutsourcedReportReady(!!patient.outsourcedReportReady);
      setMobile(patient.mobile);
      setAgeValue(String(patient.ageValue ?? patient.age ?? ""));
      setAgeUnit((patient.ageUnit ?? "years") as AgeUnit);
      setSex(patient.sex); setReferredDoctor(patient.referredDoctor ?? "");
      setNotes(patient.notes ?? "");
      setSelectedTests(patient.tests.map(t => t.testId));
      setDiscount(patient.discount);
      setDraftPayments([]);
    } else {
      const parsed = splitSalutation(prefill?.name ?? "");
      setSalutation(parsed.salutation); setName(parsed.rest);
      setWhatsappReportRequired(false); setOutsourcedReportReady(false);
      setMobile(prefill?.mobile ?? "");
      setAgeValue(prefill?.ageValue != null ? String(prefill.ageValue) : "");
      setAgeUnit((prefill?.ageUnit ?? "years") as AgeUnit);
      setSex((prefill?.sex ?? "M") as Sex); setReferredDoctor(prefill?.referredDoctor ?? "");
      setNotes(prefill?.notes ?? "");
      setSelectedTests([]); setDiscount("");
      setDraftPayments([]);
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, patient, entryDate]);

  const total = useMemo(
    () => selectedTests.reduce((s, id) => s + Number(tests.find(t => t.id === id)?.rate ?? 0), 0),
    [selectedTests, tests],
  );
  const net = Math.max(0, total - num(discount));

  const filteredTests = useMemo(() => {
    const q = testFilter.toLowerCase();
    return tests.filter(t => t.active && (
      !q ||
      t.name.toLowerCase().includes(q) ||
      (t.outsourcedLab ?? "").toLowerCase().includes(q) ||
      (t.testCode ?? "").toLowerCase().includes(q)
    ));
  }, [tests, testFilter]);

  function toggleTest(id: string) {
    setSelectedTests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim() || !mobile.trim() || !ageValue || !selectedTests.length) {
      toast.error("Name, mobile, age, and at least one test are required");
      return;
    }
    // entryDate is never inferred — a new patient must always carry an explicit ledger date.
    if (!patient && !entryDate) { toast.error("Patient entry date is required."); return; }

    const input: UpsertPatientInput = {
      name: combineName(salutation, name), mobile: mobile.trim(),
      ageValue: Number(ageValue), ageUnit,
      sex,
      referredDoctor: referredDoctor.trim() || undefined,
      notes: notes.trim() || undefined,
      whatsappReportRequired,
      outsourcedReportReady,
      testIds: selectedTests,
      discount: num(discount),
      entryDate: !patient && entryDate ? entryDate : undefined,
      // Money is created ONLY from explicit transactions on a new patient; on edit
      // the payment rows are managed by the Payment Transactions section itself.
      ...(patient ? {} : { payments: draftPayments }),
    };
    try {
      if (patient) {
        await update.mutateAsync(input);
      } else {
        const created = await create.mutateAsync(input);
        if (onCreated) await onCreated(created);
      }
      toast.success(patient ? "Patient updated" : "Patient saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[92vw] max-h-[92vh] overflow-y-auto xl:max-w-6xl">
        <DialogHeader>
          <DialogTitle>{patient ? `Edit Patient #${patient.registerNumber ?? patient.dailySerial}${patient.financialYear ? ` · FY ${patient.financialYear}` : ""}` : `New Patient Entry${entryDate ? ` — ${fmtDate(entryDate)}` : ""}`}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 space-y-4">
            <div className="grid grid-cols-6 gap-3">
              <Field label="Title" className="col-span-1">
                <Select
                  value={salutation ?? NO_SALUTATION}
                  onValueChange={v => setSalutation(v === NO_SALUTATION ? null : (v as Salutation))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SALUTATION}>—</SelectItem>
                    {SALUTATIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Name" className="col-span-3">
                <Input ref={nameRef} value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field label="Mobile" className="col-span-2">
                <Input value={mobile} onChange={e => setMobile(e.target.value)} inputMode="tel" />
              </Field>
              <Field label="Age" className="col-span-2">
                <div className="flex gap-1">
                  <Input value={ageValue} onChange={e => setAgeValue(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="w-16" />
                  <Select value={ageUnit} onValueChange={v => setAgeUnit(v as AgeUnit)}>
                    <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="days">Days</SelectItem>
                      <SelectItem value="months">Months</SelectItem>
                      <SelectItem value="years">Years</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
              <Field label="Sex" className="col-span-2">
                <Select value={sex} onValueChange={v => setSex(v as Sex)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="O">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Referred Doctor" className="col-span-2">
                <Input value={referredDoctor} onChange={e => setReferredDoctor(e.target.value)} />
              </Field>
              <Field label="Notes" className="col-span-6">
                <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
              </Field>
            </div>

            {/* Manual tracking flags — stored only, nothing is sent automatically. */}
            <div className="grid grid-cols-2 gap-3">
              <FlagToggle
                icon={<MessageCircle className="h-4 w-4" />}
                label="Send report on WhatsApp"
                hint="Patient wants the report on WhatsApp"
                checked={whatsappReportRequired}
                onChange={setWhatsappReportRequired}
                activeClass="border-emerald-400 bg-emerald-50 text-emerald-900"
              />
              <FlagToggle
                icon={<FileCheck2 className="h-4 w-4" />}
                label="Outsourced report ready"
                hint="Report received from the outsourced lab / printed"
                checked={outsourcedReportReady}
                onChange={setOutsourcedReportReady}
                activeClass="border-amber-400 bg-amber-50 text-amber-900"
              />
            </div>

            <div className="rounded-md border">
              <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
                <div className="text-sm font-medium">Tests ({selectedTests.length})</div>
                <Input value={testFilter} onChange={e => setTestFilter(e.target.value)} placeholder="Filter by name or lab..." className="h-7 w-56" />
              </div>
              <div className="max-h-64 overflow-auto">
                {filteredTests.map(t => {
                  const sel = selectedTests.includes(t.id);
                  const provider = t.outsourced ? (t.outsourcedLab || "Outsourced") : "In-house";
                  return (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => toggleTest(t.id)}
                      className={cn(
                        "flex w-full items-center justify-between border-b px-3 py-1.5 text-left text-sm hover:bg-secondary/50",
                        sel && "bg-accent/40",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className={cn("flex h-4 w-4 items-center justify-center rounded border", sel && "border-primary bg-primary text-primary-foreground")}>
                          {sel && <Check className="h-3 w-3" />}
                        </span>
                        <span className="font-medium">{t.name}</span>
                        <span className={cn(
                          "rounded px-1.5 py-0.5 text-[10px] uppercase",
                          t.outsourced ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800",
                        )}>{provider}</span>
                        {t.outsourced && (
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            Code: {t.testCode ? t.testCode : <span className="italic">Not added</span>}
                          </span>
                        )}
                      </span>
                      <span className="tabular-nums">₹{Number(t.rate).toFixed(2)}</span>
                    </button>
                  );
                })}
                {filteredTests.length === 0 && <div className="p-4 text-sm text-muted-foreground">No tests match.</div>}
              </div>
            </div>
          </div>

          <div className="col-span-5 space-y-3 rounded-md border bg-secondary/30 p-4">
            <div className="text-sm font-semibold">Billing</div>
            <Row label="Total"><Money value={total} /></Row>
            <Row label="Discount">
              <Input value={discount} onChange={e => setDiscount(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Net" emphasis><Money value={net} /></Row>
          </div>
        </div>

        <PaymentTransactions
          patient={patient ?? null}
          net={net}
          draftPayments={draftPayments}
          setDraftPayments={setDraftPayments}
        />

        <DialogFooter className="sm:justify-between">
          <div>{patient?.id && <BillActions patientId={patient.id} />}</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" />Cancel</Button>
            <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
              {patient ? "Update" : "Save"} (Ctrl+S)
            </Button>
          </div>
        </DialogFooter>

        <KeyboardShortcuts onSave={handleSave} />
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Payment Transactions                                                */
/* ------------------------------------------------------------------ */

type DraftRow = PaymentInput & { id?: string };

function PaymentTransactions({
  patient, net, draftPayments, setDraftPayments,
}: {
  patient: Patient | null;
  net: number;
  draftPayments: PaymentInput[];
  setDraftPayments: (rows: PaymentInput[]) => void;
}) {
  const saved = !!patient?.id;
  const history = usePatientPayments(saved ? patient!.id : undefined);
  const record = useRecordPayment(patient?.id ?? "");
  const updatePayment = useUpdatePayment(patient?.id ?? "");
  const removePayment = useDeletePayment(patient?.id ?? "");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<{ index: number; row: DraftRow } | null>(null);

  const rows: DraftRow[] = saved
    ? ((history.data?.payments ?? []) as PaymentRow[]).map(p => ({
        id: p.id, kind: p.kind, mode: p.mode, amount: Number(p.amount),
        date: p.date.slice(0, 10), notes: p.notes ?? "",
      }))
    : draftPayments;

  const effectiveNet = saved ? Number(history.data?.net ?? patient!.net) : net;
  const totalPaid = rows.reduce((s, r) => s + Number(r.amount), 0);
  const pending = effectiveNet - totalPaid;
  const overpaid = totalPaid > effectiveNet ? totalPaid - effectiveNet : 0;

  async function persist(row: DraftRow, index: number | null) {
    const payload: PaymentInput = {
      kind: row.kind, mode: row.mode, amount: Number(row.amount),
      date: row.date, notes: row.notes?.trim() || null,
    };
    if (!saved) {
      const next = [...draftPayments];
      if (index === null) next.push(payload); else next[index] = payload;
      setDraftPayments(next);
      return;
    }
    if (row.id) await updatePayment.mutateAsync({ id: row.id, ...payload });
    else await record.mutateAsync(payload);
  }

  async function handleDelete(row: DraftRow, index: number) {
    try {
      if (!saved) {
        setDraftPayments(draftPayments.filter((_, i) => i !== index));
      } else if (row.id) {
        await removePayment.mutateAsync(row.id);
      }
      toast.success("Payment deleted");
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  }

  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
        <div className="text-sm font-semibold">Payment Transactions</div>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={() => { setEditing(null); setEditorOpen(true); }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add Payment
        </Button>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-secondary/20 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">Date</th>
            <th className="px-3 py-2 text-left font-semibold">Kind</th>
            <th className="px-3 py-2 text-left font-semibold">Mode</th>
            <th className="px-3 py-2 text-right font-semibold">Amount</th>
            <th className="px-3 py-2 text-left font-semibold">Notes</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? `draft-${i}`} className="border-t">
              <td className="px-3 py-1.5 tabular-nums">{fmtDate(r.date)}</td>
              <td className="px-3 py-1.5 capitalize">{r.kind}</td>
              <td className="px-3 py-1.5 text-xs font-medium uppercase">{r.mode}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">₹{Number(r.amount).toFixed(2)}</td>
              <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.notes || "—"}</td>
              <td className="px-3 py-1.5 text-right">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing({ index: i, row: r }); setEditorOpen(true); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r, i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-3 py-4 text-center text-sm text-muted-foreground">No payments recorded yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center justify-end gap-6 border-t bg-secondary/20 px-3 py-2 text-sm">
        <span>Net <strong className="tabular-nums">₹{effectiveNet.toFixed(2)}</strong></span>
        <span>Total Paid <strong className="tabular-nums">₹{totalPaid.toFixed(2)}</strong></span>
        <span className={cn(pending > 0 && "text-destructive")}>
          Pending <strong className="tabular-nums">₹{Math.max(0, pending).toFixed(2)}</strong>
        </span>
      </div>

      {overpaid > 0 && (
        <div className="flex items-center gap-2 border-t bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4" />
          Overpaid by ₹{overpaid.toFixed(2)} — only the amount actually kept by the lab should be recorded.
        </div>
      )}

      <PaymentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing?.row ?? null}
        onSubmit={async (row) => {
          await persist(row, editing ? editing.index : null);
          setEditorOpen(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

function PaymentEditorDialog({
  open, onOpenChange, initial, onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial: DraftRow | null;
  onSubmit: (row: DraftRow) => Promise<void>;
}) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<PaymentKind>("advance");
  const [mode, setMode] = useState<PaymentMode>("cash");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    // Dates are NEVER pre-filled — the user always picks the money-received date.
    setDate(initial?.date ?? "");
    setKind(initial?.kind ?? "advance");
    setMode(initial?.mode ?? "cash");
    setAmount(initial ? String(initial.amount) : "");
    setNotes(initial?.notes ?? "");
  }, [open, initial]);

  const dateError = date ? paymentDateError(date) : null;

  async function submit() {
    const err = paymentDateError(date);
    if (err) { toast.error(err); return; }
    if (num(amount) <= 0) { toast.error("Amount must be greater than 0."); return; }
    setBusy(true);
    try {
      await onSubmit({ id: initial?.id, date, kind, mode, amount: num(amount), notes: notes.trim() || null });
      toast.success(initial ? "Payment updated" : "Payment added");
    } catch (e: any) {
      toast.error(e.message || "Could not save the payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit Payment" : "Add Payment"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Payment Date">
            <Input
              type="date"
              min={LEDGER_START}
              value={date}
              onChange={e => setDate(e.target.value)}
              className={cn(dateError && "border-destructive")}
            />
            {dateError && <div className="text-xs text-destructive">{dateError}</div>}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">
              <Select value={kind} onValueChange={v => setKind(v as PaymentKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="balance">Balance</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Mode">
              <Select value={mode} onValueChange={v => setMode(v as PaymentMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Amount">
            <Input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" className="text-right" />
          </Field>
          <Field label="Notes">
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{initial ? "Save Changes" : "Add Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FlagToggle({
  icon, label, hint, checked, onChange, activeClass,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  activeClass: string;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors",
        checked ? activeClass : "bg-background text-muted-foreground",
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        <span className="text-sm">
          <span className="block font-medium leading-tight">{label}</span>
          <span className="block text-[11px] opacity-80">{hint}</span>
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Row({ label, children, emphasis }: { label: string; children: React.ReactNode; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={cn("text-sm", emphasis ? "font-semibold" : "text-muted-foreground")}>{label}</span>
      <div className="w-40 text-right">{children}</div>
    </div>
  );
}

function Money({ value }: { value: number }) {
  return <span className="tabular-nums">₹{value.toFixed(2)}</span>;
}

function KeyboardShortcuts({ onSave }: { onSave: () => void }) {
  useEffect(() => {
    function h(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        onSave();
      }
    }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onSave]);
  return null;
}
