/**
 * Isolated Horizon Realty Dubai demo records for the product video.
 * Do not persist. Remove after the demo is recorded.
 */
import type {
  Appointment,
  AppointmentWithLead,
  ChannelAccount,
  ConversationLeadSummary,
  ConversationWithLead,
  Lead,
  LeadActivity,
  LeadFollowUp,
  LeadFollowUpWithLead,
  LeadSource,
  LeadStatus,
  MessageWithDeliveryStatus,
} from "@/lib/db/types";
import type { AiToolActionPublic } from "@/modules/ai/actions/schema";
import type {
  ActionCenterRecommendationItem,
  AiActionCenter,
} from "@/modules/ai/action-center/types";
import type { PublicAiSalesAnalysis } from "@/modules/ai/analysis/map";
import type { PublicAiSalesRecommendation } from "@/modules/ai/recommendation/map";
import type { OrganizationSalesProfilePublic } from "@/modules/organizations/sales-profile-schema";

const ORG = "b7e4d210-8c91-4a6f-9d22-horizon000001";
const OWNER = "c1a9f803-2d44-4b71-8e15-lina00000001";
const AGENT = "d2b0e914-3e55-4c82-9f26-yousef000002";

export const DEMO_WORKSPACE = {
  organizationName: "Horizon Realty Dubai",
  slug: "horizon-realty-dubai",
  ownerName: "Lina Al-Farsi",
  ownerRole: "owner" as const,
  agentName: "Yousef Mansour",
};

export const DEMO_MEMBERS: Array<{ user_id: string; display_name: string }> = [
  { user_id: OWNER, display_name: DEMO_WORKSPACE.ownerName },
  { user_id: AGENT, display_name: DEMO_WORKSPACE.agentName },
];

export const DEMO_SALES_PROFILE: OrganizationSalesProfilePublic = {
  offering_summary:
    "Horizon Realty Dubai sells and leases residential property across Marina, Downtown, Dubai Hills, Palm Jumeirah, JVC, and Arabian Ranches. Inventory includes apartments, villas, townhouses, and off-plan units from Emaar, Nakheel, and Damac.",
  service_area:
    "Dubai Marina, JBR, Downtown Dubai, Business Bay, Dubai Hills Estate, Arabian Ranches, Palm Jumeirah, JVC, JLT, Creek Harbour.",
  qualification_criteria:
    "Budget, preferred community, move-in timeline, and whether the buyer is cash or mortgage. A lead is qualified when budget, location, and timeline are confirmed and a viewing can be booked.",
  constraints:
    "Do not discuss off-plan payment plans below 20% down without a human agent. Never quote a price that is not on the listing sheet. Escalate mortgage pre-approval questions to Yousef.",
  typical_next_step:
    "Book a private viewing, send the floor plan and payment schedule, then confirm a follow-up after the visit.",
};

