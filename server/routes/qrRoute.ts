import { Router } from "express";
import { QrService } from "../services/qrService";
import type { Client } from "whatsapp-web.js";
import type { EventEmitter } from "events";

export const QrRoutes = (
  globalQr: string | null,
  eventEmitter: EventEmitter,
  client: Client
) => {
  const router = Router();
  const qrService = QrService(globalQr, eventEmitter, client);

  router.get("/events/qr", qrService.handleQrRequest);

  return router;
};
