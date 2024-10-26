import type { Chat, Client, Message } from "whatsapp-web.js";
import prisma from "./prismaService";
import { productSyncQueue } from "../jobs/productSyncQueue";

interface ImageData {
  mimetype: string;
  data: string;
}

interface ProductData {
  name: string;
  sku: string;
  price: string;
  categories: string[];
  sizes: string[];
  description: string;
  priceVariants: {
    priceLevel: string;
    price: string;
    range: {
      minQuantity: number;
      maxQuantity: number;
    };
  }[];
}

export class WhatsappProductsService {
  constructor(private client: Client) {}

  isProductMessage(messageBody: string) {
    const productPattern = /SKU: (.+)/;
    return productPattern.test(messageBody);
  }

  extractQuantityRange(rangeText: string) {
    let minQuantity = 1;
    let maxQuantity = 1;

    // Caso 1: "De X a Y unidades"
    const rangeMatch = rangeText.match(/De (\d+) a (\d+) unidades/);
    if (rangeMatch) {
      minQuantity = parseInt(rangeMatch[1], 10);
      maxQuantity = parseInt(rangeMatch[2], 10);
    }

    // Caso 2: "X unidades o más"
    const moreThanMatch = rangeText.match(/(\d+) unidades o más/);
    if (moreThanMatch) {
      minQuantity = parseInt(moreThanMatch[1], 10);
      maxQuantity = 1000000;
    }

    return { minQuantity, maxQuantity };
  }

  async downloadImage(message: Message) {
    const media = await message.downloadMedia();
    if (media) {
      return {
        mimetype: media.mimetype, // Tipo de archivo (ej: "image/jpeg")
        data: media.data, // Datos de la imagen en base64
      };
    }
    return null;
  }

  extractProductData(messageBody: string): ProductData {
    const skuMatch = messageBody.match(/SKU: (.+)/);
    const priceMatch = messageBody.match(/PRECIO: (.+)/);
    const categoriesMatch = messageBody.match(/CATEGORÍAS: (.+)/);
    const sizesMatch = messageBody.match(/TALLAS: (.+)/);
    const descriptionMatch = messageBody.match(/DESCRIPCIÓN: (.+)/);
    const nameMatch = messageBody.match(/NOMBRE: (.+)/);

    const priceVariants: {
      priceLevel: string;
      price: string;
      range: { minQuantity: number; maxQuantity: number };
    }[] = [];
    const variantMatches = messageBody.match(/\* Precio (\d+): (.+) \((.+)\)/g);
    if (variantMatches?.length) {
      variantMatches.forEach((variant) => {
        const match = variant.match(
          /\* Precio (\d+): \$(\d{1,3}(?:\.\d{3})*(?:,\d{2})) USD \(([^)]+)\)/
        );
        if (match) {
          priceVariants.push({
            priceLevel: match[1],
            price: match[2],
            range: this.extractQuantityRange(match[3]),
          });
        }
      });
    }

    const sizes = sizesMatch
      ? sizesMatch[1].split("-").map((size) => size.trim())
      : [];
    const categories = categoriesMatch
      ? categoriesMatch[1].split("-").map((category) => category.trim())
      : [];

