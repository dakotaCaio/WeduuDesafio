import express from "express";
import { check, processMessage, startRun } from "./modules/integration/integration.controller";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
    return res.status(200).json({
        status: "Health OK!",
    });
});

app.post("/check", check);
app.post("/process", processMessage);
app.post("/runs", startRun);

export { app };