/* eslint-disable @typescript-eslint/naming-convention */
import { TranspileOptions, ScriptTarget, ModuleKind, CompilerOptions, transpileModule } from "typescript";
import { inject, injectable } from "tsyringe";
import path from "path";
import fs from "fs";
import type { ILogger } from "../models/spt/utils/ILogger";
import { HashCacheService } from "./HashCacheService";
import { VFS } from "../utils/VFS";

@injectable()
export class ModCompilerService
{
    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("HashCacheService") protected hashCacheService: HashCacheService,
        @inject("VFS") protected vfs: VFS
    )
    { }

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

    protected async compile(fileNames: string[], options: CompilerOptions): Promise<void>
    {
        const tranOptions: TranspileOptions = {
            compilerOptions: options
        };

        for (const filePath of fileNames)
        {
            const readFile = fs.readFileSync(filePath);
            const text = readFile.toString();

            let replacedText;
            if (globalThis.G_RELEASE_CONFIGURATION)
            {
                // The path is hardcoded here since it references node_modules in PKG's internal virtual file system
                replacedText = text.replace(/(@spt-aki)/g, "C:/snapshot/project/obj");
                replacedText = replacedText.replace("\"tsyringe\"", "\"C:/snapshot/project/node_modules/tsyringe\"");
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

    protected areFilesReady(fileNames: string[]): boolean
    {
        return fileNames.filter(x => !this.vfs.exists(x.replace(".ts", ".js"))).length === 0;
    }

    protected delay(ms: number): Promise<unknown>
    {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
}