    return {
      name: nameMatch ? nameMatch[1] : "",
      sku: skuMatch ? skuMatch[1] : "",
      price: priceMatch ? priceMatch[1] : "",
      categories,
      sizes,
      description: descriptionMatch ? descriptionMatch[1] : "",
      priceVariants,
    };
  }

  async processMessages(
    chat: Chat,
    lastMessageId: string | null = null
  ): Promise<
    | {
        processedProducts: {
          productData: ProductData;
          images: ImageData[];
        }[];
        lastMessageId: string | null;
      }
    | undefined
  > {
    try {
      // Obtener todos los mensajes del chat desde la última referencia o todos si es la primera vez
      const messages = await chat.fetchMessages({ limit: 1000 });

      // Ordenar mensajes por timestamp
      const sortedMessages = messages.sort((a, b) => a.timestamp - b.timestamp);

      // Si tenemos una referencia, comenzamos a procesar después de esa referencia
      let startProcessing = !lastMessageId;
      let productData = null;
      const processedProducts = [];

      for (let i = 0; i < sortedMessages.length; i++) {
        const message = sortedMessages[i];

        // Empezar a procesar si hemos encontrado el último mensaje procesado
        if (!startProcessing && message.id._serialized === lastMessageId) {
          startProcessing = true;
          continue;
        }

        if (startProcessing) {
          if (message.type === "chat" && this.isProductMessage(message.body)) {
            // Extraemos los datos del producto del mensaje
            productData = this.extractProductData(message.body);

            console.log("Producto encontrado:", productData);

            // Procesamos imágenes anteriores
            const images: ImageData[] = [];
            let j = i - 1;
            while (j >= 0 && sortedMessages[j].type === "image") {
              const image = await this.downloadImage(sortedMessages[j]);
              if (image) {
                images.push(image);
              }
              j--;
            }

            // Guardamos el producto y las imágenes asociadas
            processedProducts.push({
              productData,
              images,
            });

            // Actualizamos la referencia del último mensaje
            lastMessageId = message.id._serialized;

            console.log(
              `Producto procesado con SKU: ${productData.sku}, imágenes asociadas: ${images.length}`
            );
          }
        }
      }

      // Devolver los productos procesados y el último mensaje procesado
      return { processedProducts, lastMessageId };
    } catch (error) {
      console.error("Error al procesar los mensajes:", error);
    }
  }

  async saveOrUpdateProduct(
    {
      processedProducts,
      lastMessageId,
    }: {
      processedProducts: {
        productData: ProductData;
        images: ImageData[];
      }[];
      lastMessageId: string | null;
    },
    chatId: string
  ) {
    await prisma.$transaction(async (prisma) => {
      for (const { productData, images } of processedProducts) {
        const sizesString = productData.sizes.join(",");
        const categoriesString = productData.categories.join(",");

        await prisma.product.upsert({
          where: { sku: productData.sku },
          update: {
            price: parseFloat(
              productData.price.replace(/[^0-9,.]/g, "").replace(",", ".")
            ),
            categories: categoriesString,
            sizes: sizesString,
            name: productData.name,
            description: productData.description,
            images: {
              deleteMany: {},
              create: images.map((image) => ({
                mimetype: image.mimetype,
                data: image.data,
              })),
            },
            variants: {
              deleteMany: {},
              create: productData.priceVariants.map((variant) => ({
                priceLevel: variant.priceLevel,
                price: parseFloat(
                  variant.price.replace(/[^0-9,.]/g, "").replace(",", ".")
                ),
                minQuantity: variant.range.minQuantity,
                maxQuantity: variant.range.maxQuantity,
              })),
            },
          },
          create: {
            name: productData.name,
            sku: productData.sku,
            price: parseFloat(
              productData.price.replace(/[^0-9,.]/g, "").replace(",", ".")
            ),
            categories: categoriesString,
            description: productData.description,
            sizes: sizesString,
            images: {
              create: images.map((image) => ({
                mimetype: image.mimetype,
                data: image.data, // Imagen en base64
              })),
            },
            variants: {
              create: productData.priceVariants.map((variant) => ({
                priceLevel: variant.priceLevel,
                price: parseFloat(
                  variant.price.replace(/[^0-9,.]/g, "").replace(",", ".")
                ),
                minQuantity: variant.range.minQuantity,
                maxQuantity: variant.range.maxQuantity,
              })),
            },
          },
        });
      }

      await prisma.chat.update({
        where: { chatId },
        data: { lastSkuFound: lastMessageId },
      });
    });
  }

  async processProductsFromChat(chatId: string) {
    const chat = await this.client.getChatById(chatId);
    const storedChat = await prisma.chat.findUnique({
      where: { chatId },
    });

    const processedMessages = await this.processMessages(
      chat,
      storedChat?.lastSkuFound
    );
    if (!processedMessages) {
      return;
    }

    await this.saveOrUpdateProduct(processedMessages, chatId);
    await productSyncQueue.add({});
  }

  async processProductsFromMessage(message: Message) {
    const chats = await prisma.chat.findMany();
    if (!chats.length) {
      return;
    }

    const chatId = message.from;
    if (!chats.find((chat) => chat.chatId === chatId)) {
      return;
    }

    await this.processProductsFromChat(chatId);
  }
}
