import { createRequestHandler } from "@remix-run/express";
import compression from "compression";
import express from "express";
import morgan from "morgan";
import whatsappWeb from "whatsapp-web.js";
import EventEmitter from "node:events";
import { QrRoutes } from "./server/routes/qrRoute";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { productSyncQueue } from "./server/jobs/productSyncQueue";
import { WhatsappProductsService } from "./server/services/whatsappProductsService";
import { ExpressAdapter } from "@bull-board/express";

async function initializeServer() {
  const { Client, LocalAuth } = whatsappWeb;
  const eventEmitter = new EventEmitter();
  const client = new Client({
    authStrategy: new LocalAuth(),
  });

  client.initialize();

  let globalQr;
  client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    eventEmitter.emit("qr", qr);
    globalQr = qr;
  });

  client.on("authenticated", (session) => {
    eventEmitter.emit("authenticated", session);
  });

  client.on("ready", () => {
    console.log("Client is ready!");
    eventEmitter.emit("ready");
  });

  client.on("message", (message) => {
    const whatsappProductService = new WhatsappProductsService(client);
    whatsappProductService.processProductsFromMessage(message);
    eventEmitter.emit("message", message);
  });

  const viteDevServer =
    process.env.NODE_ENV === "production"
      ? undefined
      : await import("vite").then((vite) =>
          vite.createServer({
            server: { middlewareMode: true },
          })
        );

  const remixHandler = createRequestHandler({
    build: viteDevServer
      ? () => viteDevServer.ssrLoadModule("virtual:remix/server-build")
      : await import("./build/server/index.js"),
    getLoadContext() {
      return { client, eventEmitter };
    },
  });

  const app = express();

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");
  createBullBoard({
    queues: [new BullAdapter(productSyncQueue)],
    serverAdapter: serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());

  app.use(compression());

  app.disable("x-powered-by");

  if (viteDevServer) {
    app.use(viteDevServer.middlewares);
  } else {
    app.use(
      "/assets",
      express.static("build/client/assets", { immutable: true, maxAge: "1y" })
    );
  }

  app.use(express.static("build/client", { maxAge: "1h" }));

  app.use(morgan("tiny"));

  app.use(QrRoutes(globalQr, eventEmitter, client));

  app.all("*", remixHandler);

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Express server listening at http://localhost:${port}`);
  });
}

initializeServer();
