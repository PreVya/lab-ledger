import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BillView } from "@/components/bill-view";
import { useBill, useBillByPatient, useGenerateBill, useMarkBillPrinted } from "@/lib/queries";
import { downloadBillPdf } from "@/lib/bill-pdf";
import type { Bill } from "@/lib/types";
import { Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";

/** Dialog showing a printable bill + PDF download. */
export function BillDialog({
  billId,
  open,
  onOpenChange,
}: {
  billId?: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { data: bill, isLoading } = useBill(open ? billId : undefined);
  const markPrinted = useMarkBillPrinted();
  const [busy, setBusy] = useState(false);

  async function download(b: Bill) {
    setBusy(true);
    try {
      await downloadBillPdf(b);
      await markPrinted.mutateAsync(b.id);
      toast.success("Bill PDF downloaded — open it and press Ctrl+P to print.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not download bill");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90vh] max-h-[90vh] w-[90vw] max-w-[1100px] flex-col gap-3 overflow-hidden sm:max-w-[1100px]">
        <DialogHeader className="no-print">
          <DialogTitle>
            {bill ? `Bill No. ${bill.billNumber}` : "Bill"}
            {bill && bill.printCount > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                printed {bill.printCount}×
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading bill…</div>}
        {bill && (
          <>
            <div className="flex-1 overflow-auto rounded-md border">
              <div className="bill-preview-stage">
                <BillView bill={bill} />
              </div>
            </div>
            <div className="no-print flex justify-end gap-2">
              <Button variant="outline" onClick={() => window.print()} className="gap-2">
                <Printer className="h-4 w-4" /> Print
              </Button>
              <Button onClick={() => download(bill)} disabled={busy} className="gap-2">
                <Download className="h-4 w-4" /> {busy ? "Preparing…" : "Download PDF"}
              </Button>
            </div>
          </>
        )}

      </DialogContent>
    </Dialog>
  );
}

/**
 * Generate / View / Reprint buttons for a patient.
 * Bills are NEVER created automatically — only by clicking Generate Bill.
 */
export function BillActions({ patientId, compact }: { patientId: string; compact?: boolean }) {
  const { data: existing, isLoading } = useBillByPatient(patientId);
  const generate = useGenerateBill();
  const [openId, setOpenId] = useState<string | undefined>();

  async function onGenerate() {
    try {
      const b = await generate.mutateAsync(patientId);
      setOpenId(b.id);
      toast.success(`Bill No. ${b.billNumber} generated`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate bill");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {existing ? (
        <>
          {!compact && (
            <span className="text-xs text-muted-foreground">
              Bill No. <span className="font-mono font-medium text-foreground">{existing.billNumber}</span>
            </span>
          )}
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpenId(existing.id)}>
            <FileText className="h-3.5 w-3.5" /> {compact ? `Bill ${existing.billNumber}` : "View Bill"}
          </Button>
          {!compact && (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setOpenId(existing.id)}>
              <Printer className="h-3.5 w-3.5" /> Reprint Bill
            </Button>
          )}
        </>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={isLoading || generate.isPending}
          onClick={onGenerate}
        >
          <FileText className="h-3.5 w-3.5" /> {generate.isPending ? "Generating…" : "Generate Bill"}
        </Button>
      )}
      <BillDialog billId={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(undefined)} />
    </div>
  );
}
