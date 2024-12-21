import path from "node:path";
import { buildInfo } from "@build/task/buildInfo";
import { cleanPost, cleanPre } from "@build/task/clean";
import { compile, updateExecutable } from "@build/task/compile";
import { copy } from "@build/task/copy";
import { hashFile } from "@build/task/hashFile";
import { getBuildOptions } from "@build/util/getBuildOptions";
import { header } from "@build/util/log";
import { BunTimer } from "@spt/utils/BunTimer";

/**
 * Executes the build process for the specified packaging type.
 *
 * @param type - The type of packaging to build, which is a key of the `entries` object.
 */
const runBuild = async (type: keyof typeof entries) => {
    header(`Running build ${type}`);

    const timer = new BunTimer();

    await cleanPre();
    await copy();
    await buildInfo();
    await hashFile();
    await compile(entries[type]);
    await updateExecutable();
    await cleanPost();

    const times = timer.finish();
    header(`Finished build in ${times.sec.toFixed(2)} seconds`);
};

/**
 * Starts the built executable for the server.
 */
const startBuild = () => {
    header("Starting built executable");
    try {
        const executable = path.resolve(`./dist/Server${options.platform === "win32" ? ".exe" : ""}`);
        console.log(`Executable location: ${executable}\nOutput:\n`);
        Bun.spawn([executable], {
            cwd: path.resolve("./dist"),
            stdin: "inherit",
            stdout: "inherit",
            stderr: "inherit",
        });
    } catch (error) {
        console.error("Error starting server:", error);
    }
};

// Resolve build options.
const options = getBuildOptions(process.argv);
export const arch = options.arch;
export const platform = options.platform;

// Define entry points for the different build types.
const entries: { [key: string]: string } = {
    release: "release.ts",
    debug: "debug.ts",
    bleeding: "bleedingEdge.ts",
    bleedingMods: "bleedingEdgeMods.ts",
};

// Engage!
await runBuild(options.type);
if (options.start) {
    startBuild();
}
