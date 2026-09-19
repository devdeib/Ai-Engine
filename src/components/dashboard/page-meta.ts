export interface PageMeta {
  title: string;
  description?: string;
}

export function getDashboardPageMeta(pathname: string): PageMeta {
  if (pathname === "/dashboard") {
    return {
      title: "Overview",
      description: "Pipeline health and recent sales activity",
    };
  }
  if (pathname.startsWith("/dashboard/leads/") && pathname !== "/dashboard/leads") {
    return {
      title: "Lead",
      description: "Customer profile and buying intent",
    };
  }
  if (pathname === "/dashboard/leads" || pathname.startsWith("/dashboard/leads?")) {
    return {
      title: "Leads",
      description: "Who is buying, what they want, and where they stand",
    };
  }
  if (pathname.startsWith("/dashboard/conversations")) {
    return {
      title: "Conversations",
      description: "Live sales threads with customers",
    };
  }
  if (pathname.startsWith("/dashboard/activity")) {
    return {
      title: "Activity",
      description: "Facts captured, qualification changes, and replies",
    };
  }
  if (pathname.startsWith("/dashboard/follow-ups")) {
    return {
      title: "Follow-ups",
      description: "Scheduled outreach that still needs attention",
    };
  }
  if (pathname.startsWith("/dashboard/appointments")) {
    return {
      title: "Appointments",
      description: "Viewings and meetings on the calendar",
    };
  }
  if (pathname.startsWith("/dashboard/channels")) {
    return {
      title: "Channels",
      description: "WhatsApp, email, SMS, and Telegram accounts",
    };
  }
  if (pathname.startsWith("/dashboard/identities")) {
    return {
      title: "Channel Identities",
      description: "Match inbound addresses to the right lead",
    };
  }
  if (pathname.startsWith("/dashboard/ai-agent")) {
    return {
      title: "AI Agent",
      description: "Actions that need a human decision",
    };
  }
  if (pathname.startsWith("/dashboard/settings")) {
    return {
      title: "Settings",
      description: "Workspace, account, and sales profile",
    };
  }
  if (pathname.startsWith("/dashboard/properties")) {
    return {
      title: "Properties",
      description: "Listings matched to buyer intent",
    };
  }
  if (pathname.startsWith("/dashboard/analytics")) {
    return {
      title: "Analytics",
      description: "Conversion, pipeline, and team performance",
    };
  }

  return { title: "ZEUS" };
}
