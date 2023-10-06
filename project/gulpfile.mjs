/* eslint-disable @typescript-eslint/naming-convention */

import crypto from "crypto";
import { deleteSync } from "del";
import fs from "fs-extra";
import gulp from "gulp";
import { exec } from "gulp-execa";
import rename from "gulp-rename";
import path from "path";
import pkg from "pkg";
import pkgfetch from "pkg-fetch";
import rcedit from "rcedit";
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
    bleeding: path.join("obj", "ide", "BleedingEdgeEntry.js")
};
const licenseFile = "../LICENSE.md";
const rceditOptions = {
    icon: manifest.icon,
    "product-version": manifest.version,
    "file-version": manifest.version,
    "version-string": {
        ProductName: manifest.name,
        CompanyName: manifest.author,
        LegalCopyright: licenseFile,
        OriginalFilename: serverExeName,
        InternalFilename: "Aki.Server",
        FileDescription: manifest.description
    }
};

// Compilation
const compileTest = async () => exec("swc src -d obj", { stdio });

// Packaging
const fetchAndPatchPackageImage = async () =>
{
    try
    {
        const output = "./.pkg-cache/v3.5";
        const fetchedPkg = await pkgfetch.need({ arch: process.arch, nodeRange: nodeVersion, platform: process.platform, output });
        console.log(`fetched node binary at ${fetchedPkg}`);
        const builtPkg = fetchedPkg.replace("node", "built");
        await fs.copyFile(fetchedPkg, builtPkg);
        if (process.platform === "win32" || process.platform === "win64") 
        {
            await exec(`dir ${output}`, {
                stdio
            });
        }
        else 
        {
            await exec(`ls ${output}`, {
                stdio
            });
        }
        await rcedit(builtPkg, rceditOptions);
    }
    catch (e)
    {
        console.error(e);
    }
};

// Assets
const addAssets = async (cb) =>
{
    await gulp.src(["assets/**/*.json", "assets/**/*.json5", "assets/**/*.png", "assets/**/*.jpg", "assets/**/*.ico"]).pipe(gulp.dest(dataDir));
    await gulp.src(["node_modules/@pnpm/exe/**/*"]).pipe(gulp.dest(`${dataDir}\\@pnpm\\exe`));
    await gulp.src([licenseFile]).pipe(rename("LICENSE-Server.txt")).pipe(gulp.dest(buildDir));
    // Write dynamic hashed of asset files for the build 
    const hashFileDir = path.resolve(dataDir, "checks.dat");
    await fs.createFile(hashFileDir);
    await fs.writeFile(hashFileDir, Buffer.from(JSON.stringify(await loadRecursiveAsync("assets/")), "utf-8").toString("base64"));
    cb();
};

// Cleanup
const clean = (cb) =>
{
    deleteSync(buildDir, { force: true });
    cb();
};
const removeCompiled = async () => fs.rmSync("./obj", { recursive: true, force: true });

// JSON Validation
function getJSONFiles(dir, files = []) 
{
    const fileList = fs.readdirSync(dir);
    for (const file of fileList) 
    {
        const name = path.resolve(dir,file);
        if (fs.statSync(name).isDirectory()) 
        {
            getJSONFiles(name, files); 
        }
        else if (name.slice(-5) === ".json")
        {
            files.push(name);
        }
    }
    return files;
}
  
const validateJSONs = (cb) => 
{
    const assetsPath = path.resolve("assets");
    const jsonFileList = getJSONFiles(assetsPath);
    let jsonFileInProcess = "";
    try 
    {
        jsonFileList.forEach((jsonFile) => 
        {
            jsonFileInProcess = jsonFile;
            const jsonString = fs.readFileSync(jsonFile).toString();
            JSON.parse(jsonString);
        });
        cb();
    }
    catch (error) 
    {
        throw new Error(`${error.message} | ${jsonFileInProcess}`);
    }
};

// Versioning
const writeCommitHashToCoreJSON = async (cb) => 
{
    const coreJSONPath = path.resolve(dataDir, "configs", "core.json");
    if (fs.existsSync(coreJSONPath)) 
    {
        // Read the core.json and execute git command
        const coreJSON = fs.readFileSync(coreJSONPath).toString();
        const parsed = JSON.parse(coreJSON);
        const gitResult = await exec("git rev-parse HEAD", { stdout: "pipe" });
        parsed.commit = gitResult.stdout || "";

        // Write the commit hash to core.json
        fs.writeFileSync(coreJSONPath, JSON.stringify(parsed, null, 4));
    }
    cb();
};

// Hash helper function
const generateHashForData = (data) =>
{
    const hashSum = crypto.createHash("sha1");
    hashSum.update(data);
    return hashSum.digest("hex");
};

// Loader to recursively find all json files in a folder
const loadRecursiveAsync = async (filepath) =>
{
    const result = {};

    // get all filepaths
    const files = fs.readdirSync(filepath).filter((item) => 
    {
        return fs.statSync(path.join(filepath, item)).isFile();
    });
    const directories = fs.readdirSync(filepath).filter((item) => 
    {
        return fs.statSync(path.join(filepath, item)).isDirectory();
    });

    // add file content to result
    for (const file of files)
    {
        if (file.split(".").pop() === "json")
        {
            const filename = file.split(".").slice(0, -1).join(".");
            const filePathAndName = `${filepath}${file}`;
            result[filename] = generateHashForData(fs.readFileSync(filePathAndName));
        }
    }

    // deep tree search
    for (const dir of directories)
    {
        result[dir] = loadRecursiveAsync(`${filepath}${dir}/`);
    }

    // set all loadRecursive to be executed asynchronously
    const resEntries = Object.entries(result);
    const resResolved = await Promise.all(resEntries.map(ent => ent[1]));
    for (let resIdx = 0; resIdx < resResolved.length; resIdx++)
    {
        resEntries[resIdx][1] = resResolved[resIdx];
    }
    
    // return the result of all async fetch
    return Object.fromEntries(resEntries);
};

// Testing
gulp.task("test:debug", async () => exec("ts-node-dev -r tsconfig-paths/register src/ide/TestEntry.ts", { stdio }));

// Main Tasks Generation
const build = (packagingType) => 
{
    const anonPackaging = () => packaging(entries[packagingType]);
    anonPackaging.displayName = `packaging-${packagingType}`;
    const tasks = [clean, validateJSONs, compileTest, fetchAndPatchPackageImage, anonPackaging, addAssets, writeCommitHashToCoreJSON, removeCompiled];
    return gulp.series(tasks);
};

// Packaging Arguments
const packaging = async (entry) => 
{
    const target = `${nodeVersion}-${process.platform}-${process.arch}`;
    const args = [entry, "--compress", "GZip", "--target", target, "--output", serverExe, "--config", pkgConfig];
    try 
    {
        await pkg.exec(args);
    }
    catch (error) 
    {
        console.error(`Error occurred during packaging: ${error}`);
    }
};

// Run server
const runSrv = async (cb) =>
{
    await exec("Aki.Server.exe", { stdio, cwd: buildDir });
    cb();
};

gulp.task("build:debug", build("debug"));
gulp.task("build:release", build("release"));
gulp.task("build:bleeding", build("bleeding"));
gulp.task("run:server", runSrv);
