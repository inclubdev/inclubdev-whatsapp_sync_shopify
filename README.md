# Whatsapp Project to sync with Shopify

## Development

Run the dev server:

```shellscript
npm run dev
```

## Deployment

First, build your app for production:

```sh
npm run build
```

Then run the app in production mode:

```sh
npm start
```

Now you'll need to pick a host to deploy it to.

## Get Shopify Credentials and setup process

You will need to go to any store that you want to sync with your Whatsapp products.
Once in the admin of that store, navigate to [https://admin.shopify.com/store/your-store/settings/apps/development](https://admin.shopify.com/store/your-store/settings/apps/development) and create an app.

You must grant these scopes to the app: `write_products` and `write_discounts`.

Now, in the Whatsapp project, once you're logged (after scanning the QR) the project will show you three fields that must be filled to have the app working, the fields will be filled with the data that you are going to find in the `API credentials` tab, in the app configuration:

- Shopify API Key
- Shopify Admin Access Token Key
- Shopify Store URL (I.E. my-test-store.myshopify.com)

Now save the changes and start selecting the chats that you want to observe for the products!
