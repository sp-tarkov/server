import fs from "node:fs/promises";
import path from "node:path";
import { header } from "@build/util/log";

type FileInfo = {
    src: string;
    dest: string;
};

/**
 * Recursively copies files and directories from the source path to the destination path.
 *
 * @param src - The source directory path to copy from.
 * @param dest - The destination directory path to copy to.
 */
async function copyRecursive(src: string, dest: string) {
    const { readdir, stat, mkdir, copyFile } = fs;

    // Ensure destination directory exists.
    try {
        await mkdir(dest, { recursive: true });
    } catch (e: unknown) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") {
            throw e;
        }
    }

    const entries = await readdir(src);
    for (const entry of entries) {
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        const stats = await stat(srcPath);

        if (stats.isDirectory()) {
            await copyRecursive(srcPath, destPath);
        } else {
            await copyFile(srcPath, destPath);
        }
    }
}

/**
 * Finds the root directory of the project by traversing up the directory hierarchy until it finds a directory named
 * "project". Once found, it returns the path to the "dist" directory within the project root.
 *
 * @returns The path to the "dist" directory within the project root.
 */
const findProjectRoot = (): string => {
    let projectRoot = path.resolve(__dirname);
    while (path.basename(projectRoot) !== "project") {
        projectRoot = path.dirname(projectRoot);
        if (projectRoot === path.dirname(projectRoot)) {
            throw new Error("Could not find 'project' directory in the path hierarchy.");
        }
    }
    return path.normalize(projectRoot);
};

/**
 * Copies specified files and directories to the './dist/' directory.
 */
export const copy = async () => {
    header(`Copying files to './dist/' directory`);

    const projectRoot = findProjectRoot();
    const destRoot = path.join(projectRoot, "dist");
    try {
        const itemsToCopy: FileInfo[] = [
            { src: "./assets", dest: "/SPT_Data/Server" },
            { src: "./src", dest: "/src" },
            { src: "./package.json", dest: "/package.json" },
            { src: "../LICENSE.md", dest: "/LICENSE-Server.md" },
        ];

        for (const item of itemsToCopy) {
            console.log(`Copying \`${item.src}\` to \`${item.dest}\``);
            const normalizedSrc = path.join(projectRoot, path.normalize(item.src));
            const normalizedDest = path.join(destRoot, item.dest);
            try {
                const srcStat = await fs.stat(normalizedSrc);
                if (srcStat.isDirectory()) {
                    await copyRecursive(normalizedSrc, normalizedDest);
                } else {
                    await fs.mkdir(path.dirname(normalizedDest), { recursive: true });
                    await fs.copyFile(normalizedSrc, normalizedDest);
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === "ENOENT") {
                    console.error(`File not found: ${normalizedSrc}`);
                } else {
                    throw error;
                }
            }
        }

        console.log("Files copied to `./dist/`");
    } catch (error) {
        console.error("Error copying files:", error);
    }
};
