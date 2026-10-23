import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui";
import { ImportWizard } from "./import-wizard";

export const metadata: Metadata = { title: "Import" };

export default function ImportPage() {
  return (
    <>
      <PageHeader
        title="Import trades"
        description="For history from before the cTrader connection, other platforms (MT4/MT5), or prop-firm accounts. Duplicates are skipped."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <ImportWizard />
        </Card>
        <Card title="Where to get a file">
          <ul className="space-y-3 text-sm text-ink-2">
            <li>
              <strong className="text-ink">This journal:</strong> the Export CSV on the Trades page imports back as-is.
            </li>
            <li>
              <strong className="text-ink">MetaTrader 4/5:</strong> Account History → right-click → Report, then save as CSV from a spreadsheet.
            </li>
            <li>
              <strong className="text-ink">Any spreadsheet:</strong> one row per trade with symbol, direction, lots, open time and entry price at minimum.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
