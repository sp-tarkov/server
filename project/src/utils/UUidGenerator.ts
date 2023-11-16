import { injectable } from "tsyringe";

import { IUUidGenerator } from "@spt-aki/models/spt/utils/IUuidGenerator";

@injectable()
export class UUidGenerator implements IUUidGenerator
{
    // https://stackoverflow.com/a/8809472
    public generate(): string
    { // Public Domain/MIT
        let date = new Date().getTime(); // Timestamp
        let time = ((typeof performance !== "undefined") && performance.now && (performance.now() * 1000)) || 0; // Time in microseconds since page-load or 0 if unsupported
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c)
        {
            let rand = Math.random() * 16; // random number between 0 and 16
            if (date > 0)
            { // Use timestamp until depleted
                rand = (date + rand) % 16 | 0;
                date = Math.floor(date / 16);
            }
            else
            { // Use microseconds since page-load if supported
                rand = (time + rand) % 16 | 0;
                time = Math.floor(time / 16);
            }
            return (c === "x" ? rand : (rand & 0x3 | 0x8)).toString(16);
        });
    }
}
