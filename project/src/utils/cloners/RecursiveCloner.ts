import { injectable } from "tsyringe";
import type { ICloner } from "@spt-aki/utils/cloners/ICloner";

@injectable()
export class RecursiveCloner implements ICloner
{
    private static primitives = new Set<string>([
        "string",
        "number",
        "boolean",
        "bigint",
        "symbol",
        "undefined",
        "null",
    ]);

    public clone<T>(obj: T): T
    {
        const typeOfObj = typeof obj;
        // no need to clone these types, they are primitives
        if (RecursiveCloner.primitives.has(typeOfObj))
        {
            return obj;
        }
        // clone the object types
        if (typeOfObj === "object")
        {
            if (Array.isArray(obj))
            {
                // biome-ignore lint/suspicious/noExplicitAny: used for clone
                const objArr = obj as Array<any>;
                return objArr.map(v => this.clone(v)) as T;
            }

            const newObj = {};
            for (const propOf1 in obj)
            {
                newObj[propOf1.toString()] = this.clone(obj[propOf1]);
            }
            return newObj as T;
        }

        throw new Error(`Cant clone ${JSON.stringify(obj)}`);
    }
}
