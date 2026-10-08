import { mockFrequentObjections } from "@/mocks/sales";
import { createClient } from "@/lib/supabase/server";
import { FallaDeLaBase } from "@/lib/server/action-result";
import type {
  FrequentObjectionSummary,
  FrequentObjectionsResult,
  ObjectionCategory,
} from "@/types/sales";

const CATEGORIES: ObjectionCategory[] = ["closing", "setting", "marketing"];

type AggregatedCategory = {
  count: number;
  resolutionRate: number;
  examples: string[];
};

type StoredCallObjection = {
  text: string;
  category: string;
  handled: boolean;
};

type StoredConversationObjection = {
  text: string;
  category: string;
};

function isObjectionCategory(value: string): value is ObjectionCategory {
  return CATEGORIES.includes(value as ObjectionCategory);
}

function aggregateCallObjections(
  analyses: Array<{ objections: unknown }>
): Record<ObjectionCategory, AggregatedCategory> {
  const byCategory: Partial<
    Record<ObjectionCategory, { count: number; resolved: number; examples: string[] }>
  > = {};

  for (const analysis of analyses) {
    const objections = (analysis.objections as StoredCallObjection[] | null) ?? [];

    for (const obj of objections) {
      if (!isObjectionCategory(obj.category)) continue;

      if (!byCategory[obj.category]) {
        byCategory[obj.category] = { count: 0, resolved: 0, examples: [] };
      }

      const bucket = byCategory[obj.category]!;
      bucket.count += 1;
      if (obj.handled) bucket.resolved += 1;
      if (obj.text && bucket.examples.length < 5) {
        bucket.examples.push(obj.text);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(byCategory).map(([cat, data]) => [
      cat,
      {
        count: data.count,
        resolutionRate:
          data.count > 0 ? Math.round((data.resolved / data.count) * 100) : 0,
        examples: data.examples,
      },
    ])
  ) as Record<ObjectionCategory, AggregatedCategory>;
}

function buildSummariesFromAggregates(
  recentByCategory: Partial<Record<ObjectionCategory, AggregatedCategory>>,
  previousByCategory: Partial<Record<ObjectionCategory, AggregatedCategory>>
): FrequentObjectionSummary[] {
  const alertMessages: Record<ObjectionCategory, string> = {
    closing:
      "Las objeciones de precio/tiempo subieron {pct}% esta semana. Revisá el proceso de calificación de leads.",
    setting:
      "Las objeciones de setting subieron {pct}%. Revisá el proceso de agendamiento.",
    marketing:
      "Las objeciones de posicionamiento subieron {pct}%. El mercado puede no estar entendiendo tu propuesta de valor.",
  };

  const summaries: FrequentObjectionSummary[] = [];

  for (const category of CATEGORIES) {
    const current = recentByCategory[category];
    if (!current) continue;

    const prev = previousByCategory[category];
    let trend: FrequentObjectionSummary["trend"] = "stable";
    let trendPct = 0;

    if (prev && prev.count > 0) {
      trendPct = Math.round(((current.count - prev.count) / prev.count) * 100);
      if (trendPct > 15) trend = "up";
      else if (trendPct < -15) trend = "down";
    } else if (current.count > 0 && !prev) {
      trend = "up";
      trendPct = 100;
    }

    let alert: string | undefined;
    if (trend === "up" && trendPct >= 40) {
      alert = alertMessages[category].replace("{pct}", String(Math.abs(trendPct)));
    }

    summaries.push({
      category,
      count: current.count,
      resolutionRate: current.resolutionRate,
      topExamples: current.examples.slice(0, 3),
      trend,
      trendPct: Math.abs(trendPct),
      ...(alert ? { alert } : {}),
    });
  }

  return summaries;
}

export function mockFrequentObjectionSummaries(): FrequentObjectionSummary[] {
  const byCategory: Partial<
    Record<ObjectionCategory, { count: number; examples: string[] }>
  > = {};

  for (const objection of mockFrequentObjections) {
    if (!byCategory[objection.category]) {
      byCategory[objection.category] = { count: 0, examples: [] };
    }
    const bucket = byCategory[objection.category]!;
    bucket.count += objection.frequency;
    if (objection.text && bucket.examples.length < 5) {
      bucket.examples.push(objection.text);
    }
  }

  const summaries: FrequentObjectionSummary[] = [];

  for (const category of CATEGORIES) {
    const data = byCategory[category];
    if (!data) continue;

    summaries.push({
      category,
      count: data.count,
      resolutionRate: 0,
      topExamples: data.examples.slice(0, 3),
      trend: "stable",
      trendPct: 0,
    });
  }

  return summaries;
}

export async function getObjectionsFromConversations(
  organizationId: string
): Promise<FrequentObjectionSummary[]> {
  const supabase = await createClient();
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("ai_detected_objections, created_at")
    .eq("organization_id", organizationId)
    .not("ai_detected_objections", "eq", "[]")
    .gte("created_at", thirtyDaysAgo);

  if (!conversations?.length) return [];

  const allObjections = conversations.flatMap(
    (conversation) =>
      (conversation.ai_detected_objections as StoredConversationObjection[] | null) ??
      []
  );

  if (!allObjections.length) return [];

  const byCategory: Partial<
    Record<ObjectionCategory, { count: number; examples: string[] }>
  > = {};

  for (const obj of allObjections) {
    if (!isObjectionCategory(obj.category)) continue;

    if (!byCategory[obj.category]) {
      byCategory[obj.category] = { count: 0, examples: [] };
    }
    const bucket = byCategory[obj.category]!;
    bucket.count += 1;
    if (obj.text && bucket.examples.length < 5) {
      bucket.examples.push(obj.text);
    }
  }

  return Object.entries(byCategory).map(([category, data]) => ({
    category: category as ObjectionCategory,
    count: data.count,
    resolutionRate: 0,
    topExamples: data.examples.slice(0, 3),
    trend: "stable" as const,
    trendPct: 0,
  }));
}

export async function getFrequentObjections(
  organizationId: string
): Promise<FrequentObjectionsResult> {
  const supabase = await createClient();

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();
  const sixtyDaysAgo = new Date(
    Date.now() - 60 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: recentAnalyses, error } = await supabase
    .from("call_analyses")
    .select("objections, created_at")
    .eq("organization_id", organizationId)
    .gte("created_at", sixtyDaysAgo)
    .order("created_at", { ascending: false });

  // Quien llama la registra (`getFrequentObjectionsAction`, SCRUM-504).
  if (error) throw new FallaDeLaBase(error);

  if (recentAnalyses?.length) {
    const recent = recentAnalyses.filter((row) => row.created_at >= thirtyDaysAgo);
    const previous = recentAnalyses.filter((row) => row.created_at < thirtyDaysAgo);
    const summaries = buildSummariesFromAggregates(
      aggregateCallObjections(recent),
      aggregateCallObjections(previous)
    );

    if (summaries.length > 0) {
      return { objections: summaries, dataSource: "calls" };
    }
  }

  const conversationObjections = await getObjectionsFromConversations(organizationId);
  if (conversationObjections.length > 0) {
    return { objections: conversationObjections, dataSource: "conversations" };
  }

  return {
    objections: [],
    dataSource: "empty",
  };
}
