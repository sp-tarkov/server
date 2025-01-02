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
        onReadCallback: (fileWithPath: string, data: string) => void = () => {},
        onObjectDeserialized: (fileWithPath: string, object: any) => void = () => {},
    ): Promise<T> {
        const result = {} as T;

        const allFiles = await this.fileSystem.getFiles(filepath, true, ["json"]);
        const progressWriter = new ProgressWriter(allFiles.length); // Progress bar initialization
        const fileProcessingPromises = allFiles.map(async (file) => {
            try {
                const fileData = await this.fileSystem.read(file);
                onReadCallback(file, fileData);
                const fileDeserialized = await this.jsonUtil.deserializeWithCacheCheckAsync<any>(fileData, file);
                onObjectDeserialized(file, fileDeserialized);
                const strippedFilePath = FileSystem.stripExtension(file).replace(filepath, "");
                this.placeObject(fileDeserialized, strippedFilePath, result, strippablePath);
            } finally {
                progressWriter.increment(); // Update progress bar after each file is processed
            }
        });

        await Promise.all(fileProcessingPromises).catch((e) => console.error(e)); // Wait for promises to resolve
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
