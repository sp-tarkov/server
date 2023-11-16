import { inject, injectable } from "tsyringe";

import { ConfigTypes } from "@spt-aki/models/enums/ConfigTypes";
import { ICoreConfig } from "@spt-aki/models/spt/config/ICoreConfig";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { VFS } from "@spt-aki/utils/VFS";

@injectable()
export class ConfigServer
{
    protected configs: Record<string, any> = {};
    protected readonly acceptableFileExtensions: string[] = ["json", "jsonc"];

    constructor(
        @inject("WinstonLogger") protected logger: ILogger,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
    )
    {
        this.initialize();
    }

    public getConfig<T>(configType: ConfigTypes): T
    {
        return this.configs[configType];
    }

    public getConfigByString<T>(configType: string): T
    {
        return this.configs[configType];
    }

    public initialize(): void
    {
        this.logger.debug("Importing configs...");

        // Get all filepaths
        const filepath = (globalThis.G_RELEASE_CONFIGURATION) ? "Aki_Data/Server/configs/" : "./assets/configs/";
        const files = this.vfs.getFiles(filepath);

        // Add file content to result
        for (const file of files)
        {
            if (this.acceptableFileExtensions.includes(this.vfs.getFileExtension(file.toLowerCase())))
            {
                const fileName = this.vfs.stripExtension(file);
                const filePathAndName = `${filepath}${file}`;
                this.configs[`aki-${fileName}`] = this.jsonUtil.deserializeJsonC<any>(
                    this.vfs.readFile(filePathAndName),
                    filePathAndName,
                );
            }
        }

        this.logger.info(`Commit hash: ${(this.configs[ConfigTypes.CORE] as ICoreConfig).commit || "DEBUG"}`);
        this.logger.info(`Build date: ${(this.configs[ConfigTypes.CORE] as ICoreConfig).buildTime || "DEBUG"}`);
    }
}
