import path from "node:path";
import { ProgramStatics } from "@spt/ProgramStatics";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { ModHashCacheService } from "@spt/services/cache/ModHashCacheService";
import { FileSystem } from "@spt/utils/FileSystem";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { inject, injectable } from "tsyringe";
import { CompilerOptions, ModuleKind, ModuleResolutionKind, ScriptTarget, transpileModule } from "typescript";

@injectable()
export class ModCompilerService {
    protected serverDependencies: string[];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ModHashCacheService") protected modHashCacheService: ModHashCacheService,
        @inject("FileSystem") protected fileSystem: FileSystem,
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
    ) {
        const packageJsonPath: string = path.join(__dirname, "../../package.json");
        this.serverDependencies = Object.keys(this.fileSystemSync.readJson(packageJsonPath).dependencies);
    }

    /**
     * Convert a mods TS into JS
     * @param modName Name of mod
     * @param modPath Dir path to mod
     * @param modTypeScriptFiles
     * @returns
     */
    public async compileMod(modName: string, modPath: string, modTypeScriptFiles: string[]): Promise<void> {
        // Concatenate TS files into one string
        let tsFileContents = "";
        let fileExists = true; // does every js file exist (been compiled before)
        for (const file of modTypeScriptFiles) {
            const fileContent = await this.fileSystem.read(file);
            tsFileContents += fileContent;

            // Does equivalent .js file exist
            if (!(await this.fileSystem.exists(file.replace(".ts", ".js")))) {
                fileExists = false;
            }
        }

        const hashMatches = await this.modHashCacheService.calculateAndCompareHash(modName, tsFileContents);

        if (fileExists && hashMatches) {
            // Everything exists and matches, escape early
            return;
        }

        if (!hashMatches) {
            // Store / update hash in json file
            await this.modHashCacheService.calculateAndStoreHash(modName, tsFileContents);
        }

        return this.compile(modTypeScriptFiles, {
            noEmitOnError: true,
            noImplicitAny: false,
            target: ScriptTarget.ESNext,
            module: ModuleKind.Preserve,
            moduleResolution: ModuleResolutionKind.NodeNext,
            sourceMap: true,
            resolveJsonModule: true,
            allowJs: true,
            esModuleInterop: true,
            downlevelIteration: true,
            experimentalDecorators: true,
            emitDecoratorMetadata: true,
            isolatedModules: true,
            rootDir: modPath,
        });
    }

    /**
     * Convert a TS file into JS
     * @param fileNames Paths to TS files
     * @param options Compiler options
     */
    protected async compile(fileNames: string[], options: CompilerOptions): Promise<void> {
        // C:/snapshot/project || /snapshot/project
        const baseDir: string = __dirname.replace(/\\/g, "/").split("/").slice(0, 3).join("/");

        for (const filePath of fileNames) {
            const destPath = filePath.replace(".ts", ".js");
            const parsedPath = path.parse(filePath);
            const parsedDestPath = path.parse(destPath);
            const text = await this.fileSystem.read(filePath);
            let replacedText: string;

            if (ProgramStatics.COMPILED) {
                replacedText = text.replace(/(@spt)/g, `${baseDir}/obj`);
                for (const dependency of this.serverDependencies) {
                    replacedText = replacedText.replace(`"${dependency}"`, `"${baseDir}/node_modules/${dependency}"`);
                }
            } else {
                replacedText = text.replace(/(@spt)/g, path.join(__dirname, "..").replace(/\\/g, "/"));
            }

            const output = transpileModule(replacedText, { compilerOptions: options });

            if (output.sourceMapText) {
                // biome-ignore format: these mappings should not be formatted
                output.outputText = output.outputText.replace(
                    "//# sourceMappingURL\=module.js.map",
                    `//# sourceMappingURL\=${parsedDestPath.base}.map`,
                );

                const sourceMap = JSON.parse(output.sourceMapText);
                sourceMap.file = parsedDestPath.base;
                sourceMap.sources = [parsedPath.base];

                await this.fileSystem.writeJson(`${destPath}.map`, sourceMap);
            }
            await this.fileSystem.write(destPath, output.outputText);
        }

        while (!(await this.areFilesReady(fileNames))) {
            await this.delay(200);
        }
    }

    /**
     * Do the files at the provided paths exist
     * @param fileNames
     * @returns
     */
    protected async areFilesReady(fileNames: string[]): Promise<boolean> {
        const fileExistencePromises = fileNames.map(async (x) => await this.fileSystem.exists(x.replace(".ts", ".js")));
        const fileExistenceResults = await Promise.all(fileExistencePromises);
        return fileExistenceResults.every((exists) => exists);
    }

    /**
     * Wait the provided number of milliseconds
     * @param ms Milliseconds
     * @returns
     */
    protected async delay(ms: number): Promise<unknown> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
