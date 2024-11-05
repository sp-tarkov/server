import "reflect-metadata";

import crypto from "node:crypto";
import fs from "node:fs";
import path, { resolve } from "node:path";
import { promisify } from "node:util";
import { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { writeFileSync } from "atomically";
import { checkSync, lockSync, unlockSync } from "proper-lockfile";
import { inject, injectable } from "tsyringe";

@injectable()
export class VFS {
    accessFilePromisify: (path: fs.PathLike, mode?: number) => Promise<void>;
    copyFilePromisify: (src: fs.PathLike, dst: fs.PathLike, flags?: number) => Promise<void>;
    mkdirPromisify: (
        path: fs.PathLike,
        options: fs.MakeDirectoryOptions & { recursive: true },
    ) => Promise<string | undefined>;

    readFilePromisify: (path: fs.PathLike) => Promise<Buffer>;
    writeFilePromisify: (path: fs.PathLike, data: string, options?: any) => Promise<void>;
    readdirPromisify: (
        path: fs.PathLike,
        options?: BufferEncoding | { encoding: BufferEncoding; withFileTypes?: false },
    ) => Promise<string[]>;

    statPromisify: (path: fs.PathLike, options?: fs.StatOptions & { bigint?: false }) => Promise<fs.Stats>;
    unlinkPromisify: (path: fs.PathLike) => Promise<void>;
    rmdirPromisify: (path: fs.PathLike) => Promise<void>;
    renamePromisify: (oldPath: fs.PathLike, newPath: fs.PathLike) => Promise<void>;

    constructor(@inject("AsyncQueue") protected asyncQueue: IAsyncQueue) {
        this.accessFilePromisify = promisify(fs.access);
        this.copyFilePromisify = promisify(fs.copyFile);
        this.mkdirPromisify = promisify(fs.mkdir);
        this.readFilePromisify = promisify(fs.readFile);
        this.writeFilePromisify = promisify(fs.writeFile);
        this.readdirPromisify = promisify(fs.readdir);
        this.statPromisify = promisify(fs.stat);
        this.unlinkPromisify = promisify(fs.unlinkSync);
        this.rmdirPromisify = promisify(fs.rmdir);
        this.renamePromisify = promisify(fs.renameSync);
    }

    public exists(filepath: fs.PathLike): boolean {
        return fs.existsSync(filepath);
    }

    public async existsAsync(filepath: fs.PathLike): Promise<boolean> {
        try {
            // Create the command to add to the queue
            const command = { uuid: crypto.randomUUID(), cmd: async () => await this.accessFilePromisify(filepath) };
            // Wait for the command completion
            await this.asyncQueue.waitFor(command);

            // If no Exception, the file exists
            return true;
        } catch {
            // If Exception, the file does not exist
            return false;
        }
    }

    public copyFile(filepath: fs.PathLike, target: fs.PathLike): void {
        fs.copyFileSync(filepath, target);
    }

    public async copyAsync(filepath: fs.PathLike, target: fs.PathLike): Promise<void> {
        const command = { uuid: crypto.randomUUID(), cmd: async () => await this.copyFilePromisify(filepath, target) };
        await this.asyncQueue.waitFor(command);
    }

    public createDir(filepath: string): void {
        fs.mkdirSync(filepath.substr(0, filepath.lastIndexOf("/")), { recursive: true });
    }

    public async createDirAsync(filepath: string): Promise<void> {
        const command = {
            uuid: crypto.randomUUID(),
            cmd: async () =>
                await this.mkdirPromisify(filepath.substr(0, filepath.lastIndexOf("/")), { recursive: true }),
        };
        await this.asyncQueue.waitFor(command);
    }

    public copyDir(filepath: string, target: string, fileExtensions?: string | string[]): void {
        const files = this.getFiles(filepath);
        const dirs = this.getDirs(filepath);

        if (!this.exists(target)) {
            this.createDir(`${target}/`);
        }

        for (const dir of dirs) {
            this.copyDir(path.join(filepath, dir), path.join(target, dir), fileExtensions);
        }

        for (const file of files) {
            // copy all if fileExtension is not set, copy only those with fileExtension if set
            if (!fileExtensions || fileExtensions.includes(file.split(".").pop() ?? "")) {
                this.copyFile(path.join(filepath, file), path.join(target, file));
            }
        }
    }

    public async copyDirAsync(filepath: string, target: string, fileExtensions: string | string[]): Promise<void> {
        const files = this.getFiles(filepath);
        const dirs = this.getDirs(filepath);

        if (!(await this.existsAsync(target))) {
            await this.createDirAsync(`${target}/`);
        }

        for (const dir of dirs) {
            await this.copyDirAsync(path.join(filepath, dir), path.join(target, dir), fileExtensions);
        }

        for (const file of files) {
            // copy all if fileExtension is not set, copy only those with fileExtension if set
            if (!fileExtensions || fileExtensions.includes(file.split(".").pop() ?? "")) {
                await this.copyAsync(path.join(filepath, file), path.join(target, file));
            }
        }
    }

    public readFile(...args: Parameters<typeof fs.readFileSync>): string {
        const read = fs.readFileSync(...args);
        if (this.isBuffer(read)) {
            return read.toString();
        }
        return read;
    }

    public async readFileAsync(path: fs.PathLike): Promise<string> {
        const read = await this.readFilePromisify(path);
        if (this.isBuffer(read)) {
            return read.toString();
        }
        return read;
    }

    private isBuffer(value: any): value is Buffer {
        return value?.write && value.toString && value.toJSON && value.equals;
    }

    public writeFile(filepath: any, data = "", append = false, atomic = true): void {
        const options = append ? { flag: "a" } : { flag: "w" };

        if (!this.exists(filepath)) {
            this.createDir(filepath);
            fs.writeFileSync(filepath, "");
        }

        const releaseCallback = this.lockFileSync(filepath);

        if (!append && atomic) {
            writeFileSync(filepath, data);
        } else {
            fs.writeFileSync(filepath, data, options);
        }

        releaseCallback();
    }

    public async writeFileAsync(filepath: any, data = "", append = false, atomic = true): Promise<void> {
        const options = append ? { flag: "a" } : { flag: "w" };

        if (!(await this.exists(filepath))) {
            await this.createDir(filepath);
            await this.writeFilePromisify(filepath, "");
        }

        if (!append && atomic) {
            await this.writeFilePromisify(filepath, data);
        } else {
            await this.writeFilePromisify(filepath, data, options);
        }
    }

    public getFiles(filepath: string): string[] {
        return fs.readdirSync(filepath).filter((item) => {
            return fs.statSync(path.join(filepath, item)).isFile();
        });
    }

    public async getFilesAsync(filepath: string): Promise<string[]> {
        const addr = await this.readdirPromisify(filepath);
        return addr.filter(async (item) => {
            const stat = await this.statPromisify(path.join(filepath, item));
            return stat.isFile();
        });
    }

    public getDirs(filepath: string): string[] {
        return fs.readdirSync(filepath).filter((item) => {
            return fs.statSync(path.join(filepath, item)).isDirectory();
        });
    }

    public async getDirsAsync(filepath: string): Promise<string[]> {
        const addr = await this.readdirPromisify(filepath);
        return addr.filter(async (item) => {
            const stat = await this.statPromisify(path.join(filepath, item));
            return stat.isDirectory();
        });
    }

    public removeFile(filepath: string): void {
        fs.unlinkSync(filepath);
    }

    public async removeFileAsync(filepath: string): Promise<void> {
        await this.unlinkPromisify(filepath);
    }

    public removeDir(filepath: string): void {
        const files = this.getFiles(filepath);
        const dirs = this.getDirs(filepath);

        for (const dir of dirs) {
            this.removeDir(path.join(filepath, dir));
        }

        for (const file of files) {
            this.removeFile(path.join(filepath, file));
        }

        fs.rmdirSync(filepath);
    }

    public async removeDirAsync(filepath: string): Promise<void> {
        const files = this.getFiles(filepath);
        const dirs = this.getDirs(filepath);

        const promises: Promise<void>[] = [];

        for (const dir of dirs) {
            promises.push(this.removeDirAsync(path.join(filepath, dir)));
        }

        for (const file of files) {
            promises.push(this.removeFileAsync(path.join(filepath, file)));
        }

        await Promise.all(promises);
        await this.rmdirPromisify(filepath);
    }

    public rename(oldPath: string, newPath: string): void {
        fs.renameSync(oldPath, newPath);
    }

    public async renameAsync(oldPath: string, newPath: string): Promise<void> {
        await this.renamePromisify(oldPath, newPath);
    }

    protected lockFileSync(filepath: any): () => void {
        return lockSync(filepath);
    }

    protected checkFileSync(filepath: any): boolean {
        return checkSync(filepath);
    }

    protected unlockFileSync(filepath: any): void {
        unlockSync(filepath);
    }

    public getFileExtension(filepath: string): string | undefined {
        return filepath.split(".").pop();
    }

    public stripExtension(filepath: string): string {
        return filepath.split(".").slice(0, -1).join(".");
    }

    public async minifyAllJsonInDirRecursive(filepath: string): Promise<void> {
        const files = this.getFiles(filepath).filter((item) => this.getFileExtension(item) === "json");
        for (const file of files) {
            const filePathAndName = path.join(filepath, file);
            const minified = JSON.stringify(JSON.parse(this.readFile(filePathAndName)));
            this.writeFile(filePathAndName, minified);
        }

        const dirs = this.getDirs(filepath);
        for (const dir of dirs) {
            this.minifyAllJsonInDirRecursive(path.join(filepath, dir));
        }
    }

    public async minifyAllJsonInDirRecursiveAsync(filepath: string): Promise<void> {
        const files = this.getFiles(filepath).filter((item) => this.getFileExtension(item) === "json");
        for (const file of files) {
            const filePathAndName = path.join(filepath, file);
            const minified = JSON.stringify(JSON.parse(await this.readFile(filePathAndName)));
            await this.writeFile(filePathAndName, minified);
        }

        const dirs = this.getDirs(filepath);
        const promises: Promise<void>[] = [];
        for (const dir of dirs) {
            promises.push(this.minifyAllJsonInDirRecursive(path.join(filepath, dir)));
        }
        await Promise.all(promises);
    }

    public getFilesOfType(directory: string, fileType: string, files: string[] = []): string[] {
        // no dir so exit early
        if (!fs.existsSync(directory)) {
            return files;
        }

        const dirents = fs.readdirSync(directory, { encoding: "utf-8", withFileTypes: true });
        for (const dirent of dirents) {
            const res = resolve(directory, dirent.name);
            if (dirent.isDirectory()) {
                this.getFilesOfType(res, fileType, files);
            } else {
                if (res.endsWith(fileType)) {
                    files.push(res);
                }
            }
        }

        return files;
    }
}
