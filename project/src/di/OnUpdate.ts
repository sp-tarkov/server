export interface OnUpdate
{
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onUpdate(timeSinceLastRun: number): Promise<boolean>;

    getRoute(): string;
}
