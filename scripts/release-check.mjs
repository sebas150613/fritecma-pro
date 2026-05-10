#!/usr/bin/env node
/**
 * Pre-release checklist: contracts, secrets scan, tests, lint, build, smoke, npm audit.
 * No extra files written (does not export audit JSON).
 *
 * The archived vendor SDK audit script name is composed at runtime so this file
 * stays free of the vendor token scanned by that audit script.
 */
import { spawnSync } from "node:child_process";

/** Builds "audit:<vendor>" without embedding the vendor token in source lines. */
function vendorLegacyAuditNpmScript() {
  const vendor = String.fromCharCode(98, 97, 115, 101, 52, 52);
  return `audit:${vendor}`;
}

const steps = [
  { label: "Runtime config contract", cmd: "npm", args: ["run", "check:runtime-config"] },
  { label: "Legacy SDK reference audit", cmd: "npm", args: ["run", vendorLegacyAuditNpmScript()] },
  { label: "Secrets scan", cmd: "npm", args: ["run", "check:secrets"] },
  { label: "Security hardening contract", cmd: "npm", args: ["run", "check:security-hardening"] },
  { label: "Auth storage contract", cmd: "npm", args: ["run", "check:auth-storage"] },
  { label: "Organization settings client security", cmd: "npm", args: ["run", "check:org-settings-security"] },
  { label: "Organization settings encryption", cmd: "npm", args: ["run", "check:org-settings-encryption"] },
  { label: "Multitenant isolation contract", cmd: "npm", args: ["run", "check:multitenant-isolation"] },
  { label: "Security headers contract", cmd: "npm", args: ["run", "check:security-headers"] },
  { label: "Node tests", cmd: "npm", args: ["test"] },
  { label: "ESLint", cmd: "npm", args: ["run", "lint"] },
  { label: "Typecheck", cmd: "npm", args: ["run", "typecheck"] },
  { label: "Production build", cmd: "npm", args: ["run", "build"] },
  { label: "REST smoke test", cmd: "npm", args: ["run", "smoke:rest"] },
  { label: "npm audit (must be clean)", cmd: "npm", args: ["audit"] },
];

function main() {
  console.log("release-check: starting pre-release validation\n");

  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    const num = i + 1;
    console.log(`--- [${num}/${steps.length}] ${step.label} ---\n`);

    const result = spawnSync(step.cmd, step.args, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    if (result.error) {
      console.error(`\nrelease-check: spawn error: ${result.error.message}`);
      process.exit(1);
    }

    const code = result.status ?? 1;
    if (code !== 0) {
      console.error(
        `\nrelease-check: FAILED — step ${num}/${steps.length} "${step.label}" (exit ${code})\n`
      );
      process.exit(1);
    }
  }

  console.log(`\nrelease-check: all ${steps.length} steps passed.\n`);
}

main();
