#!/usr/bin/env node
import { spawn } from "node:child_process";

function run(command, args) {
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

  if (!process.env.CONVEX_DEPLOY_KEY) {
    console.warn("CONVEX_DEPLOY_KEY is not set. Skipping Convex deploy and running web build only.");
    await run("pnpm", turboBuildArgs);
    return;
  }

  await run("pnpm", ["exec", "convex", "codegen"]);
  await run("pnpm", ["exec", "convex", "deploy", "--cmd", `pnpm ${turboBuildArgs.join(" ")}`]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
