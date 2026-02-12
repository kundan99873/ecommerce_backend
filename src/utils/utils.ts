import crypto from "crypto";

const algorithm = "aes-256-cbc";

let secretKeyRaw = "default_32_characters_secret_key_!";
if (secretKeyRaw.length < 32) {
  secretKeyRaw = secretKeyRaw.padEnd(32, "0");
} else if (secretKeyRaw.length > 32) {
  secretKeyRaw = secretKeyRaw.slice(0, 32);
}
const secretKey = Buffer.from(secretKeyRaw);

const encryptData = (data: any): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

  const stringData = JSON.stringify(data);

  let encrypted = cipher.update(stringData, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
};

const decryptData = (encrypted: string): any => {
  const [ivHex, encryptedData] = encrypted.split(":");
  if (!ivHex || !encryptedData)
    throw new Error("Invalid encrypted data format");

  const decipher = crypto.createDecipheriv(
    algorithm,
    secretKey,
    Buffer.from(ivHex, "hex"),
  );

  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return JSON.parse(decrypted);
};

const generateSku = (
  productName: string,
  color?: string | null,
  size?: string | null
): string => {
  const normalize = (value: string) =>
    value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 4);

  const namePart = normalize(productName);
  const colorPart = color ? normalize(color) : "GEN";
  const sizePart = size ? normalize(size) : "NA";

  const randomPart = Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase();

  return `${namePart}-${colorPart}-${sizePart}-${randomPart}`;
};


export { encryptData, decryptData, generateSku };
