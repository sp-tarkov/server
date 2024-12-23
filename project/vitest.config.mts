import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
    cacheDir: "./tests/__cache__",
    test: {
        name: "spt-server",
        reporters: ["default"],
        root: "./",
        include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
        environment: "./tests/CustomEnvironment.ts",
        globals: true,
        coverage: {
            provider: "istanbul",
            reporter: ["text", "html"],
            reportsDirectory: "./tests/__coverage__",
            reportOnFailure: true,
            all: true,
            include: ["src"],
            exclude: ["src/models/**", "tests/**"],
        },
        pool: "threads",
        poolOptions: { threads: { singleThread: true, isolate: false } },
        alias: { "@spt": path.resolve(__dirname, "src"), "@tests": path.resolve(__dirname, "tests") },
    },
});
