import "dotenv/config";

export const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number between 1 and 65535.");
}

export const apiOrigin = `http://127.0.0.1:${port}`;

export const webPort = Number(process.env.VITE_PORT || 5173);
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
  throw new Error("VITE_PORT must be a valid port number between 1 and 65535.");
}
