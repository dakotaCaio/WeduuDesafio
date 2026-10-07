import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        env: {
            PLATFORM_BASE_URL: "http://localhost:9999",
            PLATFORM_CID: "test-cid",
            PLATFORM_TOKEN: "test-token"
        },
        exclude: [
            "**/node_modules",
            "**/dist/**"
        ]
    }
});