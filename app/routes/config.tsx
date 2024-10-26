import {
  ActionFunctionArgs,
  redirect,
  json,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import type { Client } from "whatsapp-web.js";
import { Spinner } from "~/components/spinner";
import prisma from "~/server/prisma.server";
import { WhatsappProductsService } from "~/server/whatsapp-product.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Whatsapp Sync With Shopify" },
    { name: "description", content: "Whatsapp Sync With Shopify" },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const client = context.client as Client;

  if (!client.info) {
    return redirect("/");
  }

  const chatsFromClient = await client.getChats();

  const groupChats = chatsFromClient.filter((chat) => chat.isGroup);

  const shopInfo = await prisma.shop.findFirst({
    orderBy: { id: "desc" },
    include: { chats: true },
  });

  return json({ groupChats, shopInfo });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const client = context.client as Client;

  const formData = await request.formData();
  const chats = formData.getAll("chats");
  const apiKey = formData.get("apiKey")?.toString();
  const accessToken = formData.get("accessToken")?.toString();
  const shopName = formData.get("shopName")?.toString();

  if (!apiKey || !accessToken || !shopName) {
    return json({
      message: "Todos los campos son requeridos",
      hasError: true,
    });
  }

  const shop = await prisma.shop.upsert({
    where: { shopName },
    update: {
      apiKey,
      accessToken,
    },
    create: {
      apiKey,
      accessToken,
      shopName,
    },
  });

  if (chats.length) {
    const chatIds = chats.map((chat) => chat.toString());
    await prisma.chat.deleteMany({
      where: {
        shopId: shop.id,
      },
    });

    await prisma.chat.createMany({
      data: chatIds.map((chatId) => ({
        chatId,
        shopId: shop.id,
      })),
    });

    const whatsappProduct = new WhatsappProductsService(client);
    for (const chatId of chatIds) {
      await whatsappProduct.processProductsFromChat(chatId);
    }
  }

  return json({ message: "Configuración guardada", hasError: false });
}

export default function Config() {
  const { groupChats, shopInfo } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const formData = navigation.formData;

  return (
    <div className="flex justify-center min-h-screen bg-slate-100 p-4">
      <div className="flex flex-col gap-4 w-full max-w-screen-md">
        <header className="flex flex-col gap-9 text-gray-800 dark:text-gray-100 sticky top-0 bg-slate-100 p-4">
          <h1 className="leading text-xl font-bold flex justify-between items-center">
            Configuración
            {formData?.getAll("chats").length &&
            navigation.state === "submitting" ? (
              <div className="text-sm flex gap-2 font-normal">
                Sincronizando productos <Spinner />
              </div>
            ) : null}
          </h1>
        </header>
        <main className="flex flex-col gap-4">
          <Form
            method="POST"
            className="flex flex-col gap-6 bg-white rounded-md shadow-md p-4"
          >
            <input
              type="text"
              name="apiKey"
              placeholder="Shopify API Key"
              className="w-full rounded-sm border-lime-900 border p-2"
              required
              defaultValue={shopInfo?.apiKey}
            />
            <input
              type="text"
              name="accessToken"
              placeholder="Shopify Admin Access Token Key"
              className="w-full rounded-sm border-lime-900 border p-2"
              required
              defaultValue={shopInfo?.accessToken}
            />
            <input
              type="text"
              name="shopName"
              placeholder="Ej: micatalogovirtual-test.myshopify.com"
              className="w-full rounded-sm border-lime-900 border p-2"
              required
              defaultValue={shopInfo?.shopName}
            />
            {groupChats.length ? (
              <>
                <h2 className="text-lg font-bold">Chats a vigilar:</h2>
                <div className="flex gap-4 flex-wrap">
                  {groupChats.map((chat) => (
                    <div
                      key={chat.id._serialized}
                      className="flex items-center gap-2 w-full max-w-52 overflow-hidden"
                    >
                      <input
                        id={chat.id._serialized}
                        type="checkbox"
                        name="chats"
                        value={chat.id._serialized}
                        defaultChecked={shopInfo?.chats.some(
                          (chatInfo) => chatInfo.chatId === chat.id._serialized
                        )}
                      />
                      <label
                        className="flex-1 whitespace-nowrap overflow-ellipsis"
                        htmlFor={chat.id._serialized}
                      >
                        {chat.name}
                      </label>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <button className="bg-lime-900 text-white p-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
              Guardar
            </button>
          </Form>
        </main>
      </div>
    </div>
  );
}
