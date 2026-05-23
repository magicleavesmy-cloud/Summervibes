/* global process */

const inventoryKey = "summer-vibes-products";

function getKvConfig() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  return { token, url };
}

async function kvRequest(path, options = {}) {
  const config = getKvConfig();

  if (!config) {
    return null;
  }

  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`KV request failed with ${response.status}`);
  }

  return response.json();
}

export default async function handler(request, response) {
  try {
    response.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    if (!getKvConfig()) {
      return response.status(501).json({
        error:
          "KV_REST_API_URL/KV_REST_API_TOKEN or UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN are not configured.",
      });
    }

    if (request.method === "GET") {
      const result = await kvRequest(`/get/${inventoryKey}`);
      const products = result?.result ? JSON.parse(result.result) : null;

      return response.status(200).json({ products });
    }

    if (request.method === "POST") {
      const { products } = request.body || {};

      if (!Array.isArray(products)) {
        return response.status(400).json({ error: "products must be an array" });
      }

      await kvRequest(`/set/${inventoryKey}`, {
        body: JSON.stringify(JSON.stringify(products)),
        method: "POST",
      });

      return response.status(200).json({ ok: true });
    }

    response.setHeader("Allow", "GET, POST");
    return response.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