function at(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

function todayAt(hour: number, minute = 0): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const IDS = {
  leads: {
    ahmed: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e501",
    sarah: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e502",
    omar: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e503",
    maya: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e504",
    khaled: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e505",
    fatima: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e506",
    james: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e507",
    priya: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e508",
    hassan: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e509",
    elena: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e510",
    mohammed: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e511",
    nadine: "7f2c1a90-4b11-4e8a-9c3d-a1b2c3d4e512",
  },
  convos: {
    ahmed: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f601",
    sarah: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f602",
    omar: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f603",
    maya: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f604",
    fatima: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f605",
    james: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f606",
    hassan: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f607",
    nadine: "8a3d2b01-5c22-4f9b-ad4e-b2c3d4e5f608",
  },
  accounts: {
    whatsapp: "9b4e3c12-6d33-409c-be5f-c3d4e5f60701",
    email: "9b4e3c12-6d33-409c-be5f-c3d4e5f60702",
    telegram: "9b4e3c12-6d33-409c-be5f-c3d4e5f60703",
    sms: "9b4e3c12-6d33-409c-be5f-c3d4e5f60704",
  },
  identities: {
    ahmed: "aa5f4d23-7e44-41ad-cf60-d4e5f6071801",
    sarah: "aa5f4d23-7e44-41ad-cf60-d4e5f6071802",
    omar: "aa5f4d23-7e44-41ad-cf60-d4e5f6071803",
    maya: "aa5f4d23-7e44-41ad-cf60-d4e5f6071804",
    unmatched1: "aa5f4d23-7e44-41ad-cf60-d4e5f6071891",
    unmatched2: "aa5f4d23-7e44-41ad-cf60-d4e5f6071892",
    unmatched3: "aa5f4d23-7e44-41ad-cf60-d4e5f6071893",
  },
};

function leadSummary(
  id: string,
  first: string,
  last: string,
  company: string | null = null
): ConversationLeadSummary {
  return { id, first_name: first, last_name: last, company_name: company };
}

function lead(input: {
  id: string;
  first: string;
  last: string;
  email: string;
  phone: string;
  company?: string | null;
  source: LeadSource;
  status: LeadStatus;
  score: number;
  notes: string;
  facts: Record<string, string>;
  owner?: string | null;
  hoursAgo: number;
}): Lead {
  const created = at(-input.hoursAgo);
  const updated = at(-Math.max(0.2, input.hoursAgo * 0.08));
  return {
    id: input.id,
    organization_id: ORG,
    owner_id: input.owner === undefined ? OWNER : input.owner,
    first_name: input.first,
    last_name: input.last,
    email: input.email,
    phone: input.phone,
    company_name: input.company ?? null,
    source: input.source,
    status: input.status,
    score: input.score,
    notes: input.notes,
    qualification_facts: input.facts,
    qualification_updated_at: updated,
    created_at: created,
    updated_at: updated,
  };
}

export const DEMO_LEADS: Lead[] = [
  lead({
    id: IDS.leads.ahmed,
    first: "Ahmed",
    last: "Khalil",
    email: "ahmed.khalil@outlook.com",
    phone: "+971501124880",
    source: "portal",
    status: "qualified",
    score: 92,
    hoursAgo: 18,
    notes:
      "Cash buyer relocating from Abu Dhabi. Wants a furnished 2BR with marina view, high floor, ready in Q4.",
    facts: {
      budget: "AED 1,500,000",
      timeline: "3 months",
      location: "Dubai Marina",
      property_type: "2BR Apartment",
      financing: "Cash",
      decision_maker: "Ahmed (self)",
    },
  }),
  lead({
    id: IDS.leads.sarah,
    first: "Sarah",
    last: "Hassan",
    email: "sarah.hassan@gmail.com",
    phone: "+971555019332",
    source: "website",
    status: "contacted",
    score: 78,
    hoursAgo: 36,
    owner: AGENT,
    notes:
      "Family of four comparing Dubai Hills villas. Husband travels; Saturday morning is the only viewing window.",
    facts: {
      budget: "AED 3,200,000",
      location: "Dubai Hills",
      property_type: "Villa",
      financing: "Mortgage",
    },
  }),
  lead({
    id: IDS.leads.omar,
    first: "Omar",
    last: "Saleh",
    email: "omar.saleh@proton.me",
    phone: "+971528441190",
    source: "social_media",
    status: "contacted",
    score: 64,
    hoursAgo: 48,
    owner: AGENT,
    notes: "First-time buyer. Asking service charges and DLD fees on a JVC 1BR.",
    facts: {
      budget: "AED 900,000",
      location: "JVC",
      property_type: "1BR Apartment",
    },
  }),
  lead({
    id: IDS.leads.maya,
    first: "Maya",
    last: "Ibrahim",
    email: "maya.ibrahim@emaar.ae",
    phone: "+971504778221",
    company: "Emaar Hospitality",
    source: "referral",
    status: "qualified",
    score: 88,
    hoursAgo: 72,
    notes: "Wants a 3BR in Downtown for own use plus occasional Airbnb. Floor plan for Tower 2 requested.",
    facts: {
      budget: "AED 2,100,000",
      timeline: "4 months",
      location: "Downtown Dubai",
      property_type: "3BR Apartment",
      financing: "Cash",
      decision_maker: "Maya and her husband",
    },
  }),
  lead({
    id: IDS.leads.khaled,
    first: "Khaled",
    last: "Nasser",
    email: "khaled.nasser@gmail.com",
    phone: "+971567002118",
    source: "portal",
    status: "new",
    score: 41,
    hoursAgo: 8,
    notes: "Inbound from Property Finder. Townhouse enquiry, no budget confirmed yet.",
    facts: {
      location: "Arabian Ranches",
      property_type: "Townhouse",
    },
  }),
  lead({
    id: IDS.leads.fatima,
    first: "Fatima",
    last: "Al-Mazrouei",
    email: "fatima.almazrouei@gmail.com",
    phone: "+971502889441",
    source: "referral",
    status: "qualified",
    score: 95,
    hoursAgo: 96,
    notes: "UHNW client. Palm penthouse, sea view, full floor if available. Prefers WhatsApp only.",
    facts: {
      budget: "AED 18,000,000",
      timeline: "Immediate",
      location: "Palm Jumeirah",
      property_type: "Penthouse",
      financing: "Cash",
      decision_maker: "Fatima",
    },
  }),
  lead({
    id: IDS.leads.james,
    first: "James",
    last: "Whitfield",
    email: "james.whitfield@barclays.com",
    phone: "+971545667210",
    company: "Barclays",
    source: "website",
    status: "contacted",
    score: 71,
    hoursAgo: 30,
    owner: AGENT,
    notes: "UK expat on a 3-year assignment. Business Bay 2BR, walking distance to DIFC.",
    facts: {
      budget: "AED 1,800,000",
      location: "Business Bay",
      property_type: "2BR Apartment",
      financing: "Mortgage",
    },
  }),
  lead({
    id: IDS.leads.priya,
    first: "Priya",
    last: "Sharma",
    email: "priya.sharma@outlook.com",
    phone: "+971529004773",
    source: "social_media",
    status: "new",
    score: 38,
    hoursAgo: 5,
    notes: "Instagram lead. Studio or compact 1BR in JLT. Night-shift nurse, replies late.",
    facts: {
      location: "JLT",
      property_type: "Studio",
    },
  }),
  lead({
    id: IDS.leads.hassan,
    first: "Hassan",
    last: "Qureshi",
    email: "hassan.qureshi@damac.ae",
    phone: "+971501993228",
    source: "portal",
    status: "qualified",
    score: 84,
    hoursAgo: 120,
    notes: "Upgrading from an apartment. 4BR villa Damac Hills with maid's room and garage for two cars.",
    facts: {
      budget: "AED 4,400,000",
      timeline: "5 months",
      location: "Damac Hills",
      property_type: "4BR Villa",
      financing: "Mortgage",
      decision_maker: "Hassan and family",
    },
  }),
  lead({
    id: IDS.leads.elena,
    first: "Elena",
    last: "Rossi",
    email: "elena.rossi@icloud.com",
    phone: "+971558210094",
    source: "email_campaign",
    status: "contacted",
    score: 59,
    hoursAgo: 54,
    owner: AGENT,
    notes: "Comparing Opera District vs Boulevard Point. Wants furnished, short-term rental allowed.",
    facts: {
      budget: "AED 2,400,000",
      location: "Downtown Dubai",
      property_type: "2BR Apartment",
    },
  }),
  lead({
    id: IDS.leads.mohammed,
    first: "Mohammed",
    last: "Al-Suwaidi",
    email: "m.alsuwaidi@etisalat.ae",
    phone: "+971506441882",
    source: "other",
    status: "new",
    score: 33,
    hoursAgo: 3,
    notes: "Land enquiry near Expo City. Not yet confirmed if residential or investment plot.",
    facts: {
      location: "Dubai South",
    },
  }),
  lead({
    id: IDS.leads.nadine,
    first: "Nadine",
    last: "Khoury",
    email: "nadine.khoury@gmail.com",
    phone: "+971521147760",
    source: "website",
    status: "contacted",
    score: 67,
    hoursAgo: 22,
    notes: "Creek Harbour 3BR, school run to Dubai College. Wants community feel and water views.",
    facts: {
      budget: "AED 2,750,000",
      timeline: "4 months",
      location: "Creek Harbour",
      property_type: "3BR Apartment",
      financing: "Cash",
    },
  }),
];

function conversation(input: {
  id: string;
  leadId: string;
  channel: ConversationWithLead["channel"];
  identityId: string | null;
  accountId: string | null;
  hoursAgo: number;
  requiresHuman?: boolean;
  lead: ConversationLeadSummary;
}): ConversationWithLead {
  const updated = at(-input.hoursAgo);
  return {
    id: input.id,
    organization_id: ORG,
    lead_id: input.leadId,
    channel: input.channel,
    status: "open",
    requires_human: input.requiresHuman ?? false,
    ai_paused_at: input.requiresHuman ? at(-2) : null,
    channel_account_id: input.accountId,
    channel_identity_id: input.identityId,
    created_at: at(-(input.hoursAgo + 20)),
    updated_at: updated,
    lead: input.lead,
  };
}

export const DEMO_CONVERSATIONS: ConversationWithLead[] = [
  conversation({
    id: IDS.convos.ahmed,
    leadId: IDS.leads.ahmed,
    channel: "whatsapp",
    identityId: IDS.identities.ahmed,
    accountId: IDS.accounts.whatsapp,
    hoursAgo: 0.2,
    requiresHuman: true,
    lead: leadSummary(IDS.leads.ahmed, "Ahmed", "Khalil"),
  }),
  conversation({
    id: IDS.convos.sarah,
    leadId: IDS.leads.sarah,
    channel: "whatsapp",
    identityId: IDS.identities.sarah,
    accountId: IDS.accounts.whatsapp,
    hoursAgo: 0.6,
    lead: leadSummary(IDS.leads.sarah, "Sarah", "Hassan"),
  }),
  conversation({
    id: IDS.convos.omar,
    leadId: IDS.leads.omar,
    channel: "telegram",
    identityId: IDS.identities.omar,
    accountId: IDS.accounts.telegram,
    hoursAgo: 1.1,
    lead: leadSummary(IDS.leads.omar, "Omar", "Saleh"),
  }),
  conversation({
    id: IDS.convos.maya,
    leadId: IDS.leads.maya,
    channel: "email",
    identityId: IDS.identities.maya,
    accountId: IDS.accounts.email,
    hoursAgo: 2,
    lead: leadSummary(IDS.leads.maya, "Maya", "Ibrahim", "Emaar Hospitality"),
  }),
  conversation({
    id: IDS.convos.fatima,
    leadId: IDS.leads.fatima,
    channel: "whatsapp",
    identityId: null,
    accountId: IDS.accounts.whatsapp,
    hoursAgo: 4,
    lead: leadSummary(IDS.leads.fatima, "Fatima", "Al-Mazrouei"),
  }),
  conversation({
    id: IDS.convos.james,
    leadId: IDS.leads.james,
    channel: "email",
    identityId: null,
    accountId: IDS.accounts.email,
    hoursAgo: 6,
    lead: leadSummary(IDS.leads.james, "James", "Whitfield", "Barclays"),
  }),
  conversation({
    id: IDS.convos.hassan,
    leadId: IDS.leads.hassan,
    channel: "whatsapp",
    identityId: null,
    accountId: IDS.accounts.whatsapp,
    hoursAgo: 9,
    lead: leadSummary(IDS.leads.hassan, "Hassan", "Qureshi"),
  }),
  conversation({
    id: IDS.convos.nadine,
    leadId: IDS.leads.nadine,
    channel: "sms",
    identityId: null,
    accountId: IDS.accounts.sms,
    hoursAgo: 14,
    lead: leadSummary(IDS.leads.nadine, "Nadine", "Khoury"),
  }),
];

function message(input: {
  id: string;
  conversationId: string;
  author: MessageWithDeliveryStatus["author_type"];
  direction: MessageWithDeliveryStatus["direction"];
  body: string;
  hoursAgo: number;
  identityId?: string | null;
}): MessageWithDeliveryStatus {
  return {
    id: input.id,
    organization_id: ORG,
    conversation_id: input.conversationId,
    author_user_id: input.author === "human" ? OWNER : null,
    author_type: input.author,
    direction: input.direction,
    body: input.body,
    in_reply_to_message_id: null,
    channel_identity_id: input.identityId ?? null,
    created_at: at(-input.hoursAgo),
    delivery_status:
      input.direction === "outbound"
        ? input.author === "ai" || input.author === "human"
          ? "sent"
          : "not_applicable"
        : null,
  };
}

export const DEMO_MESSAGES: Record<string, MessageWithDeliveryStatus[]> = {
  [IDS.convos.ahmed]: [
    message({
      id: "msg-ahmed-1",
      conversationId: IDS.convos.ahmed,
      author: "customer",
      direction: "inbound",
      hoursAgo: 6,
      identityId: IDS.identities.ahmed,
      body: "Hi, I saw the 2BR in Marina Gate on Property Finder. Is it still available?",
    }),
    message({
      id: "msg-ahmed-2",
      conversationId: IDS.convos.ahmed,
      author: "ai",
      direction: "outbound",
      hoursAgo: 5.9,
      body: "Yes Ahmed — Marina Gate Tower 2, 1,248 sq ft, high floor with a marina view is still available. Are you looking to move in within the next few months?",
    }),
    message({
      id: "msg-ahmed-3",
      conversationId: IDS.convos.ahmed,
      author: "customer",
      direction: "inbound",
      hoursAgo: 5.4,
      identityId: IDS.identities.ahmed,
      body: "Yes, within 3 months. Budget is around 1.5 million, cash. Can we view this week?",
    }),
    message({
      id: "msg-ahmed-4",
      conversationId: IDS.convos.ahmed,
      author: "ai",
      direction: "outbound",
      hoursAgo: 5.3,
      body: "Perfect. I can hold Thursday 17:30 or Saturday 11:00. Which works better for you?",
    }),
    message({
      id: "msg-ahmed-5",
      conversationId: IDS.convos.ahmed,
      author: "customer",
      direction: "inbound",
      hoursAgo: 0.2,
      identityId: IDS.identities.ahmed,
      body: "Is the Marina unit still available this week? I can do Thursday after 5pm. Also can you confirm the service charge?",
    }),
  ],
  [IDS.convos.sarah]: [
    message({
      id: "msg-sarah-1",
      conversationId: IDS.convos.sarah,
      author: "customer",
      direction: "inbound",
      hoursAgo: 8,
      identityId: IDS.identities.sarah,
      body: "We are looking for a 4 bedroom villa in Dubai Hills. Something with a garden for the kids.",
    }),
    message({
      id: "msg-sarah-2",
      conversationId: IDS.convos.sarah,
      author: "ai",
      direction: "outbound",
      hoursAgo: 7.8,
      body: "I have two villas in Golf Grove that match — 3,420 and 3,610 sq ft, both with private gardens. Budget range?",
    }),
    message({
      id: "msg-sarah-3",
      conversationId: IDS.convos.sarah,
      author: "customer",
      direction: "inbound",
      hoursAgo: 7.2,
      identityId: IDS.identities.sarah,
      body: "Up to 3.2 million, we will mortgage. Can we visit the villa on Saturday morning?",
    }),
    message({
      id: "msg-sarah-4",
      conversationId: IDS.convos.sarah,
      author: "ai",
      direction: "outbound",
      hoursAgo: 0.6,
      body: "Saturday 10:30 is open. I’ll send the viewing to Lina for confirmation.",
    }),
  ],
  [IDS.convos.omar]: [
    message({
      id: "msg-omar-1",
      conversationId: IDS.convos.omar,
      author: "customer",
      direction: "inbound",
      hoursAgo: 10,
      identityId: IDS.identities.omar,
      body: "What is the service charge on the JVC apartment? The 1BR in District 7.",
    }),
    message({
      id: "msg-omar-2",
      conversationId: IDS.convos.omar,
      author: "ai",
      direction: "outbound",
      hoursAgo: 9.7,
      body: "AED 14 per sq ft, so about AED 10,080 a year on this unit. DLD is 4% plus admin. Would you like the payment schedule?",
    }),
    message({
      id: "msg-omar-3",
      conversationId: IDS.convos.omar,
      author: "customer",
      direction: "inbound",
      hoursAgo: 1.1,
      identityId: IDS.identities.omar,
      body: "Yes please. And is the kitchen closed or open plan?",
    }),
  ],
  [IDS.convos.maya]: [
    message({
      id: "msg-maya-1",
      conversationId: IDS.convos.maya,
      author: "customer",
      direction: "inbound",
      hoursAgo: 26,
      identityId: IDS.identities.maya,
      body: "Please send the floor plan for tower 2. We liked the 3BR facing the fountain.",
    }),
    message({
      id: "msg-maya-2",
      conversationId: IDS.convos.maya,
      author: "human",
      direction: "outbound",
      hoursAgo: 25,
      body: "Sent to your email — unit 2408, 1,862 sq ft, fountain view. Happy to walk the unit tomorrow after 4.",
    }),
    message({
      id: "msg-maya-3",
      conversationId: IDS.convos.maya,
      author: "customer",
      direction: "inbound",
      hoursAgo: 2,
      identityId: IDS.identities.maya,
      body: "Tomorrow 16:30 works. Can we also see a stacked unit one floor up if it is vacant?",
    }),
  ],
  [IDS.convos.fatima]: [
    message({
      id: "msg-fatima-1",
      conversationId: IDS.convos.fatima,
      author: "customer",
      direction: "inbound",
      hoursAgo: 12,
      body: "I only want Palm West beach, full floor if possible. Do not send anything below 14 million.",
    }),
    message({
      id: "msg-fatima-2",
      conversationId: IDS.convos.fatima,
      author: "human",
      direction: "outbound",
      hoursAgo: 4,
      body: "Understood. I have a west-facing penthouse at One Palm, AED 18.2M, private pool. I can arrange a discreet viewing this evening.",
    }),
  ],
  [IDS.convos.james]: [
    message({
      id: "msg-james-1",
      conversationId: IDS.convos.james,
      author: "customer",
      direction: "inbound",
      hoursAgo: 20,
      body: "Need a 2 bed near DIFC before November. Company will cover agency fee.",
    }),
    message({
      id: "msg-james-2",
      conversationId: IDS.convos.james,
      author: "ai",
      direction: "outbound",
      hoursAgo: 6,
      body: "I shortlisted Executive Towers T3 and Damac Maison. Both are a 12-minute walk to DIFC. Shall I book Tuesday 18:00?",
    }),
  ],
  [IDS.convos.hassan]: [
    message({
      id: "msg-hassan-1",
      conversationId: IDS.convos.hassan,
      author: "customer",
      direction: "inbound",
      hoursAgo: 30,
      body: "The Damac Hills villa — is the maid room ensuite? We need parking for two cars.",
    }),
    message({
      id: "msg-hassan-2",
      conversationId: IDS.convos.hassan,
      author: "ai",
      direction: "outbound",
      hoursAgo: 9,
      body: "Yes, ensuite maid's room and a two-car garage. Viewing is held for Friday 16:00.",
    }),
  ],
  [IDS.convos.nadine]: [
    message({
      id: "msg-nadine-1",
      conversationId: IDS.convos.nadine,
      author: "customer",
      direction: "inbound",
      hoursAgo: 16,
      body: "Creek Harbour 3BR — how far is Dubai College by car at 7:15am?",
    }),
    message({
      id: "msg-nadine-2",
      conversationId: IDS.convos.nadine,
      author: "ai",
      direction: "outbound",
      hoursAgo: 14,
      body: "About 18–22 minutes via Al Khail at that time. I can send a school-run map with the listing pack.",
    }),
  ],
};

function followUp(input: {
  id: string;
  leadId: string;
  title: string;
  notes: string;
  dueAt: string;
  status: LeadFollowUp["status"];
  assigned?: string | null;
  hoursAgo: number;
  lead: ConversationLeadSummary;
}): LeadFollowUpWithLead {
  return {
    id: input.id,
    organization_id: ORG,
    lead_id: input.leadId,
    assigned_user_id: input.assigned === undefined ? OWNER : input.assigned,
    title: input.title,
    notes: input.notes,
    due_at: input.dueAt,
    status: input.status,
    created_at: at(-input.hoursAgo),
    updated_at: at(-input.hoursAgo / 4),
    lead: input.lead,
  };
}

export const DEMO_FOLLOW_UPS: LeadFollowUpWithLead[] = [
  followUp({
    id: "fu-ahmed-viewing",
    leadId: IDS.leads.ahmed,
    title: "Confirm Thursday Marina Gate viewing",
    notes: "Hold 17:30 with building security. Send parking instructions.",
    dueAt: todayAt(16, 0),
    status: "pending",
    hoursAgo: 4,
    lead: leadSummary(IDS.leads.ahmed, "Ahmed", "Khalil"),
  }),
  followUp({
    id: "fu-sarah-mortgage",
    leadId: IDS.leads.sarah,
    title: "Send mortgage pre-approval checklist",
    notes: "Salary certificate + 6-month statements. Husband is the applicant.",
    dueAt: at(-20),
    status: "pending",
    assigned: AGENT,
    hoursAgo: 22,
    lead: leadSummary(IDS.leads.sarah, "Sarah", "Hassan"),
  }),
  followUp({
    id: "fu-omar-fees",
    leadId: IDS.leads.omar,
    title: "Share DLD and service-charge breakdown",
    notes: "Include agency commission so there are no surprises.",
    dueAt: at(30),
    status: "pending",
    assigned: AGENT,
    hoursAgo: 6,
    lead: leadSummary(IDS.leads.omar, "Omar", "Saleh"),
  }),
  followUp({
    id: "fu-maya-keys",
    leadId: IDS.leads.maya,
    title: "Arrange Tower 2 access cards",
    notes: "Fountain view 2408 plus stacked 2508 if vacant.",
    dueAt: at(46),
    status: "pending",
    hoursAgo: 8,
    lead: leadSummary(IDS.leads.maya, "Maya", "Ibrahim", "Emaar Hospitality"),
  }),
  followUp({
    id: "fu-khaled-qualify",
    leadId: IDS.leads.khaled,
    title: "Qualify budget for Arabian Ranches townhouse",
    notes: "First reply still pending. Try WhatsApp at 11:00.",
    dueAt: at(70),
    status: "pending",
    hoursAgo: 3,
    lead: leadSummary(IDS.leads.khaled, "Khaled", "Nasser"),
  }),
  followUp({
    id: "fu-james-done",
    leadId: IDS.leads.james,
    title: "Send DIFC walking-map pack",
    notes: "Executive Towers and Damac Maison PDFs sent.",
    dueAt: at(-30),
    status: "completed",
    assigned: AGENT,
    hoursAgo: 28,
    lead: leadSummary(IDS.leads.james, "James", "Whitfield", "Barclays"),
  }),
  followUp({
    id: "fu-priya-cancel",
    leadId: IDS.leads.priya,
    title: "Instagram studio follow-up",
    notes: "Lead asked to pause — night shifts this week.",
    dueAt: at(-8),
    status: "cancelled",
    hoursAgo: 10,
    lead: leadSummary(IDS.leads.priya, "Priya", "Sharma"),
  }),
];

function appointment(input: {
  id: string;
  leadId: string;
  startsAt: string;
  endsAt: string;
  status: Appointment["status"];
  location: string;
  notes: string;
  assigned?: string | null;
  hoursAgo: number;
  lead: ConversationLeadSummary;
}): AppointmentWithLead {
  return {
    id: input.id,
    organization_id: ORG,
    lead_id: input.leadId,
    assigned_user_id: input.assigned === undefined ? OWNER : input.assigned,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    status: input.status,
    location: input.location,
    notes: input.notes,
    created_at: at(-input.hoursAgo),
    updated_at: at(-input.hoursAgo / 3),
    lead: input.lead,
  };
}

export const DEMO_APPOINTMENTS: AppointmentWithLead[] = [
  appointment({
    id: "ap-ahmed-marina",
    leadId: IDS.leads.ahmed,
    startsAt: todayAt(17, 30),
    endsAt: todayAt(18, 15),
    status: "scheduled",
    location: "Marina Gate Tower 2, Dubai Marina — lobby",
    notes: "High-floor 2BR. Cash buyer. Bring floor plan and SPA draft.",
    hoursAgo: 5,
    lead: leadSummary(IDS.leads.ahmed, "Ahmed", "Khalil"),
  }),
  appointment({
    id: "ap-sarah-hills",
    leadId: IDS.leads.sarah,
    startsAt: at(64),
    endsAt: at(65.5),
    status: "scheduled",
    location: "Golf Grove, Dubai Hills Estate",
    notes: "Family viewing. Kids will attend. Unlock garden gate.",
    assigned: AGENT,
    hoursAgo: 12,
    lead: leadSummary(IDS.leads.sarah, "Sarah", "Hassan"),
  }),
  appointment({
    id: "ap-maya-downtown",
    leadId: IDS.leads.maya,
    startsAt: at(22),
    endsAt: at(23),
    status: "scheduled",
    location: "Boulevard Point Tower 2, Downtown Dubai",
    notes: "Fountain-view 3BR plus stacked unit if vacant.",
    hoursAgo: 20,
    lead: leadSummary(IDS.leads.maya, "Maya", "Ibrahim", "Emaar Hospitality"),
  }),
  appointment({
    id: "ap-hassan-done",
    leadId: IDS.leads.hassan,
    startsAt: at(-28),
    endsAt: at(-26.5),
    status: "completed",
    location: "Damac Hills, Villa cluster 4",
    notes: "Family liked the layout. Waiting on bank pre-approval.",
    hoursAgo: 40,
    lead: leadSummary(IDS.leads.hassan, "Hassan", "Qureshi"),
  }),
  appointment({
    id: "ap-james-cancel",
    leadId: IDS.leads.james,
    startsAt: at(-6),
    endsAt: at(-5),
    status: "cancelled",
    location: "Executive Towers T3, Business Bay",
    notes: "Rescheduled — client had a board call.",
    assigned: AGENT,
    hoursAgo: 18,
    lead: leadSummary(IDS.leads.james, "James", "Whitfield", "Barclays"),
  }),
];

function activity(input: {
  id: string;
  leadId: string;
  type: LeadActivity["type"];
  content: string;
  hoursAgo: number;
  userId?: string | null;
}): LeadActivity {
  return {
    id: input.id,
    organization_id: ORG,
    lead_id: input.leadId,
    user_id: input.userId === undefined ? OWNER : input.userId,
    type: input.type,
    content: input.content,
    created_at: at(-input.hoursAgo),
  };
}

export const DEMO_LEAD_ACTIVITIES: LeadActivity[] = [
  activity({
    id: "act-ahmed-1",
    leadId: IDS.leads.ahmed,
    type: "conversation",
    content: "Inbound WhatsApp: asked if the Marina Gate 2BR is still available this week.",
    hoursAgo: 0.2,
    userId: null,
  }),
  activity({
    id: "act-ahmed-2",
    leadId: IDS.leads.ahmed,
    type: "appointment",
    content: "Viewing scheduled Thursday 17:30 at Marina Gate Tower 2.",
    hoursAgo: 5,
  }),
  activity({
    id: "act-ahmed-3",
    leadId: IDS.leads.ahmed,
    type: "ai",
    content: "Captured budget AED 1,500,000 and cash financing from the WhatsApp thread.",
    hoursAgo: 5.4,
    userId: null,
  }),
  activity({
    id: "act-ahmed-4",
    leadId: IDS.leads.ahmed,
    type: "status_change",
    content: "Moved to Qualified after location, budget, and timeline were confirmed.",
    hoursAgo: 5.5,
  }),
  activity({
    id: "act-ahmed-5",
    leadId: IDS.leads.ahmed,
    type: "call",
    content: "Intro call — relocating from Abu Dhabi, wants a furnished high floor.",
    hoursAgo: 16,
  }),
  activity({
    id: "act-sarah-1",
    leadId: IDS.leads.sarah,
    type: "conversation",
    content: "Asked to visit the villa Saturday morning.",
    hoursAgo: 0.6,
    userId: null,
  }),
  activity({
    id: "act-sarah-2",
    leadId: IDS.leads.sarah,
    type: "follow_up",
    content: "Mortgage checklist queued for Yousef.",
    hoursAgo: 8,
    userId: AGENT,
  }),
  activity({
    id: "act-sarah-3",
    leadId: IDS.leads.sarah,
    type: "note",
    content: "Family of four. Saturday mornings only.",
    hoursAgo: 12,
    userId: AGENT,
  }),
  activity({
    id: "act-maya-1",
    leadId: IDS.leads.maya,
    type: "email",
    content: "Sent Tower 2 floor plan for unit 2408.",
    hoursAgo: 25,
  }),
  activity({
    id: "act-maya-2",
    leadId: IDS.leads.maya,
    type: "meeting",
    content: "Downtown viewing locked for tomorrow 16:30.",
    hoursAgo: 2,
  }),
  activity({
    id: "act-omar-1",
    leadId: IDS.leads.omar,
    type: "conversation",
    content: "Asked about JVC service charges and kitchen layout.",
    hoursAgo: 1.1,
    userId: null,
  }),
  activity({
    id: "act-khaled-1",
    leadId: IDS.leads.khaled,
    type: "note",
    content: "New Property Finder enquiry. No budget yet.",
    hoursAgo: 8,
    userId: null,
  }),
  activity({
    id: "act-fatima-1",
    leadId: IDS.leads.fatima,
    type: "call",
    content: "Discreet Palm briefing. West beach only, 14M floor.",
    hoursAgo: 14,
  }),
  activity({
    id: "act-hassan-1",
    leadId: IDS.leads.hassan,
    type: "appointment",
    content: "Completed Damac Hills villa viewing. Positive, waiting on the bank.",
    hoursAgo: 28,
  }),
];

export const DEMO_CHANNEL_ACCOUNTS: Array<{
  id: string;
  channel: "whatsapp" | "email" | "sms" | "telegram" | "test";
  status: "active" | "paused" | "disabled";
  providerDestinationId: string;
  createdAt: string;
}> = [
  {
    id: IDS.accounts.whatsapp,
    channel: "whatsapp",
    status: "active",
    providerDestinationId: "102938475610",
    createdAt: at(-720),
  },
  {
    id: IDS.accounts.email,
    channel: "email",
    status: "active",
    providerDestinationId: "sales@horizonrealty.ae",
    createdAt: at(-700),
  },
  {
    id: IDS.accounts.telegram,
    channel: "telegram",
    status: "paused",
    providerDestinationId: "horizon_sales_bot",
    createdAt: at(-480),
  },
  {
    id: IDS.accounts.sms,
    channel: "sms",
    status: "active",
    providerDestinationId: "+97144123456",
    createdAt: at(-360),
  },
];

export const DEMO_CHANNEL_ACCOUNT_ROWS: ChannelAccount[] =
  DEMO_CHANNEL_ACCOUNTS.map((account) => ({
    id: account.id,
    organization_id: ORG,
    channel: account.channel,
    status: account.status,
    provider_destination_id: account.providerDestinationId,
    created_by_user_id: OWNER,
    created_at: account.createdAt,
    updated_at: account.createdAt,
  }));

export interface DemoIdentityPublic {
  id: string;
  organizationId: string;
  channelAccountId: string;
  externalAddress: string;
  leadId: string | null;
  createdAt: string;
}

export const DEMO_LINKED_IDENTITIES: DemoIdentityPublic[] = [
  {
    id: IDS.identities.ahmed,
    organizationId: ORG,
    channelAccountId: IDS.accounts.whatsapp,
    externalAddress: "+971501124880",
    leadId: IDS.leads.ahmed,
    createdAt: at(-18),
  },
  {
    id: IDS.identities.sarah,
    organizationId: ORG,
    channelAccountId: IDS.accounts.whatsapp,
    externalAddress: "+971555019332",
    leadId: IDS.leads.sarah,
    createdAt: at(-36),
  },
  {
    id: IDS.identities.omar,
    organizationId: ORG,
    channelAccountId: IDS.accounts.telegram,
    externalAddress: "@omar_saleh",
    leadId: IDS.leads.omar,
    createdAt: at(-48),
  },
  {
    id: IDS.identities.maya,
    organizationId: ORG,
    channelAccountId: IDS.accounts.email,
    externalAddress: "maya.ibrahim@emaar.ae",
    leadId: IDS.leads.maya,
    createdAt: at(-72),
  },
];

export const DEMO_UNMATCHED_IDENTITIES: DemoIdentityPublic[] = [
  {
    id: IDS.identities.unmatched1,
    organizationId: ORG,
    channelAccountId: IDS.accounts.whatsapp,
    externalAddress: "+971509883114",
    leadId: null,
    createdAt: at(-2),
  },
  {
    id: IDS.identities.unmatched2,
    organizationId: ORG,
    channelAccountId: IDS.accounts.email,
    externalAddress: "k.nasser@icloud.com",
    leadId: null,
    createdAt: at(-5),
  },
  {
    id: IDS.identities.unmatched3,
    organizationId: ORG,
    channelAccountId: IDS.accounts.sms,
    externalAddress: "+971521147760",
    leadId: null,
    createdAt: at(-9),
  },
];

export interface DemoMatchCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  status: LeadStatus;
}

