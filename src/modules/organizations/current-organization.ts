import type { OrganizationWithRole } from "@/lib/db/types";

export const CURRENT_ORGANIZATION_COOKIE = "zeus_organization_id";

export function resolveCurrentOrganization(
  organizations: OrganizationWithRole[],
  preferredId?: string | null
): OrganizationWithRole | null {
  if (organizations.length === 0) {
    return null;
  }

  if (preferredId) {
    const preferred = organizations.find((organization) => organization.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  const businessWorkspace = organizations.find(
    (organization) => !/'s Organization$/i.test(organization.name)
  );
  if (businessWorkspace) {
    return businessWorkspace;
  }

  const newest = [...organizations].sort((left, right) =>
    right.created_at.localeCompare(left.created_at)
  )[0];
  return newest ?? null;
}
