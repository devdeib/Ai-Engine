/**
 * Phase 4.3 remote Supabase smoke test.
 * Not part of the default vitest suite (dummy env in src/tests/setup.ts).
 * Run: npx vitest run --config vitest.smoke.config.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterAll } from "vitest";

function loadLocalEnv() {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1);
    process.env[key] = value;
  }
  process.env.AI_PROVIDER = "mock";
  delete process.env.OPENAI_API_KEY;
}

loadLocalEnv();

const SMOKE_MARKER = "[phase43-smoke]";
const created = {
  leadIds: [] as string[],
  conversationIds: [] as string[],
  messageIds: [] as string[],
  jobIds: [] as string[],
  activityIds: [] as string[],
};

describe("Phase 4.3 remote smoke", () => {
  it(
    "enqueues, claims, executes, and completes against remote Supabase",
    async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { runWithSupabaseClientOverride } = await import(
      "@/lib/supabase/client-override"
    );
    const { createConversationMessage } = await import(
      "@/modules/conversations/actions"
    );
    const { enqueueAiExecutionJob } = await import("@/modules/ai/jobs/enqueue");
    const { processDueAiJobs } = await import("@/modules/ai/jobs/worker");
    const { processConversationMessage } = await import("@/modules/ai/service");

    const admin = createAdminClient();
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host;
    expect(host).toBe("xksqqpjrwadgkekfyusn.supabase.co");

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id")
      .is("deleted_at", null)
      .limit(1)
      .single();
    if (orgError || !org) {
      throw new Error(`No remote organization: ${orgError?.message}`);
    }

    const { data: member, error: memberError } = await admin
      .from("organization_members")
      .select("user_id")
      .eq("organization_id", org.id)
      .limit(1)
      .single();
    if (memberError || !member) {
      throw new Error(`No remote member: ${memberError?.message}`);
    }

    const organizationId = org.id;
    const userId = member.user_id;

    async function createOpenConversation(firstName: string) {
      const { data: lead, error: leadError } = await admin
        .from("leads")
        .insert({
          organization_id: organizationId,
          owner_id: userId,
          first_name: firstName,
          last_name: "Smoke",
          source: "other",
          status: "new",
          notes: SMOKE_MARKER,
        })
        .select("id")
        .single();
      if (leadError || !lead) {
        throw new Error(`Lead insert failed: ${leadError?.message}`);
      }
      created.leadIds.push(lead.id);

      const { data: conversation, error: conversationError } = await admin
        .from("conversations")
        .insert({
          organization_id: organizationId,
          lead_id: lead.id,
          channel: "in_app",
          status: "open",
          requires_human: false,
        })
        .select("id")
        .single();
      if (conversationError || !conversation) {
        throw new Error(`Conversation insert failed: ${conversationError?.message}`);
      }
      created.conversationIds.push(conversation.id);
      return { leadId: lead.id, conversationId: conversation.id };
    }

    const success = await createOpenConversation("Success");
    const failure = await createOpenConversation("Failure");
    const claimProbe = await createOpenConversation("Claim");
    const outboundOnly = await createOpenConversation("Outbound");

    const result = await runWithSupabaseClientOverride(admin, async () => {
      const inbound = await createConversationMessage(
        organizationId,
        userId,
        success.conversationId,
        { direction: "inbound", body: `${SMOKE_MARKER} interested in a listing` }
      );
      created.messageIds.push(inbound.id);

      const outbound = await createConversationMessage(
        organizationId,
        userId,
        outboundOnly.conversationId,
        {
          direction: "outbound",
          body: `${SMOKE_MARKER} human outbound should not enqueue`,
        }
      );
      created.messageIds.push(outbound.id);

      const { data: outboundJobs } = await admin
        .from("ai_execution_jobs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("conversation_id", outboundOnly.conversationId);

      const { data: jobsAfterInbound, error: jobsError } = await admin
        .from("ai_execution_jobs")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("inbound_message_id", inbound.id);
      if (jobsError) {
        throw new Error(`Job read failed: ${jobsError.message}`);
      }

      await enqueueAiExecutionJob({
        organizationId,
        userId,
        conversationId: success.conversationId,
        inboundMessageId: inbound.id,
      });
      const { data: jobsAfterDuplicate } = await admin
        .from("ai_execution_jobs")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("inbound_message_id", inbound.id);

      const claimed = await processDueAiJobs({
        organizationId,
        useAdminClient: true,
      });

      const { data: jobAfter } = await admin
        .from("ai_execution_jobs")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("inbound_message_id", inbound.id)
        .single();

      const { data: aiMessages } = await admin
        .from("messages")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("conversation_id", success.conversationId)
        .eq("author_type", "ai")
        .eq("in_reply_to_message_id", inbound.id);

      const { data: aiActivities } = await admin
        .from("lead_activities")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("lead_id", success.leadId)
        .eq("type", "ai");

      const secondDrain = await processDueAiJobs({
        organizationId,
        useAdminClient: true,
      });

      let manualDuplicate: string | null = null;
      try {
        await processConversationMessage(
          organizationId,
          success.conversationId,
          { kind: "operator", userId }
        );
      } catch (error) {
        manualDuplicate = error instanceof Error ? error.name : "unknown";
      }

      const failInbound = await createConversationMessage(
        organizationId,
        userId,
        failure.conversationId,
        { direction: "inbound", body: `${SMOKE_MARKER} provider should fail` }
      );
      created.messageIds.push(failInbound.id);

      const { data: failJobBefore } = await admin
        .from("ai_execution_jobs")
        .select("*")
        .eq("inbound_message_id", failInbound.id)
        .single();

      process.env.AI_PROVIDER = "openai";
      process.env.OPENAI_API_KEY = "sk-invalid-phase43-smoke";
      process.env.AI_TIMEOUT_MS = "4000";
      const failDrain = await processDueAiJobs({
        organizationId,
        useAdminClient: true,
      });
      process.env.AI_PROVIDER = "mock";
      delete process.env.OPENAI_API_KEY;

      const { data: failInboundAfter } = await admin
        .from("messages")
        .select("id,body,direction,author_type")
        .eq("id", failInbound.id)
        .single();
      const { data: failAiMessages } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", failure.conversationId)
        .eq("author_type", "ai");
      const { data: failAiActivities } = await admin
        .from("lead_activities")
        .select("id,content")
        .eq("lead_id", failure.leadId)
        .eq("type", "ai");
      const { data: failJobAfter } = await admin
        .from("ai_execution_jobs")
        .select("*")
        .eq("inbound_message_id", failInbound.id)
        .single();

      const claimInbound = await createConversationMessage(
        organizationId,
        userId,
        claimProbe.conversationId,
        { direction: "inbound", body: `${SMOKE_MARKER} claim probe` }
      );
      created.messageIds.push(claimInbound.id);

      const { data: claimedRows, error: claimError } = await admin.rpc(
        "claim_ai_execution_jobs",
        {
          p_limit: 1,
          p_organization_id: organizationId,
          p_lease_seconds: 90,
        }
      );

      process.env.AI_PROVIDER = "mock";
      delete process.env.OPENAI_API_KEY;
      const { data: claimedJob } = await admin
        .from("ai_execution_jobs")
        .select("*")
        .eq("inbound_message_id", claimInbound.id)
        .single();

      return {
        inbound,
        outbound,
        outboundJobs: outboundJobs ?? [],
        jobsAfterInbound: jobsAfterInbound ?? [],
        jobsAfterDuplicateCount: jobsAfterDuplicate?.length ?? 0,
        claimed,
        jobAfter,
        aiMessages: aiMessages ?? [],
        aiActivities: aiActivities ?? [],
        secondDrain,
        manualDuplicate,
        failInbound,
        failJobBefore,
        failDrain,
        failInboundAfter,
        failAiMessages: failAiMessages ?? [],
        failAiActivities: failAiActivities ?? [],
        failJobAfter,
        claimError: claimError?.message ?? null,
        claimedRows: (claimedRows ?? []) as Array<Record<string, unknown>>,
        claimedJob,
      };
    });

    for (const job of result.jobsAfterInbound) created.jobIds.push(job.id);
    if (result.failJobBefore?.id) created.jobIds.push(result.failJobBefore.id);
    if (result.claimedJob?.id) created.jobIds.push(result.claimedJob.id);
    for (const message of result.aiMessages) created.messageIds.push(message.id);
    for (const activity of result.aiActivities) created.activityIds.push(activity.id);

    const report = {
      remoteHost: host,
      organizationId,
      userId,
      successConversationId: success.conversationId,
      inboundMessageId: result.inbound.id,
      jobsAfterInbound: result.jobsAfterInbound.map((job) => ({
        id: job.id,
        organization_id: job.organization_id,
        conversation_id: job.conversation_id,
        inbound_message_id: job.inbound_message_id,
        status: job.status,
        attempt_count: job.attempt_count,
      })),
      jobsAfterDuplicateCount: result.jobsAfterDuplicateCount,
      workerClaimedCount: result.claimed,
      jobAfter: result.jobAfter
        ? {
            id: result.jobAfter.id,
            status: result.jobAfter.status,
            attempt_count: result.jobAfter.attempt_count,
            last_error_code: result.jobAfter.last_error_code,
            completed_at: result.jobAfter.completed_at,
            locked_at: result.jobAfter.locked_at,
          }
        : null,
      aiMessages: result.aiMessages.map((message) => ({
        id: message.id,
        author_type: message.author_type,
        author_user_id: message.author_user_id,
        direction: message.direction,
        in_reply_to_message_id: message.in_reply_to_message_id,
        bodyPreview: String(message.body).slice(0, 80),
      })),
      aiActivities: result.aiActivities.map((activity) => ({
        id: activity.id,
        type: activity.type,
        content: activity.content,
      })),
      secondDrain: result.secondDrain,
      manualDuplicate: result.manualDuplicate,
      outboundDidNotCreateExtraJob: result.outboundJobs.length === 0,
      fail: {
        inboundIntact: result.failInboundAfter,
        aiMessageCount: result.failAiMessages.length,
        aiActivityCount: result.failAiActivities.length,
        job: result.failJobAfter
          ? {
              status: result.failJobAfter.status,
              attempt_count: result.failJobAfter.attempt_count,
              last_error_code: result.failJobAfter.last_error_code,
            }
          : null,
        drainCount: result.failDrain,
      },
      claimProbe: {
        rpcError: result.claimError,
        claimedCount: Array.isArray(result.claimedRows)
          ? result.claimedRows.length
          : 0,
        claimedRow: result.claimedRows[0]
          ? {
              id: result.claimedRows[0].id,
              status: result.claimedRows[0].status,
              attempt_count: result.claimedRows[0].attempt_count,
              locked_at: result.claimedRows[0].locked_at,
              inbound_message_id: result.claimedRows[0].inbound_message_id,
            }
          : null,
        pendingProbeJob: result.claimedJob
          ? {
              status: result.claimedJob.status,
              attempt_count: result.claimedJob.attempt_count,
              inbound_message_id: result.claimedJob.inbound_message_id,
            }
          : null,
      },
    };
    console.log("PHASE_43_SMOKE_REPORT " + JSON.stringify(report, null, 2));

    expect(result.inbound.direction).toBe("inbound");
    expect(result.inbound.author_type).toBe("human");
    expect(result.jobsAfterInbound).toHaveLength(1);
    const queued = result.jobsAfterInbound[0];
    expect(queued?.organization_id).toBe(organizationId);
    expect(queued?.conversation_id).toBe(success.conversationId);
    expect(queued?.inbound_message_id).toBe(result.inbound.id);
    expect(queued?.status).toBe("pending");
    expect(result.jobsAfterDuplicateCount).toBe(1);
    expect(result.outboundJobs).toHaveLength(0);

    expect(result.jobAfter?.status).toBe("completed");
    expect(result.jobAfter?.attempt_count).toBeGreaterThanOrEqual(1);
    expect(result.jobAfter?.completed_at).toBeTruthy();
    expect(result.jobAfter?.locked_at).toBeNull();

    expect(result.aiMessages).toHaveLength(1);
    const aiMessage = result.aiMessages[0];
    expect(aiMessage?.author_type).toBe("ai");
    expect(aiMessage?.author_user_id).toBeNull();
    expect(aiMessage?.direction).toBe("outbound");
    expect(aiMessage?.in_reply_to_message_id).toBe(result.inbound.id);

    expect(result.aiActivities).toHaveLength(1);
    expect(result.aiActivities[0]?.type).toBe("ai");
    expect(result.aiActivities[0]?.content).toBe("AI response generated");

    expect(result.secondDrain).toBe(0);
    expect(result.failInboundAfter?.id).toBe(result.failInbound.id);
    expect(result.failInboundAfter?.body).toContain(SMOKE_MARKER);
    expect(result.failAiMessages).toHaveLength(0);
    expect(result.failAiActivities).toHaveLength(0);
    expect(result.failJobAfter?.last_error_code).toBe("AI_PROVIDER_ERROR");
    expect(["pending", "failed"]).toContain(result.failJobAfter?.status);

    expect(result.claimError).toBeNull();
    expect(result.claimedRows.length).toBeGreaterThanOrEqual(1);
    expect(result.claimedRows[0]?.status).toBe("processing");
    expect(result.claimedRows[0]?.attempt_count).toBeGreaterThanOrEqual(1);
    expect(result.claimedRows[0]?.locked_at).toBeTruthy();
    expect(result.claimedRows[0]?.organization_id).toBe(organizationId);
  },
  120_000
);

  afterAll(async () => {
    loadLocalEnv();
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: smokeLeads } = await admin
      .from("leads")
      .select("id")
      .eq("notes", SMOKE_MARKER);
    const leadIds = [
      ...new Set([...created.leadIds, ...(smokeLeads ?? []).map((row) => row.id)]),
    ];
    if (leadIds.length) {
      const { data: convos } = await admin
        .from("conversations")
        .select("id")
        .in("lead_id", leadIds);
      const conversationIds = [
        ...new Set([
          ...created.conversationIds,
          ...(convos ?? []).map((row) => row.id),
        ]),
      ];
      if (conversationIds.length) {
        await admin
          .from("ai_execution_jobs")
          .delete()
          .in("conversation_id", conversationIds);
        await admin.from("messages").delete().in("conversation_id", conversationIds);
        await admin.from("conversations").delete().in("id", conversationIds);
      }
      await admin.from("lead_activities").delete().in("lead_id", leadIds);
      await admin.from("leads").delete().in("id", leadIds);
    }
  }, 60_000);
});
