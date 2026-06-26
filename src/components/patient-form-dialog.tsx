import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTests, useCreatePatient, useUpdatePatient } from "@/lib/queries";
import type { AgeUnit, Patient, Sex, UpsertPatientInput } from "@/lib/types";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const num = (v: string) => (v === "" ? 0 : Number(v) || 0);

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patient?: Patient | null;
}

export function PatientFormDialog({ open, onOpenChange, patient }: Props) {
  const { data: tests = [] } = useTests();
  const create = useCreatePatient();
  const update = useUpdatePatient(patient?.id ?? "");

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [ageValue, setAgeValue] = useState("");
  const [ageUnit, setAgeUnit] = useState<AgeUnit>("years");
  const [sex, setSex] = useState<Sex>("M");
  const [referredDoctor, setReferredDoctor] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [testFilter, setTestFilter] = useState("");

  const [discount, setDiscount] = useState("");
  const [advanceCash, setAdvanceCash] = useState("");
  const [advanceUpi, setAdvanceUpi] = useState("");
  const [advancePaidOn, setAdvancePaidOn] = useState("");
  const [balanceCash, setBalanceCash] = useState("");
  const [balanceUpi, setBalanceUpi] = useState("");
  const [balancePaidOn, setBalancePaidOn] = useState("");

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (patient) {
      setName(patient.name); setMobile(patient.mobile);
      setAgeValue(String(patient.ageValue ?? patient.age ?? ""));
      setAgeUnit((patient.ageUnit ?? "years") as AgeUnit);
      setSex(patient.sex); setReferredDoctor(patient.referredDoctor ?? "");
      setNotes(patient.notes ?? "");
      setSelectedTests(patient.tests.map(t => t.testId));
      setDiscount(patient.discount); setAdvanceCash(patient.advanceCash); setAdvanceUpi(patient.advanceUpi);
      setAdvancePaidOn(patient.advancePaidOn?.slice(0, 10) ?? "");
      setBalanceCash(patient.balanceCash); setBalanceUpi(patient.balanceUpi);
      setBalancePaidOn(patient.balancePaidOn?.slice(0, 10) ?? "");
    } else {
      setName(""); setMobile(""); setAgeValue(""); setAgeUnit("years");
      setSex("M"); setReferredDoctor(""); setNotes("");
      setSelectedTests([]); setDiscount(""); setAdvanceCash(""); setAdvanceUpi("");
      setAdvancePaidOn(""); setBalanceCash(""); setBalanceUpi(""); setBalancePaidOn("");
    }
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [open, patient]);

  const total = useMemo(
    () => selectedTests.reduce((s, id) => s + Number(tests.find(t => t.id === id)?.rate ?? 0), 0),
    [selectedTests, tests],
  );
  const net = Math.max(0, total - num(discount));
  const advanceTotal = num(advanceCash) + num(advanceUpi);
  const balanceCollected = num(balanceCash) + num(balanceUpi);
  const balance = net - advanceTotal - balanceCollected;

  const filteredTests = useMemo(() => {
    const q = testFilter.toLowerCase();
    return tests.filter(t => t.active && (!q || t.name.toLowerCase().includes(q) || (t.outsourcedLab ?? "").toLowerCase().includes(q)));
  }, [tests, testFilter]);

  function toggleTest(id: string) {
    setSelectedTests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim() || !mobile.trim() || !ageValue || !selectedTests.length) {
      toast.error("Name, mobile, age, and at least one test are required");
      return;
    }
    const input: UpsertPatientInput = {
      name: name.trim(), mobile: mobile.trim(),
      ageValue: Number(ageValue), ageUnit,
      sex,
      referredDoctor: referredDoctor.trim() || undefined,
      notes: notes.trim() || undefined,
      testIds: selectedTests,
      discount: num(discount),
      advanceCash: num(advanceCash), advanceUpi: num(advanceUpi),
      advancePaidOn: advancePaidOn || null,
      balanceCash: num(balanceCash), balanceUpi: num(balanceUpi),
      balancePaidOn: balancePaidOn || null,
    };
    try {
      if (patient) await update.mutateAsync(input);
      else await create.mutateAsync(input);
      toast.success(patient ? "Patient updated" : "Patient saved");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{patient ? `Edit Patient #${patient.registerNumber ?? patient.dailySerial}${patient.financialYear ? ` · FY ${patient.financialYear}` : ""}` : "New Patient Entry"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7 space-y-4">
            <div className="grid grid-cols-6 gap-3">
              <Field label="Name" className="col-span-3">
                <Input ref={nameRef} value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <Field label="Mobile" className="col-span-3">
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
            <div className="text-sm font-semibold">Payment</div>
            <Row label="Total"><Money value={total} /></Row>
            <Row label="Discount">
              <Input value={discount} onChange={e => setDiscount(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Net" emphasis><Money value={net} /></Row>
            <div className="my-2 border-t" />
            <Row label="Advance Cash">
              <Input value={advanceCash} onChange={e => setAdvanceCash(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Advance UPI">
              <Input value={advanceUpi} onChange={e => setAdvanceUpi(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Advance Paid On">
              <Input type="date" value={advancePaidOn} onChange={e => setAdvancePaidOn(e.target.value)} className="h-8" />
            </Row>
            <div className="my-2 border-t" />
            <Row label="Balance" emphasis>
              <span className={cn("tabular-nums", balance > 0 ? "text-destructive" : "text-foreground")}>
                ₹{balance.toFixed(2)}
              </span>
            </Row>
            <Row label="Balance Cash">
              <Input value={balanceCash} onChange={e => setBalanceCash(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Balance UPI">
              <Input value={balanceUpi} onChange={e => setBalanceUpi(e.target.value)} className="h-8 text-right" inputMode="decimal" />
            </Row>
            <Row label="Balance Paid On">
              <Input type="date" value={balancePaidOn} onChange={e => setBalancePaidOn(e.target.value)} className="h-8" />
            </Row>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}><X className="mr-1 h-4 w-4" />Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending || update.isPending}>
            {patient ? "Update" : "Save"} (Ctrl+S)
          </Button>
        </DialogFooter>

        <KeyboardShortcuts onSave={handleSave} />
      </DialogContent>
    </Dialog>
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
