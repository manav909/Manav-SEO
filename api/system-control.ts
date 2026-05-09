/**
 * system-control.ts
 * 
 * Central API for:
 * 1. Logging every data change + computing what it makes stale
 * 2. Checking input fingerprints before any Claude call (save money)
 * 3. Recording API costs
 * 4. Returning full system state for the Control Centre
 */
import { createClient } from "@supabase/supabase-js";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = { maxDuration: 30 };

const STALENESS_MAP: Record<string, string[]> = {
  data_room:  ["strategy", "pipeline", "execution_all", "agenda_all"],
  metrics:    ["strategy", "pipeline", "kpi_forecast"],
  audit:      ["strategy", "pipeline"],
  document:   ["strategy", "execution_all"],
  canvas:     ["pipeline", "agenda_all"],
};

const COST_PER_1K = { input: 0.003, output: 0.015 }; // Sonnet 4 pricing per 1k tokens

function fingerprint(input: any): string {
  const str = JSON.stringify(input, Object.keys(input).sort()).slice(0, 3000);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString(16);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
  const { action, projectId, payload } = req.body;

  /* ─── LOG CHANGE ─── */
  if (action === "log_change") {
    const { changeType, fieldPath, oldValue, newValue, sourceDate, sourceName } = payload;
    const affects = STALENESS_MAP[changeType] || [];

    const { data: logRow } = await sb.from("system_change_log").insert({
      project_id:  projectId,
      change_type: changeType,
      field_path:  fieldPath,
      old_value:   oldValue ? String(oldValue).slice(0, 500) : null,
      new_value:   newValue ? String(newValue).slice(0, 500) : null,
      source_date: sourceDate || null,
      source_name: sourceName || null,
      affects,
    }).select().single();

    // Mark affected sections stale
    for (const section of affects) {
      const sections = section === "agenda_all"
        ? ["agenda_1","agenda_2","agenda_3","agenda_4","agenda_5"]
        : section === "execution_all" ? [] // execution sections are per-block, skip here
        : [section];
      
      for (const s of sections) {
        await sb.from("staleness_registry").upsert({
          project_id:    projectId,
          section:       s,
          stale:         true,
          stale_reason:  `${sourceName || changeType} updated${sourceDate ? ` (data from ${sourceDate})` : ""}`,
          stale_since:   new Date().toISOString(),
          change_log_id: logRow?.id || null,
          updated_at:    new Date().toISOString(),
        }, { onConflict: "project_id,section" });
      }
    }

    return res.status(200).json({ success: true, affects });
  }

  /* ─── CHECK FINGERPRINT (before any Claude call) ─── */
  if (action === "check_fingerprint") {
    const { contentType, inputData } = payload;
    const fp = fingerprint(inputData);

    const { data } = await sb.from("ai_content_cache")
      .select("content,input_fingerprint,estimated_tokens,updated_at,status")
      .eq("project_id", projectId)
      .eq("content_type", contentType)
      .single();

    if (data?.input_fingerprint === fp && data?.status === "complete" && data?.content) {
      return res.status(200).json({
        success:    true,
        cached:     true,
        content:    data.content,
        cachedAt:   data.updated_at,
        tokens:     data.estimated_tokens || 0,
        message:    `Served from cache — inputs unchanged since ${new Date(data.updated_at).toLocaleDateString()}. No Claude call made.`,
      });
    }

    const est = Math.round(JSON.stringify(inputData).length / 3.5);
    return res.status(200).json({
      success:          true,
      cached:           false,
      fingerprint:      fp,
      estimatedTokens:  est,
      estimatedCost:    `~$${((est / 1000) * COST_PER_1K.input + (2000 / 1000) * COST_PER_1K.output).toFixed(4)}`,
    });
  }

  /* ─── SAVE WITH FINGERPRINT ─── */
  if (action === "save_with_fingerprint") {
    const { contentType, content, inputData, inputTokens = 0, outputTokens = 0 } = payload;
    const fp = fingerprint(inputData);

    await sb.from("ai_content_cache").upsert({
      project_id:          projectId,
      content_type:        contentType,
      content,
      status:              "complete",
      input_fingerprint:   fp,
      estimated_tokens:    inputTokens + outputTokens,
      updated_at:          new Date().toISOString(),
    }, { onConflict: "project_id,content_type" });

    // Log cost
    await sb.from("api_cost_log").insert({
      project_id:    projectId,
      api_endpoint:  contentType,
      input_tokens:  inputTokens,
      output_tokens: outputTokens,
      cached:        false,
    });

    // Mark section as fresh
    await sb.from("staleness_registry").upsert({
      project_id:  projectId,
      section:     contentType,
      stale:       false,
      stale_reason:null,
      updated_at:  new Date().toISOString(),
    }, { onConflict: "project_id,section" });

    return res.status(200).json({ success: true });
  }

  /* ─── GET SYSTEM STATE (Control Centre) ─── */
  if (action === "get_state") {
    const [cacheR, staleR, costR, changeR, projR] = await Promise.all([
      sb.from("ai_content_cache").select("content_type,status,updated_at,estimated_tokens,input_fingerprint").eq("project_id", projectId),
      sb.from("staleness_registry").select("*").eq("project_id", projectId),
      sb.from("api_cost_log").select("api_endpoint,input_tokens,output_tokens,cached,created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
      sb.from("system_change_log").select("*").eq("project_id", projectId).order("created_at", { ascending: false }).limit(20),
      sb.from("projects").select("playground_strategy,playground_generated_at,name,url").eq("id", projectId).single(),
    ]);

    const staleMap: Record<string,any> = {};
    for (const r of (staleR.data || [])) staleMap[r.section] = r;

    const cacheMap: Record<string,any> = {};
    for (const r of (cacheR.data || [])) cacheMap[r.content_type] = r;

    const totalCost = (costR.data || []).reduce((s,r) =>
      s + (r.input_tokens/1000)*COST_PER_1K.input + (r.output_tokens/1000)*COST_PER_1K.output, 0);
    const savedCost = (costR.data || []).filter(r=>r.cached).reduce((s,r) =>
      s + (r.input_tokens/1000)*COST_PER_1K.input + (r.output_tokens/1000)*COST_PER_1K.output, 0);

    const sections = ["strategy","pipeline","agenda_1","agenda_2","agenda_3","agenda_4","agenda_5"];
    const sectionStatus = sections.map(s => ({
      section:   s,
      hasCache:  !!cacheMap[s]?.content,
      stale:     staleMap[s]?.stale || false,
      staleReason: staleMap[s]?.stale_reason || null,
      lastUpdated: cacheMap[s]?.updated_at || null,
      tokens:    cacheMap[s]?.estimated_tokens || 0,
    }));

    return res.status(200).json({
      success: true,
      project: { name: projR.data?.name, url: projR.data?.url, strategyDate: projR.data?.playground_generated_at },
      sectionStatus,
      staleCount:  sectionStatus.filter(s=>s.stale).length,
      freshCount:  sectionStatus.filter(s=>s.hasCache&&!s.stale).length,
      costs: {
        total:     parseFloat(totalCost.toFixed(4)),
        saved:     parseFloat(savedCost.toFixed(4)),
        callCount: (costR.data||[]).length,
        cachedCount:(costR.data||[]).filter(r=>r.cached).length,
      },
      recentChanges: (changeR.data||[]).slice(0,10),
    });
  }

  return res.status(400).json({ error: `Unknown action: ${action}` });
}
