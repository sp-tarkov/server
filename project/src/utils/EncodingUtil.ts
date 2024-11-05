import { injectable } from "tsyringe";

@injectable()
export class EncodingUtil {
    public encode(value: string, encode: EncodeType): string {
        return Buffer.from(value).toString(encode);
    }

    public decode(value: string, encode: EncodeType): string {
        return Buffer.from(value, encode).toString(EncodeType.UTF8);
    }

    public fromBase64(value: string): string {
        return this.decode(value, EncodeType.BASE64);
    }

    public toBase64(value: string): string {
        return this.encode(value, EncodeType.BASE64);
    }

    public fromHex(value: string): string {
        return this.decode(value, EncodeType.HEX);
    }

    public toHex(value: string): string {
        return this.encode(value, EncodeType.HEX);
    }
}

export enum EncodeType {
    BASE64 = "base64",
    HEX = "hex",
    ASCII = "ascii",
    BINARY = "binary",
    UTF8 = "utf8",
}
