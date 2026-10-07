import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProcessQueue } from "./process.queue";
import { platformClient } from "./platform.client";
import { PlatformHttpError } from "./platform.error";
import { runManager } from "./run.manager";

describe("ProcessQueue", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not enrich a duplicated run_id + seq twice", async () => {
        const queue = new ProcessQueue();

        const enrichSpy = vi
            .spyOn(platformClient, "enrich")
            .mockResolvedValue({
                sku: "sku-duplicate",
                price: 100,
                stock: 10
            });

        const message = {
            run_id: "duplicate-run",
            seq: 0,
            sku: "sku-duplicate"
        };

        runManager.registerRun(message.run_id, 2)

        queue.add(message);
        queue.add(message);

        await vi.waitFor(() => {
            expect(enrichSpy).toHaveBeenCalledTimes(1);
        });
    });

    it("never processes more than 3 enrichments concurrently", async () => {
        const queue = new ProcessQueue();
        const runId = "concurrency-test";

        let active = 0;
        let maxActive = 0;
        let completed = 0;

        vi.spyOn(platformClient, "enrich").mockImplementation(
            async (sku: string) => {
                active++;
                maxActive = Math.max(maxActive, active);

                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 20);
                });

                active--;
                completed++;

                return {
                    sku,
                    price: 100,
                    stock: 10
                };
            }
        );

        const callbackSpy = vi
            .spyOn(platformClient, "sendCallback")
            .mockResolvedValue("ok");

        vi.spyOn(runManager, "scheduleCleanup")
            .mockImplementation(() => {});

        runManager.registerRun(runId, 5);

        for (let seq = 0; seq < 5; seq++) {
            queue.add({
                run_id: runId,
                seq,
                sku: `sku-${seq}`
            });
        }

        expect(active).toBe(3);

        await vi.waitFor(() => {
            expect(completed).toBe(5);
            expect(active).toBe(0);
            expect(callbackSpy).toHaveBeenCalledTimes(1);
            expect(runManager.getRun(runId)?.callbackStatus).toBe("sent");
        });

        expect(maxActive).toBe(3);
    })
 
    it("retries a transient 500 error", async () => {
        const queue = new ProcessQueue();

        const enrichSpy = vi
            .spyOn(platformClient, "enrich")
            .mockRejectedValueOnce(
                new PlatformHttpError(500)
            )
            .mockResolvedValueOnce({
                sku: "sku-retry",
                price: 200,
                stock: 20
            });

        const runId = "retry-500-run";

        runManager.registerRun(runId, 2);

        queue.add({
            run_id: runId,
            seq: 0,
            sku: "sku-retry",
        });

        await vi.waitFor(
            () => {
                expect(enrichSpy).toHaveBeenCalledTimes(2);
            },
            {
                timeout: 2000,
            }
        );
    });

    it("does not retry a 401 response", async () => {
        const queue = new ProcessQueue();

        const enrichSpy = vi
            .spyOn(platformClient, "enrich")
            .mockRejectedValue(
                new PlatformHttpError(401)
            );

        const runId = "terminal-401-run";

        runManager.registerRun(runId, 2);
        
        queue.add({
            run_id: runId,
            seq: 0,
            sku: "sku-401"
        });

        await vi.waitFor(() => {
            expect(
                runManager
                    .getRun(runId)
                    ?.failed.has(0)
            ).toBe(true);
        });

        expect(enrichSpy).toHaveBeenCalledTimes(1);
    });

    it("does not retry a 404 response", async () => {
        const queue = new ProcessQueue();

        const enrichSpy = vi
            .spyOn(platformClient, "enrich")
            .mockRejectedValue(
                new PlatformHttpError(404)
            );

        const runId = "terminal-404-run"

        runManager.registerRun(runId, 2);

        queue.add({
            run_id: runId,
            seq: 0,
            sku: "sku-404"
        });

        await vi.waitFor(() => {
            expect(
                runManager
                    .getRun(runId)
                    ?.failed.has(0)
            ).toBe(true);
        });

        expect(enrichSpy).toHaveBeenCalledTimes(1);
    });
});