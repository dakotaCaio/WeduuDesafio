import { describe, expect, it } from "vitest";

import { RunManager } from "./run.manager";
import { ProcessMessage, ProcessedItem } from "./integration.types";

function createMessage(seq: number, runId = "run-1"): ProcessMessage {
    return {
        run_id: runId,
        seq,
        sku: `sku-${seq}`
    };
}

function createResult(seq: number): ProcessedItem {
    return {
        seq,
        sku: `sku-${seq}`,
        price: 100 + seq,
        stock: 10 + seq,
    };
}

describe("RunManager", () => {
    it("registers a new message", () => {
        const manager = new RunManager();
        const message = createMessage(0);

        const registered = manager.registerMessage(message);

        expect(registered).toBe(true);

        const run = manager.getRun("run-1");

        expect(run?.received.has(0)).toBe(true);
        expect(run?.received.size).toBe(1);
    });

    it("rejects duplicated run_id + seq", () => {
        const manager = new RunManager();

        const message = createMessage(3);

        expect(manager.registerMessage(message)).toBe(true);
        expect(manager.registerMessage(message)).toBe(false);

        expect(manager.getRun("run-1")?.received.size).toBe(1);
    });

    it("allows the same seq in different runs", () => {
        const manager = new RunManager();

        const first = createMessage(3, "run-1");
        const second = createMessage(3, "run-2");

        expect(manager.registerMessage(first)).toBe(true);
        expect(manager.registerMessage(second)).toBe(true);
    });

    it("returns results ordered by seq", () => {
        const manager = new RunManager();

        manager.markCompleted(
            createMessage(2),
            createResult(2)
        );

        manager.markCompleted(
            createMessage(0),
            createResult(0)
        )

        manager.markCompleted(
            createMessage(1),
            createResult(1)
        )

        const results = manager.getResults("run-1");

        expect(results.map((result) => result.seq)).toEqual([0, 1, 2]);
    });

    it("marks a run as complete only after all messages complete", () => {
        const manager = new RunManager();

        manager.registerRun("run-1", 2);

        manager.markCompleted(
            createMessage(0),
            createResult(0)
        );

        expect(manager.isComplete("run-1")).toBe(false);

        manager.markCompleted(
            createMessage(1),
            createResult(1)
        );

        expect(manager.isComplete("run-1")).toBe(true);
    });

    it("does not complete a run with failures", () => {
        const manager = new RunManager();

        manager.registerRun("run-1", 2);

        const message0 = createMessage(0);
        const message1 = createMessage(1);

        manager.markCompleted(
            message0,
            createResult(0)
        )

        manager.markCompleted(
            message1,
            createResult(1)
        );

        manager.markFailed(message1);

        expect(manager.isComplete("run-1")).toBe(false);
    });

    it("prevents concurrent callback attempts", () => {
        const manager = new RunManager();

        manager.registerRun("run-1", 1);

        expect(manager.tryMarkCallbackSending("run-1")).toBe(true);
        expect(manager.tryMarkCallbackSending("run-1")).toBe(false);

        manager.markCallbackSent("run-1");

        expect(manager.tryMarkCallbackSending("run-1")).toBe(false);
    });

    it("prevents another callback attempt after terminal failure", () => {
        const manager = new RunManager();

        manager.registerRun("run-1", 1);

        expect(manager.tryMarkCallbackSending("run-1")).toBe(true);

        manager.markCallbackFailed("run-1");

        expect(manager.getRun("run-1")?.callbackStatus).toBe("failed");
        expect(manager.tryMarkCallbackSending("run-1")).toBe(false);
    })
});