export const DEMO_IDENTITY_CANDIDATES: Record<string, DemoMatchCandidate[]> = {
  [IDS.identities.unmatched1]: [
    {
      id: IDS.leads.khaled,
      firstName: "Khaled",
      lastName: "Nasser",
      email: "khaled.nasser@gmail.com",
      phone: "+971567002118",
      companyName: null,
      status: "new",
    },
    {
      id: IDS.leads.mohammed,
      firstName: "Mohammed",
      lastName: "Al-Suwaidi",
      email: "m.alsuwaidi@etisalat.ae",
      phone: "+971506441882",
      companyName: null,
      status: "new",
    },
  ],
  [IDS.identities.unmatched2]: [
    {
      id: IDS.leads.khaled,
      firstName: "Khaled",
      lastName: "Nasser",
      email: "khaled.nasser@gmail.com",
      phone: "+971567002118",
      companyName: null,
      status: "new",
    },
  ],
  [IDS.identities.unmatched3]: [
    {
      id: IDS.leads.nadine,
      firstName: "Nadine",
      lastName: "Khoury",
      email: "nadine.khoury@gmail.com",
      phone: "+971521147760",
      companyName: null,
      status: "contacted",
    },
  ],
};

export const DEMO_PENDING_AI_ACTIONS: AiToolActionPublic[] = [
  {
    id: "ai-act-sarah-appt",
    toolName: "create_appointment",
    trust: "human_approval",
    status: "pending",
    conversationId: IDS.convos.sarah,
    createdAt: at(-0.7),
    expiresAt: at(23),
    lead: { firstName: "Sarah", lastName: "Hassan", companyName: null },
    summary: {
      title: "Dubai Hills villa viewing",
      startsAt: at(64),
      endsAt: at(65.5),
      location: "Golf Grove, Dubai Hills Estate",
    },
  },
  {
    id: "ai-act-omar-fu",
    toolName: "create_follow_up",
    trust: "human_approval",
    status: "pending",
    conversationId: IDS.convos.omar,
    createdAt: at(-1.2),
    expiresAt: at(22),
    lead: { firstName: "Omar", lastName: "Saleh", companyName: null },
    summary: {
      title: "Send JVC service-charge pack",
      dueAt: at(30),
    },
  },
];

