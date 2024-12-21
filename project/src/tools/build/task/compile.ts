import fs from "node:fs/promises";
import path from "node:path";
import { platform } from "@build/project";
import { header } from "@build/util/log";
import { streamToString } from "@build/util/streamToString";
import manifest from "@project/package.json" assert { type: "json" };
import { spawn } from "bun";
import * as ResEdit from "resedit";

/**
 * Compiles an executable from the given entry point.
 *
 * @param entryPoint - The entry point file to compile.
 * @returns A promise that resolves when the compilation is complete.
 */
export const compile = async (entryPoint: string) => {
    header("Compiling executable");

    try {
        const absoluteEntryPoint = path.join("./dist/src/ide", entryPoint);
        const outfile = path.resolve("./dist/Server");
        const bunBuildArgs = ["bun", "build", "--compile", "--sourcemap", absoluteEntryPoint, "--outfile", outfile];

        const buildProcess = spawn(bunBuildArgs, {
            stdout: "pipe",
            stderr: "pipe",
        });
        const buildResult = await buildProcess.exited;
        if (buildResult !== 0) {
            const stderr = await streamToString(buildProcess.stderr);
            throw new Error(`Compilation failed: ${stderr || "unknown"}`);
        }

        console.log("Executable built successfully!");
    } catch (error) {
        console.error("Error building executable:", error);
        throw error;
    }
};

/**
 * Updates the properties of the executable file for the server.
 */
export const updateExecutable = async () => {
    if (platform !== "win32") {
        // Can't modify non-Windows executables
        return;
    }

    header("Updating executable properties");

    const serverExePath = path.resolve("./dist/Server.exe");

    try {
        const serverExeBuffer = await fs.readFile(serverExePath);
        const exe = ResEdit.NtExecutable.from(serverExeBuffer);
        const res = ResEdit.NtExecutableResource.from(exe);

        const iconPath = path.resolve(manifest.icon);
        const iconFileBuffer = await fs.readFile(iconPath);
        const iconFile = ResEdit.Data.IconFile.from(iconFileBuffer);

        ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
            res.entries,
            1, // Resource ID (main icon)
            1033, // Language ID (English (US))
            iconFile.icons.map((item) => item.data), // Icon data
        );
        console.log("Embeded icon into executable");

        let versionInfo = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
        if (!versionInfo) {
            versionInfo = ResEdit.Resource.VersionInfo.createEmpty();
        }

        versionInfo.setStringValues(
            // Lang 1033 is 'en-US', Codepage 1200 is the default
            { lang: 1033, codepage: 1200 },
            {
                ProductName: manifest.author,
                FileDescription: manifest.description,
                CompanyName: manifest.name,
                LegalCopyright: manifest.license,
            },
        );

        // Remove unnecessary strings
        versionInfo.removeStringValue({ lang: 1033, codepage: 1200 }, "OriginalFilename");
        versionInfo.removeStringValue({ lang: 1033, codepage: 1200 }, "InternalName");

        // Set version information numbers
        const versionNumbers = manifest.version.split(".").map(Number) as [number, number, number, number?];
        versionInfo.setFileVersion(...versionNumbers);
        versionInfo.setProductVersion(...versionNumbers);

        // Update resource entries and write back to the executable
        versionInfo.outputToResourceEntries(res.entries);
        console.log("Updated version information properties");

        res.outputResource(exe, false);
        await fs.writeFile(serverExePath, Buffer.from(exe.generate()));
    } catch (error) {
        console.error("Error updating executable:", error);
        throw error;
    }

    console.log("Executable updated successfully");
};
