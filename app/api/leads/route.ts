import { env } from "cloudflare:workers";
import { handleLead } from "@/lib/leads.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return handleLead(request, env);
}
