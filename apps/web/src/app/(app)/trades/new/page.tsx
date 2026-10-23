import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getProfile } from "@/lib/data/trades";
import { createTrade } from "../actions";
import { TradeForm, emptyTrade } from "../trade-form";

export const metadata: Metadata = { title: "Add trade" };

export default function NewTradePage() {
  return (
    <>
      <PageHeader title="Add a trade" description="For anything the automatic sync does not cover. Synced trades appear on their own." />
      <Card>
        <Suspense fallback={<Skeleton className="h-96" />}>
          <NewTradeForm />
        </Suspense>
      </Card>
    </>
  );
}

async function NewTradeForm() {
  const { supabase, user } = await requireUser();
  const { timezone } = await getProfile(supabase, user.id);
  return <TradeForm action={createTrade} values={emptyTrade} submitLabel="Save trade" timeZone={timezone} />;
}
