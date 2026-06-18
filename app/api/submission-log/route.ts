import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  const { mode } = await request.json() as { mode?: string };

  const { error } = await supabase
    .from("submission_logs")
    .insert({ mode });

  if (error) {
    console.error("[submission-log]", error.message);
    return Response.json({ error: "Failed to log submission." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
