// @ts-check
import {
  populateAbortErrorResponse,
  populateGeneralErrorResponse,
  populateRatelimitErrorResponse,
  populateSuccessfulResponse,
} from "@discordjs/proxy";
import {
  DiscordAPIError,
  HTTPError,
  RateLimitError,
  REST,
} from "@discordjs/rest";
import { createServer } from "node:http";

if (!process.env.DISCORD_TOKEN) {
  throw new Error("A DISCORD_TOKEN env var is required");
}

// We want to let upstream handle retrying
const api = new REST({ rejectOnRateLimit: () => true, retries: 0 }).setToken(
  process.env.DISCORD_TOKEN
);

api.on("response", (req) => {
  console.log(`[${req.method}] ${req.path}`);
});

const server = createServer(async (req, res) => {
  const { method, url } = req;
  if (!method || !url) {
    throw new TypeError(
      "Invalid request. Missing method and/or url, implying that this is not a Server IncomingMesage"
    );
  }

  const fullRoute = new URL(url, "http://noop").pathname.replace(
    /^\/api(\/v\d+)?/,
    ""
  );

  try {
    const discordResponse = await api.raw({
      body: req,
      // @ts-ignore
      fullRoute,
      // @ts-ignore
      method,
      passThroughBody: true,
      headers: {
        // @ts-ignore
        "Content-Type": req.headers["content-type"],
      },
    });

    if (fullRoute.includes("/gateway/bot") && process.env.DISCORD_GATEWAY) {
      for (const header of Object.keys(discordResponse.headers)) {
        if (header.startsWith("x-ratelimit")) {
          continue;
        }
        // @ts-ignore
        res.setHeader(header, discordResponse.headers[header]);
      }
      res.write(
        JSON.stringify({
          ...(await discordResponse.body.json()),
          url: process.env.DISCORD_GATEWAY,
        })
      );

      res.statusCode = discordResponse.statusCode;
    } else {
      await populateSuccessfulResponse(res, discordResponse);
    }
  } catch (error) {
    if (error instanceof DiscordAPIError || error instanceof HTTPError) {
      populateGeneralErrorResponse(res, error);
    } else if (error instanceof RateLimitError) {
      populateRatelimitErrorResponse(res, error);
    } else if (error instanceof Error && error.name === "AbortError") {
      populateAbortErrorResponse(res);
    } else {
      throw error;
    }
  } finally {
    res.end();
  }
});

const port = parseInt(process.env.PORT ?? "8080", 10);
server.listen(port, () => console.log(`Listening on port ${port}`));
