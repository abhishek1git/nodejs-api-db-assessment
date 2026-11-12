"use strict";

const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const SERVERLESS_BIN = path.join(ROOT, "node_modules", "serverless", "bin", "serverless.js");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, output, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become ready at ${url}\n--- server output ---\n${output()}`);
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        process.kill(child.pid, "SIGKILL");
      } catch {
        // Already gone.
      }
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

/**
 * Boots the real serverless-offline stack (API Gateway emulation) against the
 * already-started DynamoDB harness, on an OS-assigned free port.
 */
async function startApi() {
  const port = await getFreePort();
  const lambdaPort = await getFreePort();
  let output = "";

  const child = spawn(
    process.execPath,
    [
      SERVERLESS_BIN,
      "offline",
      "start",
      "--httpPort",
      String(port),
      "--lambdaPort",
      String(lambdaPort),
      "--host",
      "127.0.0.1",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        SLS_TELEMETRY_DISABLED: "1",
        SLS_DEPRECATION_DISABLE: "*",
      },
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForServer(`${baseUrl}/docs`, () => output);
  } catch (err) {
    await stopChild(child);
    throw err;
  }

  return {
    baseUrl,
    output: () => output,
    stop: () => stopChild(child),
  };
}

module.exports = {
  startApi,
};
