import path from "node:path";
import type { OnLoad } from "@spt/di/OnLoad";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { ImageRouter } from "@spt/routers/ImageRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { BunTimer } from "@spt/utils/BunTimer";
import { EncodingUtil } from "@spt/utils/EncodingUtil";
import { HashUtil } from "@spt/utils/HashUtil";
import type { ImporterUtil } from "@spt/utils/ImporterUtil";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { VFS } from "@spt/utils/VFS";
import { inject, injectable } from "tsyringe";

@injectable()
export class DatabaseImporter implements OnLoad {
    private hashedFile: any;
    private valid = VaildationResult.UNDEFINED;
    private filepath: string;
    protected httpConfig: IHttpConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
        @inject("ImageRouter") protected imageRouter: ImageRouter,
        @inject("EncodingUtil") protected encodingUtil: EncodingUtil,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ImporterUtil") protected importerUtil: ImporterUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.httpConfig = this.configServer.getConfig(ConfigTypes.HTTP);
    }

    /**
     * Get path to spt data
     * @returns path to data
     */
    public getSptDataPath(): string {
        // Keep the trailing slash!
        return globalThis.G_RELEASE_CONFIGURATION ? "./SPT_Data/Server/" : "./assets/";
    }

    public async onLoad(): Promise<void> {
        this.filepath = this.getSptDataPath();

        if (globalThis.G_RELEASE_CONFIGURATION) {
            try {
                const file = "checks.dat";
                const fileWithPath = path.join(this.filepath, file);
                if (this.vfs.exists(fileWithPath)) {
                    this.hashedFile = this.jsonUtil.deserialize(
                        this.encodingUtil.fromBase64(this.vfs.readFile(fileWithPath)),
                        file,
                    );
                } else {
                    this.valid = VaildationResult.NOT_FOUND;
                    this.logger.debug(this.localisationService.getText("validation_not_found"));
                }
            } catch (e) {
                this.valid = VaildationResult.FAILED;
                this.logger.warning(this.localisationService.getText("validation_error_decode"));
            }
        }

        await this.hydrateDatabase(this.filepath);

        const imageFilePath = path.join(this.filepath, "images/");
        const directories = this.vfs.getDirs(imageFilePath);
        this.loadImages(imageFilePath, directories, [
            "/files/achievement/",
            "/files/CONTENT/banners/",
            "/files/handbook/",
            "/files/Hideout/",
            "/files/launcher/",
            "/files/quest/icon/",
            "/files/trader/avatar/",
        ]);
    }

    protected async hydrateDatabase(filepath: string): Promise<void> {
        this.logger.info(this.localisationService.getText("importing_database"));

        const databasePath = path.join(filepath, "database/");
        try {
            const timer = new BunTimer();
            const dataToImport = await this.importerUtil.loadAsync<IDatabaseTables>(
                databasePath,
                this.filepath,
                (fileWithPath: string, data: string) => this.onReadValidate(fileWithPath, data),
            );
            const times = timer.finish();

            const validation =
                this.valid === VaildationResult.FAILED || this.valid === VaildationResult.NOT_FOUND ? "." : "";

            this.logger.info(`${this.localisationService.getText("importing_database_finish")}${validation}`);
            this.logger.debug(`Database import took ${times.sec.toFixed(2)} seconds`);
            this.databaseServer.setTables(dataToImport);
        } catch (error) {
            this.logger.error(`Error hydrating database: ${error.message}`);
            throw error;
        }
    }

    protected onReadValidate(fileWithPath: string, data: string): void {
        if (globalThis.G_RELEASE_CONFIGURATION && this.hashedFile && !this.validateFile(fileWithPath, data)) {
            this.valid = VaildationResult.FAILED;
        }
    }

    /**
     * Normalize key paths to ensure consistency in how they were generated. Validation keys are are relative paths
     * from the `assets` directory, normalized, no leading slash, forward slashes, and include the file extension.
     * Example: `database/locations/sandbox/base.json`
     *
     * @param keyPath - The path that is being used for a validation check that needs to be normalized.
     */
    protected normalizeKeyPath(keyPath: string): string {
        const assetsPath = path.normalize(this.filepath).replace(/\\/g, "/");
        return path.normalize(keyPath).replace(/\\/g, "/").replace(assetsPath, "");
    }

    protected validateFile(filePathAndName: string, fileData: any): boolean {
        try {
            const hashedKeyPath = this.normalizeKeyPath(filePathAndName);

            if (!hashedKeyPath) {
                this.logger.error(`Key not found in path: "${hashedKeyPath}"`);
                return false;
            }

            const tempObject = this.hashedFile[hashedKeyPath];
            const generatedHash = this.hashUtil.generateSha1ForData(fileData);

            if (!tempObject || tempObject !== generatedHash) {
                this.logger.debug(this.localisationService.getText("validation_error_file", filePathAndName));
                return false;
            }
        } catch (e) {
            this.logger.warning(`Validation error: ${e.message || e}`);
            return false;
        }
        return true;
    }

    public loadImages(filepath: string, directories: string[], routes: string[]): void {
        for (const directoryIndex in directories) {
            const filesInDirectory = this.vfs.getFiles(path.join(filepath, directories[directoryIndex]));
            for (const file of filesInDirectory) {
                const filename = this.vfs.stripExtension(file);
                const routeKey = `${routes[directoryIndex]}${filename}`;
                let imagePath = path.join(filepath, directories[directoryIndex], file);

                const pathOverride = this.getImagePathOverride(imagePath);
                if (pathOverride) {
                    this.logger.debug(`overrode route: ${routeKey} endpoint: ${imagePath} with ${pathOverride}`);
                    imagePath = pathOverride;
                }
                this.imageRouter.addRoute(routeKey, imagePath);
            }
        }
        this.imageRouter.addRoute("/favicon.ico", path.join(filepath, "icon.ico"));
    }

    protected getImagePathOverride(imagePath: string): string {
        return this.httpConfig.serverImagePathOverride[imagePath];
    }
}

enum VaildationResult {
    SUCCESS = 0,
    FAILED = 1,
    NOT_FOUND = 2,
    UNDEFINED = 3,
}
