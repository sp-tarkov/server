import { Program } from "@spt/Program";
import { OnLoad } from "@spt/di/OnLoad";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IHttpConfig } from "@spt/models/spt/config/IHttpConfig";
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ImageRouter } from "@spt/routers/ImageRouter";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { EncodingUtil } from "@spt/utils/EncodingUtil";
import { HashUtil } from "@spt/utils/HashUtil";
import { ImporterUtil } from "@spt/utils/ImporterUtil";
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
        return Program.COMPILED ? "SPT_Data/Server/" : "./assets/";
    }

    public async onLoad(): Promise<void> {
        this.filepath = this.getSptDataPath();

        if (Program.COMPILED) {
            try {
                // Reading the dynamic SHA1 file
                const file = "checks.dat";
                const fileWithPath = `${this.filepath}${file}`;
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

        const imageFilePath = `${this.filepath}images/`;
        const directories = this.vfs.getDirs(imageFilePath);
        this.loadImages(imageFilePath, directories, [
            "/files/achievement/",
            "/files/CONTENT/banners/",
            "/files/handbook/",
            "/files/Hideout/",
            "/files/launcher/",
            "/files/prestige/",
            "/files/quest/icon/",
            "/files/trader/avatar/",
        ]);
    }

    /**
     * Read all json files in database folder and map into a json object
     * @param filepath path to database folder
     */
    protected async hydrateDatabase(filepath: string): Promise<void> {
        this.logger.info(this.localisationService.getText("importing_database"));

        const dataToImport = await this.importerUtil.loadAsync<IDatabaseTables>(
            `${filepath}database/`,
            this.filepath,
            (fileWithPath: string, data: string) => this.onReadValidate(fileWithPath, data),
        );

        const validation =
            this.valid === VaildationResult.FAILED || this.valid === VaildationResult.NOT_FOUND ? "." : "";
        this.logger.info(`${this.localisationService.getText("importing_database_finish")}${validation}`);
        this.databaseServer.setTables(dataToImport);
    }

    protected onReadValidate(fileWithPath: string, data: string): void {
        // Validate files
        if (Program.COMPILED && this.hashedFile && !this.validateFile(fileWithPath, data)) {
            this.valid = VaildationResult.FAILED;
        }
    }

    public getRoute(): string {
        return "spt-database";
    }

    protected validateFile(filePathAndName: string, fileData: any): boolean {
        try {
            const finalPath = filePathAndName.replace(this.filepath, "").replace(".json", "");
            let tempObject: any;
            for (const prop of finalPath.split("/")) {
                if (!tempObject) {
                    tempObject = this.hashedFile[prop];
                } else {
                    tempObject = tempObject[prop];
                }
            }

            if (tempObject !== this.hashUtil.generateSha1ForData(fileData)) {
                this.logger.debug(this.localisationService.getText("validation_error_file", filePathAndName));
                return false;
            }
        } catch (e) {
            this.logger.warning(this.localisationService.getText("validation_error_exception", filePathAndName));
            this.logger.warning(e);
            return false;
        }
        return true;
    }

    /**
     * Find and map files with image router inside a designated path
     * @param filepath Path to find files in
     */
    public loadImages(filepath: string, directories: string[], routes: string[]): void {
        for (const directoryIndex in directories) {
            // Get all files in directory
            const filesInDirectory = this.vfs.getFiles(`${filepath}${directories[directoryIndex]}`);
            for (const file of filesInDirectory) {
                // Register each file in image router
                const filename = this.vfs.stripExtension(file);
                const routeKey = `${routes[directoryIndex]}${filename}`;
                let imagePath = `${filepath}${directories[directoryIndex]}/${file}`;

                const pathOverride = this.getImagePathOverride(imagePath);
                if (pathOverride) {
                    this.logger.debug(`overrode route: ${routeKey} endpoint: ${imagePath} with ${pathOverride}`);
                    imagePath = pathOverride;
                }

                this.imageRouter.addRoute(routeKey, imagePath);
            }
        }

        // Map icon file separately
        this.imageRouter.addRoute("/favicon.ico", `${filepath}icon.ico`);
    }

    /**
     * Check for a path override in the http json config file
     * @param imagePath Key
     * @returns override for key
     */
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
