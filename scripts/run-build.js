const fs = require("node:fs");
const path = require("node:path");
const {
  spawn
} = require("node:child_process");
const repoDir = path.resolve(__dirname, "..");
const clientDir = path.join(repoDir, "client");
const serverDir = path.join(repoDir, "server");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
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
function assertClientDependencies(taskDescription) {
  if (!fs.existsSync(path.join(clientDir, "node_modules"))) {
    throw new Error(`Client dependencies are missing. Run \`node scripts/bootstrap.js\` before ${taskDescription}.`);
  }
}
function getBinaryName(baseName) {
  return isWindows ? `${baseName}.exe` : baseName;
}
function formatStartError(command, label, error) {
  if (error && error.code === "ENOENT") {
    return new Error(`${label || command} could not start because \`${command}\` was not found on PATH.`);
  }
  return new Error(`${label || command} could not start: ${error.message}`);
}
function logStep(message) {
  console.log(`\n==> ${message}`);
}
function runCommand(command, args, {
  cwd,
  label,
  env
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env
      },
      stdio: "inherit"
    });
    child.once("error", error => {
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
  console.log(`Usage: node scripts/run-build.js

Builds client assets into client/dist and a server binary into server/dist.`);
}
async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }
  ensureProjectLayout();
  assertClientDependencies("building the project");
  const serverDistDir = path.join(serverDir, "dist");
  const binaryName = getBinaryName("atlas-db");
  fs.mkdirSync(serverDistDir, {
    recursive: true
  });
  console.log("Building Atlas DB...");
  logStep(`Building client assets in ${clientDir}`);
  await runCommand(npmCommand, ["run", "build"], {
    cwd: clientDir,
    label: "client build"
  });
  logStep(`Building server binary in ${serverDistDir}`);
  await runCommand(goCommand, ["build", "-o", path.join("dist", binaryName), "./cmd/atlas"], {
    cwd: serverDir,
    label: "server build"
  });
  console.log(`\nBuild complete.
Client assets: ${path.join(clientDir, "dist")}
Server binary: ${path.join(serverDistDir, binaryName)}`);
}
main().catch(printErrorAndExit);
