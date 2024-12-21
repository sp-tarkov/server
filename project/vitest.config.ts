import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        name: "spt-server",
        reporters: ["default"],
        root: "./",
        include: ["**/*.{test,spec}.?(c|m)[jt]s?(x)"],
        cache: { dir: "./tests/__cache__" },
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
        alias: {
            "@spt": fileURLToPath(new URL("src", import.meta.url)),
            "@tests": fileURLToPath(new URL("tests", import.meta.url)),
        },
    },
});
