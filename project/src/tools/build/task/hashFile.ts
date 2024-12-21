import crypto from "node:crypto";
import type { PathLike } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { header } from "@build/util/log";

/**
 * Generates a SHA-1 hash for the given data.
 *
 * @param data - The data to hash. It can be a string, Buffer, TypedArray, DataView, or other binary-like object.
 * @returns The SHA-1 hash of the data as a hexadecimal string.
 */
const generateHashForData = (data: crypto.BinaryLike): string => {
    const hashSum = crypto.createHash("sha1");
    hashSum.update(data);
    return hashSum.digest("hex");
};

/**
 * Normalize key paths to ensure consistency in how they were generated. Validation keys are are relative paths
 * from the `assets` directory, normalized, no leading slash, forward slashes, and include the file extension.
 * Example: `database/locations/sandbox/base.json`
 *
 * @param keyPath - The path that is being used for a validation check that needs to be normalized.
 */
const normalizeKeyPath = (keyPath: string): string => {
    const assetsPath = path.normalize("./assets/").replace(/\\/g, "/");
    return path.normalize(keyPath).replace(/\\/g, "/").replace(assetsPath, "");
};

/**
 * Recursively loads files from a given directory and generates a hash for each JSON file.
 *
 * @param filepath - The path to the directory to load files from.
 * @returns A promise that resolves to an object containing the hashed data of JSON files.
 */
async function loadPathsAsync(rootPath: string): Promise<{ [key: string]: string }> {
    const result: { [key: string]: string } = {};
    const queue: string[] = [rootPath];

    while (queue.length > 0) {
        const currentPath = queue.pop();
        if (!currentPath) {
            continue;
        }
        const filesList = await fs.readdir(currentPath);

        for (const file of filesList) {
            const filePath = path.join(currentPath, file);
            const stats = await fs.stat(filePath);
            if (stats.isDirectory()) {
                queue.push(filePath);
            } else if (path.extname(file) === ".json") {
                const fileContent = await fs.readFile(filePath);
                const relativePathKey = normalizeKeyPath(filePath);
                result[relativePathKey] = generateHashForData(fileContent);
            }
        }
    }

    return result;
}

/**
 * Asynchronously creates a verification file named `checks.dat` in the specified directory.
 */
export const hashFile = async () => {
    header("Creating verification file");

    try {
        const hashFileDir = path.normalize("./dist/SPT_Data/Server/checks.dat");
        const assetData = await loadPathsAsync("./assets");
        const assetDataString = Buffer.from(JSON.stringify(assetData), "utf-8").toString("base64");

        await fs.writeFile(hashFileDir, assetDataString);
        console.log("Created `checks.dat` verification file");
    } catch (error) {
        console.error("Error creating `checks.dat` file:", error);
        throw error;
    }
};
