/* eslint-disable @typescript-eslint/naming-convention */
import fs from "fs";
import os from "os";
import path from "path";
import { inject, injectable } from "tsyringe";
import { CompilerOptions, ModuleKind, ScriptTarget, TranspileOptions, transpileModule } from "typescript";
import type { ILogger } from "../models/spt/utils/ILogger";
import { VFS } from "../utils/VFS";
import { HashCacheService } from "./HashCacheService";

@injectable()
export class ModCompilerService
{
    protected serverDependencies: Record<string, string>;

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashCacheService") protected hashCacheService: HashCacheService,
        @inject("VFS") protected vfs: VFS
    )
    {
        const packageJsonPath = globalThis.G_RELEASE_CONFIGURATION ? "C:/snapshot/project/package.json" : "./package.json";
        this.serverDependencies = JSON.parse(this.vfs.readFile(packageJsonPath)).dependencies;
    }

    /**
     * Convert a mods TS into JS
     * @param modName Name of mod
     * @param modPath Dir path to mod
     * @param modTypeScriptFiles 
     * @returns 
     */
    public async compileMod(modName: string, modPath: string, modTypeScriptFiles: string[]): Promise<void>
    {
        // Concatenate TS files into one string
        let tsFileContents: string;
        let fileExists = true; // does every js file exist (been compiled before)
        for (const file of modTypeScriptFiles)
        {
            const fileContent = this.vfs.readFile(file);
            tsFileContents+= fileContent;

            // Does equivalent .js file exist
            if (!this.vfs.exists(file.replace(".ts", ".js")))
            {
                fileExists = false;
            }
        }

        const hashMatches = this.hashCacheService.modContentMatchesStoredHash(modName, tsFileContents);

        if (fileExists && hashMatches)
        {
            // Everything exists and matches, escape early
            return;
        }

        if (!hashMatches)
        {
            // Store / update hash in json file
            this.hashCacheService.storeModContent(modName, tsFileContents);
        }

        return this.compile(modTypeScriptFiles,
            {
                noEmitOnError: true,
                noImplicitAny: false,
                target: ScriptTarget.ES2020,
                module: ModuleKind.CommonJS,
                resolveJsonModule: true,
                allowJs: true,
                esModuleInterop: true,
                downlevelIteration: true,
                experimentalDecorators: true,
                emitDecoratorMetadata: true,
                rootDir: modPath,
                isolatedModules: true
            });
    }

    /**
     * Convert a TS file into JS
     * @param fileNames Paths to TS files
     * @param options Compiler options
     */
    protected async compile(fileNames: string[], options: CompilerOptions): Promise<void>
    {
        const tranOptions: TranspileOptions = {
            compilerOptions: options
        };

        for (const filePath of fileNames)
        {
            const readFile = fs.readFileSync(filePath);
            const text = readFile.toString();

            let replacedText: string;
            if (globalThis.G_RELEASE_CONFIGURATION)
            {
                // The path is hardcoded here since it references node_modules in PKG's internal virtual file system
                if (os.platform() === "win32")
                {
                    replacedText = text.replace(/(@spt-aki)/g, "C:/snapshot/project/obj");
                    for (const dependency of Object.keys(this.serverDependencies)) 
                    {
                        replacedText = replacedText.replace(`"${dependency}"`, `"C:/snapshot/project/node_modules/${dependency}"`);
                    }
                }
                else
                {
                    replacedText = text.replace(/(@spt-aki)/g, "/snapshot/project/obj");
                    for (const dependency of Object.keys(this.serverDependencies)) 
                    {
                        replacedText = replacedText.replace(`"${dependency}"`, `"/snapshot/project/node_modules/${dependency}"`);
                    }
                }
            }
            else
            {
                replacedText = text.replace(/(@spt-aki)/g, path.join(__dirname, "..").replace(/\\/g,"/"));
            }

            const output = transpileModule(replacedText, tranOptions);
            fs.writeFileSync(filePath.replace(".ts", ".js"), output.outputText);
        }

        while (!this.areFilesReady(fileNames))
        {
            await this.delay(200);
        }
    }

    /**
     * Do the files at the provided paths exist
     * @param fileNames 
     * @returns 
     */
    protected areFilesReady(fileNames: string[]): boolean
    {
        return fileNames.filter(x => !this.vfs.exists(x.replace(".ts", ".js"))).length === 0;
    }

    /**
     * Wait the provided number of milliseconds
     * @param ms Milliseconds
     * @returns 
     */
    protected delay(ms: number): Promise<unknown>
    {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}