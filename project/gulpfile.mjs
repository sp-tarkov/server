/* eslint-disable @typescript-eslint/naming-convention */

import gulp from "gulp";
import { exec } from "gulp-execa";
import rename from "gulp-rename";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pkg from "pkg";
import pkgfetch from "pkg-fetch";
import * as ResEdit from "resedit";
import manifest from "./package.json" assert { type: "json" };

const nodeVersion = "node18"; // As of pkg-fetch v3.5, it's v18.15.0
const stdio = "inherit";
const buildDir = "build/";
const dataDir = path.join(buildDir, "Aki_Data", "Server");
const serverExeName = "Aki.Server.exe";
const serverExe = path.join(buildDir, serverExeName);
const pkgConfig = "pkgconfig.json";
const entries = {
    release: path.join("obj", "ide", "ReleaseEntry.js"),
    debug: path.join("obj", "ide", "DebugEntry.js"),
    bleeding: path.join("obj", "ide", "BleedingEdgeEntry.js"),
};
const licenseFile = "../LICENSE.md";

/**
 * Transpiles the src files into javascript with swc
 */
const compile = async () => await exec("swc src -d obj", { stdio });

// Packaging
const fetchPackageImage = async () =>
{
    try
    {
        const output = "./.pkg-cache/v3.5";
        const fetchedPkg = await pkgfetch.need({
            arch: process.arch,
            nodeRange: nodeVersion,
            platform: process.platform,
            output,
        });
        console.log(`fetched node binary at ${fetchedPkg}`);
        const builtPkg = fetchedPkg.replace("node", "built");
        await fs.copyFile(fetchedPkg, builtPkg);
    }
    catch (e)
    {
        console.error(`Error while fetching and patching package image: ${e.message}`);
        console.error(e.stack);
    }
};

const updateBuildProperties = async () =>
{
    if (os.platform() !== "win32")
    {
        return;
    }

    const exe = ResEdit.NtExecutable.from(await fs.readFile(serverExe));
    const res = ResEdit.NtExecutableResource.from(exe);

    const iconPath = path.resolve(manifest.icon);
    const iconFile = ResEdit.Data.IconFile.from(await fs.readFile(iconPath));

    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1,
        1033,
        iconFile.icons.map((item) => item.data),
    );

    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];

    vi.setStringValues({ lang: 1033, codepage: 1200 }, {
        ProductName: manifest.author,
        FileDescription: manifest.description,
        CompanyName: manifest.name,
        LegalCopyright: manifest.license,
    });
    vi.removeStringValue({ lang: 1033, codepage: 1200 }, "OriginalFilename");
    vi.removeStringValue({ lang: 1033, codepage: 1200 }, "InternalName");
    vi.setFileVersion(...manifest.version.split(".").map(Number));
    vi.setProductVersion(...manifest.version.split(".").map(Number));
    vi.outputToResourceEntries(res.entries);
    res.outputResource(exe, true);
    await fs.writeFile(serverExe, Buffer.from(exe.generate()));
};

/**
 * Copy various asset files to the destination directory
 */
const copyAssets = () =>
    gulp.src(["assets/**/*.json", "assets/**/*.json5", "assets/**/*.png", "assets/**/*.jpg", "assets/**/*.ico"]).pipe(
        gulp.dest(dataDir),
    );

/**
 * Copy executables from node_modules
 */
const copyExecutables = () =>
    gulp.src(["node_modules/@pnpm/exe/**/*"]).pipe(gulp.dest(path.join(dataDir, "@pnpm", "exe")));

/**
 * Rename and copy the license file
 */
const copyLicense = () => gulp.src([licenseFile]).pipe(rename("LICENSE-Server.txt")).pipe(gulp.dest(buildDir));

/**
 * Writes the latest Git commit hash to the core.json configuration file.
 */
const writeCommitHashToCoreJSON = async () =>
{
    try
    {
        const coreJSONPath = path.resolve(dataDir, "configs", "core.json");
        const coreJSON = await fs.readFile(coreJSONPath, "utf8");
        const parsed = JSON.parse(coreJSON);

        // Fetch the latest Git commit hash
        const gitResult = await exec("git rev-parse HEAD", { stdout: "pipe" });

        // Update the commit hash in the core.json object
        parsed.commit = gitResult.stdout.trim() || "";

        // Add build timestamp
        parsed.buildTime = new Date().getTime();

        // Write the updated object back to core.json
        await fs.writeFile(coreJSONPath, JSON.stringify(parsed, null, 4));
    }
    catch (error)
    {
        throw new Error(`Failed to write commit hash to core.json: ${error.message}`);
    }
};

/**
 * Create a hash file for asset checks
 */
