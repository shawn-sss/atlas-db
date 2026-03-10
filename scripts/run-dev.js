const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

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
    throw new Error(
      `Client dependencies are missing. Run \`node scripts/bootstrap.js\` before ${taskDescription}.`
    );
  }
}

function formatStartError(command, label, error) {
  if (error && error.code === "ENOENT") {
    return new Error(
      `${label || command} could not start because \`${command}\` was not found on PATH.`
    );
  }

  return new Error(`${label || command} could not start: ${error.message}`);
}

function attachPrefixedOutput(stream, label, target) {
  if (!stream) {
    return;
  }

  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    target.write(`[${label}] ${line}\n`);
  });
  stream.on("end", () => rl.close());
}

function spawnManaged(command, args, { cwd, label, env } = {}) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...(process.stdout.isTTY && !process.env.FORCE_COLOR
        ? { FORCE_COLOR: "1" }
        : {}),
      ...env,
    },
    stdio: ["inherit", "pipe", "pipe"],
    detached: !isWindows,
  });

  attachPrefixedOutput(child.stdout, label, process.stdout);
  attachPrefixedOutput(child.stderr, label, process.stderr);
  child.spawnCommand = command;
  child.spawnLabel = label;

  return child;
}

function observeProcess(child, label) {
  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve({ label, ...result });
    };

    child.once("error", (error) => {
      finish({
        code: 1,
        error: formatStartError(
          child.spawnCommand || label,
          child.spawnLabel || label,
          error
        ),
      });
    });

    child.once("exit", (code, signal) => {
      finish({ code: code ?? 0, signal });
    });
  });
}

function terminateProcess(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve();
    };

    child.once("exit", finish);

    if (typeof child.pid !== "number") {
      try {
        child.kill("SIGTERM");
      } catch {}
      const timer = setTimeout(finish, 250);
      timer.unref();
      return;
    }

    if (isWindows) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        stdio: "ignore",
      });

      killer.once("error", () => {
        try {
          child.kill();
        } catch {}
        const timer = setTimeout(finish, 250);
        timer.unref();
      });

      killer.once("exit", () => {
        const timer = setTimeout(finish, 250);
        timer.unref();
      });

      return;
    }

    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {}
    }

    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        try {
          child.kill("SIGKILL");
        } catch {}
      }
    }, 5000);
    timer.unref();
  });
}

function printErrorAndExit(error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}

function printUsage() {
  console.log(`Usage: node scripts/run-dev.js

Starts the Go server on http://localhost:8080 and the Vite client on http://localhost:5173.`);
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  ensureProjectLayout();
  assertClientDependencies("starting development mode");

  console.log("Starting Atlas DB development services...");
  console.log("Client: http://localhost:5173");
  console.log("Server: http://localhost:8080");

  const server = spawnManaged(goCommand, ["run", "./cmd/atlas"], {
    cwd: serverDir,
    label: "server",
  });
  const client = spawnManaged(npmCommand, ["run", "dev"], {
    cwd: clientDir,
    label: "client",
  });

  const children = [server, client];
  let shuttingDown = false;

  async function shutdown(exitCode) {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await Promise.all(children.map((child) => terminateProcess(child)));
    process.exit(exitCode);
  }

  const handleSignal = (signalName) => {
    console.log(`\nReceived ${signalName}. Stopping development services...`);
    shutdown(0);
  };

  process.once("SIGINT", () => handleSignal("SIGINT"));
  process.once("SIGTERM", () => handleSignal("SIGTERM"));
  if (isWindows) {
    process.once("SIGBREAK", () => handleSignal("SIGBREAK"));
  }

  const firstExit = await Promise.race([
    observeProcess(server, "server"),
    observeProcess(client, "client"),
  ]);

  if (shuttingDown) {
    return;
  }

  const otherChild = firstExit.label === "server" ? client : server;
  await terminateProcess(otherChild);

  if (firstExit.error) {
    throw firstExit.error;
  }

  if (firstExit.signal) {
    throw new Error(
      `${firstExit.label} exited from signal ${firstExit.signal}`
    );
  }

  process.exit(firstExit.code ?? 0);
}

main().catch(printErrorAndExit);
