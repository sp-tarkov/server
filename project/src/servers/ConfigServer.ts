import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { VFS } from "@spt/utils/VFS";
import { inject, injectable } from "tsyringe";

@injectable()
export class ConfigServer {
    protected configs: Record<string, any> = {};
    protected readonly acceptableFileExtensions: string[] = ["json", "jsonc"];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
    ) {
        this.initialize();
    }

    public getConfig<T>(configType: ConfigTypes): T {
        if (!this.configs[configType]) {
            throw new Error(`Config: ${configType} is undefined. Ensure you have not broken it via editing`);
        }

        return this.configs[configType];
    }

    public getConfigByString<T>(configType: string): T {
        return this.configs[configType];
    }

    public initialize(): void {
        this.logger.debug("Importing configs...");

        // Get all filepaths
        const filepath = globalThis.G_RELEASE_CONFIGURATION ? "SPT_Data/Server/configs/" : "./assets/configs/";
        const files = this.vfs.getFiles(filepath);

        // Add file content to result
        for (const file of files) {
            if (this.acceptableFileExtensions.includes(this.vfs.getFileExtension(file.toLowerCase()))) {
                const fileName = this.vfs.stripExtension(file);
                const filePathAndName = `${filepath}${file}`;
                const deserialsiedJson = this.jsonUtil.deserializeJsonC<any>(
                    this.vfs.readFile(filePathAndName),
                    filePathAndName,
                );

                if (!deserialsiedJson) {
                    this.logger.error(
                        `Config file: ${filePathAndName} is corrupt. Use a site like: https://jsonlint.com to find the issue.`,
                    );
                    throw new Error(
                        `Server will not run until the: ${filePathAndName} config error mentioned above is fixed`,
                    );
                }

                this.configs[`spt-${fileName}`] = deserialsiedJson;
            }
        }

        this.logger.info(`Commit hash: ${globalThis.G_COMMIT || "DEBUG"}`);
        this.logger.info(`Build date: ${globalThis.G_BUILDTIME || "DEBUG"}`);
    }
}
