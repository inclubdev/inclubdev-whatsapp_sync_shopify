import { Prisma, PrismaClient } from "@prisma/client";

export const numberToDecimal = (input?: number | null) => {
  return new Prisma.Decimal(input ?? 0);
};

export const prismaClientFactory = (url?: string) => {
  const client = new PrismaClient({
    datasources: url ? { db: { url } } : undefined,
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  return client;
};

let prisma: ReturnType<typeof prismaClientFactory>;
if (
  process.env.NODE_ENV === "production" ||
  // @ts-expect-error funkiness with how we are using NODE_ENV
  process.env.NODE_ENV === "sandbox"
) {
  prisma = prismaClientFactory();
} else {
  // @ts-expect-error we need to do this for remix hot reloading but we don't want to set a global so that other
  if (!global.prisma) {
    // @ts-expect-error same as above
    global.prisma = prismaClientFactory();
  }
  // @ts-expect-error same as above
  prisma = global.prisma;
}

export default prisma;
