import { OnLoad } from "@spt/di/OnLoad";

export class OnLoadMod implements OnLoad {
    public constructor(
        private onLoadOverride: () => void,
        private getRouteOverride: () => string,
    ) {
        // super();
    }

    public async onLoad(): Promise<void> {
        return this.onLoadOverride();
    }

    public getRoute(): string {
        return this.getRouteOverride();
    }
}