const AHMED_PLAN = {
  kind: "blocked_no_auto_escalation" as const,
  executable: false,
  observability: "not_on_ledger" as const,
  skipReason: "blocked_no_auto_escalation" as const,
  ledger: null,
};

const SARAH_PLAN = {
  kind: "blocked_missing_schedule" as const,
  executable: false,
  observability: "on_ledger" as const,
  skipReason: "blocked_missing_schedule" as const,
  ledger: {
    actionId: "ai-act-sarah-appt",
    toolName: "create_appointment" as const,
    status: "pending" as const,
    trust: "human_approval" as const,
  },
};

export const DEMO_ACTION_CENTER: AiActionCenter = {
  pendingActions: DEMO_PENDING_AI_ACTIONS,
  recommendationItems: [
    {
      id: "rec-sarah-appt",
      kind: "appointment_needs_scheduling",
      conversationId: IDS.convos.sarah,
      recommendedAction: "suggest_appointment_approval",
      planKind: "blocked_missing_schedule",
      executable: false,
      observability: SARAH_PLAN.observability,
      skipReason: SARAH_PLAN.skipReason,
      ledger: SARAH_PLAN.ledger,
      createdAt: at(-0.7),
      lead: { firstName: "Sarah", lastName: "Hassan", companyName: null },
      href: `/dashboard/conversations?conversation=${IDS.convos.sarah}`,
    } satisfies ActionCenterRecommendationItem,
    {
      id: "rec-ahmed-handoff",
      kind: "human_handoff_recommended",
      conversationId: IDS.convos.ahmed,
      recommendedAction: "suggest_human_handoff",
      planKind: "blocked_no_auto_escalation",
      executable: false,
      observability: AHMED_PLAN.observability,
      skipReason: AHMED_PLAN.skipReason,
      ledger: null,
      createdAt: at(-0.2),
      lead: { firstName: "Ahmed", lastName: "Khalil", companyName: null },
      href: `/dashboard/conversations?conversation=${IDS.convos.ahmed}`,
    } satisfies ActionCenterRecommendationItem,
  ],
  counts: {
    pendingAppointments: 1,
    appointmentRecommendations: 1,
    handoffRecommendations: 1,
    total: 3,
  },
};

