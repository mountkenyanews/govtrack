// Vercel serverless entry point
// This re-exports the Express app with bulletproof diagnostic error catching
export default async function handler(req: any, res: any) {
  try {
    const serverModule = await import("../server");
    const app = serverModule.default;
    return app(req, res);
  } catch (err: any) {
    console.error("[Vercel Serverless Error Handler]", err);
    res.status(500).json({
      error: "Serverless Function Crash",
      message: err.message || String(err),
      stack: err.stack || "No stack trace available."
    });
  }
}
