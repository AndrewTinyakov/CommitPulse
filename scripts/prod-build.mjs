#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(command, args) {
  console.log(`\n> ${command} ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

async function main() {
  const turboBuildArgs = ["turbo", "run", "build", "--filter=web"];
  const envLabel = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown";
  const hasDeployKey = Boolean(process.env.CONVEX_DEPLOY_KEY);
  const deployment = process.env.CONVEX_DEPLOYMENT ?? "(unset)";
  const convexUrl = process.env.CONVEX_URL ?? "(unset)";
  const publicConvexUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "(unset)";

  console.log("Build context:");
  console.log(`- env: ${envLabel}`);
  console.log(`- CONVEX_DEPLOY_KEY: ${hasDeployKey ? "set" : "missing"}`);
  console.log(`- CONVEX_DEPLOYMENT: ${deployment}`);
  console.log(`- CONVEX_URL: ${convexUrl}`);
  console.log(`- NEXT_PUBLIC_CONVEX_URL: ${publicConvexUrl}`);

  if (!hasDeployKey && envLabel === "production") {
    throw new Error(
      "CONVEX_DEPLOY_KEY is required in production. Refusing to build web without Convex deploy.",
    );
  }

  if (!hasDeployKey) {
    console.warn(
      "CONVEX_DEPLOY_KEY is not set. Skipping Convex deploy and running web build only.",
    );
    await run("pnpm", turboBuildArgs);
    return;
  }

  await run("pnpm", ["exec", "convex", "codegen"]);
  await run("pnpm", ["exec", "convex", "deploy"]);
  await run("pnpm", turboBuildArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
