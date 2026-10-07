import { ProcessMessage, ProcessedItem, RunState } from "./integration.types";

export class RunManager {
    private readonly runs = new Map<string, RunState>();

    registerMessage(message: ProcessMessage): boolean {
        const run = this.getOrCreate(message.run_id);

        if (run.received.has(message.seq)) {
            return false;
        }

        run.received.add(message.seq);

        return true;
    }

    registerRun(runId: string, total: number): void {
        const run = this.getOrCreate(runId);

        run.total = total;

        console.log(`[RUN CREATED] ${runId} | total=${total}`);
    }

    markCompleted(message: ProcessMessage, result: ProcessedItem): void {
        const run = this.getOrCreate(message.run_id);

        run.failed.delete(message.seq);

        run.completed.set(message.seq, result);

        console.log(
            `[RUN] ${message.run_id} | total=${run.total ?? "?"} received=${run.received.size}
            completed=${run.completed.size} failed=${run.failed.size}`
        )

        if (this.isComplete(message.run_id)) {
            console.log(`[RUN COMPLETE] ${message.run_id}`);
        }
    }

    markFailed(message: ProcessMessage): void {
        const run = this.getOrCreate(message.run_id);

        run.failed.add(message.seq);
    }

    getRun(runId: string): RunState | undefined {
       return this.runs.get(runId);
    }

    getResults(runId: string): ProcessedItem[] {
        const run = this.runs.get(runId);

        if (!run) {
            return [];
        }

        return Array.from(run.completed.values()).sort(
            (a, b) => a.seq - b.seq
        );
    }

    isComplete(runId: string): boolean {
        const run = this.runs.get(runId)

        if (!run || run.total === undefined) {
            return false;
        }

        return (
            run.completed.size === run.total &&
            run.failed.size === 0
        );
    }

    tryMarkCallbackSending(runId: string): boolean {
        const run = this.runs.get(runId);

        if (!run) {
            return false;
        }

        if (run.callbackStatus !== "pending") {
            return false;
        }

        run.callbackStatus = "sending"

        return true;
    }

    markCallbackSent(runId: string): void {
        const run = this.runs.get(runId);

        if (run) {
            run.callbackStatus = "sent";
        }
    }

    markCallbackFailed(runId: string): void {
        const run = this.runs.get(runId);

        if (run) {
            run.callbackStatus = "failed";
        }
    }

    scheduleCleanup(runId: string, ttlMs = 5 * 60 * 1000): void {
        setTimeout(() => {
            this.runs.delete(runId);
            console.log(`[RUN CLEANUP] ${runId}`)
        }, ttlMs)
    }

    private getOrCreate(runId: string): RunState {
        let run = this.runs.get(runId);

        if (!run) {
            run = {
                runId,
                received: new Set(),
                completed: new Map(),
                failed: new Set(),
                callbackStatus: "pending",
            };
            
            this.runs.set(runId, run);
        }

        return run;
    }
}

export const runManager = new RunManager();