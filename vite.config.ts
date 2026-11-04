import { spawn, spawnSync } from "node:child_process";

import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, type Plugin } from "vite";

// The CLI spawns the real tailwindcss binary as its own child, so signalling `bunx`
// alone leaves that grandchild polling forever. Mirrors src/scripts/watch-control.ts.
function killTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      // Group already gone.
    }
  }
}

// public/styles.css is read at runtime by src/files/pdf.tsx to inline styles in the printed tags
function tailwindCssFile(): Plugin {
  return {
    name: "tailwind-css-file",
    apply: "serve",
    configureServer() {
      // Vite re-evaluates this config when it restarts, so the guard has to outlive the
      // module: a local flag resets and each restart leaks another polling CLI.
      const globals = globalThis as typeof globalThis & { tailwindWatcherPid?: number };
      if (globals.tailwindWatcherPid !== undefined) {
        return;
      }

      // `--watch always` keeps the CLI alive when stdin is closed, as it is in the detached container.
      const child = spawn(
        "bun",
        [
          "x",
          "@tailwindcss/cli",
          "-i",
          "./src/routes/styles.css",
          "-o",
          "./public/styles.css",
          "--minify",
          "--watch",
          "always",
        ],
        // On POSIX, detached makes the CLI a process-group leader so killTree can signal the group.
        // On Windows it would open a separate console and hide the CLI's output; taskkill /T covers the tree.
        { detached: process.platform !== "win32", stdio: "inherit" },
      );

      if (child.pid === undefined) {
        throw new Error("Failed to spawn the Tailwind CSS watcher");
      }

      const pid = child.pid;
      globals.tailwindWatcherPid = pid;
      process.once("exit", () => {
        killTree(pid);
      });
    },
  };
}

export default defineConfig(({ command }) => {
  return {
    envDir: "./envs",
    plugins: [
      tanstackStart({
        importProtection: {
          // Always error, even in dev
          behavior: "error",
        },
      }),
      tailwindcss(),
      tailwindCssFile(),
      viteReact({ compiler: true }),
      // Nitro's dev worker fails every SSR request with "socket hang up" when Vite runs on Bun, so only the build uses it.
      command === "build" && nitro({ preset: "bun" }),
    ],
    resolve: {
      tsconfigPaths: true,
    },
    server: {
      host: "0.0.0.0",
      strictPort: true,
      watch: {
        // Chokidar matches against absolute paths, so relative globs never match. envs/*/ keeps envs/.env.* watched.
        ignored: ["**/envs/*/**", "**/ignore/**", "**/routeTree.gen.ts", "**/public/styles.css"],
      },
      allowedHosts: [".resanorp"],
    },
    optimizeDeps: {
      include: [
        "@tanstack/router-core",
        "@tanstack/router-core/ssr/client",
        "@tanstack/router-core/isServer",
        "seroval",
      ],
    },
  };
});
