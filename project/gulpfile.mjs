import { spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import pkg from "@yao-pkg/pkg";
import pkgfetch from "@yao-pkg/pkg-fetch";
import fs from "fs-extra";
import gulp from "gulp";
import decompress from "gulp-decompress";
import download from "gulp-download";
import { exec } from "gulp-execa";
import rename from "gulp-rename";
import minimist from "minimist";
import * as ResEdit from "resedit";

// Load the package.json file
const manifest = JSON.parse(fs.readFileSync("./package.json", "utf8"));

// Accept command line arguments for arch and platform
const knownOptions = { string: ["arch", "platform"], default: { arch: process.arch, platform: process.platform } };
const options = minimist(process.argv.slice(2), knownOptions);
const targetArch = options.arch;
const targetPlatform = options.platform;
console.log(`target arch: ${targetArch}, target platform: ${targetPlatform}`);

const nodeVersion = "node22"; // As of @yao-pkg/pkg-fetch@3.5.18, it's Node 22.12.0
const stdio = "inherit";
const buildDir = "build/";
const dataDir = path.join(buildDir, "SPT_Data", "Server");
const serverExeName = "SPT.Server.exe";
const serverExe = path.join(buildDir, serverExeName);
const pkgConfig = "pkgconfig.json";
const entries = {
    release: "RELEASE",
    debug: "DEBUG",
    bleeding: "BLEEDING_EDGE",
    bleedingmods: "BLEEDING_EDGE_MODS",
};
const licenseFile = "../LICENSE.md";

// Modules to transpile
const backupDir = path.resolve("backup_modules");
const transpiledDir = path.resolve("transpiled_modules");
const modulesToTranspile = [
    "@messageformat/date-skeleton/lib/get-date-formatter.js",
    "@messageformat/date-skeleton/lib/index.js",
    "@messageformat/date-skeleton/lib/options.js",
    "@messageformat/date-skeleton/lib/tokens.js",
    "@messageformat/number-skeleton/lib/errors.js",
    "@messageformat/number-skeleton/lib/get-formatter.js",
    "@messageformat/number-skeleton/lib/index.js",
    "@messageformat/number-skeleton/lib/numberformat/locales.js",
    "@messageformat/number-skeleton/lib/numberformat/modifier.js",
    "@messageformat/number-skeleton/lib/numberformat/options.js",
    "@messageformat/number-skeleton/lib/parse-pattern.js",
    "@messageformat/number-skeleton/lib/parse-skeleton.js",
    "@messageformat/number-skeleton/lib/pattern-parser/affix-tokens.js",
    "@messageformat/number-skeleton/lib/pattern-parser/number-as-skeleton.js",
    "@messageformat/number-skeleton/lib/pattern-parser/number-tokens.js",
    "@messageformat/number-skeleton/lib/pattern-parser/parse-tokens.js",
    "@messageformat/number-skeleton/lib/skeleton-parser/options.js",
    "@messageformat/number-skeleton/lib/skeleton-parser/parse-precision-blueprint.js",
    "@messageformat/number-skeleton/lib/skeleton-parser/token-parser.js",
    "@messageformat/number-skeleton/lib/types/skeleton.js",
    "@messageformat/number-skeleton/lib/types/unit.js",
    "atomically/dist/constants.js",
    "atomically/dist/index.js",
    "atomically/dist/utils/lang.js",
    "atomically/dist/utils/scheduler.js",
    "atomically/dist/utils/temp.js",
    "stubborn-fs/dist/attemptify.js",
    "stubborn-fs/dist/constants.js",
    "stubborn-fs/dist/handlers.js",
    "stubborn-fs/dist/index.js",
    "stubborn-fs/dist/retryify.js",
    "stubborn-fs/dist/retryify_queue.js",
    "when-exit/dist/node/constants.js",
    "when-exit/dist/node/index.js",
    "when-exit/dist/node/interceptor.js",
    "when-exit/dist/node/signals.js",
];

/**
 * Runs a shell command with spawn, wrapping it in a Promise for async/await usage.
 */
const runCommand = (command, args, options = {}) => {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, { shell: true, ...options });

        process.stdout.on("data", (data) => {
            const message = data.toString().trim();
            if (message) console.log(message);
        });

        process.stderr.on("data", (data) => {
            const message = data.toString().trim();
            if (message) console.error(message);
        });

        process.on("exit", (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${command} exited with code ${code}`));
            }
        });

        process.on("error", reject);
    });
};

const transpileModules = async () => {
    await fs.ensureDir(backupDir);
    await fs.ensureDir(transpiledDir);

    for (const modulePath of modulesToTranspile) {
        // Resolve the path of the module
        const resolvedPath = path.resolve("node_modules", modulePath);
        const relativeModulePath = modulePath.replace(/\//g, path.sep); // Normalize for platform-specific paths
        const backupPath = path.join(backupDir, relativeModulePath);
        const outputPath = path.join(transpiledDir, relativeModulePath);

        // Backup the original file
        await fs.ensureDir(path.dirname(backupPath));
        await fs.copy(resolvedPath, backupPath, { overwrite: true });
        console.log(`Backed up: ${path.basename(resolvedPath)}`);

        // Ensure the output directory exists
        await fs.ensureDir(path.dirname(outputPath));

        // Transpile the module
        try {
            await runCommand("npx", ["swc", resolvedPath, "-o", outputPath, "--config-file", ".swcrc"]);
            console.log(`Successfully transpiled: ${resolvedPath}`);
        } catch (error) {
            console.error(`Error transpiling module: ${resolvedPath}`);
            throw error;
        }

        // Replace the original file with the transpiled version
        await fs.copy(outputPath, resolvedPath, { overwrite: true });
        console.log(`Replaced original module: ${path.basename(resolvedPath)} with transpiled version.\n`);
    }
};

const restoreModules = async () => {
    for (const modulePath of modulesToTranspile) {
        // Resolve the path of the module
        const resolvedPath = path.resolve("node_modules", modulePath);
        const relativeModulePath = modulePath.replace(/\//g, path.sep); // Normalize for platform-specific paths
        const backupPath = path.join(backupDir, relativeModulePath);

        // Restore the original file
        if (await fs.pathExists(backupPath)) {
            await fs.copy(backupPath, resolvedPath, { overwrite: true });
            console.log(`Restored original module: ${path.basename(resolvedPath)}`);
        }
    }

    // Clean up backup directory after restoration
    await fs.remove(backupDir);
    await fs.remove(transpiledDir);
    console.log("Backup directory removed.");
};

/**
 * Transpile src files into Javascript with SWC
 */
const compile = async () => {
    // Compile TypeScript files using SWC
    try {
        await runCommand("npx", ["swc", "src", "-d", "obj", "--config-file", ".swcrc"]);
    } catch (error) {
        console.error("Error transpiling source:");
        throw error;
    }

    // Merge the contents from the /obj/src directory into /obj
    const srcDir = path.join("obj", "src");
    const destDir = path.join("obj");

    try {
        const entities = await fs.readdir(srcDir);
        for (const entity of entities) {
            const srcPath = path.join(srcDir, entity);
            const destPath = path.join(destDir, entity);
            await fs.move(srcPath, destPath, { overwrite: true });
        }
        // After moving all contents, remove the now-empty /obj/src directory
        await fs.remove(srcDir);
    } catch (error) {
        console.error("An error occurred during the merge operation:", error);
    }
};

// Packaging
const fetchPackageImage = async () => {
    try {
        const output = "./.pkg-cache/v3.5";
        const fetchedPkg = await pkgfetch.need({
            arch: targetArch,
            nodeRange: nodeVersion,
            platform: targetPlatform,
            output,
        });
        console.log(`fetched node binary at ${fetchedPkg}`);
        const builtPkg = fetchedPkg.replace("node", "built");
        await fs.copyFile(fetchedPkg, builtPkg);
    } catch (e) {
        console.error(`Error while fetching and patching package image: ${e.message}`);
        console.error(e.stack);
    }
};

const updateBuildProperties = async () => {
    if (targetPlatform !== "win32") {
        // can't modify executable's resource on non-windows build
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

    vi.setStringValues(
        { lang: 1033, codepage: 1200 },
        {
            ProductName: manifest.author,
            FileDescription: manifest.description,
            CompanyName: manifest.name,
            LegalCopyright: manifest.license,
        },
    );
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
    gulp
        .src(["assets/**/*.json", "assets/**/*.json5", "assets/**/*.png", "assets/**/*.jpg", "assets/**/*.ico"], {
            encoding: false,
        })
        .pipe(gulp.dest(dataDir));

/**
 * Download pnpm executable
 */
const downloadPnpm = async () => {
    // Please ensure that the @pnpm/exe version in devDependencies is pinned to a specific version. If it's not, the
    // following task will download *all* versions that are compatible with the semver range specified.
    const pnpmVersion = manifest.devDependencies["@pnpm/exe"];
    const pnpmPackageName = `@pnpm/${targetPlatform === "win32" ? "win" : targetPlatform}-${targetArch}`;
    const npmResult = await exec(`npm view ${pnpmPackageName}@${pnpmVersion} dist.tarball`, { stdout: "pipe" });
    const pnpmLink = npmResult.stdout.trim();
    console.log(`Downloading pnpm binary from ${pnpmLink}`);
    download(pnpmLink)
        .pipe(decompress({ strip: 1 }))
        .pipe(gulp.dest(path.join(dataDir, "@pnpm", "exe")));
};

/**
 * Rename and copy the license file
 */
const copyLicense = () => gulp.src([licenseFile]).pipe(rename("LICENSE-Server.txt")).pipe(gulp.dest(buildDir));

/**
 * Writes the latest build data to the core.json and build.json configuration files.
 */
const writeBuildDataToJSON = async (entryType) => {
    try {
        // Fetch the latest Git commit hash
        const gitResult = await exec("git rev-parse HEAD", { stdout: "pipe" });

        // Update core.json
        const coreJSONPath = path.resolve(dataDir, "configs", "core.json");
        const coreJSON = await fs.readFile(coreJSONPath, "utf8");
        const coreParsed = JSON.parse(coreJSON);

        coreParsed.commit = gitResult.stdout.trim() || "";
        coreParsed.buildTime = new Date().getTime();
        await fs.writeFile(coreJSONPath, JSON.stringify(coreParsed, null, 4));

        // Write build.json
        const buildJsonPath = path.join("obj", "entry", "build.json");

        const buildInfo = {};
        buildInfo.entryType = entryType;
        buildInfo.expectedNode = manifest?.engines?.node ?? "";
        buildInfo.sptVersion = coreParsed.sptVersion;
        buildInfo.commit = coreParsed.commit;
        buildInfo.buildTime = coreParsed.buildTime;
        await fs.writeFile(buildJsonPath, JSON.stringify(buildInfo, null, 4));
    } catch (error) {
        throw new Error(`Failed to write commit hash to core.json: ${error.message}`);
    }
};

/**
 * Create a hash file for asset checks
 */
const createHashFile = async () => {
    const hashFileDir = path.resolve(dataDir, "checks.dat");
    const assetData = await loadRecursiveAsync("assets/");
    const assetDataString = Buffer.from(JSON.stringify(assetData), "utf-8").toString("base64");
    await fs.writeFile(hashFileDir, assetDataString);
};

// Combine all tasks into addAssets
const addAssets = (entryType) =>
    gulp.series(copyAssets, downloadPnpm, copyLicense, () => writeBuildDataToJSON(entryType), createHashFile);

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
const getJSONFiles = async (dir, files = []) => {
    const fileList = await fs.readdir(dir);
    for (const file of fileList) {
        const name = path.resolve(dir, file);
        if ((await fs.stat(name)).isDirectory()) {
            getJSONFiles(name, files);
        } else if (name.slice(-5) === ".json") {
            files.push(name);
        }
    }
    return files;
};

/**
 * Goes through every json file in assets and makes sure they're valid json.
 */
const validateJSONs = async () => {
    const assetsPath = path.resolve("assets");
    const jsonFileList = await getJSONFiles(assetsPath);
    let jsonFileInProcess = "";
    try {
        for (const jsonFile of jsonFileList) {
            jsonFileInProcess = jsonFile;
            JSON.parse(await fs.readFile(jsonFile));
        }
    } catch (error) {
        throw new Error(`${error.message} | ${jsonFileInProcess}`);
    }
};

/**
 * Hash helper function
 *
 * @param {crypto.BinaryLike} data
 * @returns {string}
 */
const generateHashForData = (data) => {
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
const loadRecursiveAsync = async (filepath) => {
    const result = {};

    const filesList = await fs.readdir(filepath);

    for (const file of filesList) {
        const curPath = path.parse(path.join(filepath, file));
        if ((await fs.stat(path.join(curPath.dir, curPath.base))).isDirectory()) {
            result[curPath.name] = loadRecursiveAsync(`${filepath}${file}/`);
        } else if (curPath.ext === ".json") {
            result[curPath.name] = generateHashForData(await fs.readFile(`${filepath}${file}`));
        }
    }

    // set all loadRecursive to be executed asynchronously
    const resEntries = Object.entries(result);
    const resResolved = await Promise.all(resEntries.map((ent) => ent[1]));
    for (let resIdx = 0; resIdx < resResolved.length; resIdx++) {
        resEntries[resIdx][1] = resResolved[resIdx];
    }

    // return the result of all async fetch
    return Object.fromEntries(resEntries);
};

// Main Tasks Generation
const build = (entryType) => {
    const anonPackaging = () => packaging(entries[entryType]);
    anonPackaging.displayName = `packaging-${entryType}`;
    const tasks = [
        cleanBuild,
        validateJSONs,
        transpileModules,
        compile,
        addAssets(entries[entryType]),
        fetchPackageImage,
        anonPackaging,
        updateBuildProperties,
        cleanCompiled,
        restoreModules,
    ];
    return gulp.series(tasks);
};

// Packaging Arguments
const packaging = async (entryType) => {
    const target = `${nodeVersion}-${targetPlatform}-${targetArch}`;
    try {
        await pkg.exec([
            path.join("obj", "entry", "run.js"),
            "--compress",
            "GZip",
            "--target",
            target,
            "--output",
            serverExe,
            "--config",
            pkgConfig,
            '--public-packages "*"',
        ]);
    } catch (error) {
        console.error(`Error occurred during packaging: ${error}`);
    }
};

gulp.task("build:debug", build("debug"));
gulp.task("build:release", build("release"));
gulp.task("build:bleeding", build("bleeding"));
gulp.task("build:bleedingmods", build("bleedingmods"));

gulp.task("run:build", async () => await exec(serverExeName, { stdio, cwd: buildDir }));
gulp.task("run:profiler", async () => {
    await cleanCompiled();
    await compile();
    await exec("node --prof --inspect --trace-warnings obj/entry/run.js", { stdio });
});
