import fs from "node:fs/promises";
import path from "node:path";
import { header } from "@build/util/log";

/**
 * Asynchronously performs a pre-build clean operation.
 *
 * @returns A promise that resolves when the clean operation is complete.
 */
export const cleanPre = async () => {
    header("Pre-build Clean");
    try {
        await fs.rm(path.normalize("./dist/"), { recursive: true, force: true });
        console.log("Cleaned `./dist/` directory");
    } catch (error) {
        if (error instanceof Error && error.message.includes("does not exist")) {
            return;
        }
        console.error("Error running pre-build clean:", error);
    }
};

/**
 * Asynchronously performs post-compile clean-up tasks.
 *
 * @returns A promise that resolves when the clean-up tasks are complete.
 */
export const cleanPost = async () => {
    header("Post-compile Clean");
    try {
        await fs.rm(path.normalize("./dist/src"), { recursive: true, force: true });
        console.log("Removed `./dist/src` directory");

        await fs.rm(path.normalize("./dist/package.json"), { recursive: true, force: true });
        console.log("Removed `./dist/package.json` directory");
    } catch (error) {
        if (error instanceof Error && error.message.includes("does not exist")) {
            return;
        }
        console.error("Error running post-compile clean:", error);
    }
};
