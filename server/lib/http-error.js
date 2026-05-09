export class HttpError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.data = data;
  }
}

export const notImplemented = (message) =>
  new HttpError(501, message || "Not implemented");
