const resolveRoleValue = (userOrRole) =>
  typeof userOrRole === "string" ? userOrRole : userOrRole?.role;

export const normalizeUserRole = (userOrRole) =>
  (resolveRoleValue(userOrRole) || "").toLowerCase();

export const isOwnerRole = (userOrRole) =>
  normalizeUserRole(userOrRole) === "owner";

export const hasAdminAccess = (userOrRole) => {
  const role = normalizeUserRole(userOrRole);
  return role === "admin" || role === "owner";
};
