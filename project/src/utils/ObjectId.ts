import crypto from "node:crypto";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class ObjectId {
    constructor(@inject("TimeUtil") protected timeUtil: TimeUtil) {}

    protected randomBytes = crypto.randomBytes(5);
    protected constglobalCounter = 0;
    protected consttime = 0;
    protected globalCounter: number;
    protected time: number;

    public incGlobalCounter(): number {
        this.globalCounter = (this.globalCounter + 1) % 0xffffff;
        return this.globalCounter;
    }

    public toHexString(byteArray: string | any[] | Buffer): string {
        let hexString = "";
        for (let i = 0; i < byteArray.length; i++) {
            hexString += `0${(byteArray[i] & 0xff).toString(16)}`.slice(-2);
        }
        return hexString;
    }

    public generate(): string {
        const time = this.timeUtil.getTimestamp();
        if (this.time !== time) {
            this.globalCounter = 0;
            this.time = time;
        }
        const counter = this.incGlobalCounter();
        const objectIdBinary = Buffer.alloc(12);

        objectIdBinary[3] = time & 0xff;
        objectIdBinary[2] = (time >> 8) & 0xff;
        objectIdBinary[1] = (time >> 16) & 0xff;
        objectIdBinary[0] = (time >> 24) & 0xff;
        objectIdBinary[4] = this.randomBytes[0];
        objectIdBinary[5] = this.randomBytes[1];
        objectIdBinary[6] = this.randomBytes[2];
        objectIdBinary[7] = this.randomBytes[3];
        objectIdBinary[8] = this.randomBytes[4];
        objectIdBinary[9] = (counter >> 16) & 0xff;
        objectIdBinary[10] = (counter >> 8) & 0xff;
        objectIdBinary[11] = counter & 0xff;

        return this.toHexString(objectIdBinary);
    }
}
