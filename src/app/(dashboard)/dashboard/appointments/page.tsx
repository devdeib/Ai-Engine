import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/shared/coming-soon";

export const metadata: Metadata = { title: "Appointments" };

export default function AppointmentsPage() {
  return (
    <ComingSoon
      title="Appointment Scheduling"
      description="Schedule and manage property viewings and client meetings. Calendar integration and automated reminders."
      icon={CalendarDays}
      phase="Phase 3"
    />
  );
}
