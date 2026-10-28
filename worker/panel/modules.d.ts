// Tipo del módulo wasm que importa assets.ts (el plugin de Cloudflare para Vite lo
// entrega como WebAssembly.Module).
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}
