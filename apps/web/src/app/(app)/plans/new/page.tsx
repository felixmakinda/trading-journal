import type { Metadata } from "next";
import { findModel } from "@tj/core";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listModels } from "@/lib/data/playbook";
import { distinctValues, getProfile, listTrades } from "@/lib/data/trades";
import { PlanForm } from "../plan-form";

export const metadata: Metadata = { title: "Plan a trade" };

export default function NewPlanPage() {
  return (
    <>
      <PageHeader title="Plan a trade" description="Write it down before you click. When the trade syncs, link it to this plan from the trade page." />
      <Card>
        <Suspense fallback={<Skeleton className="h-96" />}>
          <Form />
        </Suspense>
      </Card>
    </>
  );
}

async function Form() {
  const { supabase, user } = await requireUser();
  const [{ rules }, trades, models] = await Promise.all([getProfile(supabase, user.id), listTrades(supabase), listModels(supabase)]);
  const active = models.filter((m) => !m.archived);
  const setups = distinctValues(trades).setups.filter((s) => !findModel(s, active));
  return <PlanForm checklist={rules.checklist} models={active} setups={setups} />;
}
