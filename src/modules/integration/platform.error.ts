export class PlatformHttpError extends Error {
    constructor (
        public readonly status: number,
        public readonly retryAfter?: number,
    ) {
        super(`Platform request failed with status ${status}`);

        this.name = "PlatformHttpError";
    }
}