function pipeline(overrides: Partial<PublicAiSalesAnalysis["pipeline"]> = {}) {
  return {
    leadStatus: "qualified" as const,
    conversationStatus: "open" as const,
    requiresHuman: false,
    aiPaused: false,
    latestMessageDirection: "inbound" as const,
    lastInboundAt: at(-0.5),
    lastOutboundAt: at(-1),
    hasScheduledAppointment: false,
    hasPendingFollowUp: true,
    hasPendingAppointmentApproval: false,
    contactEmailPresent: true,
    contactPhonePresent: true,
    ...overrides,
  };
}

export const DEMO_INSIGHTS: Record<
  string,
  { analysis: PublicAiSalesAnalysis; recommendation: PublicAiSalesRecommendation }
> = {
  [IDS.convos.ahmed]: {
    analysis: {
      id: "an-ahmed",
      status: "recorded",
      schemaVersion: "1",
      promptVersion: "SALES_AGENT_PROMPT_V3",
      createdAt: at(-0.2),
      inboundMessageCreatedAt: at(-0.2),
      isCurrent: true,
      pipeline: pipeline({
        requiresHuman: true,
        aiPaused: true,
        hasScheduledAppointment: true,
      }),
      analysis: {
        inboundIntent: "appointment",
        objection: "none",
        urgency: "high",
        qualification: "qualified",
        inferredStage: "ready_for_appointment",
        buyingSignals: ["asking_viewing", "mentioning_budget"],
        missingInformation: [],
        nextBestAction: "human_handoff",
        rationale:
          "Cash buyer confirmed a Thursday viewing and asked service charge. A human should close the slot.",
        confidence: 0.91,
      },
    },
    recommendation: {
      id: "rec-an-ahmed",
      status: "recorded",
      policyVersion: "v1",
      createdAt: at(-0.2),
      inboundMessageCreatedAt: at(-0.2),
      isCurrent: true,
      recommendedAction: "suggest_human_handoff",
      citedAnalysisAction: "human_handoff",
      requiresHumanApproval: true,
      mappedToolName: null,
      reasonCodes: ["viewing_ready", "service_charge_question"],
      pipeline: pipeline({ requiresHuman: true, aiPaused: true }),
      plan: AHMED_PLAN,
    },
  },
  [IDS.convos.sarah]: {
    analysis: {
      id: "an-sarah",
      status: "recorded",
      schemaVersion: "1",
      promptVersion: "SALES_AGENT_PROMPT_V3",
      createdAt: at(-0.6),
      inboundMessageCreatedAt: at(-0.6),
      isCurrent: true,
      pipeline: pipeline({
        leadStatus: "contacted",
        hasPendingAppointmentApproval: true,
      }),
      analysis: {
        inboundIntent: "appointment",
        objection: "timing",
        urgency: "medium",
        qualification: "qualifying",
        inferredStage: "ready_for_appointment",
        buyingSignals: ["asking_viewing", "mentioning_budget"],
        missingInformation: ["decision_maker"],
        nextBestAction: "request_appointment_approval",
        rationale:
          "Saturday morning villa viewing requested. Needs operator approval before it is booked.",
        confidence: 0.86,
      },
    },
    recommendation: {
      id: "rec-an-sarah",
      status: "recorded",
      policyVersion: "v1",
      createdAt: at(-0.6),
      inboundMessageCreatedAt: at(-0.6),
      isCurrent: true,
      recommendedAction: "suggest_appointment_approval",
      citedAnalysisAction: "request_appointment_approval",
      requiresHumanApproval: true,
      mappedToolName: "create_appointment",
      reasonCodes: ["viewing_window_saturday"],
      pipeline: pipeline({
        leadStatus: "contacted",
        hasPendingAppointmentApproval: true,
      }),
      plan: SARAH_PLAN,
    },
  },
};

