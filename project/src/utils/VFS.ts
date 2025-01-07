import "reflect-metadata";

import crypto from "node:crypto";
import fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import path, { resolve } from "node:path";
import type { IAsyncQueue } from "@spt/models/spt/utils/IAsyncQueue";
import { writeFileSync } from "atomically";
import { checkSync, lockSync, unlockSync } from "proper-lockfile";
import { inject, injectable } from "tsyringe";

@injectable()
export class VFS {
    constructor(@inject("AsyncQueue") protected asyncQueue: IAsyncQueue) {}

    public exists(filepath: fs.PathLike): boolean {
        return fs.existsSync(filepath);
    }

    public async existsAsync(filepath: fs.PathLike): Promise<boolean> {
        try {
            await fsPromises.access(filepath);

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
        await fsPromises.copyFile(filepath, target);
    }

    public createDir(filepath: string): void {
        fs.mkdirSync(filepath.substr(0, filepath.lastIndexOf("/")), { recursive: true });
    }

    public async createDirAsync(filepath: string): Promise<void> {
        await fsPromises.mkdir(filepath.slice(0, filepath.lastIndexOf("/")), { recursive: true });
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
        const read = await fsPromises.readFile(path);
        if (this.isBuffer(read)) {
            return read.toString();
        }
        return read;
    }

    private isBuffer(value: Buffer | string): value is Buffer {
        return Buffer.isBuffer(value);
    }

    public writeFile(filepath: string, data = "", append = false, atomic = true): void {
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

    public async writeFileAsync(filepath: string, data = "", append = false, atomic = true): Promise<void> {
        const options = append ? { flag: "a" } : { flag: "w" };

        if (!(await this.existsAsync(filepath))) {
            await this.createDirAsync(filepath);
            await fsPromises.writeFile(filepath, "");
        }

        if (!append && atomic) {
            await fsPromises.writeFile(filepath, data);
        } else {
            await fsPromises.writeFile(filepath, data, options);
        }
    }

    public getFiles(filepath: string): string[] {
        return fs.readdirSync(filepath).filter((item) => {
            return fs.statSync(path.join(filepath, item)).isFile();
        });
    }

    public async getFilesAsync(filepath: string): Promise<string[]> {
        const entries = await fsPromises.readdir(filepath, { withFileTypes: true });
        return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    }

    public getDirs(filepath: string): string[] {
        return fs.readdirSync(filepath).filter((item) => {
            return fs.statSync(path.join(filepath, item)).isDirectory();
        });
    }

    public async getDirsAsync(filepath: string): Promise<string[]> {
        const entries = await fsPromises.readdir(filepath, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    }

    public removeFile(filepath: string): void {
        fs.unlinkSync(filepath);
    }

    public async removeFileAsync(filepath: string): Promise<void> {
        await fsPromises.unlink(filepath);
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
        await fsPromises.rmdir(filepath);
    }

    public rename(oldPath: string, newPath: string): void {
        fs.renameSync(oldPath, newPath);
    }

    public async renameAsync(oldPath: string, newPath: string): Promise<void> {
        await fsPromises.rename(oldPath, newPath);
    }

    protected lockFileSync(filepath: string): () => void {
        return lockSync(filepath);
    }

    protected checkFileSync(filepath: string): boolean {
        return checkSync(filepath);
    }

    protected unlockFileSync(filepath: string): void {
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
