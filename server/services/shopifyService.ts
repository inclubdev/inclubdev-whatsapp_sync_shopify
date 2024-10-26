import { Image, Product, ProductVariant, Shop } from "@prisma/client";
import Shopify from "shopify-api-node";

type AutomaticDiscountResponse = {
  automaticDiscountNodes: {
    edges: Array<{
      node: {
        id: string;
        automaticDiscount: {
          title: string;
          customerGets: {
            items: {
              products?: {
                edges: Array<{
                  node: {
                    id: string;
                  };
                }>;
              };
            };
          };
        };
      };
    }>;
  };
};

export class ShopifyService {
  private shopify: Shopify;

  constructor(shopInfo: Shop) {
    this.shopify = new Shopify({
      apiKey: shopInfo.apiKey,
      password: shopInfo.accessToken,
      shopName: shopInfo.shopName,
    });
  }

  async getShopInfo() {
    return this.shopify.shop.get();
  }

  async getOrCreateCollection(categoriesString: string) {
    categoriesString = categoriesString
      ? categoriesString + ",Whatsapp Sync"
      : "Whatsapp Sync";

    const categories = categoriesString.split(",");
    const collections = await this.shopify.customCollection.list();

    const collectionIds: number[] = [];

    for (const category of categories) {
      const collection = collections.find(
        (collection) => collection.title === category
      );
      if (collection) {
        collectionIds.push(collection.id);
        continue;
      }
      const newCollection = await this.shopify.customCollection.create({
        title: category,
        body_html: `Colección generada para la categoría ${category}`,
        published: true,
      });

      collectionIds.push(newCollection.id);
    }

    return collectionIds;
  }

  async findProductBySku(sku: string) {
    const products = await this.shopify.product.list({
      product_type: sku,
      limit: 1,
    });

    return products.length ? products[0] : null;
  }

  async createVolumeDiscounts(
    productId: number,
    volumeDiscounts: Array<{
      minQuantity: number;
      amountToDiscount: number;
      sku: string;
    }>
  ) {
    for (const discount of volumeDiscounts) {
      await this.shopify.graphql(
        "mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) { discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) { automaticDiscountNode { id } } }",
        {
          automaticBasicDiscount: {
            title: `Descuento -$${discount.amountToDiscount.toFixed(2)} para ${
              discount.sku
            }`,
            startsAt: new Date().toISOString(),
            minimumRequirement: {
              quantity: {
                greaterThanOrEqualToQuantity: discount.minQuantity.toString(),
              },
            },
            recurringCycleLimit: 1000,
            combinesWith: {
              orderDiscounts: true,
              productDiscounts: true,
              shippingDiscounts: true,
            },
            customerGets: {
              appliesOnOneTimePurchase: true,
              appliesOnSubscription: true,
              value: {
                discountAmount: {
                  amount: discount.amountToDiscount,
                  appliesOnEachItem: true,
                },
              },
              items: {
                products: {
                  productsToAdd: [
                    "gid://shopify/Product/" + productId.toString(),
                  ],
                },
              },
            },
          },
        }
      );
    }
  }

  async clearVolumeDiscounts(productId: number) {
    const priceRules = (await this.shopify.graphql(
      "{ automaticDiscountNodes(first: 250) { edges { node { id automaticDiscount { ...on DiscountAutomaticBasic { title customerGets { items { ...on DiscountProducts { products(first: 250) { edges { node { id } } } } } } } } } } } }"
    )) as AutomaticDiscountResponse;

    for (const rule of priceRules.automaticDiscountNodes.edges) {
      const existProduct =
        rule.node.automaticDiscount.customerGets.items.products?.edges?.find(
          (product) => product.node.id.endsWith(productId.toString())
        );

      if (existProduct) {
        await this.shopify.graphql(
          `mutation discountAutomaticDelete($id: ID!) {
            discountAutomaticDelete(id: $id) {
                deletedAutomaticDiscountId
            }
          }`,
          {
            id: rule.node.id,
          }
        );
      }
    }
  }

  async createOrUpdateProduct(
    productData: Product & { variants: ProductVariant[]; images: Image[] }
  ) {
    const sizes = productData.sizes.split(",");
    const minVariant = productData.variants.find(
      (variant) => variant.minQuantity === 1
    );
    const price = minVariant ? minVariant.price : productData.price;

    const optionsData = sizes.length
      ? [
          {
            name: "Talla",
            values: sizes,
          },
        ]
      : [];

    const variantsData = sizes.length
      ? sizes.map((size) => ({
          option1: size,
          sku: productData.sku + "-" + size,
          price,
          inventory_quantity: 100,
        }))
      : [
          {
            sku: productData.sku,
            price,
            inventory_quantity: 100,
          },
        ];

    if (!productData.images.length) {
      throw new Error(`El producto ${productData.sku} no tiene imágenes`);
    }

    const imageData = productData.images.map((image) => ({
      attachment: image.data,
    }));

    const collectionIds = await this.getOrCreateCollection(
      productData.categories
    );

    const productInfo = {
      title: productData.name,
      body_html: productData.description,
      product_type: productData.sku,
      images: imageData,
      options: optionsData,
      variants: variantsData,
    };

    const volumeDiscounts = productData.variants.length
      ? productData.variants
          .filter((variant) => variant.price !== price)
          .map((variant) => ({
            minQuantity: variant.minQuantity,
            amountToDiscount: price - variant.price,
            sku: productData.sku,
          }))
      : [];

    const product = await this.findProductBySku(productData.sku);
    if (!product) {
      const newProduct = await this.shopify.product.create(productInfo);

      for (const collectionId of collectionIds) {
        await this.shopify.collect.create({
          product_id: newProduct.id,
          collection_id: collectionId,
        });
      }

      if (volumeDiscounts.length) {
        await this.createVolumeDiscounts(newProduct.id, volumeDiscounts);
      }
      return newProduct;
    }

    const collects = await this.shopify.collect.list({
      product_id: product.id,
    });

    for (const collect of collects) {
      await this.shopify.collect.delete(collect.id);
    }

    await this.clearVolumeDiscounts(product.id);

    const updatedProduct = await this.shopify.product.update(
      product.id,
      productInfo
    );

    for (const collectionId of collectionIds) {
      await this.shopify.collect.create({
        product_id: updatedProduct.id,
        collection_id: collectionId,
      });
    }

    if (volumeDiscounts.length) {
      await this.createVolumeDiscounts(updatedProduct.id, volumeDiscounts);
    }

    return updatedProduct;
  }
}