export const DEMO_PROPERTIES = [
  {
    id: "prop-marina-gate",
    title: "Marina Gate Tower 2 · 2BR",
    community: "Dubai Marina",
    price: "AED 1,480,000",
    beds: 2,
    baths: 2,
    area: "1,248 sq ft",
    status: "Available",
    matchedLead: "Ahmed Khalil",
  },
  {
    id: "prop-hills-grove",
    title: "Golf Grove Villa · 4BR",
    community: "Dubai Hills Estate",
    price: "AED 3,150,000",
    beds: 4,
    baths: 5,
    area: "3,420 sq ft",
    status: "Viewing booked",
    matchedLead: "Sarah Hassan",
  },
  {
    id: "prop-blvd-2408",
    title: "Boulevard Point 2408 · 3BR",
    community: "Downtown Dubai",
    price: "AED 2,090,000",
    beds: 3,
    baths: 3,
    area: "1,862 sq ft",
    status: "Available",
    matchedLead: "Maya Ibrahim",
  },
  {
    id: "prop-jvc-d7",
    title: "District 7 · 1BR",
    community: "JVC",
    price: "AED 875,000",
    beds: 1,
    baths: 1,
    area: "720 sq ft",
    status: "Available",
    matchedLead: "Omar Saleh",
  },
  {
    id: "prop-palm-one",
    title: "One Palm Penthouse",
    community: "Palm Jumeirah",
    price: "AED 18,200,000",
    beds: 5,
    baths: 7,
    area: "8,140 sq ft",
    status: "Private listing",
    matchedLead: "Fatima Al-Mazrouei",
  },
  {
    id: "prop-damac-v4",
    title: "Damac Hills Cluster 4 · Villa",
    community: "Damac Hills",
    price: "AED 4,350,000",
    beds: 4,
    baths: 5,
    area: "4,180 sq ft",
    status: "Reserved interest",
    matchedLead: "Hassan Qureshi",
  },
];

