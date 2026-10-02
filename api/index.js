import { createApi } from "../server/api.js";
import { serveApi } from "../server/http.js";

let apiPromise = null;

function getApi() {
  if (!apiPromise) {
    apiPromise = createApi({ root: process.cwd(), env: process.env, hosted: true }).catch((error) => {
      apiPromise = null;
      throw error;
    });
  }
  return apiPromise;
}

export default function handler(req, res) {
  return serveApi(req, res, getApi, { behindProxy: true });
}
