import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const dataDir = path.join(workspaceRoot, "server", "data");
const entitiesDir = path.join(dataDir, "entities");

const readJsonArray = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const writeJsonArray = async (filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
};

const SMOKE_USER_EMAILS = new Set([
  "user-a@local.test",
  "admin-b@local.test",
  "tech-license@local.test",
  "helper-license@local.test",
  "tech-delete@local.test",
  "admin-license@local.test",
  "tecnico-prueba@local.test",
  "ayudante-prueba@local.test",
  "admin-prueba@local.test",
]);

const isSmokeOrganization = (org) => {
  const slug = String(org?.slug || "").toLowerCase();
  const name = String(org?.name || "").toLowerCase();
  return slug.startsWith("smoke-") || name.startsWith("empresa smoke");
};

const run = async () => {
  const orgPath = path.join(entitiesDir, "Organization.json");
  const userPath = path.join(entitiesDir, "User.json");
  const membershipPath = path.join(entitiesDir, "OrganizationMembership.json");
  const subscriptionPath = path.join(entitiesDir, "OrganizationSubscription.json");
  const settingsPath = path.join(entitiesDir, "OrganizationSettings.json");

  const [organizations, users, memberships, subscriptions, settings] =
    await Promise.all([
      readJsonArray(orgPath),
      readJsonArray(userPath),
      readJsonArray(membershipPath),
      readJsonArray(subscriptionPath),
      readJsonArray(settingsPath),
    ]);

  const smokeOrgIds = new Set(
    organizations.filter(isSmokeOrganization).map((org) => org.id).filter(Boolean)
  );
  const smokeUserIds = new Set(
    users
      .filter((user) => SMOKE_USER_EMAILS.has(String(user?.email || "").toLowerCase()))
      .map((user) => user.id)
      .filter(Boolean)
  );

  // Keep hidden owner and seed users.
  const nextOrganizations = organizations.filter((org) => !smokeOrgIds.has(org.id));
  const nextUsers = users.filter((user) => {
    if (user?.is_hidden_owner === true) {
      return true;
    }
    const email = String(user?.email || "").toLowerCase();
    if (SMOKE_USER_EMAILS.has(email)) {
      return false;
    }
    return true;
  });

  const nextMemberships = memberships.filter((m) => {
    if (smokeOrgIds.has(m.organization_id)) return false;
    if (smokeUserIds.has(m.user_id)) return false;
    return true;
  });
  const nextSubscriptions = subscriptions.filter(
    (s) => !smokeOrgIds.has(s.organization_id)
  );
  const nextSettings = settings.filter((s) => !smokeOrgIds.has(s.organization_id));

  await Promise.all([
    writeJsonArray(orgPath, nextOrganizations),
    writeJsonArray(userPath, nextUsers),
    writeJsonArray(membershipPath, nextMemberships),
    writeJsonArray(subscriptionPath, nextSubscriptions),
    writeJsonArray(settingsPath, nextSettings),
  ]);

  const summary = {
    removed_organizations: organizations.length - nextOrganizations.length,
    removed_users: users.length - nextUsers.length,
    removed_memberships: memberships.length - nextMemberships.length,
    removed_subscriptions: subscriptions.length - nextSubscriptions.length,
    removed_settings: settings.length - nextSettings.length,
  };

  console.log(JSON.stringify(summary, null, 2));
};

run().catch((error) => {
  console.error("[clean:local-test-data] FAILED");
  console.error(error);
  process.exitCode = 1;
});

