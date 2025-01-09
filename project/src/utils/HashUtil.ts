import crypto, { webcrypto } from "node:crypto";
import { crc32 } from "node:zlib";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { mongoid } from "mongoid-js";
import { inject, injectable } from "tsyringe";
import { FileSystemSync } from "./FileSystemSync";

@injectable()
export class HashUtil {
    constructor(
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("FileSystemSync") protected fileSystemSync: FileSystemSync,
    ) {}

    /**
     * Create a 24 character id using the sha256 algorithm + current timestamp
     * @returns 24 character hash
     */
    public generate(): string {
        return mongoid();
    }

    /**
     * is the passed in string a valid mongo id
     * @param stringToCheck String to check
     * @returns True when string is a valid mongo id
     */
    public isValidMongoId(stringToCheck: string) {
        return /^[a-fA-F0-9]{24}$/.test(stringToCheck);
    }

    public generateMd5ForData(data: string): string {
        return this.generateHashForData("md5", data);
    }

    public generateSha1ForData(data: string): string {
        return this.generateHashForData("sha1", data);
    }

    public generateCRC32ForFile(filePath: string): number {
        return crc32(this.fileSystemSync.read(filePath));
    }
    /**
     * Create a hash for the data parameter
     * @param algorithm algorithm to use to hash
     * @param data data to be hashed
     * @returns hash value
     */
    public generateHashForData(algorithm: string, data: crypto.BinaryLike): string {
        const hashSum = crypto.createHash(algorithm);
        hashSum.update(data);
        return hashSum.digest("hex");
    }

    /** Creates a SHA-1 hash asynchronously, this doesn't end up blocking.
     * @param data data to be hashed
     * @returns A promise with the hash value
     */
    public async generateSha1ForDataAsync(data: crypto.BinaryLike): Promise<string> {
        const encoder = new TextEncoder();
        const encodedData = encoder.encode(data.toString());

        const hashBuffer = await webcrypto.subtle.digest("SHA-1", encodedData);
        return [...new Uint8Array(hashBuffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }

    public generateAccountId(): number {
        const min = 1000000;
        const max = 1999999;
        return max > min ? Math.floor(Math.random() * (max - min + 1) + min) : min;
    }
}
