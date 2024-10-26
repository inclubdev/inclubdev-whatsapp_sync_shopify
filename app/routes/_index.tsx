import {
  redirect,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@remix-run/node";
import { useNavigate } from "@remix-run/react";
import { useEffect, useState } from "react";
import type { Client } from "whatsapp-web.js";
import { Spinner } from "~/components/spinner";

export const meta: MetaFunction = () => {
  return [
    { title: "Whatsapp Sync With Shopify" },
    { name: "description", content: "Whatsapp Sync With Shopify" },
  ];
};

export async function loader({ context }: LoaderFunctionArgs) {
  const client = context.client as Client;

  if (client.info) {
    return redirect("/config");
  }

  return null;
}

export default function Index() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Esperando QR...");

  const navigate = useNavigate();

  useEffect(() => {
    const eventSource = new EventSource("/events/qr");

    eventSource.onmessage = (event) => {
      const data = event.data;
      console.log(data);
      if (data === "SESSION_READY") {
        navigate("/config");
      } else {
        setQrCode(data);
        setStatus("Escanee el código QR para iniciar sesión");
      }
    };

    return () => {
      eventSource.close();
    };
  }, [navigate]);

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100">
      <div className="flex flex-col items-center gap-16">
        <header className="flex flex-col items-center gap-9 text-gray-800 dark:text-gray-100">
          <h1 className="leading text-xl font-bold">{status}</h1>
          {qrCode ? (
            <div className="bg-white p-3 rounded-md shadow-md">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
                  qrCode
                )}&size=250x250`}
                alt="Código QR"
              />
            </div>
          ) : (
            <Spinner />
          )}
        </header>
      </div>
    </div>
  );
}
