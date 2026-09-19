"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getUserOrganizations } from "@/modules/auth/queries";
import { CURRENT_ORGANIZATION_COOKIE } from "@/modules/organizations/current-organization";

export async function setCurrentOrganizationAction(
  organizationId: string
): Promise<void> {
  const organizations = await getUserOrganizations();
  const allowed = organizations.some((organization) => organization.id === organizationId);
  if (!allowed) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORGANIZATION_COOKIE, organizationId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/dashboard");
}
