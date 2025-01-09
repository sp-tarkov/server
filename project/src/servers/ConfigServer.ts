import { ProgramStatics } from "@spt/ProgramStatics";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import { FileSystemSync } from "@spt/utils/FileSystemSync";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ConfigServer {
    protected configs: Record<string, any> = {};
    protected readonly acceptableFileExtensions: string[] = ["json", "jsonc"];

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
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
        const filepath = ProgramStatics.COMPILED ? "SPT_Data/Server/configs/" : "./assets/configs/";
        const files = this.fileSystemSync.getFiles(filepath, true, this.acceptableFileExtensions, true);

        // Add file content to result
        for (const file of files) {
            const fileName = FileSystemSync.getFileName(file);
            const deserialsiedJson = this.jsonUtil.deserializeJsonC<any>(this.fileSystemSync.read(file), fileName);

            if (!deserialsiedJson) {
                this.logger.error(
                    `Config file: ${fileName} is corrupt. Use a site like: https://jsonlint.com to find the issue.`,
                );
                throw new Error(`Server will not run until the: ${fileName} config error mentioned above is fixed`);
            }

            this.configs[`spt-${fileName}`] = deserialsiedJson;
        }

        this.logger.info(`Commit hash: ${ProgramStatics.COMMIT || "DEBUG"}`);
        this.logger.info(`Build date: ${ProgramStatics.BUILD_TIME || "DEBUG"}`);
    }
}
