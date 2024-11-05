import { OnUpdate } from "@spt/di/OnUpdate";

export class OnUpdateMod implements OnUpdate {
    public constructor(
        private onUpdateOverride: (timeSinceLastRun: number) => boolean,
        private getRouteOverride: () => string,
    ) {}

    public async onUpdate(timeSinceLastRun: number): Promise<boolean> {
        return this.onUpdateOverride(timeSinceLastRun);
    }

    public getRoute(): string {
        return this.getRouteOverride();
    }
}
