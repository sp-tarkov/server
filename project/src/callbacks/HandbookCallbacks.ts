import { HandbookController } from "@spt/controllers/HandbookController";
import type { OnLoad } from "@spt/di/OnLoad";
import { inject, injectable } from "tsyringe";

@injectable()
export class HandbookCallbacks implements OnLoad {
    constructor(@inject("HandbookController") protected handbookController: HandbookController) {}

    public async onLoad(): Promise<void> {
        this.handbookController.load();
    }

    public getRoute(): string {
        return "spt-handbook";
    }
}
