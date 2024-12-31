import fs from "node:fs";
import path from "node:path";
import { inject, injectable } from "tsyringe";
import { ScriptTarget, ModuleKind, ModuleResolutionKind, transpileModule, CompilerOptions } from "typescript";
import { Program } from "@spt/Program";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ModHashCacheService } from "@spt/services/cache/ModHashCacheService";
import { VFS } from "@spt/utils/VFS";

@injectable()
export class ModCompilerService
{
    protected serverDependencies: string[];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ModHashCacheService") protected modHashCacheService: ModHashCacheService,
        @inject("VFS") protected vfs: VFS,
    )
    {
        const packageJsonPath: string = path.join(__dirname, "../../package.json");
        this.serverDependencies = Object.keys(JSON.parse(this.vfs.readFile(packageJsonPath)).dependencies);
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
        let tsFileContents = "";
        let fileExists = true; // does every js file exist (been compiled before)
        for (const file of modTypeScriptFiles)
        {
            const fileContent = this.vfs.readFile(file);
            tsFileContents += fileContent;

            // Does equivalent .js file exist
            if (!this.vfs.exists(file.replace(".ts", ".js")))
            {
                fileExists = false;
            }
        }

        const hashMatches = this.modHashCacheService.calculateAndCompareHash(modName, tsFileContents);

        if (fileExists && hashMatches)
        {
            // Everything exists and matches, escape early
            return;
        }

        if (!hashMatches)
        {
            // Store / update hash in json file
            this.modHashCacheService.calculateAndStoreHash(modName, tsFileContents);
        }

        return this.compile(modTypeScriptFiles, {
            noEmitOnError: true,
            noImplicitAny: false,
            target: ScriptTarget.ES2022,
            module: ModuleKind.CommonJS,
            moduleResolution: ModuleResolutionKind.Node10,
            sourceMap: true,
            resolveJsonModule: true,
            allowJs: true,
            esModuleInterop: true,
            downlevelIteration: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            rootDir: modPath,
        });
    }

    /**
     * Convert a TS file into JS
     * @param fileNames Paths to TS files
     * @param options Compiler options
     */
    protected async compile(fileNames: string[], options: CompilerOptions): Promise<void>
    {
        // C:/snapshot/project || /snapshot/project
        const baseDir: string = __dirname.replace(/\\/g, "/").split("/").slice(0, 3).join("/");

        for (const filePath of fileNames)
        {
            const destPath = filePath.replace(".ts", ".js");
            const parsedPath = path.parse(filePath);
            const parsedDestPath = path.parse(destPath);
            const text = fs.readFileSync(filePath).toString();
            let replacedText: string;

            if (Program.COMPILED) {
                replacedText = text.replace(/(@spt)/g, `${baseDir}/obj`);
                for (const dependency of this.serverDependencies)
                {
                    replacedText = replacedText.replace(`"${dependency}"`, `"${baseDir}/node_modules/${dependency}"`);
                }
            }
            else
            {
                replacedText = text.replace(/(@spt)/g, path.join(__dirname, "..").replace(/\\/g, "/"));
            }

            const output = transpileModule(replacedText, { compilerOptions: options });

            if (output.sourceMapText)
            {
                output.outputText = output.outputText.replace(
                    "//# sourceMappingURL\=module.js.map",
                    `//# sourceMappingURL\=${parsedDestPath.base}.map`,
                );

                const sourceMap = JSON.parse(output.sourceMapText);
                sourceMap.file = parsedDestPath.base;
                sourceMap.sources = [parsedPath.base];

                fs.writeFileSync(`${destPath}.map`, JSON.stringify(sourceMap));
            }
            fs.writeFileSync(destPath, output.outputText);
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
        return fileNames.filter((x) => !this.vfs.exists(x.replace(".ts", ".js"))).length === 0;
    }

    /**
     * Wait the provided number of milliseconds
     * @param ms Milliseconds
     * @returns
     */
    protected delay(ms: number): Promise<unknown>
    {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
