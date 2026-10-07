import { ProcessedItem, ProcessMessage } from "./integration.types";
import { platformClient } from "./platform.client";
import { PlatformHttpError } from "./platform.error";
import { runManager } from "./run.manager";

export class ProcessQueue {
    private queue: ProcessMessage[] = [];
    
    private activeWorkers = 0;
    private readonly concurrency = 3;
    

    add(message: ProcessMessage): void {
        const isNew = runManager.registerMessage(message);

        if (!isNew) {
            console.log(`[DUPLICATE] run=${message.run_id} seq=${message.seq}`);
            return;
        }
        this.queue.push(message);

        this.process();
    }

    private process(): void {
        while (
            this.activeWorkers < this.concurrency &&
            this.queue.length > 0
        ) {
            const message = this.queue.shift();

            if (!message) {
                return;
            }

            this.activeWorkers++;

            void this.handle(message)
                .catch((error) => {
                    console.error(`[ERROR] seq=${message.seq} sku=${message.sku}`, error)
                })
                .finally(() => {
                    this.activeWorkers--;
                    this.process();
                });
        }
    }

    private async enrichWithRetry(
        sku: string,
        maxAttempts = 4
    ) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) { 
            try {
                return await platformClient.enrich(sku);
            } catch (error) {
                if (!(error instanceof PlatformHttpError)) {
                    throw error;
                }

                if (error.status === 401 || error.status === 404) {
                    throw error;
                }

                if (attempt === maxAttempts) {
                    throw error;
                }

                let delayMs: number;

                if (error.status === 429 && error.retryAfter !== undefined) {
                    delayMs = error.retryAfter * 1000;
                } else if (error.status >= 500) {
                    delayMs = 500 * 2 ** (attempt - 1);
                } else {
                    throw error;
                }

                console.warn(
                    `[RETRY] sku=${sku} status=${error.status} attempt=${attempt}/${maxAttempts} waiting=${delayMs}ms`
                );

                await this.sleep(delayMs);
            }
        }
        throw new Error(`Unexpected retry state for sku=${sku}`);
    }

    private async sleep(ms: number): Promise<void> {
        return new Promise((resolve) =>  setTimeout(resolve, ms));
    }

    private async handle(message: ProcessMessage): Promise<void> {
        console.log(`[START] seq=${message.seq} sku=${message.sku} | active=${this.activeWorkers}`);

        try {
            const result = await this.enrichWithRetry(message.sku);

            runManager.markCompleted(message, {
                seq: message.seq,
                sku: message.sku,
                price: result.price,
                stock: result.stock
            })

            console.log(`[SUCCESS] seq=${message.seq} sku=${message.sku}`, result);
        } catch (error) {
            runManager.markFailed(message);

            console.error(`[ENRICH ERROR] seq=${message.seq} sku=${message.sku}`, error);
            return;
        }

        await this.tryFinalizeRun(message.run_id);
    }

    private async tryFinalizeRun(runId: string): Promise<void> {
        if (!runManager.isComplete(runId)) {
            return;
        }

        if (!runManager.tryMarkCallbackSending(runId)) {
            return;
        }

        try {
            const results = runManager.getResults(runId);

            console.log(`[CALLBACK] run=${runId} results=${results.length}`)

            const report = await this.sendCallbackWithRetry(runId, results);

            runManager.markCallbackSent(runId);
            runManager.scheduleCleanup(runId);

            console.log(`[CALLBACK SUCCESS] run=${runId}`)

            console.log(`[CALLBACK RESPONSE]`)
            console.log(report);
        } catch (error) {
            runManager.markCallbackFailed(runId);

            console.error(`[CALLBACK ERROR] run=${runId}`, error);
        }
    }

    private async sendCallbackWithRetry (runId: string, results: ProcessedItem[], maxAttempts = 3): Promise<string> {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await platformClient.sendCallback(runId, results);
            } catch (error) {
                if (!(error instanceof PlatformHttpError)) {
                    throw error;
                }

                if (attempt === maxAttempts) {
                    throw error;
                }

                if (error.status < 500 && error.status !== 429) {
                    throw error;
                }

                const delayMs =
                    error.status === 429 &&
                    error.retryAfter !== undefined
                        ? error.retryAfter * 1000
                        : 500 * 2 ** (attempt - 1);
            
                console.warn(`[CALLBACK RETRY] run=${runId} status=${error.status} attempt=${attempt}/${maxAttempts} waiting=${delayMs}ms`);

                await this.sleep(delayMs);
            }
        }

        throw new Error(`Unexpected callback retry state for run=${runId}`);
    }

    async registerRun(runId: string, total: number): Promise<void> {
        runManager.registerRun(runId, total);

        await this.tryFinalizeRun(runId);
    }
}

export const processQueue = new ProcessQueue();