import { EnrichResult, ProcessedItem } from "./integration.types";
import { PlatformHttpError } from "./platform.error";

interface BurstResponse {
    run_id: string;
    total: number;
    started_at: string;
}

class PlatformClient {
    private readonly baseUrl: string;
    private readonly cid: string;
    private readonly token: string;

    constructor() {
        const baseUrl = process.env.PLATFORM_BASE_URL;
        const cid = process.env.PLATFORM_CID;
        const token = process.env.PLATFORM_TOKEN;

        if(!baseUrl || !cid || !token) {
            throw new Error("PLATFORM_BASE_URL, PLATFORM_CID and PLATFORM_TOKEN are required");
        }

        this.baseUrl = baseUrl;
        this.cid = cid;
        this.token = token;
    }

    async requestBurst(): Promise<BurstResponse> {
        const response = await fetch(
            `${this.baseUrl}/burst/${this.cid}`,
            {
                method: "POST",
                headers: {
                    "x-token": this.token,
                },
            }
        );

        if (!response.ok) {
            throw new Error(
                `Burst request failed with status ${response.status}`
            );
        }

        return (await response.json()) as BurstResponse;
    }

    async enrich(sku: string): Promise<EnrichResult> {
        const response = await fetch(
            `${this.baseUrl}/enrich/${encodeURIComponent(sku)}`, 
            {
                method: "GET",
                headers: {
                    "x-cid": this.cid,
                    "x-token": this.token,
                },
            }
        );

        if (!response.ok) {
            const retryAfterHeader = response.headers.get("retry-after");

            const retryAfter = retryAfterHeader
                ? Number(retryAfterHeader)
                : undefined;

            throw new PlatformHttpError (
                response.status,
                retryAfter
            );
        }
        return (await response.json()) as EnrichResult;
    }  

    async sendCallback(runId: string, result: ProcessedItem[]): Promise<string> {
        const response = await fetch(`${this.baseUrl}/callback`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "x-token": this.token
            },
            body: JSON.stringify({
                cid: this.cid,
                run_id: runId,
                result,
            }),
        });

        const body = await response.text();

        if (!response.ok) {
            throw new PlatformHttpError(response.status);
        }

        return body;
    }
}

export const platformClient = new PlatformClient();