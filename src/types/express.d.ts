import { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface User {
      user_id: number;
      role_id: number;
      device_id: string;
    }
    interface Request {
      user?: User;
    }
  }
}
