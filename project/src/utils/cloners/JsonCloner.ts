import { injectable } from "tsyringe";
import type { ICloner } from "@spt/utils/cloners/ICloner";

@injectable()
export class JsonCloner implements ICloner
{
    public clone<T>(obj: T): T
    {
        return JSON.parse(JSON.stringify(obj));
    }
}
