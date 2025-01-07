import { JsonUtil } from "@spt/utils/JsonUtil";
import { ProgressWriter } from "@spt/utils/ProgressWriter";
import { VFS } from "@spt/utils/VFS";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImporterUtil {
    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
    ) {}

    public async loadAsync<T>(
        filepath: string,
        strippablePath = "",
        onReadCallback: (fileWithPath: string, data: string) => void = () => {},
        onObjectDeserialized: (fileWithPath: string, object: any) => void = () => {},
    ): Promise<T> {
        const result = {} as T;

        // Fetch files and directories concurrently for the root path
        const [files, directories] = await Promise.all([
            this.vfs.getFilesAsync(filepath),
            this.vfs.getDirsAsync(filepath),
        ]);

        // Queue to process files and directories for the root path first.
        const filesToProcess = files.map((f) => new VisitNode(filepath, f));
        const directoriesToRead = directories.map((d) => `${filepath}${d}`);

        const allFiles = [...filesToProcess];

        // Method to traverse directories and collect all files recursively
        const traverseDirectories = async (directory: string) => {
            const [directoryFiles, subDirectories] = await Promise.all([
                this.vfs.getFilesAsync(directory),
                this.vfs.getDirsAsync(directory),
            ]);

            // Add the files from this directory to the processing queue
            const fileNodes = directoryFiles.map((f) => new VisitNode(directory, f));
            allFiles.push(...fileNodes);

            // Recurse into subdirectories
            for (const subDirectory of subDirectories) {
                await traverseDirectories(`${directory}/${subDirectory}`);
            }
        };

        // Start recursive directory traversal
        const traversalPromises = directoriesToRead.map((dir) => traverseDirectories(dir));
        await Promise.all(traversalPromises); // Ensure all directories are processed

        // Setup the progress writer with the total amount of files to load
        const progressWriter = new ProgressWriter(allFiles.length);

        const fileProcessingPromises = allFiles.map(async (fileNode) => {
            if (this.vfs.getFileExtension(fileNode.fileName) !== "json") {
                return Promise.resolve(); // Skip non-JSON files
            }

            // Ensure we're creating the correct file path
            const filePathAndName = `${fileNode.filePath}${fileNode.filePath.endsWith("/") ? "" : "/"}${fileNode.fileName}`;

            try {
                const fileData = await this.vfs.readFileAsync(filePathAndName);
                onReadCallback(filePathAndName, fileData);
                const fileDeserialized = await this.jsonUtil.deserializeWithCacheCheckAsync<any>(fileData, filePathAndName);
                onObjectDeserialized(filePathAndName, fileDeserialized);
                const strippedFilePath = this.vfs.stripExtension(filePathAndName).replace(filepath, "");
                this.placeObject(fileDeserialized, strippedFilePath, result, strippablePath);
            } finally {
                return progressWriter.increment(); // Update progress after each file
            }
        });

        // Wait for all file processing to complete
        await Promise.all(fileProcessingPromises).catch((e) => console.error(e));

        return result;
    }

    protected placeObject<T>(fileDeserialized: any, strippedFilePath: string, result: T, strippablePath: string): void {
        const strippedFinalPath = strippedFilePath.replace(strippablePath, "");
        let temp = result;
        const propertiesToVisit = strippedFinalPath.split("/");
        for (let i = 0; i < propertiesToVisit.length; i++) {
            const property = propertiesToVisit[i];

            if (i === propertiesToVisit.length - 1) {
                temp[property] = fileDeserialized;
            } else {
                if (!temp[property]) {
                    temp[property] = {};
                }
                temp = temp[property];
            }
        }
    }
}

class VisitNode {
    constructor(
        public filePath: string,
        public fileName: string,
    ) {}
}
