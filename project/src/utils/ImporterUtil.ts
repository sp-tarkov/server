import { FileSystem } from "@spt/utils/FileSystem";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { ProgressWriter } from "@spt/utils/ProgressWriter";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImporterUtil {
    constructor(
        @inject("FileSystem") protected fileSystem: FileSystem,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
    ) {}

    public async loadAsync<T>(
        filepath: string,
        strippablePath = "",
        onReadCallback: (fileWithPath: string, data: string) => Promise<void> = () => Promise.resolve(),
        onObjectDeserialized: (fileWithPath: string, object: any) => Promise<void> = () => Promise.resolve(),
    ): Promise<T> {
        const result = {} as T;

        const allFiles = await this.fileSystem.getFiles(filepath, true, ["json"], true);

        const progressWriter = new ProgressWriter(allFiles.length); // Progress bar initialization
        const fileProcessingPromises = allFiles.map(async (file) => {
            try {
                const fileData = await this.fileSystem.read(file);
                await onReadCallback(file, fileData);
                const fileDeserialized = await this.jsonUtil.deserializeWithCacheCheck<any>(fileData, file, false);
                await onObjectDeserialized(file, fileDeserialized);
                const strippedFilePath = FileSystem.stripExtension(file).replace(filepath, "");
                this.placeObject(fileDeserialized, strippedFilePath, result, strippablePath);
            } finally {
                progressWriter.increment(); // Update progress bar after each file is processed
            }
        });

        await Promise.all(fileProcessingPromises).catch((e) => console.error(e)); // Wait for promises to resolve
        await this.jsonUtil.writeCache(); // Execute writing of all of the hashes one single time
        return result;
    }

    protected placeObject<T>(fileDeserialized: any, strippedFilePath: string, result: T, strippablePath: string): void {
        const strippedFinalPath = strippedFilePath.replace(strippablePath, "");
        const propertiesToVisit = strippedFinalPath.split("/");

        // Traverse the object structure
        let current = result;

        for (const [index, property] of propertiesToVisit.entries()) {
            // If we're at the last property, set the value
            if (index === propertiesToVisit.length - 1) {
                current[property] = fileDeserialized;
            } else {
                // Ensure the property exists as an object and move deeper
                current[property] = current[property] || {};
                current = current[property];
            }
        }
    }
}
