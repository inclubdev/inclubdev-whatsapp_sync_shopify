import Bull from "bull";
import { processUnsyncedProducts } from "./productSyncJob";

export const productSyncQueue = new Bull("product-sync-queue", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
  },
});

productSyncQueue.process(1, async (job) => {
  job.name = "product-sync-queue";
  job.log(`Iniciando job con ID: ${job.id}`);

  try {
    await processUnsyncedProducts();
    job.progress(100);
    return Promise.resolve();
  } catch (error) {
    if (error instanceof Error) {
      job.log(`Error en el job con ID ${job.id}: ${error.message}`);
    } else {
      job.log(`Error en el job con ID ${job.id}: ${error}`);
    }
    return Promise.reject(error);
  }
});

productSyncQueue.on("completed", (job) => {
  job.log(`Job completado con ID: ${job.id}`);
});

productSyncQueue.on("failed", (job, err) => {
  job.log(`Job fallido con ID: ${job.id}. Error: ${err.message}`);
});

productSyncQueue.on("stalled", (job) => {
  job.log(`Job estancado con ID: ${job.id}`);
});

productSyncQueue.on("progress", (job, progress) => {
  job.log(`Job con ID: ${job.id} en progreso: ${progress}% completado.`);
});

productSyncQueue.on("active", (job) => {
  job.log(`Job con ID: ${job.id} está activo y en ejecución.`);
});
