import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const entitiesDir = path.join(workspaceRoot, "server", "data", "entities");

const DEMO_EMAILS = new Set([
  "admin@local.test",
  "oficina@local.test",
  "tecnico@local.test",
  "ayudante@local.test",
]);

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

const run = async () => {
  const userPath = path.join(entitiesDir, "User.json");
  const membershipPath = path.join(entitiesDir, "OrganizationMembership.json");

  const [users, memberships] = await Promise.all([
    readJsonArray(userPath),
    readJsonArray(membershipPath),
  ]);

  const demoUsers = users.filter((user) =>
    DEMO_EMAILS.has(String(user?.email || "").toLowerCase())
  );
  const demoUserIds = new Set(demoUsers.map((user) => user.id).filter(Boolean));

  const nextUsers = users.filter((user) => {
    if (user?.is_hidden_owner === true) {
      return true;
    }
    const email = String(user?.email || "").toLowerCase();
    return !DEMO_EMAILS.has(email);
  });

  const nextMemberships = memberships.filter(
    (membership) => !demoUserIds.has(membership.user_id)
  );

  await Promise.all([
    writeJsonArray(userPath, nextUsers),
    writeJsonArray(membershipPath, nextMemberships),
  ]);

  console.log(
    JSON.stringify(
      {
        removed_users: users.length - nextUsers.length,
        removed_memberships: memberships.length - nextMemberships.length,
      },
      null,
      2
    )
  );
};

run().catch((error) => {
  console.error("[clean:local-demo-users] FAILED");
  console.error(error);
  process.exitCode = 1;
});

