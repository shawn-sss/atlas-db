#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoDir = path.resolve(__dirname, "..");
const clientDir = path.join(repoDir, "client");
const serverDir = path.join(repoDir, "server");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const goCommand = "go";

function ensurePathExists(targetPath, description) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${description}: ${targetPath}`);
  }
}

function ensureProjectLayout() {
  ensurePathExists(clientDir, "client directory");
  ensurePathExists(path.join(clientDir, "package.json"), "client/package.json");
  ensurePathExists(serverDir, "server directory");
  ensurePathExists(path.join(serverDir, "go.mod"), "server/go.mod");
}

function formatStartError(command, label, error) {
  if (error && error.code === "ENOENT") {
    return new Error(
      `${label || command} could not start because \`${command}\` was not found on PATH.`
    );
  }

  return new Error(`${label || command} could not start: ${error.message}`);
}

function logStep(message) {
  console.log(`\n==> ${message}`);
}

function runCommand(command, args, { cwd, label, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });

    child.once("error", (error) => {
      reject(formatStartError(command, label, error));
    });

    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${label || command} exited from signal ${signal}`));
        return;
      }
      if (code !== 0) {
        reject(new Error(`${label || command} exited with code ${code}`));
        return;
      }
      resolve();
    });
  });
}

function printErrorAndExit(error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

function printUsage() {
  console.log(`Usage: node scripts/bootstrap.js

Installs client npm packages and downloads server Go modules.`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  ensureProjectLayout();

  console.log("Bootstrapping Atlas DB...");

  logStep(`Installing client dependencies in ${clientDir}`);
  await runCommand(npmCommand, ["install"], {
    cwd: clientDir,
    label: "client npm install",
  });

  logStep(`Downloading server Go modules in ${serverDir}`);
  await runCommand(goCommand, ["mod", "download"], {
    cwd: serverDir,
    label: "server go mod download",
  });

  console.log("\nBootstrap complete.");
}

main().catch(printErrorAndExit);
