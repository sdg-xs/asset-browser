import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import express, {
  type ErrorRequestHandler,
  type RequestHandler,
} from "express";
import multer from "multer";
import { ZodError } from "zod";
import { CatalogIndexSchema } from "../shared/contracts.js";
import { DEFAULT_MAX_UPLOAD_BYTES } from "./config.js";
import {
  LibraryError,
  LibraryStore,
  type StoreOptions,
} from "./library-store.js";

const localRequests: RequestHandler = (request, response, next) => {
  const host = request.headers.host;
  if (!host || !/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/.test(host)) {
    next(
      new LibraryError(
        "INVALID_HOST",
        "Use the localhost library address.",
        403,
      ),
    );
    return;
  }
  const port = host.split(":")[1];
  if (port && (Number(port) < 1 || Number(port) > 65535)) {
    next(new LibraryError("INVALID_HOST", "Use a valid localhost port.", 403));
    return;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.origin;
    if (
      (origin !== undefined && origin !== `http://${host}`) ||
      request.headers["sec-fetch-site"] === "cross-site"
    ) {
      next(
        new LibraryError(
          "CROSS_ORIGIN_MUTATION",
          "Library changes require a request from this localhost app.",
          403,
        ),
      );
      return;
    }
  }
  if (request.path.startsWith("/api") && Object.keys(request.query).length) {
    next(
      new LibraryError(
        "INVALID_QUERY",
        "These library routes do not accept filesystem paths or query parameters.",
        400,
      ),
    );
    return;
  }
  response.setHeader("X-Content-Type-Options", "nosniff");
  next();
};

export async function createApp(
  options: StoreOptions,
): Promise<express.Express> {
  const store = await LibraryStore.create(options);
  const app = express();
  app.disable("x-powered-by");
  app.use(localRequests);
  app.use("/api", express.json({ limit: "32mb" }));
  const upload = multer({
    storage: multer.diskStorage({
      destination: join(resolve(options.dataRoot), "staging"),
      filename: (_request, _file, callback) =>
        callback(null, `${randomUUID()}.tmp`),
    }),
    limits: {
      fileSize: options.maxUploadBytes ?? DEFAULT_MAX_UPLOAD_BYTES,
      files: 1,
      fields: 0,
      parts: 1,
    },
  });
  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok" });
  });
  app.get("/api/models", async (_request, response) => {
    response.json(await store.listModels());
  });
  app.get("/api/models/:id/file", async (request, response, next) => {
    const path = await store.resolveModelFile(request.params.id);
    response.type("text/plain");
    response.sendFile(path, (error) => {
      if (error) next(error);
    });
  });
  app.post("/api/models", upload.single("file"), async (request, response) => {
    if (!request.file)
      throw new LibraryError(
        "MISSING_UPLOAD",
        "Choose an IFC file to upload in the file field.",
        400,
      );
    response
      .status(201)
      .json(
        await store.persistUpload({
          temporaryPath: request.file.path,
          name: request.file.originalname,
        }),
      );
  });
  app.delete("/api/models/:id", async (request, response) => {
    await store.hideModel(request.params.id);
    response.status(204).end();
  });
  app.put("/api/models/:id/index", async (request, response) => {
    const raw: unknown = request.body;
    response.json(
      await store.saveIndex(request.params.id, CatalogIndexSchema.parse(raw)),
    );
  });
  app.use("/api", (_request, _response, next) => {
    next(
      new LibraryError(
        "ROUTE_NOT_FOUND",
        "This library API route does not exist.",
        404,
      ),
    );
  });
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_request, response, next) => {
    response.sendFile(resolve("dist/index.html"), (error) => {
      if (error) next(error);
    });
  });
  const errors: ErrorRequestHandler = (
    error: unknown,
    _request,
    response,
    next,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof LibraryError) {
      response
        .status(error.status)
        .json({ error: { code: error.code, message: error.message } });
    } else if (error instanceof ZodError || error instanceof SyntaxError) {
      response
        .status(400)
        .json({
          error: {
            code: "INVALID_REQUEST",
            message: "The request does not match the library data format.",
          },
        });
    } else if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";
      response
        .status(tooLarge ? 413 : 400)
        .json({
          error: {
            code: tooLarge ? "UPLOAD_TOO_LARGE" : "INVALID_UPLOAD",
            message: tooLarge
              ? "The IFC file exceeds the configured upload limit."
              : "Upload one IFC file in the file field.",
          },
        });
    } else {
      process.stderr.write(
        `${JSON.stringify({ event: "library-request-failed", message: error instanceof Error ? error.message : "Unknown error" })}\n`,
      );
      response
        .status(500)
        .json({
          error: {
            code: "LIBRARY_ERROR",
            message:
              "The library could not access or save its local files. Check the service terminal and configured folders.",
          },
        });
    }
  };
  app.use(errors);
  return app;
}
