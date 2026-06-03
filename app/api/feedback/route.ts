import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.email) {
    return Response.json({ error: "Email required." }, { status: 400 });
  }

  const { email, feedback, items_searched, total_savings } = body as {
    email: string;
    feedback?: string | null;
    items_searched?: string[];
    total_savings?: number;
  };

  const { error } = await supabase.from("user_feedback").insert({
    email: email.trim(),
    feedback: feedback?.trim() || null,
    items_searched: items_searched ?? [],
    total_savings: total_savings ?? 0,
    source: "results_page",
  });

  if (error) {
    console.error("[feedback] Supabase error:", error);
    return Response.json({ error: "Failed to save feedback." }, { status: 500 });
  }

  return Response.json({ success: true });
}
