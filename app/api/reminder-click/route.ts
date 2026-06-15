import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST() {
  const { error } = await supabase
    .from("reminder_clicks")
    .insert({ action: "text_reminder_click" });

  if (error) {
    console.error("[reminder-click]", error.message);
    return Response.json({ error: "Failed to log click." }, { status: 500 });
  }

  return Response.json({ ok: true });
}
