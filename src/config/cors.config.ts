import cors, { type CorsOptions } from "cors";

const whitelist: string[] = [
  process.env.NODE_ENV === "development" ? "http://localhost:5173" : "",
].filter(Boolean);

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