export const DEMO_ANALYTICS = {
  metrics: [
    { label: "Leads this month", value: "248", delta: "+12.4%" },
    { label: "Viewings booked", value: "41", delta: "+9.1%" },
    { label: "Qualified rate", value: "34.7%", delta: "+2.8%" },
    { label: "Avg. response", value: "2m 14s", delta: "-18s" },
  ],
  channels: [
    { label: "WhatsApp", share: 52, count: 129 },
    { label: "Portal", share: 24, count: 60 },
    { label: "Email", share: 14, count: 35 },
    { label: "Website", share: 10, count: 24 },
  ],
  agents: [
    { name: "Lina Al-Farsi", leads: 64, qualified: 29, viewings: 18 },
    { name: "Yousef Mansour", leads: 51, qualified: 17, viewings: 14 },
  ],
};

export const DEMO_OVERVIEW_METRICS = [
  { label: "Total leads", value: "248", delta: "+12.4%", positive: true },
  { label: "Qualified", value: "86", delta: "+8.7%", positive: true },
  { label: "Open conversations", value: "32", delta: "+3.8%", positive: true },
  { label: "Viewings this week", value: "14", delta: "+2", positive: true },
];

export const DEMO_OVERVIEW_PIPELINE = [
  { label: "New", count: 88, share: 35 },
  { label: "Qualifying", count: 74, share: 30 },
  { label: "Qualified", count: 86, share: 35 },
];

