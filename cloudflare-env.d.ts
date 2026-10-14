declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    TOKEN_ENCRYPTION_KEY?: string;
  }
}
