import fs from "node:fs/promises";
import path from "node:path";
import { header } from "@build/util/log";
import { streamToString } from "@build/util/streamToString";
import { spawn } from "bun";

/**
 * Asynchronously writes build information to a JSON file.
 */
export const buildInfo = async () => {
    header("Writing build data");

    try {
        // Fetch the latest Git commit hash
        const gitResult = spawn(["git", "rev-parse", "HEAD"], { stdout: "pipe", stderr: "pipe" });
        const gitResultExited = await gitResult.exited;
        if (gitResultExited !== 0) {
            const stderr = await streamToString(gitResult.stderr);
            console.error("Error getting Git commit hash:", stderr);
            throw new Error(`Failed to get Git commit hash: ${stderr || "unknown"}`);
        }
        const commitHash = await streamToString(gitResult.stdout);

        // Update core.json
        const coreJSONPath = path.normalize("./dist/SPT_Data/Server/configs/core.json");
        try {
            await fs.access(coreJSONPath); // Check if file exists
        } catch (error) {
            console.error(`The core.json could not be found at ${coreJSONPath}`);
            throw error;
        }

        const coreJSON = await fs.readFile(coreJSONPath, "utf8");
        const coreParsed = JSON.parse(coreJSON);

        console.log("Writing build data to build.json");
        const buildJsonPath = path.normalize("./dist/src/ide/build.json");
        await fs.mkdir(path.dirname(buildJsonPath), { recursive: true });
        const buildInfo = {
            commit: commitHash,
            buildTime: Date.now(),
            sptVersion: coreParsed.sptVersion,
        };
        await fs.writeFile(buildJsonPath, JSON.stringify(buildInfo, null, 4));
    } catch (error) {
        console.error("Error writing build data to JSON:", error);
        throw error;
    }
};