export const DEMO_OVERVIEW_LEADS = DEMO_LEADS.slice(0, 5).map(
  (item) => ({
    id: item.id,
    name: `${item.first_name} ${item.last_name}`,
    interest: item.qualification_facts.property_type ?? "—",
    location: item.qualification_facts.location ?? "—",
    budget: item.qualification_facts.budget ?? "Not set",
    timeline: item.qualification_facts.timeline ?? "Not set",
    qualification: (item.qualification_facts.budget &&
    item.qualification_facts.timeline &&
    item.qualification_facts.location
      ? "Qualified"
      : item.qualification_facts.location
        ? "Qualifying"
        : "New") as "Qualified" | "Qualifying" | "New",
    lastActivity: "",
  })
);

export const DEMO_OVERVIEW_CONVERSATIONS = [
  {
    id: IDS.convos.ahmed,
    name: "Ahmed Khalil",
    lastMessage: "Is the Marina unit still available this week?",
    time: "12m ago",
    status: "Open",
    channel: "WhatsApp",
  },
  {
    id: IDS.convos.sarah,
    name: "Sarah Hassan",
    lastMessage: "Can we visit the villa on Saturday morning?",
    time: "38m ago",
    status: "Open",
    channel: "WhatsApp",
  },
  {
    id: IDS.convos.omar,
    name: "Omar Saleh",
    lastMessage: "What is the service charge on the JVC apartment?",
    time: "1h ago",
    status: "Open",
    channel: "Telegram",
  },
  {
    id: IDS.convos.maya,
    name: "Maya Ibrahim",
    lastMessage: "Please send the floor plan for tower 2.",
    time: "2h ago",
    status: "Open",
    channel: "Email",
  },
];

export const DEMO_OVERVIEW_ACTIVITY = [
  {
    id: "demo-act-1",
    title: "Ahmed Khalil replied",
    detail: "Asked to keep Thursday 17:30 at Marina Gate",
    time: "12m ago",
    kind: "conversation",
  },
  {
    id: "demo-act-2",
    title: "Human handoff requested",
    detail: "ZEUS paused on Ahmed Khalil — service charge question",
    time: "14m ago",
    kind: "qualification",
  },
  {
    id: "demo-act-3",
    title: "Sarah Hassan",
    detail: "Saturday villa viewing waiting for approval",
    time: "38m ago",
    kind: "follow_up",
  },
  {
    id: "demo-act-4",
    title: "Customer fact captured",
    detail: "Omar Saleh · JVC 1BR · budget AED 900,000",
    time: "1h ago",
    kind: "fact",
  },
  {
    id: "demo-act-5",
    title: "Maya Ibrahim",
    detail: "Downtown viewing confirmed for tomorrow 16:30",
    time: "2h ago",
    kind: "qualification",
  },
  {
    id: "demo-act-6",
    title: "New lead",
    detail: "Khaled Nasser · Arabian Ranches townhouse",
    time: "3h ago",
    kind: "fact",
  },
  {
    id: "demo-act-7",
    title: "Follow-up overdue",
    detail: "Send mortgage checklist to Sarah Hassan",
    time: "4h ago",
    kind: "follow_up",
  },
];

export const DEMO_CONVERSATION_IDS = IDS.convos;
export const DEMO_LEAD_IDS = IDS.leads;
export const DEMO_IDENTITY_IDS = IDS.identities;

export function getDemoLead(leadId: string): Lead | undefined {
  return DEMO_LEADS.find((item) => item.id === leadId);
}

export function listDemoLeads(filters: {
  search?: string;
  status?: string;
  source?: string;
  ownerId?: string;
  page?: number;
  limit?: number;
}): { data: Lead[]; meta: { page: number; limit: number; count: number } } {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;
  const search = filters.search?.trim().toLowerCase() ?? "";
  let rows = DEMO_LEADS.slice();
  if (search) {
    rows = rows.filter((item) => {
      const haystack = [
        item.first_name,
        item.last_name,
        item.email,
        item.phone,
        item.company_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }
  if (filters.status) {
    rows = rows.filter((item) => item.status === filters.status);
  }
  if (filters.source) {
    rows = rows.filter((item) => item.source === filters.source);
  }
  if (filters.ownerId) {
    rows = rows.filter((item) => item.owner_id === filters.ownerId);
  }
  const start = (page - 1) * limit;
  return {
    data: rows.slice(start, start + limit),
    meta: { page, limit, count: rows.length },
  };
}

export function listDemoFollowUps(options: {
  status?: string;
  leadId?: string;
}): LeadFollowUpWithLead[] {
  return DEMO_FOLLOW_UPS.filter((item) => {
    if (options.leadId && item.lead_id !== options.leadId) return false;
    if (options.status && options.status !== "all" && item.status !== options.status) {
      return false;
    }
    return true;
  });
}

export function listDemoAppointments(options: {
  status?: string;
  leadId?: string;
}): AppointmentWithLead[] {
  return DEMO_APPOINTMENTS.filter((item) => {
    if (options.leadId && item.lead_id !== options.leadId) return false;
    if (options.status && options.status !== "all" && item.status !== options.status) {
      return false;
    }
    return true;
  });
}

export function listDemoActivities(leadId: string): LeadActivity[] {
  return DEMO_LEAD_ACTIVITIES.filter((item) => item.lead_id === leadId).sort(
    (a, b) => b.created_at.localeCompare(a.created_at)
  );
}

export function getDemoConversation(id: string): ConversationWithLead | undefined {
  return DEMO_CONVERSATIONS.find((item) => item.id === id);
}

export function getDemoConversationForLead(
  leadId: string
): ConversationWithLead | undefined {
  return DEMO_CONVERSATIONS.find(
    (item) => item.lead_id === leadId && item.status === "open"
  );
}

export function listDemoMessages(conversationId: string): MessageWithDeliveryStatus[] {
  return DEMO_MESSAGES[conversationId] ?? [];
}

export function getDemoPendingActions(options: {
  conversationId?: string;
  leadId?: string;
}): AiToolActionPublic[] {
  return DEMO_PENDING_AI_ACTIONS.filter((action) => {
    if (options.conversationId && action.conversationId !== options.conversationId) {
      return false;
    }
    if (options.leadId) {
      const conversation = getDemoConversation(action.conversationId);
      if (conversation?.lead_id !== options.leadId) return false;
    }
    return true;
  });
}

export function getDemoIdentity(id: string): DemoIdentityPublic | undefined {
  return [...DEMO_LINKED_IDENTITIES, ...DEMO_UNMATCHED_IDENTITIES].find(
    (item) => item.id === id
  );
}
