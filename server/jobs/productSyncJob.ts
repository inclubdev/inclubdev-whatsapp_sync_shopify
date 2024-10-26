import prisma from "../services/prismaService";
import { ShopifyService } from "../services/shopifyService";

export async function processUnsyncedProducts() {
  const unsyncedProducts = await prisma.product.findMany({
    where: { synced_at: null },
    include: { images: true, variants: true },
  });

  const shopsToSync = await prisma.shop.findMany();

  if (!shopsToSync.length) {
    console.log("No hay tiendas para sincronizar.");
    return;
  }

  if (!unsyncedProducts.length) {
    console.log("No hay productos para sincronizar.");
    return;
  }

  for (const shop of shopsToSync) {
    console.log(`Sincronizando productos con la tienda ${shop.shopName}`);
    const shopifyService = new ShopifyService(shop);

    for (const product of unsyncedProducts) {
      console.log(
        `Sincronizando producto con SKU: ${product.sku} a la tienda ${shop.shopName}`
      );
      await shopifyService.createOrUpdateProduct(product);

      await prisma.product.update({
        where: { id: product.id },
        data: { synced_at: new Date() },
      });
    }
  }
}