const createHashFile = async () =>
{
    const hashFileDir = path.resolve(dataDir, "checks.dat");
    const assetData = await loadRecursiveAsync("assets/");
    const assetDataString = Buffer.from(JSON.stringify(assetData), "utf-8").toString("base64");
    await fs.writeFile(hashFileDir, assetDataString);
};

// Combine all tasks into addAssets
const addAssets = gulp.series(copyAssets, copyExecutables, copyLicense, writeCommitHashToCoreJSON, createHashFile);

/**
 * Cleans the build directory.
 */
const cleanBuild = async () => await fs.rm(buildDir, { recursive: true, force: true });

/**
 * Cleans the transpiled javascript directory.
 */
const cleanCompiled = async () => await fs.rm("./obj", { recursive: true, force: true });

/**
 * Recursively builds an array of paths for json files.
 *
 * @param {fs.PathLike} dir
 * @param {string[]} files
 * @returns {Promise<string[]>}
 */
const getJSONFiles = async (dir, files = []) =>
{
    const fileList = await fs.readdir(dir);
    for (const file of fileList)
    {
        const name = path.resolve(dir, file);
        if ((await fs.stat(name)).isDirectory())
        {
            getJSONFiles(name, files);
        }
        else if (name.slice(-5) === ".json")
        {
            files.push(name);
        }
    }
    return files;
};

/**
 * Goes through every json file in assets and makes sure they're valid json.
 */
const validateJSONs = async () =>
{
    const assetsPath = path.resolve("assets");
    const jsonFileList = await getJSONFiles(assetsPath);
    let jsonFileInProcess = "";
    try
    {
        for (const jsonFile of jsonFileList)
        {
            jsonFileInProcess = jsonFile;
            JSON.parse(await fs.readFile(jsonFile));
        }
    }
    catch (error)
    {
        throw new Error(`${error.message} | ${jsonFileInProcess}`);
    }
};

/**
 * Hash helper function
 *
 * @param {crypto.BinaryLike} data
 * @returns {string}
 */
const generateHashForData = (data) =>
{
    const hashSum = crypto.createHash("sha1");
    hashSum.update(data);
    return hashSum.digest("hex");
};

/**
 * Loader to recursively find all json files in a folder
 *
 * @param {fs.PathLike} filepath
 * @returns {}
 */
const loadRecursiveAsync = async (filepath) =>
{
    const result = {};

    const filesList = await fs.readdir(filepath);

    for (const file of filesList)
    {
        const curPath = path.parse(path.join(filepath, file));
        if ((await fs.stat(path.join(curPath.dir, curPath.base))).isDirectory())
        {
            result[curPath.name] = loadRecursiveAsync(`${filepath}${file}/`);
        }
        else if (curPath.ext === ".json")
        {
            result[curPath.name] = generateHashForData(await fs.readFile(`${filepath}${file}`));
        }
    }

    // set all loadRecursive to be executed asynchronously
    const resEntries = Object.entries(result);
    const resResolved = await Promise.all(resEntries.map((ent) => ent[1]));
    for (let resIdx = 0; resIdx < resResolved.length; resIdx++)
    {
        resEntries[resIdx][1] = resResolved[resIdx];
    }

    // return the result of all async fetch
    return Object.fromEntries(resEntries);
};

// Main Tasks Generation
const build = (packagingType) =>
{
    const anonPackaging = () => packaging(entries[packagingType]);
    anonPackaging.displayName = `packaging-${packagingType}`;
    const tasks = [
        cleanBuild,
        validateJSONs,
        compile,
        fetchPackageImage,
        anonPackaging,
        addAssets,
        updateBuildProperties,
        cleanCompiled,
    ];
    return gulp.series(tasks);
};

// Packaging Arguments
const packaging = async (entry) =>
{
    const target = `${nodeVersion}-${process.platform}-${process.arch}`;
    try
    {
        await pkg.exec([
            entry,
            "--compress",
            "GZip",
            "--target",
            target,
            "--output",
            serverExe,
            "--config",
            pkgConfig,
            "--public",
        ]);
    }
    catch (error)
    {
        console.error(`Error occurred during packaging: ${error}`);
    }
};

gulp.task("build:debug", build("debug"));
gulp.task("build:release", build("release"));
gulp.task("build:bleeding", build("bleeding"));

gulp.task("run:build", async () => await exec("Aki.Server.exe", { stdio, cwd: buildDir }));
gulp.task(
    "run:debug",
    async () => await exec("ts-node-dev -r tsconfig-paths/register src/ide/TestEntry.ts", { stdio }),
);
gulp.task("run:profiler", async () =>
{
    await cleanCompiled();
    await compile();
    await exec("node --prof --inspect --trace-warnings obj/ide/TestEntry.js", { stdio });
});
