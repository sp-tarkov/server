/* eslint-disable @typescript-eslint/naming-convention */

import crypto from "crypto";
import { deleteSync } from "del";
import fs from "fs-extra";
import gulp from "gulp";
import { exec } from "gulp-execa";
import rename from "gulp-rename";
import os from "os";
import path from "path";
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
    bleeding: path.join("obj", "ide", "BleedingEdgeEntry.js")
};
const licenseFile = "../LICENSE.md";

// Compilation
const compileTest = async () => exec("swc src -d obj", { stdio });

// Packaging
const fetchPackageImage = async () =>
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
    }
    catch (e) 
    {
        console.error(`Error while fetching and patching package image: ${e.message}`);
        console.error(e.stack);
    }
};

const updateBuildProperties = async (cb) =>
{
    if(os.platform() !== "win32") {
        cb();
        return;
    }

    const exe = ResEdit.NtExecutable.from(fs.readFileSync(serverExe));
    const res = ResEdit.NtExecutableResource.from(exe);
    
    const iconPath = path.resolve(manifest.icon);
    const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));

    ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
        res.entries,
        1,
        1033,
        iconFile.icons.map(item => item.data)
    );

    const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];

    vi.setStringValues(
        {lang: 1033, codepage: 1200},
        {
            ProductName: manifest.author,
            FileDescription: manifest.description,
            CompanyName: manifest.name,
            LegalCopyright:  manifest.license
        }
    );
    vi.removeStringValue({lang: 1033, codepage: 1200}, "OriginalFilename");
    vi.removeStringValue({lang: 1033, codepage: 1200}, "InternalName");
    vi.setFileVersion(...manifest.version.split(".").map(Number));
    vi.setProductVersion(...manifest.version.split(".").map(Number));
    vi.outputToResourceEntries(res.entries);
    res.outputResource(exe, true);
    fs.writeFileSync(serverExe, Buffer.from(exe.generate()));

    cb();
};

// Copy various asset files to the destination directory
function copyAssets()
{
    return gulp.src(["assets/**/*.json", "assets/**/*.json5", "assets/**/*.png", "assets/**/*.jpg", "assets/**/*.ico"])
        .pipe(gulp.dest(dataDir));
}

// Copy executables from node_modules
function copyExecutables() 
{
    return gulp.src(["node_modules/@pnpm/exe/**/*"])
        .pipe(gulp.dest(path.join(dataDir, "@pnpm", "exe")));
}

// Rename and copy the license file
function copyLicense() 
{
    return gulp.src([licenseFile])
        .pipe(rename("LICENSE-Server.txt"))
        .pipe(gulp.dest(buildDir));
}

/**
 * Writes the latest Git commit hash to the core.json configuration file.
 * @param {*} cb Callback to run after completion of function
 */
async function writeCommitHashToCoreJSON(cb) 
{
    const coreJSONPath = path.resolve(dataDir, "configs", "core.json");
    if (fs.existsSync(coreJSONPath)) 
    {
        try 
        {
            const coreJSON = fs.readFileSync(coreJSONPath, "utf8");
            const parsed = JSON.parse(coreJSON);
            
            // Fetch the latest Git commit hash
            const gitResult = await exec("git rev-parse HEAD", { stdout: "pipe" });
            
            // Update the commit hash in the core.json object
            parsed.commit = gitResult.stdout.trim() || "";

            // Add build timestamp
            parsed.buildTime = new Date().getTime();
            
            // Write the updated object back to core.json
            fs.writeFileSync(coreJSONPath, JSON.stringify(parsed, null, 4));
        }
        catch (error) 
        {
            throw new Error(`Failed to write commit hash to core.json: ${error.message}`);
        }
    }
    else 
    {
        console.warn(`core.json not found at ${coreJSONPath}. Skipping commit hash update.`);
    }
    
    cb();
}


// Create a hash file for asset checks
async function createHashFile() 
{
    const hashFileDir = path.resolve(dataDir, "checks.dat");
    await fs.createFile(hashFileDir);
    const assetData = await loadRecursiveAsync("assets/");
    const assetDataString = Buffer.from(JSON.stringify(assetData), "utf-8").toString("base64");
    await fs.writeFile(hashFileDir, assetDataString);
}

// Combine all tasks into addAssets
const addAssets = gulp.series(copyAssets, copyExecutables, copyLicense, writeCommitHashToCoreJSON, createHashFile);

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
    const tasks = [clean, validateJSONs, compileTest, fetchPackageImage, anonPackaging, addAssets, updateBuildProperties, removeCompiled];
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
