
import cors, { type CorsOptions } from "cors";

const env = process.env.NODE_ENV || "development";
const whitelist: string[] = [
  env === "development" ? "http://localhost:5174" : "",
].filter(Boolean);

console.log(whitelist)

const corsOptions: CorsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
    if (!origin || whitelist.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

const corsConfig = cors(corsOptions);

export default corsConfig;
