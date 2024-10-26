import type { Request, Response } from "express";
import type { EventEmitter } from "events";
import type { Client } from "whatsapp-web.js";

export const QrService = (
  globalQr: string | null,
  eventEmitter: EventEmitter,
  client: Client
) => ({
  handleQrRequest: (req: Request, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Encoding", "none");
    res.flushHeaders();

    res.write(":\n\n");

    if (globalQr) {
      res.write(`data: ${globalQr}\n\n`);
    }

    eventEmitter.on("qr", (qr: string) => {
      res.write(`data: ${qr}\n\n`);
    });

    if (client && client.info) {
      res.write("data: SESSION_READY\n\n");
    }

    req.on("close", () => {
      console.log("Conexión cerrada por el cliente");
      res.end();
    });
  },
});
