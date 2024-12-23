import { JsonUtil } from "@spt/utils/JsonUtil";
import { ProgressWriter } from "@spt/utils/ProgressWriter";
import { VFS } from "@spt/utils/VFS";
import { Queue } from "@spt/utils/collections/queue/Queue";
import { inject, injectable } from "tsyringe";

@injectable()
export class ImporterUtil {
    constructor(
        @inject("VFS") protected vfs: VFS,
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
    ) {}

    /**
     * Load files into js objects recursively (asynchronous)
     * @param filepath Path to folder with files
     * @returns Promise<T> return T type associated with this class
     */
    public async loadRecursiveAsync<T>(
        filepath: string,
        onReadCallback: (fileWithPath: string, data: string) => void = () => {},
        onObjectDeserialized: (fileWithPath: string, object: any) => void = () => {},
    ): Promise<T> {
        const result = {} as T;

        // get all filepaths
        const files = this.vfs.getFiles(filepath);
        const directories = this.vfs.getDirs(filepath);

        // add file content to result
        for (const file of files) {
            if (this.vfs.getFileExtension(file) === "json") {
                const filename = this.vfs.stripExtension(file);
                const filePathAndName = `${filepath}${file}`;
                await this.vfs.readFileAsync(filePathAndName).then((fileData) => {
                    onReadCallback(filePathAndName, fileData);
                    const fileDeserialized = this.jsonUtil.deserializeWithCacheCheck(fileData, filePathAndName);
                    onObjectDeserialized(filePathAndName, fileDeserialized);
                    result[filename] = fileDeserialized;
                });
            }
        }

        // deep tree search
        for (const dir of directories) {
            result[dir] = this.loadRecursiveAsync(`${filepath}${dir}/`);
        }

        // set all loadRecursive to be executed asynchronously
        const resEntries = Object.entries(result);
        const resResolved = await Promise.all(resEntries.map((ent) => ent[1]));
        for (let resIdx = 0; resIdx < resResolved.length; resIdx++) {
            resEntries[resIdx][1] = resResolved[resIdx];
        }

        // return the result of all async fetch
        return Object.fromEntries(resEntries) as T;
    }

    /**
     * Load files into js objects recursively (synchronous)
     * @param filepath Path to folder with files
     * @returns
     */
    public loadRecursive<T>(
        filepath: string,
        onReadCallback: (fileWithPath: string, data: string) => void = () => {},
        onObjectDeserialized: (fileWithPath: string, object: any) => void = () => {},
    ): T {
        const result = {} as T;

        // get all filepaths
        const files = this.vfs.getFiles(filepath);
        const directories = this.vfs.getDirs(filepath);

        // add file content to result
        for (const file of files) {
            if (this.vfs.getFileExtension(file) === "json") {
                const filename = this.vfs.stripExtension(file);
                const filePathAndName = `${filepath}${file}`;
                const fileData = this.vfs.readFile(filePathAndName);
                onReadCallback(filePathAndName, fileData);
                const fileDeserialized = this.jsonUtil.deserializeWithCacheCheck(fileData, filePathAndName);
                onObjectDeserialized(filePathAndName, fileDeserialized);
                result[filename] = fileDeserialized;
            }
        }

        // deep tree search
        for (const dir of directories) {
            result[dir] = this.loadRecursive(`${filepath}${dir}/`);
        }

        return result;
    }

    public async loadAsync<T>(
        filepath: string,
        strippablePath = "",
        onReadCallback: (fileWithPath: string, data: string) => void = () => {},
        onObjectDeserialized: (fileWithPath: string, object: any) => void = () => {},
    ): Promise<T> {
        const directoriesToRead = new Queue<string>();
        const filesToProcess = new Queue<VisitNode>();

        const promises = new Array<Promise<any>>();

        const result = {} as T;

        const files = this.vfs.getFiles(filepath);
        const directories = this.vfs.getDirs(filepath);

        directoriesToRead.enqueueAll(directories.map((d) => `${filepath}${d}`));
        filesToProcess.enqueueAll(files.map((f) => new VisitNode(filepath, f)));

        while (directoriesToRead.length !== 0) {
            const directory = directoriesToRead.dequeue();
            if (!directory) continue;
            filesToProcess.enqueueAll(this.vfs.getFiles(directory).map((f) => new VisitNode(`${directory}/`, f)));
            directoriesToRead.enqueueAll(this.vfs.getDirs(directory).map((d) => `${directory}/${d}`));
        }

        const progressWriter = new ProgressWriter(filesToProcess.length - 1);

        while (filesToProcess.length !== 0) {
            const fileNode = filesToProcess.dequeue();
            if (!fileNode) continue;

            if (this.vfs.getFileExtension(fileNode.fileName) === "json") {
                const filePathAndName = `${fileNode.filePath}${fileNode.fileName}`;
                promises.push(
                    this.vfs
                        .readFileAsync(filePathAndName)
                        .then(async (fileData) => {
                            onReadCallback(filePathAndName, fileData);
                            return this.jsonUtil.deserializeWithCacheCheckAsync<any>(fileData, filePathAndName);
                        })
                        .then(async (fileDeserialized) => {
                            onObjectDeserialized(filePathAndName, fileDeserialized);
                            const strippedFilePath = this.vfs.stripExtension(filePathAndName).replace(filepath, "");
                            this.placeObject(fileDeserialized, strippedFilePath, result, strippablePath);
                        })
                        .then(() => progressWriter.increment()),
                );
            }
        }

        await Promise.all(promises).catch((e) => console.error(e));

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
