import { IGetBodyResponseData } from "@spt/models/eft/httpResponse/IGetBodyResponseData";
import { INullResponseData } from "@spt/models/eft/httpResponse/INullResponseData";
import { IItemEventRouterResponse } from "@spt/models/eft/itemEvent/IItemEventRouterResponse";
import { BackendErrorCodes } from "@spt/models/enums/BackendErrorCodes";
import { LocalisationService } from "@spt/services/LocalisationService";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class HttpResponseUtil {
    constructor(
        @inject("JsonUtil") protected jsonUtil: JsonUtil,
        @inject("LocalisationService") protected localisationService: LocalisationService,
    ) {}

    protected clearString(s: string): any {
        return s
            .replace(/[\b]/g, "")
            .replace(/[\f]/g, "")
            .replace(/[\n]/g, "")
            .replace(/[\r]/g, "")
            .replace(/[\t]/g, "");
    }

    /**
     * Return passed in data as JSON string
     * @param data
     * @returns
     */
    public noBody(data: any): any {
        return this.clearString(this.jsonUtil.serialize(data));
    }

    /**
     * Game client needs server responses in a particular format
     * @param data
     * @param err
     * @param errmsg
     * @returns
     */
    public getBody<T>(data: T, err = 0, errmsg?: string, sanitize = true): IGetBodyResponseData<T> {
        return sanitize
            ? this.clearString(this.getUnclearedBody(data, err, errmsg))
            : (this.getUnclearedBody(data, err, errmsg) as any);
    }

    public getUnclearedBody(data: any, err = 0, errmsg?: string): string {
        return this.jsonUtil.serialize({ err: err, errmsg: errmsg, data: data });
    }

    public emptyResponse(): IGetBodyResponseData<string> {
        return this.getBody("", 0, "");
    }

    public nullResponse(): INullResponseData {
        return this.clearString(this.getUnclearedBody(undefined, 0, undefined));
    }

    public emptyArrayResponse(): IGetBodyResponseData<any[]> {
        return this.getBody([]);
    }

    /**
     * Add an error into the 'warnings' array of the client response message
     * @param output IItemEventRouterResponse
     * @param message Error message
     * @param errorCode Error code
     * @returns IItemEventRouterResponse
     */
    public appendErrorToOutput(
        output: IItemEventRouterResponse,
        message = this.localisationService.getText("http-unknown_error"),
        errorCode = BackendErrorCodes.NONE,
    ): IItemEventRouterResponse {
        if (output.warnings?.length > 0) {
            output.warnings.push({ index: output.warnings?.length - 1, errmsg: message, code: errorCode.toString() });
        } else {
            output.warnings = [{ index: 0, errmsg: message, code: errorCode.toString() }];
        }

        return output;
    }
}
