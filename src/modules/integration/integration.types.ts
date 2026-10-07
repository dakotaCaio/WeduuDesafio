export interface ProcessMessage {
    run_id: string;
    seq: number;
    sku: string;
}

export interface EnrichResult {
    sku: string;
    price: number;
    stock: number;
}

export interface ProcessedItem {
    seq: number;
    sku: string;
    price: number;
    stock: number;
}

export interface RunState {
    runId: string;
    total?: number;
    
    received: Set<number>;
    completed: Map<number, ProcessedItem>;
    failed: Set<number>;

    callbackStatus: CallbackStatus;
}

export function isProcessMessage ( value: unknown ): value is ProcessMessage {
    if (typeof value !== "object" || value === null ) {
        return false;
    }

    const message = value as Record<string, unknown>;

    return (
        typeof message.run_id === "string" &&
        message.run_id.length > 0 &&
        typeof message.seq === "number" &&
        Number.isInteger(message.seq) &&
        message.seq >= 0 &&
        typeof message.sku === "string" &&
        message.sku.length > 0
    );
}

export type CallbackStatus =
    | "pending"
    | "sending"
    | "sent"
    | "failed";

