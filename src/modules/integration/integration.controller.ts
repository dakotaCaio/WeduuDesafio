import { Request, Response } from "express";
import { isProcessMessage } from "./integration.types";
import { processQueue } from "./process.queue";
import { platformClient } from "./platform.client";

export function check(req: Request, res: Response){
    const { token } = req.body;

    return res.status(200).json({
        token,
    });
}

export function processMessage(req: Request, res: Response) {
    if (!isProcessMessage(req.body)) {
        console.log(`[PROCESS INVALID]`, req.body)

        return res.status(400).json({
            error: "invalid_process_message"
        });
    }

    processQueue.add(req.body);

    return res.status(200).json({
        ok: true
    });
}

export async function startRun(_req: Request, res: Response) {
    try {
        const burst = await platformClient.requestBurst();

        await processQueue.registerRun(burst.run_id, burst.total);

        return res.status(201).json(burst)
    } catch (error) {
        console.error("[START RUN ERROR]", error);

        return res.status(500).json({
            error: "failed_to_start_run",
        });
    }
}