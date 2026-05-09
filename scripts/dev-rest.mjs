import { spawn } from "node:child_process";
import process from "node:process";

const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
  console.log(`Usage: npm run dev:rest

Starts the REST backend and the Vite frontend together with REST-first env defaults:
- VITE_APP_BACKEND_PROVIDER=rest
- VITE_APP_API_URL=http://127.0.0.1:3000
- VITE_APP_ID=local-app

Any existing environment variables still take precedence.`);
  process.exit(0);
}

const sharedEnv = {
  ...process.env,
  VITE_APP_BACKEND_PROVIDER:
    process.env.VITE_APP_BACKEND_PROVIDER || "rest",
  VITE_APP_API_URL: process.env.VITE_APP_API_URL || "http://127.0.0.1:3000",
  VITE_APP_ID: process.env.VITE_APP_ID || "local-app",
  APP_ID: process.env.APP_ID || process.env.VITE_APP_ID || "local-app",
};

const children = [];
let shuttingDown = false;

const run = (label, command, commandArgs, env = sharedEnv) => {
  const child = spawn(command, commandArgs, {
    cwd: process.cwd(),
    env,
    stdio: ["inherit", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  child.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  child.on("exit", (code, signal) => {
    if (!shuttingDown && (code !== 0 || signal)) {
      console.error(
        `[${label}] exited unexpectedly with ${signal || `code ${code}`}.`
      );
      shutdown(code || 1);
    }
  });

  children.push(child);
  return child;
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    process.exit(exitCode);
  }, 300);
};

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("rest-server", process.platform === "win32" ? "npm.cmd" : "npm", [
  "run",
  "server:dev",
]);
run("vite", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev"]);
