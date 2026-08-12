// Secrets del Worker: no viven en wrangler.jsonc, así que `wrangler types` no
// los conoce y hay que declararlos acá. En runtime llegan como undefined si no
// están configurados — el código lo contempla y cae a modo demo.
declare global {
  interface Env {
    /** Client ID de la app en developer.solaxcloud.com */
    SOLAX_CLIENT_ID: string;
    /** Client Secret de esa misma app */
    SOLAX_CLIENT_SECRET: string;
  }
}

export {};
