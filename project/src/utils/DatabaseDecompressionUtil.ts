import * as path from "node:path";
import { path7za } from "7zip-bin";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import * as fs from "fs-extra";
import * as Seven from "node-7z";
import { inject, injectable } from "tsyringe";

@injectable()
export class DatabaseDecompressionUtil {
    private compressedDir: string;
    private assetsDir: string;
    private compiled: boolean;

    constructor(@inject("PrimaryLogger") protected logger: ILogger) {
        this.compressedDir = path.normalize("./assets/compressed/database");
        this.assetsDir = path.normalize("./assets/database");
        this.compiled = this.isCompiled();
    }

    /**
     * Checks if the application is running in a compiled environment. A simple check is done to see if the relative
     * assets directory exists. If it does not, the application is assumed to be running in a compiled environment. All
     * relative asset paths are different within a compiled environment, so this simple check is sufficient.
     */
    private isCompiled(): boolean {
        const assetsDir = path.normalize("./assets");
        return !fs.existsSync(assetsDir);
    }

    /**
     * Initializes the database compression utility.
     *
     * This method will decompress all 7-zip archives within the compressed database directory. The decompressed files
     * are placed in their respective directories based on the name and location of the compressed file.
     */
    public async initialize(): Promise<void> {
        if (this.compiled) {
            this.logger.debug("Skipping database decompression in compiled environment");
            return;
        }

        try {
            const compressedFiles = await this.getCompressedFiles();
            if (compressedFiles.length === 0) {
                this.logger.debug("No database archives found");
                return;
            }

            for (const compressedFile of compressedFiles) {
                await this.processCompressedFile(compressedFile);
            }
            this.logger.info("Database archives processed");
        } catch (error) {
            this.logger.error(`Error handling database archives: ${error}`);
        }
    }

    /**
     * Retrieves a list of all 7-zip archives within the compressed database directory.
     */
    private async getCompressedFiles(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.compressedDir);
            const compressedFiles = files.filter((file) => file.endsWith(".7z"));
            return compressedFiles;
        } catch (error) {
            this.logger.error(`Error reading database archive directory: ${error}`);
            return [];
        }
    }

    /**
     * Processes a compressed file by checking if the target directory is empty, and if so, decompressing the file into
     * the target directory.
     */
    private async processCompressedFile(compressedFileName: string): Promise<void> {
        this.logger.info("Processing database archives...");

        const compressedFilePath = path.join(this.compressedDir, compressedFileName);
        const relativeTargetPath = compressedFileName.replace(".7z", "");
        const targetDir = path.join(this.assetsDir, relativeTargetPath);

        try {
            this.logger.debug(`Processing: ${compressedFileName}`);

            const isTargetDirEmpty = await this.isDirectoryEmpty(targetDir);
            if (!isTargetDirEmpty) {
                this.logger.debug(`Archive target directory not empty, skipping: ${targetDir}`);
                return;
            }

            await this.decompressFile(compressedFilePath, targetDir);

            this.logger.debug(`Successfully processed: ${compressedFileName}`);
        } catch (error) {
            this.logger.error(`Error processing ${compressedFileName}: ${error}`);
        }
    }

    /**
     * Checks if a directory exists and is empty.
     */
    private async isDirectoryEmpty(directoryPath: string): Promise<boolean> {
        try {
            const exists = await fs.pathExists(directoryPath);
            if (!exists) {
                return true; // Directory doesn't exist, consider it empty.
            }
            const files = await fs.readdir(directoryPath);
            return files.length === 0;
        } catch (error) {
            this.logger.error(`Error checking if directory is empty ${directoryPath}: ${error}`);
            throw error;
        }
    }

    /**
     * Decompresses a 7-zip archive to the target directory.
     */
    private decompressFile(archivePath: string, destinationPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const myStream = Seven.extractFull(archivePath, destinationPath, {
                $bin: path7za,
                overwrite: "a",
            });

            let hadError = false;

            myStream.on("end", () => {
                if (!hadError) {
                    this.logger.debug(`Decompressed ${archivePath} to ${destinationPath}`);
                    resolve();
                }
            });

            myStream.on("error", (err) => {
                hadError = true;
                this.logger.error(`Error decompressing ${archivePath}: ${err}`);
                reject(err);
            });
        });
    }
}
